// Ramsa phone bridge: connects a real phone number (Twilio Programmable Voice webhooks) to the Ramsa AI call-center agent.
// Twilio → POST ?ws=<workspace>&co=<company record id>[&step=...]. Uses Twilio <Gather> speech recognition (ar-AE / en-US) and Amazon Polly
// neural voices via <Say> for low latency. Conversation state lives in ramsa_cc_records (kind "phone_turn", ref = CallSid).
// Optional secret TWILIO_AUTH_TOKEN → every request must carry a valid X-Twilio-Signature.
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TW_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const PUBLIC = `${SB_URL}/functions/v1/ramsa-phone`;
const T = "ramsa_cc_records";
const wsOk = (w: string) => /^[A-Za-z0-9_-]{16,64}$/.test(w);
const uuidOk = (u: string) => /^[0-9a-f-]{36}$/i.test(u);
const x = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
const twiml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "content-type": "text/xml; charset=utf-8" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const bg = (p: Promise<unknown>) => { try { EdgeRuntime?.waitUntil(p); } catch { /* not available */ } };

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", prefer: "return=representation", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(8000) });
  const t = await r.text(); if (!r.ok) throw new Error("db " + r.status); return t ? JSON.parse(t) : null;
}
const getCompany = async (ws: string, co: string) => (await db(`${T}?id=eq.${co}&ws=eq.${ws}&kind=eq.company&select=data&limit=1`))?.[0]?.data ?? null;
const getTurn = async (ws: string, sid: string) => (await db(`${T}?ws=eq.${ws}&kind=eq.phone_turn&ref=eq.${encodeURIComponent(sid)}&select=id,data&limit=1`))?.[0] ?? null;
const putTurn = (id: string, data: unknown) => db(`${T}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ data, updated_at: new Date().toISOString() }) });

async function validSig(req: Request, params: URLSearchParams) {
  if (!TW_TOKEN) return true;
  const sig = req.headers.get("x-twilio-signature") ?? ""; const u = new URL(req.url);
  const keys = [...new Set([...params.keys()])].sort(); const data = PUBLIC + u.search + keys.map((k) => k + params.get(k)).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(TW_TOKEN), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))));
  return mac === sig;
}
const voiceFor = (lang: string) => (lang === "en" ? { v: "Polly.Joanna-Neural", l: "en-US" } : { v: "Polly.Hala-Neural", l: "ar-AE" });
const say = (text: string, lang = "ar") => { const v = voiceFor(lang); return `<Say voice="${v.v}" language="${v.l}">${x(text)}</Say>`; };
function gather(base: string, inner: string, lang = "ar", ivr = false) {
  const l = voiceFor(lang).l;
  return `<Gather input="speech dtmf" language="${l}" speechTimeout="auto" timeout="6" ${ivr ? 'numDigits="1"' : ""} actionOnEmptyResult="true" action="${x(base + "&step=turn")}" method="POST">${inner}</Gather>`;
}
const greetingOf = (p: any) => (p.greeting || `${p.name ?? ""}، معك ${p.agent_name ?? "سلامة"}، شلون أقدر أساعدك؟`);
const ivrOf = (p: any) => (p.ivr_on && Array.isArray(p.ivr) && p.ivr.length ? p.ivr.map((o: any) => `إذا تبي ${o.label} اضغط ${o.key}`).join("، ") + "، أو قول طلبك مباشرة." : "");

async function runTurn(ws: string, co: string, p: any, rowId: string, data0: any, input: { text?: string; dtmf?: string }, from: string, sid: string) {
  const seq = data0.seq; let data = data0;
  try {
    const r = await fetch(`${SB_URL}/functions/v1/ramsa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "cc_turn", ws, profile: p, state: { caller: from, channel: "phone" }, history: data.history.slice(-14), ...input, speak: false, call_id: sid }), signal: AbortSignal.timeout(60000) });
    const o = await r.json(); if (!r.ok || o.error) throw new Error(o.error ?? "turn");
    const fresh = await getTurn(ws, sid).catch(() => null); if (fresh && fresh.data.seq !== seq) return { status: "stale" }; if (fresh) data = fresh.data;
    data.history.push({ role: "agent", text: o.reply });
    if (o.action?.ready && o.action_result) { data.history.push({ role: "system", text: `تم تنفيذ ${o.action.type}${o.action_result.ref ? " رقم " + o.action_result.ref : ""}` }); (data.actions ||= []).push({ type: o.action.type, params: o.action.params, ref: o.action_result.ref, source: o.action_result.source }); }
    if (o.action?.type === "transfer") data.transferred = true;
    if (o.lang) { data.lang = o.lang; (data.langs ||= []).includes(o.lang) || data.langs.push(o.lang); }
    if (o.dialect && o.dialect !== "unknown") (data.dialects ||= []).includes(o.dialect) || data.dialects.push(o.dialect);
    data.turns_meta = [...(data.turns_meta ?? []), { intent: o.intent, sentiment: o.sentiment, ms: o.ms?.llm }].slice(-50);
    data.pending = { status: "done", seq, reply: o.reply, lang: o.lang ?? "ar", action: o.action?.type ?? "none" };
  } catch (e) { const fresh = await getTurn(ws, sid).catch(() => null); if (fresh && fresh.data.seq !== seq) return { status: "stale" }; if (fresh) data = fresh.data; data.pending = { status: "error", seq, reply: "", err: String(e).slice(0, 80) }; }
  await putTurn(rowId, data).catch(() => {});
  return data.pending;
}
async function finalize(ws: string, row: any, p: any, from: string, duration?: string) {
  const d = row.data; if (d.summarized) return; d.summarized = true; await putTurn(row.id, d).catch(() => {});
  const lat = (d.turns_meta ?? []).map((t: any) => t.ms).filter(Boolean);
  const meta = { call_id: d.sid, company: p.name, agent: p.agent_name ?? "سلامة", voice: "Polly Hala (Twilio)", direction: "inbound", channel: "phone", caller: from || d.from, started_at: d.started_at, duration: Number(duration) || Math.round((Date.now() - Date.parse(d.started_at)) / 1000), turns: d.history.filter((h: any) => h.role === "user").length, avg_latency: lat.length ? Math.round(lat.reduce((a: number, b: number) => a + b, 0) / lat.length) : null, transferred: !!d.transferred, actions: d.actions ?? [], dialects: d.dialects ?? [], langs: d.langs ?? [] };
  await fetch(`${SB_URL}/functions/v1/ramsa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "cc_summary", ws, transcript: d.history.filter((h: any) => h.role !== "system").map((h: any) => ({ role: h.role, text: h.text })), meta }), signal: AbortSignal.timeout(60000) }).catch(() => {});
}
function replyTwiml(base: string, p: any, pend: any, ws: string, row: any, from: string) {
  const lang = pend.lang ?? "ar";
  if (pend.action === "transfer" && p.human_phone) return twiml(say(pend.reply, lang) + `<Dial timeout="25">${x(p.human_phone)}</Dial>` + say(lang === "en" ? "Sorry, no one is available right now. We'll call you back." : "المعذرة، ما فيه موظف متاح الحين، بنتواصل وياك قريب.", lang));
  if (pend.action === "end_call") { bg(finalize(ws, row, p, from)); return twiml(say(pend.reply, lang) + "<Hangup/>"); }
  return twiml(gather(base, say(pend.reply, lang), lang) + `<Redirect method="POST">${x(base + "&step=silence")}</Redirect>`);
}

Deno.serve(async (req) => {
  const u = new URL(req.url); const ws = u.searchParams.get("ws") ?? ""; const co = u.searchParams.get("co") ?? ""; const step = u.searchParams.get("step") ?? "start";
  if (req.method === "GET") return new Response(JSON.stringify({ ok: true, name: "ramsa-phone", usage: "Set as Twilio Voice webhook (HTTP POST) with ?ws=&co=", signature_check: !!TW_TOKEN }), { headers: { "content-type": "application/json" } });
  const params = new URLSearchParams(await req.text());
  if (!(await validSig(req, params))) return new Response("bad signature", { status: 403 });
  if (!wsOk(ws) || !uuidOk(co)) return twiml(say("عذرًا، هذا الرقم غير مهيأ بعد.") + "<Hangup/>");
  const base = `${PUBLIC}?ws=${encodeURIComponent(ws)}&co=${encodeURIComponent(co)}`;
  const sid = (params.get("CallSid") ?? "").slice(0, 64); const from = (params.get("From") ?? "").slice(0, 32);
  let p: any; try { p = await getCompany(ws, co); } catch { p = null; }
  if (!p) return twiml(say("عذرًا، تعذّر تحميل إعدادات الشركة. حاول لاحقًا.") + "<Hangup/>");
  if (!sid) return twiml(say("طلب غير صالح.") + "<Hangup/>");

  if (step === "status") {
    if (params.get("CallStatus") === "completed") { const row = await getTurn(ws, sid).catch(() => null); if (row) bg(finalize(ws, row, p, from, params.get("CallDuration") ?? undefined)); }
    return new Response("ok");
  }
  let row = await getTurn(ws, sid).catch(() => null);
  if (step === "start" || !row) {
    const g = greetingOf(p); const ivr = ivrOf(p);
    const data = { sid, from, started_at: new Date().toISOString(), history: [{ role: "agent", text: g + (ivr ? " " + ivr : "") }], lang: "ar" };
    if (!row) row = (await db(T, { method: "POST", body: JSON.stringify({ ws, kind: "phone_turn", ref: sid, status: "open", data }) }).catch(() => [null]))[0];
    return twiml(gather(base, say(g) + (ivr ? say(ivr) : ""), "ar", !!ivr) + `<Redirect method="POST">${x(base + "&step=silence")}</Redirect>`);
  }
  const data = row.data;
  if (step === "silence") {
    data.silence = (data.silence ?? 0) + 1; await putTurn(row.id, data).catch(() => {});
    if (data.silence >= 3) { bg(finalize(ws, row, p, from)); return twiml(say(data.lang === "en" ? "I can't hear you. Thank you for calling, goodbye." : "ما أسمعك، شكرًا لاتصالك، مع السلامة.", data.lang) + "<Hangup/>"); }
    return twiml(gather(base, say(data.lang === "en" ? "Are you still there? How can I help?" : "معاك؟ شلون أقدر أساعدك؟", data.lang), data.lang) + `<Redirect method="POST">${x(base + "&step=silence")}</Redirect>`);
  }
  if (step === "turn") {
    const speech = (params.get("SpeechResult") ?? "").trim().slice(0, 800); const digits = (params.get("Digits") ?? "").replace(/[^0-9*#]/g, "").slice(0, 4);
    if (!speech && !digits) return twiml(`<Redirect method="POST">${x(base + "&step=silence")}</Redirect>`);
    data.silence = 0; data.seq = (data.seq ?? 0) + 1; data.history.push({ role: "user", text: speech || `ضغط ${digits}` }); data.pending = { status: "working", seq: data.seq };
    await putTurn(row.id, data).catch(() => {});
    const job = runTurn(ws, co, p, row.id, data, speech ? { text: speech } : { dtmf: digits }, from, sid); bg(job);
    const quick = await Promise.race([job, sleep(9000).then(() => null)]);
    if (quick?.status === "done") return replyTwiml(base, p, quick, ws, row, from);
    if (quick?.status === "error") return twiml(gather(base, say(data.lang === "en" ? "Sorry, could you repeat that?" : "المعذرة، ممكن تعيد كلامك؟", data.lang), data.lang));
    return twiml(say(data.lang === "en" ? "One moment please." : "لحظة من فضلك.", data.lang) + `<Pause length="2"/><Redirect method="POST">${x(base + "&step=wait&k=1")}</Redirect>`);
  }
  if (step === "wait") {
    const k = Number(u.searchParams.get("k") ?? 1);
    for (let i = 0; i < 6; i++) { const r = await getTurn(ws, sid).catch(() => null); const pend = r?.data?.pending; if (pend?.status === "done") return replyTwiml(base, p, pend, ws, r, from); if (pend?.status === "error") break; await sleep(1000); }
    if (k < 6) return twiml(`<Pause length="1"/>` + (k === 2 || k === 4 ? say(data.lang === "en" ? "Still checking, thanks for waiting." : "قاعد أتأكد لك، شكرًا على صبرك.", data.lang) : "") + `<Redirect method="POST">${x(base + "&step=wait&k=" + (k + 1))}</Redirect>`);
    return twiml(gather(base, say(data.lang === "en" ? "Sorry for the delay, could you say that again?" : "المعذرة على التأخير، ممكن تعيد طلبك؟", data.lang), data.lang));
  }
  return twiml(`<Redirect method="POST">${x(base + "&step=silence")}</Redirect>`);
});

// Ramsa Call Center: AI phone agent turn, actions (webhooks or demo DB), summaries, campaigns, records.
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const T = "ramsa_cc_records";
const s = (v: unknown, n = 400) => String(v ?? "").slice(0, n);
const wsOk = (w: unknown) => /^[A-Za-z0-9_-]{16,64}$/.test(String(w ?? ""));

async function db(path: string, init: RequestInit = {}) {
  if (!SB_URL || !SB_KEY) throw new Error("no_db");
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", prefer: "return=representation", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(10000) });
  const t = await r.text(); if (!r.ok) throw new Error("db " + r.status + " " + t.slice(0, 200)); return t ? JSON.parse(t) : null;
}
export async function insertRec(ws: string, kind: string, data: any, ref = "", status = "open") {
  const [row] = await db(T, { method: "POST", body: JSON.stringify({ ws, kind, ref, status, data }) }); return row;
}
export async function listRec(ws: string, kinds: string[], limit = 500, ref = "") {
  const k = kinds.filter((x) => /^[a-z_]+$/.test(x)).join(",");
  return await db(`${T}?ws=eq.${ws}&kind=in.(${k})${ref ? `&ref=eq.${encodeURIComponent(ref)}` : ""}&order=created_at.desc&limit=${limit}`, { method: "GET" });
}
const refNo = (p: string) => `${p}-${Math.floor(100000 + Math.random() * 900000)}`;

// ---------- hours ----------
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_AR: Record<string, string> = { sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة", sat: "السبت" };
export function dubaiNow() { const d = new Date(Date.now() + 4 * 3600e3); return { day: DAYS[d.getUTCDay()], hm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`, date: d.toISOString().slice(0, 10) }; }
function hoursText(h: any) {
  if (!h || typeof h !== "object") return "غير محددة";
  return DAYS.map((d) => { const v = h[d]; return `${DAY_AR[d]}: ${v && v.open ? `${s(v.from, 5)}–${s(v.to, 5)}` : "مغلق"}`; }).join("، ");
}
function isOpen(h: any) {
  const n = dubaiNow(); const v = h?.[n.day]; if (!v || !v.open) return false;
  const from = s(v.from, 5), to = s(v.to, 5); if (!from || !to) return true;
  return to > from ? n.hm >= from && n.hm < to : n.hm >= from || n.hm < to;
}

// ---------- profile -> system prompt ----------
export function ccSys(p: any, st: any) {
  const n = dubaiNow();
  const services = Array.isArray(p.services) ? p.services.slice(0, 60).map((x: any) => `- ${s(x.name, 80)}${x.price ? `: ${s(x.price, 30)}` : ""}${x.note ? ` (${s(x.note, 100)})` : ""}`).join("\n") : "";
  const faqs = Array.isArray(p.faqs) ? p.faqs.slice(0, 60).map((x: any) => `س: ${s(x.q, 200)}\nج: ${s(x.a, 500)}`).join("\n") : "";
  const ivr = Array.isArray(p.ivr) ? p.ivr.slice(0, 9).map((x: any) => `${s(x.key, 2)} = ${s(x.label, 60)} → ${s(x.route, 20)}`).join("\n") : "";
  const dialectRule = p.dialect_mode === "mirror" ? "رد بنفس لهجة المتصل (إماراتي، سعودي، كويتي، مصري…)، والافتراضي إماراتي." : "رد دائمًا باللهجة الإماراتية الطبيعية، حتى لو المتصل من لهجة ثانية (افهم لهجته عادي).";
  const outbound = st?.direction === "outbound" ? `\n\n## مكالمة صادرة (أنت المتصل)\nأنت اتصلت بالعميل ضمن حملة: ${s(st.campaign_type, 40)}.\nبيانات العميل: ${s(JSON.stringify(st.contact ?? {}), 600)}\nهدف المكالمة والنص الإرشادي: ${s(st.script, 1200)}\nكن مختصرًا ومحترمًا، عرّف بنفسك وبالشركة، وإن قال العميل إنه مشغول اعرض معاودة الاتصال. سجّل النتيجة في action عند الوصول لها (type=campaign_result, params:{outcome:"confirmed|declined|paid|promised|reschedule|survey_done|no_interest|callback", detail, score?}).` : "";
  return `أنت "${s(p.agent_name, 40) || "سلامة"}"، موظف/ة خدمة العملاء الصوتي الذكي لدى «${s(p.name, 80) || "الشركة"}» وترد على مكالمة هاتفية حيّة.
نبذة النشاط: ${s(p.about, 600)}
النبرة: ${s(p.tone, 200) || "ودودة ومهنية"}.
اللغة: ${dialectRule} إذا تكلم المتصل بالإنجليزية فرد بالإنجليزية، وإذا رجع للعربي ارجع للعربي (تبديل اللغة في أي لحظة). افهم كل اللهجات العربية.
أسلوب الهاتف: ردود قصيرة جدًا ومنطوقة (جملة أو جملتين، بحد أقصى 35 كلمة)، بدون قوائم أو رموز أو روابط أو إيموجي. الأرقام والأسعار تُكتب بالأرقام. سؤال واحد في كل مرة. لا تكرر الترحيب.
الصدق: اعتمد فقط على معلومات النشاط أدناه ونتائج الأنظمة. لا تخترع أسعارًا أو مواعيد أو سياسات أو حالات طلبات. إن لم تعرف قل ذلك واعرض التحويل لموظف أو طلب معاودة اتصال.

الوقت الآن في الإمارات: ${DAY_AR[n.day]} ${n.date} الساعة ${n.hm}. حالة الدوام الآن: ${isOpen(p.hours) ? "مفتوح" : "مغلق"}.
ساعات العمل: ${hoursText(p.hours)}

## الخدمات والأسعار
${services || "(غير محددة)"}

## الأسئلة الشائعة
${faqs || "(لا يوجد)"}

## قاعدة المعرفة
${s(p.kb, 9000) || "(لا يوجد)"}

## السياسات
${s(p.policies, 2500) || "(لا يوجد)"}

## قواعد التصعيد والتحويل لموظف
${s(p.escalation, 1500) || "حوّل عند طلب المتصل لموظف، أو الغضب الشديد، أو موضوع خارج معرفتك بعد محاولة واحدة."}
${p.hours && !isOpen(p.hours) ? "الدوام مغلق الآن: لا تحوّل لموظف مباشرة، بل اعرض طلب معاودة اتصال (request_callback) أو تذكرة." : ""}

## قائمة الرد الآلي (IVR)
${ivr || "(لا يوجد)"}
إذا وصل اختيار من لوحة الأرقام (DTMF) فتعامل معه حسب القائمة. وإذا تكلم المتصل بطلبه مباشرة فوجّهه بذكاء بدون إجباره على الأرقام.

## الإجراءات (أنظمة حقيقية متصلة)
- create_booking {service, date (YYYY-MM-DD), time (HH:MM), name, phone?, people?, notes?}: احجز فقط بعد جمع البيانات الضرورية وتأكيد المتصل صراحة.
- order_status {order_id}: استعلام عن حالة طلب. لا تخمّن الحالة أبدًا؛ النظام يرد بالنتيجة.
- create_ticket {category: complaint|technical|billing|request|other, summary, severity: low|medium|high, name?, phone?}: لشكوى أو مشكلة. اعتذر بصدق.
- request_callback {name, phone, preferred_time, reason}: طلب معاودة اتصال.
- transfer {reason, department}: تحويل لموظف بشري حسب قواعد التصعيد.
- end_call {}: عندما يودّع المتصل وتنتهي الحاجة.
لا تكرر إجراءً نُفّذ سابقًا (يظهر في سطور «النظام» في المكالمة)، بل أكّد للمتصل أنه تم.
في الرد المنطوق قل الأوقات والتواريخ بشكل طبيعي (مثل: باجر الساعة خمس العصر)، لا بصيغة 17:00 أو 2026-10-28.
ضع ready=true فقط عندما تكون البيانات مكتملة والمتصل موافق (أو إجراء لا يحتاج تأكيد مثل order_status وtransfer). عند ready=true للحجز/التذكرة/المعاودة اكتب الرد كأن الإجراء تم واستخدم الرمز {ref} مكان رقم المرجع، واذكر أنه بيوصله إشعار ${p.notify === "sms" ? "برسالة نصية" : "على الواتساب"}. لـ order_status اكتب reply قصير مثل "لحظة أشيك لك على الطلب".
رقم هاتف المتصل (من النظام): ${s(st?.caller, 20) || "غير معروف"}. استخدمه بدل سؤاله إذا كان معروفًا (أكّده فقط).${outbound}

${p.scenario ? `## سيناريو عرض تجريبي (جهة خيالية)
هذه جهة خيالية لغرض العرض فقط وليست شركة أو جهة حكومية حقيقية. إذا سُئلت قل بصراحة إنها تجربة. لا تنتحل أي جهة حقيقية.
### قاعدة بيانات العملاء التجريبية (المصدر الوحيد للحقائق)
${s(JSON.stringify(p.scenario.db ?? {}), 7000)}
### سير المكالمة الواقعي
${s(p.scenario.flow, 2500)}
قواعد عامة للسيناريو:
- التحقق من الهوية: قبل كشف أي بيانات شخصية أو مالية أو تنفيذ عملية، اطلب معرّف التحقق المذكور في السيناريو وطابقه مع القاعدة. إذا ما طابق، اطلب إعادة مرة، وبعد 3 محاولات فاشلة اعتذر واعرض التحويل لموظف. لا تذكر البيانات المخزنة للمتصل قبل التحقق ولا تلمّح لها.
- قبل الاستعلام قل جملة انتظار قصيرة طبيعية (مثل: لحظة أشيك لك على النظام) ثم أعطِ النتيجة في نفس الرد.
- العمليات (إيقاف بطاقة، اعتراض، تجديد، شكوى، مطالبة، تغيير باقة…) نفّذها بعد التأكيد عبر create_ticket مع category مناسب وsummary واضح، واذكر رقم المرجع {ref}.
- العرض الإضافي (upsell) إلزامي مرة واحدة في المكالمة: في نفس الرد الذي تنهي فيه أول طلب بنجاح، أضف جملة قصيرة تعرض العرض المناسب من السيناريو (بدون إلحاح، ولا تكرره إذا رفض أو إذا ظهر سابقًا في المكالمة). وبعدها اسأل إذا يحتاج شي ثاني، وعند الوداع اختم بشكل مهني.
- الأسئلة خارج النص: جاوب بشكل طبيعي إذا كانت معلومة عامة بسيطة أو موجودة في القاعدة، وإلا قل إنك ما عندك المعلومة واعرض بديل. إذا قاطعك المتصل، تجاوب مع كلامه الجديد مباشرة.
- لا تخترع أرقامًا غير موجودة في القاعدة.

` : ""}## المخرجات: JSON فقط
{"heard":"كلام المتصل حرفيًا بلهجته/لغته","heard_en":"English","lang":"ar|en","dialect":"emirati|najdi|hijazi|kuwaiti|qatari|bahraini|omani|iraqi|syrian|lebanese|jordanian|palestinian|egyptian|sudanese|moroccan|algerian|tunisian|libyan|yemeni|msa|english|unknown","intent":"BOOKING|ORDER_STATUS|COMPLAINT|CALLBACK|FAQ|PRICING|HOURS|TRANSFER|PAYMENT|SURVEY|GREETING|GOODBYE|SMALL_TALK|UNKNOWN","sentiment":"positive|neutral|negative|angry","action":{"type":"none|create_booking|order_status|create_ticket|request_callback|transfer|end_call|campaign_result","params":{},"ready":false},"reply":"ردك المنطوق","reply_en":"English translation of reply"}
إذا كان الصوت صامتًا أو غير مفهوم: heard="" والرد يطلب الإعادة بلطف وباختصار.`;
}

// ---------- webhooks ----------
function safeUrl(u: string) {
  try {
    const x = new URL(u); if (x.protocol !== "https:") return null;
    const host = x.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host === "metadata.google.internal") return null;
    return x.toString();
  } catch { return null; }
}
async function callWebhook(url: string, secret: string, event: string, payload: any) {
  const u = safeUrl(url); if (!u) return { ok: false, error: "invalid_url" };
  const body = JSON.stringify({ event, ...payload, sent_at: new Date().toISOString() });
  const headers: Record<string, string> = { "content-type": "application/json", "x-ramsa-event": event, "user-agent": "Ramsa-CallCenter/1.0" };
  if (secret) { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)); headers["x-ramsa-signature"] = "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
  const t0 = Date.now();
  try {
    const r = await fetch(u, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(6000) });
    const txt = (await r.text()).slice(0, 4000); let data: any = null; try { data = JSON.parse(txt); } catch { data = { text: txt.slice(0, 300) }; }
    return { ok: r.ok, status: r.status, data, ms: Date.now() - t0 };
  } catch { return { ok: false, error: "timeout", ms: Date.now() - t0 }; }
}

const ACT_KIND: Record<string, [string, string, string]> = { create_booking: ["booking", "BK", "booking"], create_ticket: ["ticket", "TK", "ticket"], request_callback: ["callback", "CB", "callback"], order_status: ["order", "", "order_status"] };
function lookupDemoOrder(p: any, id: string) {
  const clean = id.replace(/\D/g, ""); if (!clean) return null;
  const list = Array.isArray(p.orders) ? p.orders : [];
  return list.find((o: any) => String(o.id ?? "").replace(/\D/g, "") === clean) ?? null;
}
function notifyText(p: any, kind: string, ref: string, params: any) {
  const biz = s(p.name, 60) || "الشركة";
  if (kind === "booking") return `«${biz}»: تم تأكيد حجزك ${params.service ? "لـ" + s(params.service, 60) + " " : ""}يوم ${s(params.date, 12)} الساعة ${s(params.time, 6)}. رقم الحجز ${ref}. للتعديل اتصل بنا.`;
  if (kind === "ticket") return `«${biz}»: استلمنا ${params.category === "complaint" ? "شكواك" : "طلبك"} برقم ${ref}، وبيتواصل معك فريقنا قريبًا. نعتذر عن الإزعاج.`;
  if (kind === "callback") return `«${biz}»: سجّلنا طلب معاودة الاتصال (${ref})${params.preferred_time ? " في " + s(params.preferred_time, 40) : ""}. بنتصل فيك إن شاء الله.`;
  return "";
}
export async function runAction(ws: string, p: any, action: any, call: any) {
  const type = s(action?.type, 30); const spec = ACT_KIND[type]; if (!spec) return null;
  const [kind, prefix, hook] = spec; const params = action.params && typeof action.params === "object" ? JSON.parse(JSON.stringify(action.params).slice(0, 3000)) : {};
  const wh = p.webhooks?.[hook] ? await callWebhook(String(p.webhooks[hook]), s(p.webhook_secret, 200), hook, { params, call: { id: s(call?.id, 60), caller: s(call?.caller, 30), company: s(p.name, 80) } }) : null;
  const res: any = { type, kind, params, source: wh?.ok ? "webhook" : "demo", webhook: wh ? { ok: wh.ok, status: wh.status, error: wh.error, ms: wh.ms } : null };
  if (type === "order_status") {
    if (wh?.ok && wh.data && !wh.data.text) res.order = wh.data;
    else { const o = lookupDemoOrder(p, s(params.order_id, 40)); res.order = o ? { found: true, ...o } : { found: false, order_id: s(params.order_id, 40) }; }
    return res;
  }
  res.ref = s(wh?.ok ? (wh.data?.ref ?? wh.data?.id ?? wh.data?.reference) : "", 40) || refNo(prefix);
  res.notification = { channel: p.notify === "sms" ? "sms" : "whatsapp", to: s(params.phone || call?.caller, 30) || "رقم المتصل", text: notifyText(p, kind, res.ref, params) };
  if (wsOk(ws)) { try { await insertRec(ws, kind, { params, company: s(p.name, 80), call_id: s(call?.id, 60), caller: s(call?.caller, 30), source: res.source, notification: res.notification }, res.ref, "open"); await insertRec(ws, "notification", res.notification, res.ref, "sent"); res.saved = true; } catch (e) { res.saved = false; res.db_error = String(e).slice(0, 80); } }
  return res;
}

// ---------- doc extraction ----------
export const DOC_SYS = `You extract a company's customer-service knowledge from a document (PDF/text, Arabic or English). Return JSON only:
{"name":"company name if stated else empty","about":"1-2 sentence Arabic description","kb":"clean, complete Arabic/English plain-text knowledge base preserving every fact (addresses, phones, policies, procedures)","faqs":[{"q":"","a":""}],"services":[{"name":"","price":"exact as written incl. currency, or empty","note":""}],"hours_text":"working hours as written or empty","policies":"refund/cancellation/delivery/warranty policies as written"}
Never invent anything not in the document. Keep prices exactly as written.`;

export const SUM_SYS = `You analyse a customer-service phone call transcript (Arabic dialects/English) between an AI agent and a caller. Return JSON only:
{"summary":"Arabic summary 2-4 sentences: who called, why, what was done, outcome","summary_en":"English one-liner","intent":"BOOKING|ORDER_STATUS|COMPLAINT|CALLBACK|FAQ|PRICING|HOURS|TRANSFER|PAYMENT|SURVEY|OTHER","sentiment":"positive|neutral|negative|angry","sentiment_score":-1.0..1.0,"resolved":true/false (true only if the caller's need was fully handled by the agent without transfer and without pending follow-up),"follow_up":"what a human should do next in Arabic, or empty","csat_pred":1-5 (predicted caller satisfaction from tone and outcome),"tags":["short Arabic tags"],"caller_name":"if said else empty"}
Base everything only on the transcript.`;

export const CAMP_SYS = `You SIMULATE a realistic outbound customer-service phone call for testing a campaign script (this is a simulation, clearly fictional). The AI agent speaks Emirati Arabic (or the contact's language), short natural phone turns. The customer behaves realistically and varies (busy, cooperative, hesitant, asks a question, declines…) based on the persona hint. 4-10 turns. Return JSON only:
{"lines":[{"who":"agent|customer","text":""}],"outcome":"confirmed|declined|paid|promised|reschedule|survey_done|no_interest|callback|no_answer","detail":"Arabic one-line result","sentiment":"positive|neutral|negative","score":null or 1-5 for surveys,"summary":"Arabic 1-2 sentences"}`;

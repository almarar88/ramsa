// Ramsa AI proxy: TTS, tashkeel, STT, voice agent. Key stays server-side.
const KEY = Deno.env.get("TV_AI_API_KEY") ?? "";
const API = "https://generativelanguage.googleapis.com/v1beta/models/";
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const TEXT_MODELS: [string, any][] = [
  ["gemini-3.5-flash-lite", { thinkingLevel: "low" }],
  ["gemini-3.5-flash", { thinkingLevel: "low" }],
  ["gemini-3.1-flash-lite", { thinkingBudget: 0 }],
  ["gemini-flash-lite-latest", null],
  ["gemini-3.6-flash", { thinkingLevel: "low" }],
  ["gemini-flash-latest", null],
];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });
class Fail extends Error { constructor(public code: string, public status = 502) { super(code); } }

const DIALECTS: Record<string, string> = {
  ae: "Emirati (UAE) Gulf Arabic — use authentic Emirati pronunciation and intonation",
  sa: "Saudi (Najdi/Hijazi urban) Arabic — authentic Saudi pronunciation",
  kw: "Kuwaiti Gulf Arabic — authentic Kuwaiti pronunciation and intonation",
  eg: "Egyptian (Cairene) Arabic — authentic Egyptian pronunciation",
  msa: "Modern Standard Arabic (Fusha), clear news-anchor diction",
  en: "Natural English, neutral accent",
};
const STYLES: Record<string, string> = {
  warm: "warm, friendly, smiling", calm: "calm, soothing, unhurried", formal: "formal, professional, confident",
  excited: "energetic, excited, upbeat", ad: "polished radio-advertisement voice, persuasive", story: "storyteller, expressive and engaging",
};
const PACE: Record<string, string> = { slow: "slightly slow", normal: "natural", fast: "slightly fast" };

function statusCode(s: number) { return s === 429 ? "rate_limit" : s >= 500 ? "busy" : "model_error"; }

async function ttsRaw(prompt: string, speechConfig: any) {
  let last = "busy";
  for (const m of TTS_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let r: Response;
      try {
        r = await fetch(API + m + ":generateContent", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig } }), signal: AbortSignal.timeout(90000) });
      } catch { last = "timeout"; break; }
      if (r.ok) { const j = await r.json(); const d = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData; if (d?.data) return { audio: d.data, mime: d.mimeType, model: m }; last = "empty"; break; }
      await r.body?.cancel(); last = statusCode(r.status);
      if (r.status === 503 && attempt === 0) { await new Promise((s) => setTimeout(s, 600)); continue; }
      break;
    }
  }
  throw new Fail(last, last === "rate_limit" ? 429 : 502);
}
const EMO: Record<string, string> = { neutral: "", happy: "happy and cheerful", sad: "sad and gentle", angry: "firm and slightly angry", whisper: "soft, whispering", proud: "proud and grand", playful: "playful and teasing", serious: "serious and grave" };
async function tts(text: string, voice: string, dialect: string, style: string, pace: string, emotion = "") {
  const prompt = `# DIRECTOR'S NOTES\nAccent: ${DIALECTS[dialect] ?? DIALECTS.ae}.\nTone: ${STYLES[style] ?? STYLES.warm}${EMO[emotion] ? ", " + EMO[emotion] : ""}.\nPace: ${PACE[pace] ?? "natural"}.\nPerform any bracketed audio tags (e.g. [chuckle], [laughs], [sigh], [whispers], [clears throat]) as sounds or delivery cues; never read the tags aloud. Read the transcript exactly as written.\n\n# TRANSCRIPT\n${text}`;
  return ttsRaw(prompt, { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } });
}

async function gem(sys: string, parts: any[], timeout = 30000, models = TEXT_MODELS) {
  let last = "busy";
  for (const [m, think] of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let r: Response;
      try {
        r = await fetch(API + m + ":generateContent", {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2, ...(think ? { thinkingConfig: think } : {}) } }),
          signal: AbortSignal.timeout(timeout),
        });
      } catch { last = "timeout"; break; }
      if (r.ok) {
        const j = await r.json();
        const t = j.candidates?.[0]?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("") ?? "";
        try { const o = JSON.parse(t.replace(/^```(json)?|```$/g, "")); o._m = m; return o; } catch { last = "bad_output"; break; }
      }
      await r.body?.cancel();
      last = statusCode(r.status);
      if (r.status === 503 && attempt === 0) { await new Promise((s) => setTimeout(s, 500)); continue; }
      break;
    }
  }
  throw new Fail(last, last === "rate_limit" ? 429 : 502);
}

const TASHKEEL = `You add full Arabic diacritics (tashkeel/harakat) to text so a speech engine reads it correctly. Respect the dialect given (do not convert dialect words to Fusha; vocalize them as they are pronounced in that dialect). Keep every word, punctuation, emoji, English word and bracketed tag like [chuckle] exactly as is and in place. When grammatical gender or person is ambiguous, assume a first-person speaker addressing a male listener (e.g. فرحت → فِرِحْت، أقولك → أَقُولَك، سمعت → سِمِعْت). Prefer vocalization that reflects dialect pronunciation, and leave sukun-heavy dialect endings natural. Return JSON {"text":"..."}.`;

const STT = `You are a precise Arabic/English speech transcriber specialised in Arabic dialects (Emirati, Saudi, Kuwaiti, Qatari, Bahraini, Omani, Egyptian, Levantine, Iraqi, Maghrebi, MSA).
Transcribe the audio VERBATIM in the language/dialect actually spoken, using common dialect spelling (e.g. Emirati: "شو"، "أبا"، "الحين"، "وايد"). Do not translate, correct or convert dialect to Fusha. Add natural punctuation. Write numbers as spoken words only if ambiguous, otherwise digits.
If there is no intelligible speech, return empty text.
Return JSON: {"text":"...","language":"ar|en|mixed|none","dialect":"emirati|saudi|kuwaiti|qatari|bahraini|omani|egyptian|levantine|iraqi|maghrebi|msa|english|unknown","confidence":0.0-1.0,"cues":["short Arabic notes on words that revealed the dialect, max 3"],"translation_en":"English translation"}`;

function agentSys(kb: string, persona: string, cfg: any = {}) {
  const biz = cfg.business ? ` لدى «${String(cfg.business).slice(0, 80)}»` : "";
  const tone = cfg.tone ? `\nالنبرة المطلوبة: ${String(cfg.tone).slice(0, 200)}.` : "";
  const intents = Array.isArray(cfg.intents) && cfg.intents.length ? `\n\n## نوايا مخصّصة عرّفها صاحب النشاط (استخدم اسمها كما هو في intent، ونفّذ إجراء باسم مماثل بأحرف صغيرة إن احتاج)\n` + cfg.intents.slice(0, 15).map((x: any) => `- ${String(x.name ?? "").replace(/[^A-Za-z0-9_]/g, "").toUpperCase()}: ${String(x.desc ?? "").slice(0, 200)}`).join("\n") : "";
  return `أنت "${persona || "رفيج"}"، وكيل خدمة عملاء صوتي${biz} يرد على مكالمة حيّة.${tone} تفهم كل اللهجات العربية (خصوصًا الإماراتية والخليجية) والإنجليزية.
ترد بنفس لهجة المتصل (إن تكلم إماراتي ترد إماراتي طبيعي: "هلا والله"، "أبشر"، "الحين"، "شو"، "وايد"...). الرد قصير ومنطوق (جملة إلى ثلاث جمل)، بدون رموز أو قوائم، دافئ ومهني. اسأل سؤال تأكيد واحد عند الحاجة قبل تنفيذ إجراء يغيّر شيئًا.
اعتمد فقط على قاعدة المعرفة والحالة أدناه. لا تخترع معلومات أو أسعار أو سياسات غير موجودة؛ إن لم تعرف قل ذلك واعرض التحويل لموظف.

## قاعدة المعرفة
${kb.slice(0, 8000)}

${intents}

## الإجراءات المتاحة (تجريبية)
lookup_order {order_id} | reschedule_delivery {order_id, day, time} (اعرض موعدًا ثم نفّذ بعد موافقة المتصل) | cancel_order {order_id} (بعد تأكيد) | send_notification {channel:"whatsapp|sms", message} | update_address {order_id, address} | answer_faq {topic} | handover {reason} (عند طلب موظف بشري، أو الغضب الشديد، أو خارج نطاق المعرفة)
status: "proposed" عندما تقترح وتنتظر التأكيد، "done" عندما يوافق المتصل أو لا يحتاج تأكيدًا، "none" بلا إجراء.

## المخرجات
JSON فقط:
{"heard":"ما قاله المتصل حرفيًا بلهجته (من الصوت أو النص)","heard_en":"English translation","dialect":"emirati|saudi|kuwaiti|qatari|bahraini|omani|egyptian|levantine|iraqi|msa|english|unknown","intent":"SNAKE_CASE_EN مثل RESCHEDULE_DELIVERY, TRACK_ORDER, CANCEL_ORDER, FAQ, GREETING, HANDOVER, SMALL_TALK, UNKNOWN","confidence":0.0-1.0,"actions":[{"name":"...","params":{},"status":"proposed|done"}],"reply":"ردك المنطوق بنفس اللهجة","reply_en":"English translation","handover":false,"resolved":false}
إن كان الصوت فارغًا أو غير مفهوم: heard="" وreply يطلب الإعادة بلطف.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: true, name: "ramsa" });
  try {
    if (!KEY) throw new Fail("no_key", 500);
    const b = await req.json();
    const mode = String(b.mode ?? "");
    if (mode === "ping") return json({ ok: true });
    if (mode === "tts") {
      const text = String(b.text ?? "").trim();
      if (!text) throw new Fail("empty_text", 400);
      if (text.length > 1500) throw new Fail("too_long", 400);
      return json(await tts(text, String(b.voice ?? "Charon").replace(/[^A-Za-z]/g, ""), String(b.dialect ?? "ae"), String(b.style ?? "warm"), String(b.pace ?? "normal"), String(b.emotion ?? "")));
    }
    if (mode === "tashkeel") {
      const text = String(b.text ?? "").slice(0, 1500);
      if (!text.trim()) throw new Fail("empty_text", 400);
      const o = await gem(TASHKEEL, [{ text: `Dialect: ${DIALECTS[String(b.dialect)] ?? "Arabic"}\n\nText:\n${text}` }], 30000, [TEXT_MODELS[1], TEXT_MODELS[0], ...TEXT_MODELS.slice(2)]);
      return json({ text: String(o.text ?? text), model: o._m });
    }
    if (mode === "stt") {
      const audio = String(b.audio ?? "");
      if (audio.length < 200) throw new Fail("empty_audio", 400);
      if (audio.length > 9_000_000) throw new Fail("too_long", 400);
      const hint = b.hint && b.hint !== "auto" ? `\nThe user expects dialect: ${b.hint}, but detect honestly.` : "";
      const o = await gem(STT + hint, [{ inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: audio } }, { text: "Transcribe this audio." }], 60000);
      return json(o);
    }
    if (mode === "agent") {
      const parts: any[] = [];
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-12).map((h: any) => `${h.role === "agent" ? "الوكيل" : "المتصل"}: ${String(h.text ?? "").slice(0, 400)}`).join("\n");
      const ctx = `حالة النظام (تجريبية): ${JSON.stringify(b.state ?? {}).slice(0, 2000)}\n\nالمحادثة السابقة:\n${hist || "(بداية المكالمة)"}\n\n`;
      if (b.audio) {
        if (String(b.audio).length > 4_000_000) throw new Fail("too_long", 400);
        parts.push({ text: ctx + "كلام المتصل الجديد في المقطع الصوتي التالي:" }, { inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: String(b.audio) } });
      } else {
        const t = String(b.text ?? "").trim().slice(0, 800);
        if (!t) throw new Fail("empty_text", 400);
        parts.push({ text: ctx + `كلام المتصل الجديد: «${t}»` });
      }
      const o = await gem(agentSys(String(b.kb ?? ""), String(b.persona ?? "").slice(0, 40), b.cfg ?? {}), parts, 40000);
      if (b.speak !== false && o.reply) {
        const dmap: Record<string, string> = { emirati: "ae", saudi: "sa", kuwaiti: "kw", egyptian: "eg", english: "en", msa: "msa", qatari: "ae", bahraini: "kw", omani: "ae" };
        try { o.tts = await tts(String(o.reply), String(b.voice ?? "Kore").replace(/[^A-Za-z]/g, ""), dmap[o.dialect] ?? "ae", "warm", "normal"); }
        catch (e) { o.tts_error = e instanceof Fail ? e.code : "busy"; }
      }
      return json(o);
    }
    if (mode === "translate") {
      const sys = `You are a live interpreter between Arabic dialects (Emirati, Saudi, Kuwaiti, Egyptian, Levantine, MSA...) and English. Detect the source language/dialect of the input (audio or text). Translate faithfully into the TARGET, written the way a native speaker of that target dialect would naturally say it (dialect spelling, not Fusha, unless target is MSA). Keep names and numbers. Return JSON {"source_text":"verbatim transcript of input","source_dialect":"emirati|saudi|kuwaiti|qatari|bahraini|omani|egyptian|levantine|iraqi|maghrebi|msa|english|unknown","translation":"..."}`;
      const tgt = String(b.target ?? "en");
      const tname: Record<string, string> = { en: "English", ae: "Emirati Arabic", sa: "Saudi Arabic", kw: "Kuwaiti Arabic", eg: "Egyptian Arabic", msa: "Modern Standard Arabic" };
      const parts: any[] = [{ text: `TARGET: ${tname[tgt] ?? "English"}` }];
      if (b.audio) { if (String(b.audio).length > 4_000_000) throw new Fail("too_long", 400); parts.push({ inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: String(b.audio) } }); }
      else { const t = String(b.text ?? "").trim().slice(0, 1500); if (!t) throw new Fail("empty_text", 400); parts.push({ text: "INPUT: " + t }); }
      const o = await gem(sys, parts, 40000);
      if (b.speak && o.translation) { try { o.tts = await tts(String(o.translation), String(b.voice ?? "Kore").replace(/[^A-Za-z]/g, ""), tgt, "warm", "normal"); } catch (e) { o.tts_error = e instanceof Fail ? e.code : "busy"; } }
      return json(o);
    }
    if (mode === "summarize") {
      const audio = String(b.audio ?? ""); if (audio.length < 200) throw new Fail("empty_audio", 400); if (audio.length > 9_000_000) throw new Fail("too_long", 400);
      const sys = `You analyse a meeting/recording (Arabic dialects and/or English). Return JSON only:
{"segments":[{"speaker":"المتحدث 1","start":"mm:ss","text":"verbatim in spoken dialect"}],"summary":"concise Arabic summary (3-6 sentences)","key_points":["Arabic"],"action_items":[{"task":"Arabic","owner":"speaker label or name if said, else غير محدد","due":"if mentioned else empty"}],"decisions":["Arabic"],"language":"..."}
Distinguish speakers by voice; label them المتحدث 1، المتحدث 2… (use real names only if clearly said). Timestamps are approximate. Never invent content; if no action items, return an empty list.${b.offset ? " This chunk starts at " + String(b.offset).slice(0, 8) + " into the recording; make timestamps absolute." : ""}`;
      return json(await gem(sys, [{ inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: audio } }, { text: "Analyse this recording." }], 90000, [TEXT_MODELS[1], TEXT_MODELS[0], ...TEXT_MODELS.slice(2)]));
    }
    if (mode === "summarize_text") {
      const t = String(b.text ?? "").trim().slice(0, 60000); if (!t) throw new Fail("empty_text", 400);
      const sys = `You get a meeting transcript (with speaker labels, possibly from several chunks). Return JSON {"summary":"concise Arabic summary (4-8 sentences)","key_points":["Arabic"],"action_items":[{"task":"Arabic","owner":"label/name or غير محدد","due":""}],"decisions":["Arabic"]}. Use only what is in the transcript.`;
      return json(await gem(sys, [{ text: t }], 60000, [TEXT_MODELS[1], TEXT_MODELS[0], ...TEXT_MODELS.slice(2)]));
    }
    if (mode === "srt") {
      const audio = String(b.audio ?? ""); if (audio.length < 200) throw new Fail("empty_audio", 400); if (audio.length > 9_000_000) throw new Fail("too_long", 400);
      const sys = `Create subtitles for this audio. Transcribe verbatim in the spoken language/dialect. Split into short cues (max ~7 seconds, max ~42 characters per line, max 2 lines). Return JSON {"cues":[{"start":seconds_float,"end":seconds_float,"text":"..."}]} with timestamps relative to the start of this audio, aligned as precisely as you can.${b.translate ? " Put an English translation of each cue in field \"en\"." : ""}`;
      return json(await gem(sys, [{ inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: audio } }, { text: "Subtitle this audio." }], 90000, [TEXT_MODELS[1], TEXT_MODELS[0], ...TEXT_MODELS.slice(2)]));
    }
    if (mode === "podcast_script") {
      const topic = String(b.topic ?? "").trim().slice(0, 600); if (!topic) throw new Fail("empty_text", 400);
      const n = Math.min(14, Math.max(4, Number(b.turns) || 8));
      const sys = `Write a natural, engaging podcast dialogue between two hosts named ${String(b.a ?? "حمدان").slice(0, 20)} and ${String(b.b ?? "ميثاء").slice(0, 20)}, in ${DIALECTS[String(b.dialect)] ?? DIALECTS.ae}. Exactly ${n} short turns (1-3 sentences each), alternating, starting with the first host. Conversational, warm, occasional light humour; you may use audio tags like [laughs] or [chuckle] sparingly. Stick to well-known, verifiable facts; do not invent statistics, dates or quotes. Return JSON {"title":"...","lines":[{"speaker":"A"|"B","text":"..."}]}`;
      return json(await gem(sys, [{ text: "Topic: " + topic }], 40000, [TEXT_MODELS[1], TEXT_MODELS[0], ...TEXT_MODELS.slice(2)]));
    }
    if (mode === "podcast_audio") {
      const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 16);
      if (!lines.length) throw new Fail("empty_text", 400);
      const A = String(b.va ?? "Charon").replace(/[^A-Za-z]/g, ""), B = String(b.vb ?? "Kore").replace(/[^A-Za-z]/g, "");
      const body = lines.map((l: any) => `${l.speaker === "B" ? "Speaker2" : "Speaker1"}: ${String(l.text ?? "").slice(0, 400)}`).join("\n");
      if (body.length > 4000) throw new Fail("too_long", 400);
      const prompt = `# DIRECTOR'S NOTES\nA relaxed, lively two-host podcast. Accent: ${DIALECTS[String(b.dialect)] ?? DIALECTS.ae}. Perform bracketed audio tags as sounds, never read them aloud.\n\n# TRANSCRIPT\n${body}`;
      return json(await ttsRaw(prompt, { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [{ speaker: "Speaker1", voiceConfig: { prebuiltVoiceConfig: { voiceName: A } } }, { speaker: "Speaker2", voiceConfig: { prebuiltVoiceConfig: { voiceName: B } } }] } }));
    }
    if (mode === "voicenote") {
      const sys = `You help the user reply to a WhatsApp voice note. Understand the received message (audio or text, any Arabic dialect or English). Then write the user's reply as a short spoken voice note (1-4 sentences) in ${DIALECTS[String(b.dialect)] ?? "the same dialect as the sender"}, with tone: ${String(b.tone ?? "friendly").slice(0, 60)}. ${b.intent ? "The user wants to say: " + String(b.intent).slice(0, 300) + "." : "Choose a polite, sensible reply."} Do not invent commitments beyond what the user asked. Return JSON {"heard":"verbatim transcript of the received message","heard_dialect":"...","gist":"one-line Arabic summary of what they want","reply":"the reply text to be spoken"}`;
      const parts: any[] = [];
      if (b.audio) { if (String(b.audio).length > 4_000_000) throw new Fail("too_long", 400); parts.push({ inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: String(b.audio) } }, { text: "Received voice note above." }); }
      else { const t = String(b.text ?? "").trim().slice(0, 1500); if (!t) throw new Fail("empty_text", 400); parts.push({ text: "Received message: " + t }); }
      const o = await gem(sys, parts, 40000);
      const dmap: Record<string, string> = { emirati: "ae", saudi: "sa", kuwaiti: "kw", egyptian: "eg", english: "en", msa: "msa" };
      const d = String(b.dialect ?? "") || dmap[o.heard_dialect] || "ae";
      if (o.reply) { try { o.tts = await tts(String(o.reply), String(b.voice ?? "Charon").replace(/[^A-Za-z]/g, ""), d, "warm", "normal"); } catch (e) { o.tts_error = e instanceof Fail ? e.code : "busy"; } }
      return json(o);
    }
    throw new Fail("bad_mode", 400);
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.code }, e.status);
    return json({ error: "server" }, 500);
  }
});

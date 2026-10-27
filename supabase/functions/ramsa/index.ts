import { ccSys, runAction, insertRec, listRec, DOC_SYS, SUM_SYS, CAMP_SYS } from "./cc.ts";
// Nabra AI proxy: TTS, tashkeel, STT, voice agent. Key stays server-side.
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
  ae: "Emirati (UAE) Gulf Arabic — authentic Emirati pronunciation and intonation (e.g. ج often as ي in words like ريال/دياية, ك→چ in some words, relaxed Gulf melody, words like شو، وايد، الحين، أبا)",
  sa: "Saudi Najdi (Riyadh) Arabic — authentic Najdi pronunciation: ق as hard g, ك→تس in some words, words like وش، ابغى، زين، مره، كذا; confident central-Arabian melody",
  hj: "Saudi Hijazi (Jeddah/Makkah) Arabic — Hijazi urban accent: ق as g or ء, ث→ت/س, words like إيش، أبغى، دحين، مرة، كدا; soft Red-Sea urban melody",
  kw: "Kuwaiti Gulf Arabic — authentic Kuwaiti pronunciation: ج→ي, ك→چ, words like شلونك، وايد، چذي، باچر; Kuwaiti sing-song intonation",
  qa: "Qatari Gulf Arabic — authentic Qatari pronunciation: ج→ي, ق→g, words like شلونك، وايد، الحين، يبا; Qatari melody close to Emirati/Bahraini but distinct",
  bh: "Bahraini Gulf Arabic — authentic Bahraini (Manama) accent: soft rounded vowels, words like شلونك، وايد، شنو، الحين; characteristic Bahraini lilt",
  om: "Omani Arabic (Muscat) — authentic Omani pronunciation: clear ق, words like كيف حالك، وايد، ذيلا، الحين، شو; calm Omani rhythm",
  iq: "Iraqi (Baghdadi) Arabic — authentic Baghdadi pronunciation: ك→چ, ق→g, words like شلونك، هواية، شكو ماكو، هسة، أريد; Iraqi intonation",
  sy: "Syrian (Damascene) Levantine Arabic — Damascus accent: ق→ء, soft ج (zh), words like شو، كتير، هلق، بدي، منيح; melodic Shami intonation",
  lb: "Lebanese (Beirut) Levantine Arabic — Beirut accent: ق→ء, vowels tilted (e.g. ـة as e), words like كيفك، كتير، هلق، بدي، شو; light Lebanese melody, occasional French-like flair",
  jo: "Jordanian (Amman urban) Levantine Arabic — Ammani accent: ق often as g or ء, words like شو، كثير، هسا، بدي، إشي; Jordanian intonation",
  ps: "Palestinian (urban Jerusalem/Nablus) Levantine Arabic — Palestinian accent: ق→ء or k, words like شو، كتير، هلأ، بدي، منيح; Palestinian rhythm",
  eg: "Egyptian (Cairene) Arabic — authentic Cairo accent: ج as hard g, ق→ء, words like إزيك، أوي، دلوقتي، عايز، كده; Egyptian intonation",
  sd: "Sudanese (Khartoum) Arabic — Sudanese accent: ق as g, words like زول، شنو، داير، هسي، كويس شديد; slower, warm Sudanese melody",
  ma: "Moroccan Darija (Casablanca/Rabat) — authentic Moroccan pronunciation: reduced short vowels, words like واخا، بزاف، دابا، بغيت، شنو، كيداير; Moroccan rhythm",
  dz: "Algerian Darija (Algiers) — Algerian accent: words like واش، بزاف، درك، نحب، صح، كيراك; Algerian intonation",
  tn: "Tunisian Derja (Tunis) — Tunisian accent: words like شنوة، برشا، توا، نحب، باهي، شنحوالك; quick Tunisian melody",
  ly: "Libyan Arabic (Tripoli) — Libyan accent: ق as g, words like شن، واجد، توا، نبي، باهي، كيف حالك; Libyan intonation",
  ye: "Yemeni Arabic (Sana'ani) — Sana'a accent: ق as g, words like ايش، قدك، ذلحين، اشتي، تمام; Yemeni rhythm",
  msa: "Modern Standard Arabic (Fusha), clear news-anchor diction with correct i'rab where natural",
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
// Policy: Nabra does not generate Quran recitation. Heuristic guard (Quranic brackets and well-known verses); not exhaustive.
const QURAN_RX = [/[﴿﴾]/, /قل هو الله أحد|قُلْ هُوَ اللَّهُ أَحَدٌ/, /الحمد لله رب العالمين\s*[،,.]?\s*الرحمن الرحيم/, /صدق الله العظيم/, /قل أعوذ برب (الفلق|الناس)/, /إنا أعطيناك الكوثر/, /الله لا إله إلا هو الحي القيوم/];
export function quranGuard(t: string) { const plain = t.replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, ""); if (QURAN_RX.some((r) => r.test(plain) || r.test(t))) throw new Fail("quran_blocked", 400); }
async function tts(text: string, voice: string, dialect: string, style: string, pace: string, emotion = "") {
  quranGuard(text);
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

const STT = `You are a precise Arabic/English speech transcriber specialised in Arabic dialects (Emirati, Saudi Najdi/Hijazi, Kuwaiti, Qatari, Bahraini, Omani, Iraqi, Syrian, Lebanese, Jordanian, Palestinian, Egyptian, Sudanese, Moroccan, Algerian, Tunisian, Libyan, Yemeni, MSA).
Transcribe the audio VERBATIM in the language/dialect actually spoken, using common dialect spelling (e.g. Emirati: "شو"، "أبا"، "الحين"، "وايد"). Do not translate, correct or convert dialect to Fusha. Add natural punctuation. Write numbers as spoken words only if ambiguous, otherwise digits.
If there is no intelligible speech, return empty text.
Return JSON: {"text":"...","language":"ar|en|mixed|none","dialect":"emirati|najdi|hijazi|kuwaiti|qatari|bahraini|omani|iraqi|syrian|lebanese|jordanian|palestinian|egyptian|sudanese|moroccan|algerian|tunisian|libyan|yemeni|msa|english|unknown","confidence":0.0-1.0,"cues":["short Arabic notes on words that revealed the dialect, max 3"],"translation_en":"English translation"}`;

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
{"heard":"ما قاله المتصل حرفيًا بلهجته (من الصوت أو النص)","heard_en":"English translation","dialect":"emirati|najdi|hijazi|kuwaiti|qatari|bahraini|omani|iraqi|syrian|lebanese|jordanian|palestinian|egyptian|sudanese|moroccan|algerian|tunisian|libyan|yemeni|msa|english|unknown","intent":"SNAKE_CASE_EN مثل RESCHEDULE_DELIVERY, TRACK_ORDER, CANCEL_ORDER, FAQ, GREETING, HANDOVER, SMALL_TALK, UNKNOWN","confidence":0.0-1.0,"actions":[{"name":"...","params":{},"status":"proposed|done"}],"reply":"ردك المنطوق بنفس اللهجة","reply_en":"English translation","handover":false,"resolved":false}
إن كان الصوت فارغًا أو غير مفهوم: heard="" وreply يطلب الإعادة بلطف.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: true, name: "ramsa" });
  if (new URL(req.url).searchParams.get("echo") === "1") { let ev = ""; try { ev = String((await req.json()).event ?? ""); } catch {} return json({ ok: true, ref: "WH-" + Math.floor(100000 + Math.random() * 900000), message: "Received by the Nabra demo webhook receiver", event: ev }); }
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
        const dmap: Record<string, string> = { emirati: "ae", saudi: "sa", najdi: "sa", hijazi: "hj", kuwaiti: "kw", qatari: "qa", bahraini: "bh", omani: "om", iraqi: "iq", levantine: "sy", syrian: "sy", lebanese: "lb", jordanian: "jo", palestinian: "ps", egyptian: "eg", sudanese: "sd", maghrebi: "ma", moroccan: "ma", algerian: "dz", tunisian: "tn", libyan: "ly", yemeni: "ye", english: "en", msa: "msa" };
        try { o.tts = await tts(String(o.reply), String(b.voice ?? "Kore").replace(/[^A-Za-z]/g, ""), dmap[o.dialect] ?? "ae", "warm", "normal"); }
        catch (e) { o.tts_error = e instanceof Fail ? e.code : "busy"; }
      }
      return json(o);
    }
    if (mode === "translate") {
      const sys = `You are a live interpreter between Arabic dialects (Emirati, Saudi, Kuwaiti, Egyptian, Levantine, MSA...) and English. Detect the source language/dialect of the input (audio or text). Translate faithfully into the TARGET, written the way a native speaker of that target dialect would naturally say it (dialect spelling, not Fusha, unless target is MSA). Keep names and numbers. Return JSON {"source_text":"verbatim transcript of input","source_dialect":"emirati|najdi|hijazi|kuwaiti|qatari|bahraini|omani|iraqi|syrian|lebanese|jordanian|palestinian|egyptian|sudanese|moroccan|algerian|tunisian|libyan|yemeni|msa|english|unknown","translation":"..."}`;
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
    if (mode === "dub") {
      const audio = String(b.audio ?? ""); if (audio.length < 200) throw new Fail("empty_audio", 400); if (audio.length > 9_000_000) throw new Fail("too_long", 400);
      const target = DIALECTS[String(b.target ?? "en")] ?? DIALECTS.en;
      const sys = `You prepare a voice DUB of this audio. Transcribe the speech into segments (natural sentences, 2-9 seconds each) with precise start/end seconds relative to the audio start, then translate each segment into the TARGET: ${target}. The translation will be SPOKEN by a voice actor in the same time slot, so keep it natural, spoken, and about the same length (do not exceed the segment duration at a normal pace). Keep names/brands as-is. Detect speaker changes (speaker: 1,2,...) and speaker gender if obvious. Return JSON only: {"source_lang":"","segments":[{"start":0.0,"end":0.0,"speaker":1,"gender":"m|f|?","text":"original","tr":"translation in target"}]}`;
      return json(await gem(sys, [{ inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: audio } }, { text: "Prepare the dub." }], 110000, [TEXT_MODELS[1], TEXT_MODELS[0], ...TEXT_MODELS.slice(2)]));
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
      const body = lines.map((l: any) => `${l.speaker === "B" ? "Speaker2" : "Speaker1"}: ${String(l.text ?? "").slice(0, 400)}`).join("\n"); quranGuard(body);
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
      const dmap: Record<string, string> = { emirati: "ae", saudi: "sa", najdi: "sa", hijazi: "hj", kuwaiti: "kw", qatari: "qa", bahraini: "bh", omani: "om", iraqi: "iq", levantine: "sy", syrian: "sy", lebanese: "lb", jordanian: "jo", palestinian: "ps", egyptian: "eg", sudanese: "sd", maghrebi: "ma", moroccan: "ma", algerian: "dz", tunisian: "tn", libyan: "ly", yemeni: "ye", english: "en", msa: "msa" };
      const d = String(b.dialect ?? "") || dmap[o.heard_dialect] || "ae";
      if (o.reply) { try { o.tts = await tts(String(o.reply), String(b.voice ?? "Charon").replace(/[^A-Za-z]/g, ""), d, "warm", "normal"); } catch (e) { o.tts_error = e instanceof Fail ? e.code : "busy"; } }
      return json(o);
    }
    if (mode.startsWith("cc_") || mode === "live_token") return json(await cc(mode, b));
    throw new Fail("bad_mode", 400);
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.code }, e.status);
    return json({ error: "server" }, 500);
  }
});

const wsOk = (w: unknown) => /^[A-Za-z0-9_-]{16,64}$/.test(String(w ?? ""));
const DMAP: Record<string, string> = { emirati: "ae", saudi: "sa", najdi: "sa", hijazi: "hj", kuwaiti: "kw", qatari: "qa", bahraini: "bh", omani: "om", iraqi: "iq", levantine: "sy", syrian: "sy", lebanese: "lb", jordanian: "jo", palestinian: "ps", egyptian: "eg", sudanese: "sd", maghrebi: "ma", moroccan: "ma", algerian: "dz", tunisian: "tn", libyan: "ly", yemeni: "ye", english: "en", msa: "msa" };
const FAST: [string, any][] = [["gemini-3.5-flash", { thinkingLevel: "minimal" }], ["gemini-3.5-flash-lite", { thinkingLevel: "minimal" }], TEXT_MODELS[2]];
const FIRST35: [string, any][] = [TEXT_MODELS[1], TEXT_MODELS[0], ...TEXT_MODELS.slice(2)];
const speakRef = (ref: string) => ref.replace(/\D/g, "").split("").join(" ");
async function cc(mode: string, b: any): Promise<any> {
  const ws = String(b.ws ?? "");
  if (mode === "live_token") {
    // Mint a short-lived, single-use Gemini Live token with the system prompt/tools LOCKED server-side (the real key never leaves the server).
    const p = b.profile && typeof b.profile === "object" ? JSON.parse(JSON.stringify(b.profile).slice(0, 150000) || "{}") : {}; const st = b.state && typeof b.state === "object" ? b.state : {};
    const full = ccSys(p, st); const cut = full.indexOf("## المخرجات: JSON فقط");
    const sys = (cut > 0 ? full.slice(0, cut) : full).replace(/## الإجراءات \(أنظمة حقيقية متصلة\)[\s\S]*?(?=رقم هاتف المتصل)/, "") + `
## مكالمة صوتية مباشرة
أنت تتكلم بالصوت مباشرة في مكالمة هاتفية مستمرة. ردود قصيرة جدًا (جملة أو جملتين)، طبيعية، بدون قوائم. إذا قاطعك المتصل توقف وتجاوب مع كلامه الجديد.
استخدم الأدوات (functions) لتنفيذ الإجراءات: create_booking, order_status, create_ticket, request_callback, transfer, end_call. قبل أداة تحتاج وقت قل كلمة قصيرة مثل «لحظة أشيك لك». بعد نتيجة الأداة أخبر المتصل بالنتيجة ورقم المرجع (ref) بنطق الأرقام رقمًا رقمًا. لا تقرأ JSON أبدًا. لا تنفذ حجزًا أو تذكرة إلا بعد تأكيد المتصل.
إذا وصلتك رسالة نصية تبدأ بـ [نظام] فهي حدث من النظام (مثل ضغط رقم من لوحة المفاتيح أو بداية المكالمة) وليست كلام المتصل.
عند الوداع النهائي قل جملة الختام ثم استدعِ end_call. إذا طلب المتصل موظفًا بشريًا أو حسب قواعد التصعيد: قل جملة واحدة قصيرة («أبشر، بحولك الحين لموظف») ثم استدعِ transfer فورًا في نفس الرد، بدون أسئلة إضافية وبدون عروض. لا تكرر نفس الجملة مرتين. لا تنطق أبدًا أسماء الأدوات أو كلمات إنجليزية تقنية مثل end_call أو call_end. إذا كان كلام المتصل غير واضح أو بلغة غريبة اطلب منه يعيد بلطف.`;
    const str = (d = "") => ({ type: "STRING", description: d });
    const tools = [{ functionDeclarations: [
      { name: "create_booking", description: "Book an appointment/table after the caller confirmed.", parameters: { type: "OBJECT", properties: { service: str(), date: str("YYYY-MM-DD"), time: str("HH:MM"), name: str(), phone: str(), people: str(), notes: str() }, required: ["date", "time", "name"] } },
      { name: "order_status", description: "Look up an order status by id.", parameters: { type: "OBJECT", properties: { order_id: str() }, required: ["order_id"] } },
      { name: "create_ticket", description: "Create a complaint/technical/billing/request ticket (e.g. block card, dispute, plan change, claim) after confirmation.", parameters: { type: "OBJECT", properties: { category: str("complaint|technical|billing|request|other"), summary: str(), severity: str("low|medium|high"), name: str(), phone: str() }, required: ["category", "summary"] } },
      { name: "request_callback", description: "Schedule a callback.", parameters: { type: "OBJECT", properties: { name: str(), phone: str(), preferred_time: str(), reason: str() }, required: ["preferred_time"] } },
      { name: "transfer", description: "Transfer the call to a human agent per escalation rules.", parameters: { type: "OBJECT", properties: { reason: str(), department: str() }, required: ["reason"] } },
      { name: "end_call", description: "End the call after the final goodbye.", parameters: { type: "OBJECT", properties: {} } } ] }];
    const voice = String(b.voice ?? "Kore").replace(/[^A-Za-z]/g, "") || "Kore";
    const models = ["gemini-3.1-flash-live-preview", "gemini-3.8-live"];
    const setup = (m: string) => ({ model: "models/" + m, generationConfig: { responseModalities: ["AUDIO"], temperature: 0.4, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      systemInstruction: { parts: [{ text: sys }] }, tools, inputAudioTranscription: {}, outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: "START_SENSITIVITY_HIGH", endOfSpeechSensitivity: "END_SENSITIVITY_HIGH", prefixPaddingMs: 120, silenceDurationMs: 450 } },
      contextWindowCompression: { slidingWindow: {} } });
    const m = models[0]; const now = Date.now();
    const r = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ uses: 1, expireTime: new Date(now + 30 * 60e3).toISOString(), newSessionExpireTime: new Date(now + 2 * 60e3).toISOString(), bidiGenerateContentSetup: setup(m) }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.name) throw new Fail(r.status === 429 ? "rate_limit" : "busy", 502);
    return { token: j.name, model: m, setup: { ...setup(m), systemInstruction: undefined, tools: undefined } };
  }
  if (mode === "cc_action") {
    const p = b.profile && typeof b.profile === "object" ? JSON.parse(JSON.stringify(b.profile).slice(0, 150000) || "{}") : {};
    const r = await runAction(ws, p, { type: String(b.action?.type ?? ""), params: b.action?.params ?? {}, ready: true }, { id: b.call_id, caller: b.state?.caller });
    return { result: r };
  }
  if (mode === "cc_turn") {
    const p = b.profile && typeof b.profile === "object" ? b.profile : {}; const st = b.state && typeof b.state === "object" ? b.state : {};
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-14).map((h: any) => `${h.role === "agent" ? "الموظف" : h.role === "system" ? "النظام" : "المتصل"}: ${String(h.text ?? "").slice(0, 500)}`).join("\n");
    const ctx = `المكالمة حتى الآن:\n${hist || "(بداية المكالمة)"}\n\n`;
    const parts: any[] = [];
    if (b.audio) { if (String(b.audio).length > 4_000_000) throw new Fail("too_long", 400); parts.push({ text: ctx + "كلام المتصل الجديد في المقطع الصوتي التالي:" }, { inlineData: { mimeType: String(b.mime ?? "audio/wav"), data: String(b.audio) } }); }
    else if (b.dtmf != null && String(b.dtmf) !== "") parts.push({ text: ctx + `المتصل ضغط الرقم «${String(b.dtmf).replace(/[^0-9*#]/g, "").slice(0, 4)}» على لوحة المفاتيح.` });
    else { const t = String(b.text ?? "").trim().slice(0, 800); if (!t) throw new Fail("empty_text", 400); parts.push({ text: ctx + `كلام المتصل الجديد: «${t}»` }); }
    const t0 = Date.now(); const sys = ccSys(p, st);
    let o: any; try { o = await Promise.any([gem(sys, parts, 20000, [["gemini-3.5-flash-lite", { thinkingLevel: "minimal" }]]), gem(sys, parts, 20000, [["gemini-3.5-flash", { thinkingLevel: "minimal" }]])]); }
    catch { o = await gem(sys, parts, 25000, TEXT_MODELS.slice(2)); } const ms: any = { llm: Date.now() - t0 };
    o.action = o.action && typeof o.action === "object" ? o.action : { type: "none", params: {}, ready: false };
    let reply = String(o.reply ?? "");
    if (o.action.ready && ["create_booking", "order_status", "create_ticket", "request_callback"].includes(o.action.type)) {
      const t1 = Date.now(); const r = await runAction(ws, p, o.action, { id: b.call_id, caller: st.caller }); ms.action = Date.now() - t1; o.action_result = r;
      if (r?.type === "order_status") {
        const t2 = Date.now();
        try { const o2 = await gem(`You are the phone agent "${String(p.agent_name ?? "سلامة").slice(0, 40)}" of «${String(p.name ?? "").slice(0, 80)}». Tell the caller the order status in ${o.lang === "en" ? "English" : p.dialect_mode === "mirror" ? "the caller's Arabic dialect (" + o.dialect + ")" : "natural Emirati Arabic"}, 1-2 short spoken sentences, based ONLY on this system result. If found=false, say you couldn't find that number and ask them to repeat/verify it. Return JSON {"reply":"","reply_en":""}.`, [{ text: "SYSTEM RESULT: " + JSON.stringify(r.order).slice(0, 2000) }], 9000, FAST); reply = String(o2.reply ?? reply); o.reply_en = o2.reply_en ?? o.reply_en; }
        catch { const od = r.order ?? {}; reply = od.found === false ? (o.lang === "en" ? "Sorry, I couldn't find that order number. Could you repeat it?" : "المعذرة، ما لقيت رقم الطلب هذا. ممكن تعيده علي؟") : (o.lang === "en" ? `Your order${od.item ? " for " + od.item : ""} is ${od.status ?? "being processed"}${od.eta ? ", expected " + od.eta : ""}.` : `طلبك${od.item ? " (" + od.item + ")" : ""} حالته: ${od.status ?? "قيد المعالجة"}${od.eta ? "، والموعد المتوقع " + od.eta : ""}.`); }
        ms.llm2 = Date.now() - t2;
      } else if (r?.ref) { reply = reply.includes("{ref}") ? reply.replaceAll("{ref}", speakRef(r.ref)) : reply + (o.lang === "en" ? ` Your reference number is ${speakRef(r.ref)}.` : ` ورقم المرجع ${speakRef(r.ref)}.`); if (o.reply_en) o.reply_en = String(o.reply_en).replaceAll("{ref}", r.ref); }
    }
    reply = reply.replaceAll("{ref}", "").trim(); o.reply = reply;
    if (b.speak !== false && reply) {
      const d = o.lang === "en" ? "en" : p.dialect_mode === "mirror" ? DMAP[o.dialect] ?? "ae" : "ae"; const t3 = Date.now();
      try { o.tts = await tts(reply, String(b.voice ?? "Kore").replace(/[^A-Za-z]/g, ""), d, "warm", "normal"); } catch (e) { o.tts_error = e instanceof Fail ? e.code : "busy"; }
      ms.tts = Date.now() - t3;
    }
    o.ms = ms; o.model = o._m; return o;
  }
  if (mode === "cc_summary") {
    const lines = (Array.isArray(b.transcript) ? b.transcript : []).slice(0, 200).map((l: any) => `${l.role === "agent" ? "الموظف الآلي" : l.role === "system" ? "النظام" : "المتصل"}: ${String(l.text ?? "").slice(0, 600)}`).join("\n");
    let a: any;
    if (!lines.trim()) a = { summary: "مكالمة بدون كلام (أُغلقت قبل أن يتكلم المتصل).", intent: "OTHER", sentiment: "neutral", sentiment_score: 0, resolved: false, follow_up: "", csat_pred: 3, tags: ["بدون كلام"] };
    else a = await gem(SUM_SYS, [{ text: (b.meta?.transferred ? "ملاحظة: تم تحويل المكالمة لموظف بشري.\n" : "") + lines }], 40000, FIRST35);
    if (b.meta?.transferred) a.resolved = false;
    let id = null, save_error = null;
    if (b.save !== false && wsOk(ws)) { try { const row = await insertRec(ws, "call", { ...JSON.parse(JSON.stringify(b.meta ?? {}).slice(0, 20000)), transcript: (b.transcript ?? []).slice(0, 200), analysis: a }, String(b.meta?.call_id ?? "").slice(0, 60), a.resolved ? "resolved" : "open"); id = row.id; } catch (e) { save_error = String(e).slice(0, 80); } }
    return { analysis: a, id, save_error };
  }
  if (mode === "cc_list") {
    if (!wsOk(ws)) throw new Fail("bad_ws", 400);
    const kinds = (Array.isArray(b.kinds) ? b.kinds : ["call", "booking", "ticket", "callback", "notification", "campaign", "company"]).map(String).filter((k: string) => k !== "phone_turn");
    try { return { rows: await listRec(ws, kinds, Math.min(1000, Number(b.limit) || 500)) }; } catch { throw new Fail("busy", 502); }
  }
  if (mode === "cc_update") {
    if (!wsOk(ws) || !/^[0-9a-f-]{36}$/.test(String(b.id ?? ""))) throw new Fail("bad_ws", 400);
    const SB = Deno.env.get("SUPABASE_URL"), K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const patch: any = { updated_at: new Date().toISOString() }; if (b.status) patch.status = String(b.status).slice(0, 20); if (b.data && typeof b.data === "object") patch.data = b.data;
    const r = await fetch(`${SB}/rest/v1/ramsa_cc_records?id=eq.${b.id}&ws=eq.${ws}`, { method: "PATCH", headers: { apikey: K, authorization: `Bearer ${K}`, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Fail("busy", 502); return { rows: await r.json() };
  }
  if (mode === "cc_company") {
    if (!wsOk(ws)) throw new Fail("bad_ws", 400);
    const p = JSON.parse(JSON.stringify(b.profile ?? {}).slice(0, 150000) || "{}");
    const row = await insertRec(ws, "company", p, String(p.name ?? "").slice(0, 60), "active"); return { id: row.id };
  }
  if (mode === "cc_doc") {
    const parts: any[] = [];
    if (b.data) { if (String(b.data).length > 12_000_000) throw new Fail("too_long", 400); parts.push({ inlineData: { mimeType: String(b.mime ?? "application/pdf"), data: String(b.data) } }, { text: "Extract the knowledge from this document." }); }
    else { const t = String(b.text ?? "").trim().slice(0, 60000); if (!t) throw new Fail("empty_text", 400); parts.push({ text: t }); }
    return await gem(DOC_SYS, parts, 120000, FIRST35);
  }
  if (mode === "cc_campaign") {
    const p = b.profile ?? {};
    const brief = `الشركة: ${String(p.name ?? "").slice(0, 80)} — ${String(p.about ?? "").slice(0, 300)}\nاسم الموظف الآلي: ${String(p.agent_name ?? "سلامة").slice(0, 40)}\nنوع الحملة: ${String(b.type ?? "").slice(0, 40)}\nالنص الإرشادي: ${String(b.script ?? "").slice(0, 1500)}\nبيانات العميل: ${JSON.stringify(b.contact ?? {}).slice(0, 600)}\nتلميح لشخصية العميل في المحاكاة: ${String(b.persona ?? "").slice(0, 100)}\nمعلومات مفيدة: ${String(p.policies ?? "").slice(0, 800)}`;
    return await gem(CAMP_SYS, [{ text: brief }], 45000);
  }
  throw new Fail("bad_mode", 400);
}

// رمسة — Arabic voice platform (client)
const API_URL = "https://olkhmscftouksbgjmtjt.supabase.co/functions/v1/ramsa";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; };
const ico = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.innerHTML = `<path d="${d}"/>`; return s; };
const I = { play: "M8 5v14l11-7z", pause: "M6 5h4v14H6zm8 0h4v14h-4z", dl: "M12 3v10.2l3.6-3.6L17 11l-5 5-5-5 1.4-1.4 3.6 3.6V3zM5 19h14v2H5z", heart: "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z",
  home: "M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z", mic: "M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zm-7 8h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z", tts: "M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z", stt: "M4 5h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z", clean: "M3 12h2l2-6 3 12 3-9 2 5 2-2h4v2h-3l-3 3-1.6-4L10 22 7 10l-1 2H3z", voices: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z" };

// ---------- errors & api ----------
const ERR = {
  rate_limit: "وصلنا الحد المجاني للطلبات حاليًا. انتظر دقيقة وجرّب مرة ثانية.",
  busy: "الخدمة مزدحمة الحين. جرّب بعد لحظات.", timeout: "الطلب أخذ وقت أطول من اللازم. جرّب مرة ثانية.",
  too_long: "المحتوى أطول من المسموح.", empty_text: "اكتب نص أول.", empty_audio: "ما وصلنا صوت واضح. جرّب مرة ثانية.",
  network: "تأكد من اتصالك بالإنترنت وجرّب مرة ثانية.", bad_output: "صار خطأ في معالجة الرد. جرّب مرة ثانية.",
  mic: "ما قدرنا نوصل للمايك. اسمح للمتصفح باستخدامه من إعدادات الموقع.", decode: "ما قدرنا نقرأ الملف. جرّب ملف MP3 أو WAV أو M4A.",
};
const errMsg = (code) => ERR[code] || "صار خطأ غير متوقع. جرّب مرة ثانية.";
async function api(mode, payload, timeout = 90000) {
  let r;
  try {
    r = await fetch(API_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, ...payload }), signal: AbortSignal.timeout(timeout) });
  } catch (e) { throw Object.assign(new Error("network"), { code: e?.name === "TimeoutError" ? "timeout" : "network" }); }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || j.error) throw Object.assign(new Error(j.error || "server"), { code: j.error || (r.status === 429 ? "rate_limit" : r.status >= 500 ? "busy" : "server") });
  return j;
}
let toastT;
function toast(msg, err = false) { const t = $("#toast"); t.textContent = msg; t.classList.toggle("err", err); t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), err ? 5200 : 2600); }
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem("ramsa." + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem("ramsa." + k, JSON.stringify(v)); } catch {} } };

// ---------- audio utils ----------
let _ctx;
const actx = () => { if (!_ctx || _ctx.state === "closed") _ctx = new (window.AudioContext || window.webkitAudioContext)(); if (_ctx.state === "suspended") _ctx.resume(); return _ctx; };
const b64ToBytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const bytesToB64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
function wavHeader(dataLen, sr, ch = 1, bits = 16) { const b = new ArrayBuffer(44), v = new DataView(b); const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0))); w(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * bits / 8, true); v.setUint16(32, ch * bits / 8, true); v.setUint16(34, bits, true); w(36, "data"); v.setUint32(40, dataLen, true); return new Uint8Array(b); }
function audioToWav(b64, mime = "") { const raw = b64ToBytes(b64); if (raw[0] === 82 && raw[1] === 73 && raw[2] === 70 && raw[3] === 70) return raw; const sr = +(/rate=(\d+)/i.exec(mime)?.[1] || 24000); const out = new Uint8Array(44 + raw.length); out.set(wavHeader(raw.length, sr)); out.set(raw, 44); return out; }
function encodeWav(f32, sr) { const out = new Uint8Array(44 + f32.length * 2); out.set(wavHeader(f32.length * 2, sr)); const v = new DataView(out.buffer); for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); } return out; }
function toMono(buf) { if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice(); const a = buf.getChannelData(0), b = buf.getChannelData(1), o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (a[i] + b[i]) / 2; return o; }
async function resample(f32, from, to, highpass = 0) {
  const len = Math.max(1, Math.round(f32.length * to / from));
  const oc = new OfflineAudioContext(1, len, to); const b = oc.createBuffer(1, f32.length, from); b.copyToChannel(f32, 0);
  const s = oc.createBufferSource(); s.buffer = b; let node = s;
  if (highpass) { const f = oc.createBiquadFilter(); f.type = "highpass"; f.frequency.value = highpass; f.Q.value = 0.7; node.connect(f); node = f; }
  node.connect(oc.destination); s.start(); return (await oc.startRendering()).getChannelData(0).slice();
}
async function decodeFile(file) { const ab = await file.arrayBuffer(); try { return await new Promise((res, rej) => { const p = actx().decodeAudioData(ab, res, rej); if (p?.then) p.then(res, rej); }); } catch { throw Object.assign(new Error("decode"), { code: "decode" }); } }
const fmtT = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const rmsOf = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / (a.length || 1)); };
function peaksOf(f32, n) { const p = new Float32Array(n), step = Math.max(1, Math.floor(f32.length / n)); for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step, e = Math.min(f32.length, j + step); j < e; j++) { const v = Math.abs(f32[j]); if (v > m) m = v; } p[i] = m; } const mx = Math.max(...p, 0.01); return p.map((v) => v / mx); }
function drawWave(cv, peaks, prog = 0) {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth || 300, hh = cv.clientHeight || 34; cv.width = w * dpr; cv.height = hh * dpr;
  const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, hh);
  const cs = getComputedStyle(document.documentElement), acc = cs.getPropertyValue("--acc").trim(), mut = cs.getPropertyValue("--line").trim();
  const bw = 3, gap = 2, n = Math.floor(w / (bw + gap));
  for (let i = 0; i < n; i++) { const v = peaks.length ? peaks[Math.floor(i / n * peaks.length)] : 0.1; const bh = Math.max(3, v * hh * 0.92); const x = w - (i + 1) * (bw + gap); g.fillStyle = i / n < prog ? acc : mut === "" ? "#ccc" : getComputedStyle(cv).color; g.globalAlpha = i / n < prog ? 1 : 0.28; g.beginPath(); g.roundRect ? g.roundRect(x, (hh - bh) / 2, bw, bh, 1.5) : g.rect(x, (hh - bh) / 2, bw, bh); g.fill(); }
}
let currentAudio = null;
function makePlayer({ title, wav, filename, autoplay = false }) {
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  const audio = new Audio(url); audio.preload = "auto";
  const btn = h("button", { class: "pbtn", "aria-label": "تشغيل" }, ico(I.play)); const cv = h("canvas"); const time = h("span", { class: "ptime" }, "0:00");
  const el = h("div", { class: "player" }, btn, h("div", { class: "pmid" }, h("div", { class: "ptitle" }, title), cv, time), h("a", { class: "dl", href: url, download: filename, "aria-label": "تنزيل WAV", title: "تنزيل WAV" }, ico(I.dl)));
  let peaks = [];
  const redraw = () => drawWave(cv, peaks, audio.duration ? audio.currentTime / audio.duration : 0);
  actx().decodeAudioData(wav.slice().buffer).then((b) => { peaks = peaksOf(b.getChannelData(0), 160); time.textContent = fmtT(b.duration); redraw(); }).catch(() => {});
  const setIcon = (p) => { btn.replaceChildren(ico(p ? I.pause : I.play)); btn.setAttribute("aria-label", p ? "إيقاف" : "تشغيل"); };
  btn.onclick = () => { if (audio.paused) { if (currentAudio && currentAudio !== audio) currentAudio.pause(); currentAudio = audio; audio.play().catch(() => toast("ما قدرنا نشغّل الصوت.", true)); } else audio.pause(); };
  audio.onplay = () => setIcon(true); audio.onpause = audio.onended = () => { setIcon(false); redraw(); };
  audio.ontimeupdate = () => { time.textContent = `${fmtT(audio.currentTime)} / ${fmtT(audio.duration)}`; redraw(); };
  cv.onclick = (e) => { if (!audio.duration) return; const r = cv.getBoundingClientRect(); audio.currentTime = ((r.right - e.clientX) / r.width) * audio.duration; redraw(); };
  new ResizeObserver(redraw).observe(cv);
  if (autoplay) setTimeout(() => btn.click(), 50);
  el._audio = audio; return el;
}

// ---------- mic ----------
class Mic {
  async start(onFrame, raw = false) {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("mic"), { code: "mic" });
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: raw ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
    catch { throw Object.assign(new Error("mic"), { code: "mic" }); }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)(); await this.ctx.resume();
    this.sr = this.ctx.sampleRate; this.src = this.ctx.createMediaStreamSource(this.stream);
    this.proc = this.ctx.createScriptProcessor(2048, 1, 1); this.mute = this.ctx.createGain(); this.mute.gain.value = 0;
    this.proc.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0).slice(); onFrame(d, rmsOf(d)); };
    this.src.connect(this.proc); this.proc.connect(this.mute); this.mute.connect(this.ctx.destination);
  }
  stop() { try { this.proc.onaudioprocess = null; this.src.disconnect(); this.proc.disconnect(); } catch {} this.stream?.getTracks().forEach((t) => t.stop()); this.ctx?.close().catch(() => {}); }
}
const concat = (chunks) => { const n = chunks.reduce((a, c) => a + c.length, 0), o = new Float32Array(n); let p = 0; for (const c of chunks) { o.set(c, p); p += c.length; } return o; };
async function toWav16kB64(f32, sr) { const r = sr === 16000 ? f32 : await resample(f32, sr, 16000); return bytesToB64(encodeWav(r, 16000)); }
function meterDraw(cv, hist) { const dpr = devicePixelRatio || 1, w = cv.clientWidth, hh = cv.clientHeight; cv.width = w * dpr; cv.height = hh * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--acc"); const n = hist.length, bw = w / n; hist.forEach((v, i) => { const bh = Math.max(2, Math.min(1, v * 6) * hh); g.globalAlpha = .35 + .65 * (i / n); g.fillRect(w - (i + 1) * bw + 1, (hh - bh) / 2, bw - 2, bh); }); }

// ---------- data ----------
const DIALECTS = [["ae", "إماراتي"], ["sa", "سعودي"], ["kw", "كويتي"], ["eg", "مصري"], ["msa", "فصحى"], ["en", "English"]];
const DNAME = Object.fromEntries(DIALECTS);
const VOICES = [
  { id: "hamdan", name: "حمدان", v: "Charon", d: "ae", g: "m", desc: "رخيم وواثق", c: "#0d5c57" },
  { id: "maitha", name: "ميثاء", v: "Kore", d: "ae", g: "f", desc: "دافئ وواضح", c: "#b7791f" },
  { id: "sultan", name: "سلطان", v: "Orus", d: "ae", g: "m", desc: "رسمي ومتزن", c: "#2b4c7e" },
  { id: "faisal", name: "فيصل", v: "Fenrir", d: "sa", g: "m", desc: "حيوي ومتحمس", c: "#1b7f5a" },
  { id: "noura", name: "نورة", v: "Leda", d: "sa", g: "f", desc: "شبابي وناعم", c: "#a3456b" },
  { id: "bader", name: "بدر", v: "Puck", d: "kw", g: "m", desc: "مرح وخفيف", c: "#7048e8" },
  { id: "dana", name: "دانة", v: "Aoede", d: "kw", g: "f", desc: "هادئ ولطيف", c: "#c2410c" },
  { id: "karim", name: "كريم", v: "Iapetus", d: "eg", g: "m", desc: "قريب وودود", c: "#0e7490" },
  { id: "heba", name: "هبة", v: "Despina", d: "eg", g: "f", desc: "مبتسم وسلس", c: "#be185d" },
  { id: "james", name: "James", v: "Algieba", d: "en", g: "m", desc: "Clear & natural", c: "#334155" },
  { id: "emma", name: "Emma", v: "Zephyr", d: "en", g: "f", desc: "Bright & friendly", c: "#9333ea" },
];
const SAMPLE_TEXT = {
  ae: "هلا والله، شو هالخبر الحلو؟ [chuckle] والله فرحت يوم سمعت السالفة، بس لحظة [clears throat] خلني أقولك التفاصيل بهدوء.",
  sa: "يا هلا والله! [laughs] وش هالأخبار الزينة؟ ترى من زمان ما سمعنا شي يفرّح مثل كذا، الله يتمم على خير.",
  kw: "هلا والله وغلا! شلونك؟ [chuckle] والله اشتقنا، تعال باجر نتقهوى ونسولف على راحتنا.",
  eg: "أهلًا أهلًا! [laughs] إيه الأخبار الحلوة دي؟ بجد فرحتني، استنى بس أحكيلك الحكاية من الأول.",
  msa: "مرحبًا بكم في رمسة، المنصة التي تحوّل النص العربي إلى صوت طبيعي واضح، بلهجات متعددة وبجودة عالية.",
  en: "Welcome to Ramsa! [chuckle] Type anything, pick a voice, and hear it come to life in seconds.",
};
const TAGS = ["[chuckle]", "[laughs]", "[sigh]", "[whispers]", "[clears throat]", "[excited]", "[pause]"];
const favs = new Set(store.get("favs", []));
const avatar = (v) => h("div", { class: "avatar", style: `background:linear-gradient(135deg,${v.c},${v.c}aa)` }, v.name[0]);
let sampleAudio = new Audio();
function playSample(v, btn) {
  const src = `samples/${v.id}.mp3`;
  if (!sampleAudio.paused && sampleAudio.dataset.id === v.id) { sampleAudio.pause(); return; }
  currentAudio?.pause(); sampleAudio.pause(); sampleAudio = new Audio(src); sampleAudio.dataset.id = v.id; currentAudio = sampleAudio;
  $$(".mini-play.on, .vplay.on").forEach((b) => { b.classList.remove("on"); b.replaceChildren(ico(I.play)); });
  btn.classList.add("on"); btn.replaceChildren(ico(I.pause));
  const reset = () => { btn.classList.remove("on"); btn.replaceChildren(ico(I.play)); };
  sampleAudio.onended = sampleAudio.onpause = reset; sampleAudio.play().catch(() => { reset(); toast("ما قدرنا نشغّل العيّنة.", true); });
}
function toggleFav(id) { favs.has(id) ? favs.delete(id) : favs.add(id); store.set("favs", [...favs]); renderVoices(); renderPick(); renderHomeVoices(); }

// ---------- router ----------
const ROUTES = [["home", "الرئيسية", I.home], ["agent", "رفيج", I.mic], ["tts", "نطق", I.tts], ["stt", "تفريغ", I.stt], ["clean", "تنقية", I.clean], ["voices", "الأصوات", I.voices]];
$("#topnav").append(...ROUTES.map(([id, label]) => h("a", { href: "#" + id, "data-r": id }, label)));
$("#tabbar").append(...ROUTES.filter((r) => r[0] !== "voices").map(([id, label, d]) => h("a", { href: "#" + id, "data-r": id }, ico(d), label)));
function route() {
  const id = (location.hash.slice(1) || "home").split("?")[0]; const ok = ROUTES.some((r) => r[0] === id) ? id : "home";
  $$(".view").forEach((v) => (v.hidden = v.id !== "v-" + ok)); $$("[data-r]").forEach((a) => a.classList.toggle("on", a.dataset.r === ok));
  if (ok !== "agent" && call.on) endCall(); if (ok !== "stt" && stt.rec) stopStt();
  window.scrollTo({ top: 0 }); document.title = ok === "home" ? "رمسة — منصة الصوت العربي بلهجتك" : `${ROUTES.find((r) => r[0] === ok)[1]} · رمسة`;
}
addEventListener("hashchange", route);

// ---------- home ----------
$("#year").textContent = new Date().getFullYear();
(() => {
  const a = new Audio("samples/hero.mp3"); const btn = $("#heroPlay"), cv = $("#heroWave"); let peaks = [];
  fetch("samples/hero.mp3").then((r) => r.arrayBuffer()).then((ab) => actx().decodeAudioData(ab)).then((b) => { peaks = peaksOf(b.getChannelData(0), 120); drawWave(cv, peaks, 0); }).catch(() => drawWave(cv, [], 0));
  btn.onclick = () => { if (a.paused) { currentAudio?.pause(); currentAudio = a; a.play().catch(() => toast("ما قدرنا نشغّل الصوت.", true)); } else a.pause(); };
  a.onplay = () => btn.replaceChildren(ico(I.pause)); a.onpause = a.onended = () => btn.replaceChildren(ico(I.play));
  a.ontimeupdate = () => drawWave(cv, peaks, a.currentTime / (a.duration || 1)); new ResizeObserver(() => drawWave(cv, peaks, a.duration ? a.currentTime / a.duration : 0)).observe(cv);
})();
function vcard(v) {
  const play = h("button", { class: "btn sm soft vplay", "aria-label": "اسمع العيّنة" }, ico(I.play)); play.onclick = () => playSample(v, play);
  return h("div", { class: "vcard card" }, h("div", { class: "top" }, avatar(v), h("div", {}, h("h4", {}, v.name), h("div", { class: "meta" }, `${DNAME[v.d]} · ${v.g === "m" ? (v.d === "en" ? "Male" : "رجالي") : (v.d === "en" ? "Female" : "نسائي")}`)),
    h("button", { class: "heart" + (favs.has(v.id) ? " on" : ""), "aria-label": "مفضلة", onclick: () => toggleFav(v.id) }, ico(I.heart))),
    h("div", { class: "meta" }, v.desc), h("div", { class: "acts" }, play, h("button", { class: "btn sm primary", onclick: () => { tts.voice = v.id; tts.dialect = v.d; store.set("voice", v.id); if (isDefaultText()) $("#ttsText").value = SAMPLE_TEXT[v.d]; location.hash = "tts"; renderTts(); } }, "استخدم الصوت")));
}
function renderHomeVoices() { $("#homeVoices").replaceChildren(...VOICES.map(vcard)); }

// ---------- voices ----------
let vFilter = "all";
function renderVoices() {
  const F = [["all", "الكل"], ["fav", "المفضلة ♥"], ...DIALECTS.filter((d) => d[0] !== "msa")];
  $("#voiceFilter").replaceChildren(...F.map(([k, l]) => h("button", { class: "chip" + (vFilter === k ? " on" : ""), onclick: () => { vFilter = k; renderVoices(); } }, l)));
  const list = VOICES.filter((v) => vFilter === "all" || (vFilter === "fav" ? favs.has(v.id) : v.d === vFilter));
  $("#voiceGrid").replaceChildren(...(list.length ? list.map(vcard) : [h("div", { class: "empty", style: "grid-column:1/-1" }, "ما عندك أصوات مفضلة بعد. اضغط ♥ على أي صوت.")]));
}

// ---------- TTS ----------
const tts = { dialect: "ae", voice: store.get("voice", "hamdan") };
{ const v = VOICES.find((x) => x.id === tts.voice) || VOICES[0]; tts.voice = v.id; tts.dialect = v.d; }
const ta = $("#ttsText");
const isDefaultText = () => !ta.value.trim() || Object.values(SAMPLE_TEXT).includes(ta.value.trim());
ta.value = SAMPLE_TEXT[tts.dialect];
function renderTts() {
  $("#ttsDialect").replaceChildren(...DIALECTS.map(([k, l]) => h("button", { class: tts.dialect === k ? "on" : "", onclick: () => { tts.dialect = k; if (isDefaultText()) ta.value = SAMPLE_TEXT[k]; const cur = VOICES.find((v) => v.id === tts.voice); if (k !== "msa" && cur.d !== k) tts.voice = VOICES.find((v) => v.d === k).id; renderTts(); } }, l)));
  ta.dir = tts.dialect === "en" ? "ltr" : "rtl"; $("#ttsCount").textContent = `${ta.value.length} / 1500`; renderPick();
}
function renderPick() {
  const order = [...VOICES].sort((a, b) => (favs.has(b.id) - favs.has(a.id)) || ((b.d === tts.dialect) - (a.d === tts.dialect)));
  $("#ttsVoices").replaceChildren(...order.map((v) => { const p = h("button", { class: "mini-play", "aria-label": "اسمع", onclick: (e) => { e.stopPropagation(); playSample(v, p); } }, ico(I.play));
    return h("div", { class: "vopt" + (tts.voice === v.id ? " on" : ""), role: "button", tabindex: "0", onclick: () => { tts.voice = v.id; store.set("voice", v.id); if (v.d !== tts.dialect) { tts.dialect = v.d; if (isDefaultText()) ta.value = SAMPLE_TEXT[v.d]; } renderTts(); } }, avatar(v), h("div", { class: "vtxt" }, h("b", {}, (favs.has(v.id) ? "♥ " : "") + v.name), h("small", {}, DNAME[v.d])), p); }));
}
ta.addEventListener("input", () => ($("#ttsCount").textContent = `${ta.value.length} / 1500`));
$("#ttsTags").append(...TAGS.map((t) => h("button", { type: "button", onclick: () => { const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s; const ins = (s > 0 && ta.value[s - 1] !== " " ? " " : "") + t + " "; ta.setRangeText(ins, s, e, "end"); ta.focus(); ta.dispatchEvent(new Event("input")); } }, t)));
$("#btnClear").onclick = () => { ta.value = ""; ta.focus(); ta.dispatchEvent(new Event("input")); };
$("#btnTashkeel").onclick = async (ev) => {
  const b = ev.currentTarget; if (!ta.value.trim()) return toast(ERR.empty_text, true); if (tts.dialect === "en") return toast("التشكيل للنصوص العربية فقط.");
  b.disabled = true; const old = b.innerHTML; b.innerHTML = '<b class="harakah">بَ</b> جاري التشكيل…';
  try { const r = await api("tashkeel", { text: ta.value, dialect: tts.dialect }); ta.value = r.text; ta.dispatchEvent(new Event("input")); toast("تمت إضافة التشكيل ✓"); }
  catch (e) { toast(errMsg(e.code), true); } finally { b.disabled = false; b.innerHTML = old; }
};
$("#btnGen").onclick = async (ev) => {
  const b = ev.currentTarget, text = ta.value.trim(); if (!text) return toast(ERR.empty_text, true);
  const v = VOICES.find((x) => x.id === tts.voice); b.classList.add("loading"); $(".btxt", b).textContent = "جاري التوليد…"; actx();
  try {
    const r = await api("tts", { text, voice: v.v, dialect: tts.dialect, style: $("#ttsStyle").value, pace: $("#ttsPace").value });
    const wav = audioToWav(r.audio, r.mime); const out = $("#ttsOut"); $(".empty", out)?.remove();
    const stamp = new Date().toLocaleTimeString("ar-AE", { hour: "2-digit", minute: "2-digit" });
    out.prepend(makePlayer({ title: `${v.name} · ${DNAME[tts.dialect]} · ${stamp} — ${text.replace(/\s+/g, " ").slice(0, 60)}`, wav, filename: `ramsa-${v.id}-${Date.now()}.wav`, autoplay: true }));
    while (out.children.length > 8) out.lastChild.remove();
    if (innerWidth < 980) out.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) { toast(errMsg(e.code), true); }
  finally { b.classList.remove("loading"); $(".btxt", b).textContent = "ولّد الصوت"; }
};

// ---------- STT ----------
const DIALECT_AR = { emirati: "إماراتي", saudi: "سعودي", kuwaiti: "كويتي", qatari: "قطري", bahraini: "بحريني", omani: "عُماني", egyptian: "مصري", levantine: "شامي", iraqi: "عراقي", maghrebi: "مغاربي", msa: "فصحى", english: "English", unknown: "غير محدد" };
const stt = { rec: null, segs: [], showEn: false, busy: 0, votes: {} };
$$("#sttMode button").forEach((b) => (b.onclick = () => { $$("#sttMode button").forEach((x) => x.classList.toggle("on", x === b)); $("#sttMic").hidden = b.dataset.v !== "mic"; $("#sttFile").hidden = b.dataset.v !== "file"; if (stt.rec) stopStt(); }));
function renderStt() {
  const out = $("#sttOut"); out.classList.toggle("hide-en", !stt.showEn); $("#sttTrToggle").classList.toggle("on", stt.showEn);
  if (!stt.segs.length) { out.replaceChildren(h("div", { class: "empty" }, "النص بيظهر هنا.")); return; }
  out.replaceChildren(...stt.segs.map((s) => h("span", { class: "seg-t" + (s.pending ? " pending" : "") }, s.pending ? "… " : s.text ? s.text + " " : "", s.en && !s.pending ? h("span", { class: "en" }, s.en) : null)));
  out.scrollTop = out.scrollHeight;
}
function sttResult(seg, r) {
  seg.pending = false; seg.text = (r.text || "").trim(); seg.en = (r.translation_en || "").trim();
  if (seg.text && r.dialect) { stt.votes[r.dialect] = (stt.votes[r.dialect] || 0) + (r.confidence || 0.5) * seg.text.length; const best = Object.entries(stt.votes).sort((a, b) => b[1] - a[1])[0][0];
    $("#sttDialectCard").hidden = false; $("#sttDialect").textContent = DIALECT_AR[best] || best; const c = Math.round((r.confidence || 0) * 100); $("#sttConfBar").style.width = c + "%"; $("#sttConf").textContent = `ثقة آخر مقطع ${c}٪`;
    if (r.cues?.length) $("#sttCues").replaceChildren(...r.cues.slice(0, 3).map((c) => h("span", { class: "chip sm gold" }, c))); }
  renderStt();
}
async function sendSeg(f32, sr) {
  const seg = { pending: true }; stt.segs.push(seg); renderStt(); stt.busy++;
  try { const r = await api("stt", { audio: await toWav16kB64(f32, sr), mime: "audio/wav", hint: $("#sttHint").value }); sttResult(seg, r); if (!r.text && stt.segs.length === 1 && !stt.rec) toast("ما سمعنا كلام واضح في التسجيل."); }
  catch (e) { seg.pending = false; seg.text = ""; renderStt(); toast(errMsg(e.code), true); }
  finally { stt.busy--; if (!stt.rec && !stt.busy) $("#sttStatus").textContent = stt.segs.some((s) => s.text) ? "خلصنا ✓ اضغط المايك للمتابعة." : "اضغط وابدأ الكلام. نكتب كلامك أول بأول كل بضع ثوانٍ."; }
}
async function startStt() {
  const mic = new Mic(), hist = new Array(48).fill(0); let chunks = [], len = 0, silent = 0, voiced = 0, floor = 0.01;
  try { await mic.start((d, r) => {
    hist.push(r); hist.shift(); meterDraw($("#sttMeter"), hist);
    floor = r < floor ? r : floor * 0.999 + r * 0.001; const thr = Math.max(0.012, floor * 2.5); const isV = r > thr;
    chunks.push(d); len += d.length; if (isV) { voiced += d.length; silent = 0; } else silent += d.length;
    const sec = len / mic.sr;
    if ((sec >= 5 && silent / mic.sr > 0.5) || sec >= 14) { const all = concat(chunks); chunks = []; len = 0; const v = voiced; voiced = 0; silent = 0; if (v / mic.sr > 0.25) sendSeg(all, mic.sr); }
  }); } catch (e) { toast(errMsg(e.code), true); return; }
  stt.rec = { mic, flush: () => { if (chunks.length && voiced / mic.sr > 0.25) sendSeg(concat(chunks), mic.sr); chunks = []; } };
  $("#sttRec").classList.add("rec"); $("#sttRec").setAttribute("aria-label", "أوقف التسجيل"); $("#sttStatus").textContent = "أسمعك… تكلّم براحتك، ونكتب أول بأول.";
}
function stopStt() { const r = stt.rec; if (!r) return; stt.rec = null; r.mic.stop(); r.flush(); $("#sttRec").classList.remove("rec"); $("#sttRec").setAttribute("aria-label", "ابدأ التسجيل"); meterDraw($("#sttMeter"), new Array(48).fill(0)); $("#sttStatus").textContent = stt.busy ? "نكمّل كتابة آخر مقطع…" : "خلصنا ✓ اضغط المايك للمتابعة."; }
$("#sttRec").onclick = () => (stt.rec ? stopStt() : startStt());
function bindDrop(drop, input, cb) { input.onchange = () => input.files[0] && cb(input.files[0]); drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); }); drop.addEventListener("dragleave", () => drop.classList.remove("over")); drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); e.dataTransfer.files[0] && cb(e.dataTransfer.files[0]); }); }
bindDrop($("#sttDrop"), $("#sttInput"), async (file) => {
  const st = $("#sttFileStatus"); st.textContent = "نقرأ الملف…";
  try {
    const buf = await decodeFile(file); if (buf.duration > 600) { st.textContent = ""; return toast("الملف أطول من 10 دقائق.", true); }
    const mono = await resample(toMono(buf), buf.sampleRate, 16000), sr = 16000, CH = 55 * sr; const parts = [];
    for (let p = 0; p < mono.length;) { let end = Math.min(mono.length, p + CH); if (end < mono.length) { let best = end, bm = 1e9; for (let s = end - 8 * sr; s < end; s += sr / 20) { const m = rmsOf(mono.subarray(s, s + sr / 10)); if (m < bm) { bm = m; best = s + sr / 20; } } end = best; } parts.push(mono.subarray(p, end)); p = end; }
    stt.segs.push(...[]); for (let i = 0; i < parts.length; i++) { st.textContent = parts.length > 1 ? `نفرّغ الجزء ${i + 1} من ${parts.length}…` : `نفرّغ ${file.name}…`; await sendSeg(parts[i], sr); }
    st.textContent = `تم تفريغ ${file.name} ✓`;
  } catch (e) { st.textContent = ""; toast(errMsg(e.code), true); }
  $("#sttInput").value = "";
});
$("#sttTrToggle").onclick = () => { stt.showEn = !stt.showEn; renderStt(); };
const sttPlain = () => stt.segs.filter((s) => s.text).map((s) => s.text + (stt.showEn && s.en ? `\n${s.en}` : "")).join(stt.showEn ? "\n\n" : " ");
$("#sttCopy").onclick = async () => { const t = sttPlain(); if (!t) return toast("ما فيه نص للنسخ."); try { await navigator.clipboard.writeText(t); toast("تم النسخ ✓"); } catch { toast("ما قدرنا ننسخ.", true); } };
$("#sttDl").onclick = () => { const t = sttPlain(); if (!t) return toast("ما فيه نص للتنزيل."); const a = h("a", { href: URL.createObjectURL(new Blob(["\ufeff" + t], { type: "text/plain;charset=utf-8" })), download: `ramsa-transcript-${Date.now()}.txt` }); a.click(); };
$("#sttReset").onclick = () => { stt.segs = []; stt.votes = {}; $("#sttDialectCard").hidden = true; renderStt(); };

// ---------- CLEAN ----------
const cl = { src: null, sr: 0, name: "" };
const STR = ["خفيفة", "قوية", "قصوى"];
$("#clStr").oninput = (e) => ($("#clStrV").textContent = STR[e.target.value]);
function clSetSource(f32, sr, name) { cl.src = f32; cl.sr = sr; cl.name = name; $("#clBefore").replaceChildren(makePlayer({ title: `${name} · ${fmtT(f32.length / sr)}`, wav: encodeWav(f32, sr), filename: "original.wav" })); $("#clAfter").replaceChildren(h("div", { class: "empty" }, "اضغط «نقِّ الصوت».")); $("#clStats").textContent = ""; $("#clGo").disabled = false; }
bindDrop($("#clDrop"), $("#clInput"), async (file) => { try { const b = await decodeFile(file); if (b.duration > 600) return toast("الملف أطول من 10 دقائق.", true); clSetSource(toMono(b), b.sampleRate, file.name); } catch (e) { toast(errMsg(e.code), true); } $("#clInput").value = ""; });
let clMic = null;
$("#clRec").onclick = async () => {
  const b = $("#clRec");
  if (clMic) { const m = clMic; clMic = null; m.mic.stop(); b.classList.remove("rec"); $(".btxt", b).textContent = "سجّل من المايك"; const f = concat(m.chunks); if (f.length / m.mic.sr < 0.5) return toast("التسجيل قصير جدًا."); clSetSource(f, m.mic.sr, "تسجيل المايك"); return; }
  const mic = new Mic(), chunks = []; try { await mic.start((d) => { chunks.push(d); if (chunks.length * 2048 / mic.sr > 600) $("#clRec").click(); }, true); } catch (e) { return toast(errMsg(e.code), true); }
  clMic = { mic, chunks }; b.classList.add("rec"); $(".btxt", b).textContent = "أوقف التسجيل";
};
let rnn = null;
$("#clGo").onclick = async (ev) => {
  const b = ev.currentTarget; if (!cl.src) return; b.classList.add("loading"); $(".btxt", b).textContent = "جاري التنقية…"; const prog = $("#clProg"); prog.hidden = false; $("i", prog).style.width = "3%";
  try {
    if (!rnn) { const { Rnnoise } = await import("./vendor/rnnoise.js"); rnn = await Rnnoise.load(); }
    const x = await resample(cl.src, cl.sr, 48000, 70); const n = rnn.frameSize, st = rnn.createDenoiseState(), st2 = rnn.createDenoiseState(); const out = new Float32Array(x.length); const frame = new Float32Array(n);
    const lvl = +$("#clStr").value, gate = $("#clGate").checked, wet = [0.75, 1, 1][lvl], floorG = [0.5, 0.25, 0.08][lvl];
    const nf = Math.floor(x.length / n), vads = new Float32Array(nf); let g = 1;
    for (let f = 0; f < nf; f++) {
      const o = f * n; for (let i = 0; i < n; i++) frame[i] = x[o + i] * 32768; const v = st.processFrame(frame); if (lvl === 2) st2.processFrame(frame); vads[f] = v;
      for (let i = 0; i < n; i++) out[o + i] = (frame[i] / 32768) * wet + x[o + i] * (1 - wet);
      if (f % 400 === 0) { $("i", prog).style.width = (5 + 80 * f / nf) + "%"; await new Promise((r) => setTimeout(r)); }
    }
    st.destroy(); st2.destroy();
    if (gate) { // smooth VAD-driven expander: shortens reverb tails and residual noise between words
      const hold = 12; let last = -1e9;
      for (let f = 0; f < nf; f++) { if (vads[f] > 0.45) last = f; const target = f - last <= hold ? 1 : floorG; g += (target - g) * (target > g ? 0.5 : 0.08); const o = f * n; for (let i = 0; i < n; i++) out[o + i] *= g; }
    }
    if ($("#clNorm").checked) { let pk = 0; for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i])); if (pk > 0.001) { const k = Math.min(8, 0.89 / pk); for (let i = 0; i < out.length; i++) out[i] *= k; } }
    // honest measurement: level in non-speech frames before vs after
    let nb = 0, na = 0, c = 0, sb = 0, sa = 0, cs = 0; let pkIn = 0; for (let i = 0; i < x.length; i++) pkIn = Math.max(pkIn, Math.abs(x[i])); const kIn = pkIn > 0.001 ? 0.89 / pkIn : 1;
    for (let f = 0; f < nf; f++) { const o = f * n; const rb = rmsOf(x.subarray(o, o + n)) * kIn, ra = rmsOf(out.subarray(o, o + n)); if (vads[f] < 0.15) { nb += rb * rb; na += ra * ra; c++; } else if (vads[f] > 0.8) { sb += rb * rb; sa += ra * ra; cs++; } }
    $("i", prog).style.width = "100%";
    const db = c > 20 && na > 0 ? (10 * Math.log10(nb / na)).toFixed(1) : null;
    $("#clAfter").replaceChildren(makePlayer({ title: `${cl.name} · منقّى`, wav: encodeWav(out, 48000), filename: `ramsa-clean-${Date.now()}.wav`, autoplay: true }));
    $("#clStats").textContent = db ? `انخفض مستوى الضوضاء في المقاطع الخالية من الكلام بنحو ${db} ديسيبل (قياس على جهازك بعد موازنة المستوى).` : "تمت التنقية. (ما فيه مقاطع صامتة كافية لقياس الفرق.)";
  } catch (e) { console.error(e); toast("ما قدرنا ننقّي الملف على هذا الجهاز. جرّب متصفح أحدث.", true); }
  finally { b.classList.remove("loading"); $(".btxt", b).textContent = "نقِّ الصوت"; setTimeout(() => (prog.hidden = true), 600); }
};

// ---------- AGENT ----------
const DEFAULT_KB = `الشركة: «سَهْم للتوصيل» — شركة تجريبية لغرض العرض فقط.
ساعات خدمة العملاء: يوميًا من 8 الصبح إلى 10 بالليل.
مناطق التوصيل: كل إمارات الدولة.
رسوم التوصيل: 15 درهم، ومجاني للطلبات فوق 200 درهم.
مواعيد التسليم المتاحة هذا الأسبوع: الأربعاء 4 العصر، الخميس 10 الصبح، الخميس 6 المساء، السبت 12 الظهر.
الإلغاء: مجاني قبل خروج الطلب للتوصيل.
الاسترجاع: خلال 14 يوم والمنتج بحالته الأصلية.
الإشعارات: نقدر نرسل تأكيد عبر واتساب أو رسالة نصية للرقم المسجل.
الدفع: بطاقة أو عند الاستلام.`;
const DEFAULT_STATE = () => ({ order_id: "4829", customer: "أحمد", item: "سماعة لاسلكية", delivery: "الثلاثاء 2 الظهر", address: "دبي — البرشاء", status: "قيد التجهيز", notifications: [] });
const AGENT_VOICES = VOICES.filter((v) => v.d !== "en");
const call = { on: false, phase: "idle", hist: [], state: DEFAULT_STATE(), t0: 0, timer: null, mic: null, audio: new Audio(), intents: [], done: [], handed: false, lastDialect: "" };
$("#agKb").value = store.get("kb", DEFAULT_KB);
$("#agVoice").append(...AGENT_VOICES.map((v) => h("option", { value: v.id }, `صوت: ${v.name} · ${DNAME[v.d]}`))); $("#agVoice").value = store.get("agVoice", "maitha");
$("#agVoice").onchange = (e) => store.set("agVoice", e.target.value);
$("#agKbSave").onclick = () => { store.set("kb", $("#agKb").value); toast("تم حفظ قاعدة المعرفة ✓"); };
$("#agKbReset").onclick = () => { $("#agKb").value = DEFAULT_KB; store.set("kb", DEFAULT_KB); toast("رجعنا للقاعدة الافتراضية."); };
function renderState(flash) {
  const s = call.state; const kv = (k, v, f) => h("div", { class: "kv" + (flash === f ? " flash" : "") }, h("span", {}, k), h("b", {}, v));
  $("#agState").replaceChildren(h("div", { class: "order" }, kv("رقم الطلب", "#" + s.order_id), kv("المنتج", s.item), kv("موعد التسليم", s.delivery, "delivery"), kv("العنوان", s.address, "address"),
    h("div", { class: "kv" + (flash === "status" ? " flash" : "") }, h("span", {}, "الحالة"), h("b", {}, h("span", { class: "status" + (s.status === "ملغي" ? " cancelled" : "") }, s.status))),
    kv("الإشعارات", s.notifications.length ? s.notifications.join("، ") : "—", "notif")));
}
$("#agResetState").onclick = () => { call.state = DEFAULT_STATE(); renderState(); toast("رجعنا الطلب لحالته الأولى."); };
function setPhase(p, label) {
  call.phase = p; const orb = $("#orb"); orb.classList.remove("listening", "thinking", "speaking"); if (["listening", "thinking", "speaking"].includes(p)) orb.classList.add(p);
  const L = { idle: "اضغط وكلّم رفيج بلهجتك", listening: "أسمعك… تكلّم", hearing: "أسمعك…", thinking: "رفيج يفكّر…", speaking: "رفيج يتكلم · اضغط للمقاطعة" };
  $("#agStatus").textContent = label || L[p] || ""; $("#agHint").hidden = p !== "idle" || call.hist.length > 0;
  $("#orb").setAttribute("aria-label", p === "idle" ? "ابدأ المكالمة" : p === "speaking" ? "قاطع رفيج" : "إنهاء المكالمة");
}
const log = $("#agLog");
function addMsg(cls, text, en, meta = []) { const m = h("div", { class: "msg " + cls }, h("div", { class: "bub", dir: "auto" }, text), en ? h("div", { class: "en" }, en) : null, meta.length ? h("div", { class: "meta" }, meta) : null); log.append(m); log.scrollTop = log.scrollHeight; return m; }
function typing() { const m = h("div", { class: "msg agent typing" }, h("div", { class: "bub" }, h("i"), h("i"), h("i"))); log.append(m); log.scrollTop = log.scrollHeight; return m; }
function applyActions(acts = []) {
  for (const a of acts) {
    const p = a.params || {}, done = a.status === "done"; let flash = null;
    if (done) {
      if (a.name === "reschedule_delivery" && (p.day || p.time)) { call.state.delivery = [p.day, p.time].filter(Boolean).join(" "); flash = "delivery"; }
      if (a.name === "cancel_order") { call.state.status = "ملغي"; flash = "status"; }
      if (a.name === "update_address" && p.address) { call.state.address = p.address; flash = "address"; }
      if (a.name === "send_notification") { const ch = p.channel === "sms" ? "رسالة نصية" : "واتساب"; if (!call.state.notifications.includes(ch)) call.state.notifications.push(ch); flash = "notif"; }
      call.done.push(a.name);
    }
    if (flash) renderState(flash);
    const list = $("#agActions"); $(".empty", list)?.remove();
    list.prepend(h("div", { class: "act-item" }, h("span", { class: "st " + (done ? "done" : "proposed") }, done ? "منفّذ" : "بانتظار التأكيد"), h("b", {}, a.name), Object.keys(p).length ? h("pre", {}, JSON.stringify(p, null, 0)) : null));
  }
}
function speak(r) {
  return new Promise((res) => {
    if (!r.tts?.audio) { if (r.tts_error) toast("الرد جاهز نصًا، بس ما قدرنا نولّد الصوت الحين (" + (r.tts_error === "rate_limit" ? "الحد المجاني" : "ضغط على الخدمة") + ").", true); return res(); }
    const url = URL.createObjectURL(new Blob([audioToWav(r.tts.audio, r.tts.mime)], { type: "audio/wav" }));
    const a = call.audio; a.src = url; setPhase("speaking");
    const fin = () => { a.onended = a.onpause = a.onerror = null; URL.revokeObjectURL(url); res(); };
    a.onended = a.onerror = fin; a.onpause = fin; a.play().catch(() => { toast("المتصفح منع تشغيل الصوت تلقائيًا. اضغط على الدائرة للمتابعة."); fin(); });
  });
}
async function agentTurn(payload) {
  setPhase("thinking"); const ty = typing(); const voice = VOICES.find((v) => v.id === $("#agVoice").value) || VOICES[1];
  let r;
  try { r = await api("agent", { ...payload, history: call.hist, kb: $("#agKb").value, state: call.state, voice: voice.v, persona: "رفيج" }, 90000); }
  catch (e) { ty.remove(); addMsg("sys", errMsg(e.code)); setPhase(call.on ? "listening" : "idle"); return; }
  ty.remove();
  const heard = (r.heard || payload.text || "").trim();
  if (payload.audio) { if (heard) addMsg("user", heard, r.heard_en, [r.dialect && h("span", { class: "ar" }, DIALECT_AR[r.dialect] || r.dialect), r.intent && h("span", {}, "INTENT: " + r.intent), r.confidence != null && h("span", {}, "CONF " + Number(r.confidence).toFixed(2))].filter(Boolean)); }
  else { const um = [...log.querySelectorAll(".msg.user")].pop(); if (um && !um.querySelector(".meta")) { if (r.heard_en) um.append(h("div", { class: "en" }, r.heard_en)); um.append(h("div", { class: "meta" }, [r.dialect && h("span", { class: "ar" }, DIALECT_AR[r.dialect] || r.dialect), r.intent && h("span", {}, "INTENT: " + r.intent), r.confidence != null && h("span", {}, "CONF " + Number(r.confidence).toFixed(2))].filter(Boolean))); } }
  if (heard) call.hist.push({ role: "user", text: heard });
  $("#agDialect").textContent = DIALECT_AR[r.dialect] || "—"; $("#agIntent").textContent = r.intent || "—"; $("#agConf").textContent = r.confidence != null ? Math.round(r.confidence * 100) + "٪" : "—";
  if (r.intent && !["SMALL_TALK", "UNKNOWN"].includes(r.intent)) call.intents.push(r.intent);
  if (r.dialect) call.lastDialect = r.dialect;
  applyActions(r.actions);
  const reply = (r.reply || "").trim();
  if (reply) { addMsg("agent", reply, r.reply_en, [...(r.actions || []).map((a) => h("span", { class: "act" }, `ACTION: ${a.name.toUpperCase()} · ${a.status === "done" ? "DONE" : "PROPOSED"}`)), r.resolved ? h("span", {}, "RESOLVED") : null, voice && r.tts ? h("span", {}, "VOICE: " + voice.name) : null].filter(Boolean)); call.hist.push({ role: "agent", text: reply }); }
  await speak(r);
  if (r.handover || (r.actions || []).some((a) => a.name === "handover")) return handover("طلب المتصل أو تقدير رفيج");
  setPhase(call.on ? "listening" : "idle");
}
function tick() { const s = Math.floor((Date.now() - call.t0) / 1000); $("#callTime").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function unlockAudio() { const a = call.audio; if (a._unlocked) return; a._unlocked = true; a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="; a.play().catch(() => {}); }
async function startCall() {
  unlockAudio(); if (call.handed) resetConversation();
  const mic = new Mic(); let pre = [], cur = null, silent = 0, voicedRun = 0, floor = 0.008, barge = 0;
  try { await mic.start((d, r) => {
    const orb = $("#orb"); orb.style.setProperty("--lvl", Math.min(1, r * 8).toFixed(2));
    floor = r < floor ? floor * 0.9 + r * 0.1 : floor * 0.9995 + r * 0.0005; const thr = Math.max(0.015, floor * 3); const fr = d.length / mic.sr;
    if (call.phase === "speaking") { if (r > Math.max(0.06, thr * 3)) { barge += fr; if (barge > 0.3) { call.audio.pause(); barge = 0; cur = { chunks: [...pre, d], speech: 0.3 }; silent = 0; setPhase("listening", "أسمعك…"); } } else barge = Math.max(0, barge - fr); return; }
    if (call.phase !== "listening") return;
    pre.push(d); if (pre.length > 8) pre.shift();
    if (!cur) { if (r > thr) { voicedRun += fr; if (voicedRun > 0.12) { cur = { chunks: [...pre], speech: voicedRun }; silent = 0; $("#agStatus").textContent = "أسمعك…"; } } else voicedRun = 0; return; }
    cur.chunks.push(d); if (r > thr) { cur.speech += fr; silent = 0; } else silent += fr;
    const dur = cur.chunks.length * fr;
    if ((silent > 0.9 && cur.speech > 0.35) || dur > 15) { const f = concat(cur.chunks); cur = null; voicedRun = 0; silent = 0; pre = []; setPhase("thinking"); toWav16kB64(f, mic.sr).then((b64) => agentTurn({ audio: b64, mime: "audio/wav" })); }
    else if (silent > 2.5 && cur.speech <= 0.35) { cur = null; voicedRun = 0; $("#agStatus").textContent = "أسمعك… تكلّم"; }
  }); } catch (e) { toast(errMsg(e.code), true); return; }
  call.mic = mic; call.on = true; call.t0 = Date.now(); tick(); call.timer = setInterval(tick, 1000);
  $("#callPill").classList.add("live"); $("#callLabel").textContent = "مكالمة مباشرة"; $("#agEnd").hidden = false;
  if (!call.hist.length) addMsg("sys ok", "بدأت المكالمة. تكلّم بلهجتك، ورفيج يرد عليك بصوت.");
  setPhase("listening");
}
function endCall(silentEnd) { if (!call.on) return; call.on = false; call.mic?.stop(); call.mic = null; clearInterval(call.timer); call.audio.pause(); $("#callPill").classList.remove("live"); $("#callLabel").textContent = call.handed ? "محوّلة لموظف" : "انتهت المكالمة"; $("#agEnd").hidden = true; $("#orb").style.setProperty("--lvl", 0); if (call.phase !== "thinking") setPhase("idle"); }
function resetConversation() { call.hist = []; call.intents = []; call.done = []; call.handed = false; log.replaceChildren(); $("#agActions").replaceChildren(h("div", { class: "empty sm" }, "ما فيه إجراءات بعد.")); ["#agDialect", "#agIntent", "#agConf"].forEach((s) => ($(s).textContent = "—")); $("#callLabel").textContent = "جاهز"; $("#callTime").textContent = "00:00"; }
function handover(reason) {
  if (call.handed) return; call.handed = true; call.audio.pause(); endCall();
  const lastUser = [...call.hist].reverse().find((x) => x.role === "user")?.text;
  const card = h("div", { class: "handover-card" }, h("h4", {}, "🔁 تم تحويل المحادثة لموظف خدمة العملاء"),
    h("div", {}, "السبب: " + reason), h("div", {}, "لهجة المتصل: " + (DIALECT_AR[call.lastDialect] || "غير محددة")),
    h("div", {}, "النوايا: " + ([...new Set(call.intents)].join("، ") || "—")), h("div", {}, "إجراءات منفّذة: " + ([...new Set(call.done)].join("، ") || "لا يوجد")),
    lastUser ? h("div", {}, "آخر طلب: «" + lastUser + "»") : null, h("div", { class: "muted small" }, "عرض تجريبي: في النسخة الفعلية يُرسل هذا الملخص للموظف مع المكالمة."));
  log.append(h("div", { class: "msg sys ok", style: "max-width:100%" }, card)); log.scrollTop = log.scrollHeight;
  $("#callLabel").textContent = "محوّلة لموظف"; setPhase("idle", "تم التحويل لموظف · اضغط لبدء مكالمة جديدة");
}
$("#btnHandover").onclick = () => { if (!call.hist.length && !call.on) return toast("ابدأ المحادثة أول، وبعدها تقدر تحوّلها لموظف."); handover("طلب يدوي من الواجهة"); };
$("#orb").onclick = () => { if (!call.on) return startCall(); if (call.phase === "speaking") { call.audio.pause(); setPhase("listening"); return; } endCall(); };
$("#agEnd").onclick = () => endCall();
$("#agForm").onsubmit = (e) => { e.preventDefault(); const t = $("#agText").value.trim(); if (!t || call.phase === "thinking") return; unlockAudio(); if (call.handed) resetConversation(); if (call.phase === "speaking") call.audio.pause(); $("#agText").value = ""; addMsg("user", t); agentTurn({ text: t }); };

// ---------- init ----------
renderHomeVoices(); renderVoices(); renderTts(); renderState(); setPhase("idle"); route();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
window.__ramsa = { call, stt, tts, cl };

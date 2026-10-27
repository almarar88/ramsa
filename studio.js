// نبرة — expert studio: audiobooks, dubbing, ad voice-over, pronunciation, developer API, projects.
const L = window.__ramsa.lib;
const { h, $, $$, api, toast, errMsg, store, encodeWav, resample, decodeFile, toMono, b64ToBytes, bytesToB64, makePlayer, fmtT, VOICES, DIALECTS, DNAME, dialectSelect, SAMPLE_TEXT, applyPron, API_URL, actx } = L;
const SR = 24000;
const QURAN_NOTE = "احترامًا للقرآن الكريم، نبرة ما تولّد تلاوة آيات بأصوات اصطناعية، والنظام يرفض النصوص القرآنية.";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dl = (blob, name) => { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const wavBlob = (f32) => new Blob([encodeWav(f32, SR)], { type: "audio/wav" });
const voiceOpts = (sel, val) => { sel.replaceChildren(...VOICES.map((v) => h("option", { value: v.v }, `${v.name} · ${v.g === "m" ? "رجالي" : "نسائي"} · ${DNAME[v.d]}`))); if (val) sel.value = val; return sel; };
const sel = (cls = "") => h("select", { class: "dsel " + cls });
function pcm(r) { const raw = b64ToBytes(r.audio); let off = 0, sr = +(/rate=(\d+)/i.exec(r.mime || "")?.[1] || 24000); if (raw[0] === 82 && raw[1] === 73) { sr = new DataView(raw.buffer).getUint32(24, true); off = 44; } const n = (raw.length - off) >> 1, dv = new DataView(raw.buffer, raw.byteOffset + off), f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 32768; return { f, sr }; }
// TTS with patient retry: the free tier rate-limits bursts, so we wait and retry instead of failing the whole job.
async function say(text, voice, dialect, style = "story", status) {
  for (let k = 0; k < 4; k++) {
    try { const { f, sr } = pcm(await api("tts", { text, voice, dialect, style, pace: "normal" }, 100000)); return sr === SR ? f : await resample(f, sr, SR); }
    catch (e) { if (e.code === "quran_blocked") throw e; if (k === 3 || !["rate_limit", "busy", "timeout"].includes(e.code)) throw e; for (let s = 30; s > 0; s--) { status?.(`ضغط على الخدمة المجانية، نعيد المحاولة بعد ${s} ث…`); await sleep(1000); } }
  }
}
const cat = (parts) => { const n = parts.reduce((a, p) => a + p.length, 0), o = new Float32Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const silence = (s) => new Float32Array(Math.round(s * SR));
const head = (t, p) => h("div", { class: "page-head" }, h("h1", {}, t), h("p", {}, p));
const view = (id, ...kids) => { const s = h("section", { class: "view", id: "v-" + id, hidden: true }, ...kids); $("#v-more").before(s); return s; };
const player = (f32, filename = "ramsa.wav") => makePlayer({ title: "", wav: encodeWav(f32, SR), filename });
const COLORS = ["#0f8a7e", "#c99a2e", "#6d5bd0", "#d0576d", "#2f7fd0", "#4a9b4f", "#b8662f"];

// ======================= AUDIOBOOK STUDIO =======================
const DEF_BOOK = { title: "حكاية البحّار", narrator: "Charon", dialect: "ae", chars: [{ name: "سالم", voice: "Puck" }, { name: "مريم", voice: "Kore" }], chapters: [{ title: "الفصل الأول: الفجر", text: "في فجرٍ هادئ على شاطئ دبي القديم، كان البحر ساكن والنوارس تحوم فوق القوارب. [وقفة 1]\nسالم: يا مريم، اليوم بنطلع للغوص قبل لا تشتد الشمس.\nمريم: انتبه على عمرك يا سالم، البحر *ما يرحم* اللي يستعجل.\nوابتسم سالم، وشد الحبل، وانطلق القارب بهدوء نحو الأفق." }] };
const bk = { book: store.get("book", null) || structuredClone(DEF_BOOK), cur: 0, audio: {} };
const saveBook = () => store.set("book", bk.book);
function parse(text, book) {
  const segs = []; const names = new Map(book.chars.map((c) => [c.name.trim(), c]));
  for (const line of text.split(/\n+/)) {
    const t = line.trim(); if (!t) continue; let who = null, body = t; const m = /^([^:：]{1,24})[:：]\s*(.+)$/.exec(t); if (m && names.has(m[1].trim())) { who = m[1].trim(); body = m[2]; }
    for (const part of body.split(/(\[(?:وقفة|pause)\s*[\d.]*\s*(?:s|ث)?\])/i)) {
      const pm = /^\[(?:وقفة|pause)\s*([\d.]*)/i.exec(part); if (pm) { segs.push({ pause: Math.min(10, +pm[1] || 1) }); continue; }
      const txt = part.replace(/\*([^*]+)\*/g, "[emphasized] $1").trim(); if (!txt) continue;
      const voice = who ? names.get(who).voice : book.narrator; const last = segs[segs.length - 1];
      if (last && !last.pause && last.who === who && last.text.length + txt.length < 550) last.text += " " + txt; else segs.push({ who, voice, text: txt });
    }
  }
  return segs;
}
function studioView() {
  const v = view("studio", head("استوديو الكتب الصوتية", "اكتب الفصول، عيّن صوت لكل شخصية، وصدّر كتاب صوتي كامل."));
  const side = h("div", { class: "card pad st-side" }), main = h("div", { class: "stack" });
  v.append(h("div", { class: "st-grid" }, side, main), h("p", { class: "muted small" }, "طريقة الكتابة: سطر يبدأ باسم الشخصية ثم «:» ينقرأ بصوتها. ", h("code", {}, "[وقفة 2]"), " = سكوت ثانيتين. ", h("code", {}, "*كلمة*"), " = تأكيد (أفضل محاولة من النموذج، مو مضمون). " + QURAN_NOTE));
  const render = () => {
    const B = bk.book, ch = B.chapters[bk.cur] || B.chapters[0];
    side.replaceChildren(h("input", { class: "input", value: B.title, oninput: (e) => { B.title = e.target.value; saveBook(); } }), h("h3", { class: "h3" }, "الفصول"),
      ...B.chapters.map((c, i) => h("div", { class: "chap" + (i === bk.cur ? " on" : ""), onclick: () => { bk.cur = i; render(); } }, h("span", { class: "f1" }, c.title || "فصل " + (i + 1)), bk.audio[i] ? h("small", {}, "✓") : null)),
      h("button", { class: "btn sm soft", onclick: () => { B.chapters.push({ title: "فصل " + (B.chapters.length + 1), text: "" }); bk.cur = B.chapters.length - 1; saveBook(); render(); } }, "+ فصل جديد"),
      h("h3", { class: "h3" }, "الأصوات"), h("label", { class: "muted small" }, "الراوي"), voiceOpts(sel(), B.narrator), h("label", { class: "muted small" }, "اللهجة"), dialectSelect(sel(), B.dialect),
      ...B.chars.map((c, i) => h("div", { class: "char-row" }, h("input", { class: "input", value: c.name, oninput: (e) => { c.name = e.target.value; saveBook(); } }), voiceOpts(sel(), c.voice), h("button", { class: "link-btn", title: "حذف", onclick: () => { B.chars.splice(i, 1); saveBook(); render(); } }, "✕"))),
      h("button", { class: "btn sm soft", onclick: () => { B.chars.push({ name: "شخصية " + (B.chars.length + 1), voice: "Leda" }); saveBook(); render(); } }, "+ شخصية"));
    const [nar, dia] = $$("select", side); nar.onchange = () => { B.narrator = nar.value; saveBook(); }; dia.onchange = () => { B.dialect = dia.value; saveBook(); };
    $$(".char-row select", side).forEach((s, i) => (s.onchange = () => { B.chars[i].voice = s.value; saveBook(); }));
    const ta = h("textarea", { class: "st-editor", dir: "auto", value: ch.text }); ta.value = ch.text;
    const tl = h("div", { class: "timeline" }), stat = h("div", { class: "muted small" }), out = h("div", {}), bar = h("div", { class: "prog" }, h("i"));
    const drawTl = () => { const segs = parse(ta.value, B); const cmap = new Map(); tl.replaceChildren(...segs.map((s) => { if (s.pause) return h("div", { class: "tl-seg pause", style: `width:${s.pause * 28}px`, title: s.pause + " ث" }, s.pause + "ث"); if (!cmap.has(s.voice)) cmap.set(s.voice, COLORS[cmap.size % COLORS.length]); return h("div", { class: "tl-seg", style: `background:${cmap.get(s.voice)};width:${Math.min(420, 40 + s.text.length * 1.6)}px`, title: s.text }, (s.who || "الراوي") + " · " + s.text); })); stat.textContent = `${segs.filter((s) => !s.pause).length} مقطع صوتي · ${ta.value.length} حرف · تقريبًا ${Math.ceil(ta.value.length / 14)} ث`; };
    ta.oninput = () => { ch.text = ta.value; saveBook(); delete bk.audio[bk.cur]; drawTl(); };
    const ins = (s) => { const a = ta.selectionStart; ta.setRangeText(s, a, ta.selectionEnd, "end"); ta.focus(); ta.oninput(); };
    const gen = h("button", { class: "btn primary" }, "ولّد هذا الفصل");
    gen.onclick = async () => {
      const segs = parse(ta.value, B); if (!segs.some((s) => !s.pause)) return toast("اكتب نص الفصل أول.", true);
      gen.disabled = true; const parts = []; let i = 0; const nT = segs.filter((s) => !s.pause).length;
      try { for (const s of segs) { if (s.pause) { parts.push(silence(s.pause)); continue; } i++; stat.textContent = `يولّد المقطع ${i} من ${nT}…`; bar.firstChild.style.width = (i / nT) * 100 + "%"; $$(".tl-seg:not(.pause)", tl)[i - 1]?.classList.add("playing"); parts.push(await say(s.text, s.voice, B.dialect, "story", (m) => (stat.textContent = m)), silence(0.35)); }
        bk.audio[bk.cur] = cat(parts); out.replaceChildren(player(bk.audio[bk.cur])); stat.textContent = `جاهز · ${fmtT(bk.audio[bk.cur].length / SR)}`; render0(); }
      catch (e) { toast(errMsg(e.code), true); stat.textContent = "توقف: " + errMsg(e.code); } finally { gen.disabled = false; $$(".playing", tl).forEach((x) => x.classList.remove("playing")); }
    };
    const render0 = () => $$(".chap", side).forEach((c, i) => { if (bk.audio[i] && !c.querySelector("small")) c.append(h("small", {}, "✓")); });
    main.replaceChildren(h("div", { class: "card pad stack" }, h("div", { class: "row between wrap" }, h("input", { class: "input f1", value: ch.title, oninput: (e) => { ch.title = e.target.value; saveBook(); $$(".chap .f1", side)[bk.cur].textContent = ch.title; } }), B.chapters.length > 1 ? h("button", { class: "btn sm ghost", onclick: () => { if (!confirm("حذف الفصل؟")) return; B.chapters.splice(bk.cur, 1); bk.audio = {}; bk.cur = 0; saveBook(); render(); } }, "حذف الفصل") : null),
      h("div", { class: "toolbar" }, h("button", { onclick: () => ins(" [وقفة 1] ") }, "⏸ وقفة 1ث"), h("button", { onclick: () => ins(" [وقفة 3] ") }, "⏸ وقفة 3ث"), h("button", { onclick: () => { const a = ta.selectionStart, b = ta.selectionEnd; if (a === b) return toast("حدد كلمة أول."); ta.setRangeText("*" + ta.value.slice(a, b) + "*", a, b, "end"); ta.oninput(); } }, "✱ تأكيد"), ...B.chars.map((c) => h("button", { onclick: () => ins("\n" + c.name + ": ") }, "🗣 " + c.name)), h("button", { onclick: () => ins(" [sigh] ") }, "تنهيدة"), h("button", { onclick: () => ins(" [whispers] ") }, "همس")),
      ta, h("div", { class: "row between wrap" }, h("b", {}, "الخط الزمني"), stat), tl, bar, h("div", { class: "row gap-s wrap" }, gen,
        h("button", { class: "btn soft", onclick: () => bk.audio[bk.cur] ? dl(wavBlob(bk.audio[bk.cur]), `${B.title}-${bk.cur + 1}.wav`) : toast("ولّد الفصل أول.") }, "تنزيل الفصل WAV"),
        h("button", { class: "btn soft", onclick: exportBook }, "تنزيل الكتاب كامل"), h("button", { class: "btn ghost", onclick: () => dl(new Blob([JSON.stringify(B, null, 1)], { type: "application/json" }), B.title + ".ramsa-book.json") }, "حفظ المشروع"),
        h("label", { class: "btn ghost" }, "فتح مشروع", h("input", { type: "file", accept: ".json", hidden: true, onchange: async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); if (!j.chapters) throw 0; bk.book = j; bk.audio = {}; bk.cur = 0; saveBook(); render(); toast("انفتح المشروع."); } catch { toast("ملف مشروع غير صالح.", true); } } }))), out));
    if (bk.audio[bk.cur]) out.append(player(bk.audio[bk.cur])); drawTl();
  };
  function exportBook() {
    const B = bk.book, miss = B.chapters.map((_, i) => i).filter((i) => !bk.audio[i]); if (miss.length) return toast(`ولّد كل الفصول أول (ناقص ${miss.length}).`, true);
    let t = 0; const marks = [], parts = []; B.chapters.forEach((c, i) => { marks.push(`${fmtT(t)}  ${c.title}`); parts.push(bk.audio[i], silence(1.5)); t += bk.audio[i].length / SR + 1.5; });
    dl(wavBlob(cat(parts)), B.title + ".wav"); dl(new Blob([marks.join("\n")], { type: "text/plain" }), B.title + "-chapters.txt");
  }
  render();
}

// ======================= VIDEO DUBBING =======================
function dubView() {
  const v = view("dub", head("دبلجة الفيديو", "ارفع فيديو قصير، ونفرّغه ونترجمه وندبلجه بصوت جديد مع ملف ترجمة SRT."));
  const st = { file: null, url: "", src: null, dur: 0, segs: [], track: null };
  const vid = h("video", { controls: true, playsinline: true }), tgt = dialectSelect(sel(), "en"), keep = h("input", { type: "checkbox", checked: true }), stat = h("div", { class: "muted small" }), list = h("div", {}), out = h("div", { class: "stack" });
  const go1 = h("button", { class: "btn primary", disabled: true }, "١. فرّغ وترجم"), go2 = h("button", { class: "btn primary", disabled: true }, "٢. ولّد الدبلجة");
  const pick = h("input", { type: "file", accept: "video/*,audio/*", hidden: true });
  pick.onchange = async () => { const f = pick.files[0]; if (!f) return; st.file = f; st.url = URL.createObjectURL(f); vid.src = st.url; stat.textContent = "نقرأ الصوت…";
    try { const b = await decodeFile(f); st.dur = b.duration; if (st.dur > 180) { stat.textContent = "الحد الأقصى 3 دقائق في هذه النسخة."; return toast("الفيديو أطول من 3 دقائق.", true); } st.src = await resample(toMono(b), b.sampleRate, SR); stat.textContent = `المدة ${fmtT(st.dur)} · جاهز للتفريغ`; go1.disabled = false; }
    catch { stat.textContent = "ما قدرنا نقرأ الصوت من هذا الملف. جرّب MP4 أو MP3."; } };
  go1.onclick = async () => { go1.disabled = true; stat.textContent = "نفرّغ ونترجم… (قد تاخذ دقيقة)";
    try { const a16 = await resample(st.src, SR, 16000); const r = await api("dub", { audio: bytesToB64(encodeWav(a16, 16000)), mime: "audio/wav", target: tgt.value }, 120000); st.segs = (r.segments || []).filter((s) => s.text || s.tr); if (!st.segs.length) throw Object.assign(new Error(), { code: "empty_audio" }); drawSegs(); go2.disabled = false; stat.textContent = `${st.segs.length} مقطع. عدّل الترجمة لو تبي ثم ولّد.`; }
    catch (e) { stat.textContent = errMsg(e.code); toast(errMsg(e.code), true); } finally { go1.disabled = false; } };
  const drawSegs = () => list.replaceChildren(h("div", { class: "seg-row muted small" }, h("b", {}, "الوقت"), h("b", {}, "الأصل"), h("b", {}, "الدبلجة")), ...st.segs.map((s) => h("div", { class: "seg-row" }, h("span", { class: "muted" }, fmtT(s.start) + (s.gender ? (s.gender === "f" || /fem/i.test(s.gender) ? " ♀" : " ♂") : "")), h("div", { dir: "auto" }, s.text), h("textarea", { dir: "auto", rows: 2, oninput: (e) => (s.tr = e.target.value) }, s.tr))));
  const voiceFor = (g, d) => { const fem = g === "f" || /fem/i.test(g || ""); return (VOICES.find((v) => v.d === d && (v.g === "f") === fem) || VOICES.find((v) => (v.g === "f") === fem)).v; };
  go2.onclick = async () => { go2.disabled = true; const N = Math.ceil(st.dur * SR) + SR, trk = new Float32Array(N); let cursor = 0, tight = 0;
    try { for (let i = 0; i < st.segs.length; i++) { const s = st.segs[i]; stat.textContent = `يدبلج ${i + 1} من ${st.segs.length}…`; let f = await say(s.tr, voiceFor(s.gender, tgt.value), tgt.value, "warm", (m) => (stat.textContent = m));
        const slot = ((st.segs[i + 1]?.start ?? st.dur + 1) - s.start) * SR; if (f.length > slot) { const k = Math.min(1.25, f.length / slot); if (k > 1.02) { f = await resample(f, SR * k, SR); tight++; } }
        const at = Math.max(Math.round(s.start * SR), cursor); trk.set(f.subarray(0, Math.max(0, N - at)), at); cursor = at + f.length; }
      if (keep.checked) for (let i = 0; i < st.src.length && i < N; i++) trk[i] += st.src[i] * 0.12;
      let pk = 0; for (const x of trk) pk = Math.max(pk, Math.abs(x)); if (pk > 0.98) for (let i = 0; i < N; i++) trk[i] *= 0.98 / pk;
      st.track = trk; const url = URL.createObjectURL(wavBlob(trk)); const au = h("audio", { src: url, preload: "auto" });
      const sync = h("button", { class: "btn soft" }, "▶ معاينة الفيديو بالدبلجة"); sync.onclick = () => { vid.muted = true; vid.currentTime = 0; au.currentTime = 0; vid.play(); au.play(); };
      vid.onpause = () => au.pause(); vid.onseeked = () => { au.currentTime = vid.currentTime; }; vid.onplay = () => { if (vid.muted) { au.currentTime = vid.currentTime; au.play(); } };
      out.replaceChildren(au, h("div", { class: "row gap-s wrap" }, sync, h("button", { class: "btn soft", onclick: () => dl(wavBlob(trk), "dub.wav") }, "تنزيل الصوت المدبلج WAV"), h("button", { class: "btn soft", onclick: () => dl(new Blob([srt(st.segs)], { type: "text/plain" }), "dub.srt") }, "تنزيل الترجمة SRT")));
      stat.textContent = "جاهز." + (tight ? ` ${tight} مقطع سرّعناه شوي عشان يلحق وقته.` : ""); }
    catch (e) { stat.textContent = errMsg(e.code); toast(errMsg(e.code), true); } finally { go2.disabled = false; } };
  const ts = (x) => { const ms = Math.round(x * 1000), p = (n, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  const srt = (segs) => segs.map((s, i) => `${i + 1}\n${ts(s.start)} --> ${ts(s.end || s.start + 3)}\n${s.tr}\n`).join("\n");
  v.append(h("div", { class: "dub-wrap" }, h("div", { class: "card pad stack" }, vid, h("label", { class: "btn soft" }, "اختر فيديو (حتى 3 دقائق)", pick), stat),
    h("div", { class: "card pad stack" }, h("div", { class: "row gap-s wrap" }, h("span", {}, "الدبلجة إلى:"), tgt, h("label", { class: "row gap-s" }, keep, "خلّ صوت الخلفية الأصلي خفيف")), h("div", { class: "row gap-s wrap" }, go1, go2), list, out)),
    h("p", { class: "muted small" }, "حدود صادقة: التوقيت تقريبي من النموذج، ما في مزامنة شفايف، وصوت الخلفية الأصلي يبقى فيه الكلام الأصلي بصوت منخفض (ما نفصل الموسيقى عن الكلام). الفيديو ما ينرفع لأي مكان غير الصوت للتفريغ."));
}

// ======================= AD / REEL VOICE-OVER =======================
const MOODS = { calm: { bpm: 72, ch: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], kick: false, name: "هادئ" }, upbeat: { bpm: 112, ch: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], kick: true, name: "حماسي" }, corporate: { bpm: 96, ch: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]], kick: true, name: "شركات" }, oud: { bpm: 84, ch: [[50, 57, 62], [48, 55, 60], [46, 53, 58], [48, 55, 60]], kick: false, name: "شرقي هادئ" } };
async function musicBed(mood, secs) { const M = MOODS[mood], oc = new OfflineAudioContext(1, Math.ceil(secs * SR), SR), beat = 60 / M.bpm, bar = beat * 4; const master = oc.createGain(); master.gain.value = 0.22; master.connect(oc.destination);
  const lp = oc.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = mood === "upbeat" ? 2400 : 1400; lp.connect(master);
  for (let t = 0, i = 0; t < secs; t += bar, i++) for (const n of M.ch[i % 4]) { const o = oc.createOscillator(), g = oc.createGain(); o.type = mood === "oud" ? "triangle" : "sawtooth"; o.frequency.value = 440 * 2 ** ((n - 69) / 12); o.detune.value = (Math.random() - 0.5) * 12; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.setValueAtTime(0.12, t + bar - 0.3); g.gain.linearRampToValueAtTime(0, t + bar); o.connect(g).connect(lp); o.start(t); o.stop(t + bar + 0.05); }
  if (M.kick) for (let t = 0; t < secs; t += beat) { const o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g).connect(master); o.start(t); o.stop(t + 0.3); }
  return (await oc.startRendering()).getChannelData(0).slice(); }
function duckMix(voice, music, lead, duckDb) { const N = Math.max(music.length, voice.length + lead), out = new Float32Array(N), win = Math.round(SR * 0.05), duck = 10 ** (-duckDb / 20); let g = 1;
  const env = new Float32Array(Math.ceil(N / win)); for (let w = 0; w < env.length; w++) { let s = 0; const a = w * win - lead; for (let i = 0; i < win; i++) { const x = voice[a + i] || 0; s += x * x; } env[w] = Math.sqrt(s / win) > 0.015 ? 1 : 0; }
  for (let w = 0; w < env.length; w++) { let near = 0; for (let k = -2; k <= 6; k++) near = Math.max(near, env[w + k] || 0); const target = near ? duck : 1; for (let i = 0; i < win; i++) { const j = w * win + i; if (j >= N) break; g += (target - g) * (target < g ? 0.004 : 0.0007); out[j] = (music[j] || 0) * g + (voice[j - lead] || 0); } }
  const fade = SR * 1.5; for (let i = 0; i < fade && i < N; i++) out[N - 1 - i] *= i / fade; let pk = 0; for (const x of out) pk = Math.max(pk, Math.abs(x)); if (pk > 0.98) for (let i = 0; i < N; i++) out[i] *= 0.98 / pk; return out; }
function advoView() {
  const v = view("advo", head("إعلانات وريلز", "تعليق صوتي احترافي مع موسيقى خلفية تنخفض تلقائيًا تحت الصوت (Ducking)."));
  const ta = h("textarea", { class: "st-editor", dir: "auto", style: "min-height:140px" }); ta.value = "عروض الصيف وصلت! خصم لين خمسين بالمية على كل التشكيلة، بس لين نهاية الأسبوع. لا تفوّتها، زورنا اليوم أو اطلب أونلاين.";
  const vs = voiceOpts(sel(), "Puck"), ds = dialectSelect(sel(), "ae"), ms = h("select", { class: "dsel" }, ...Object.entries(MOODS).map(([k, m]) => h("option", { value: k }, m.name)), h("option", { value: "file" }, "موسيقاي (ملف)")), mf = h("input", { type: "file", accept: "audio/*", hidden: true });
  const duck = h("input", { type: "range", min: 6, max: 24, value: 14 }), dv = h("span", {}, "14 dB"), stat = h("div", { class: "muted small" }), out = h("div", { class: "stack" }), go = h("button", { class: "btn primary" }, "ولّد الإعلان");
  duck.oninput = () => (dv.textContent = duck.value + " dB"); ms.onchange = () => ms.value === "file" && mf.click(); let voiceCache = null;
  go.onclick = async () => { const text = ta.value.trim(); if (!text) return toast("اكتب نص الإعلان.", true); go.disabled = true;
    try { const key = [text, vs.value, ds.value].join("|"); if (voiceCache?.key !== key) { stat.textContent = "يسجل الصوت…"; voiceCache = { key, f: await say(text, vs.value, ds.value, "ad", (m) => (stat.textContent = m)) }; }
      stat.textContent = "يركّب الموسيقى ويخفضها تحت الصوت…"; const lead = Math.round(SR * 1.6), secs = voiceCache.f.length / SR + 4.2; let music;
      if (ms.value === "file" && mf.files[0]) { const b = await decodeFile(mf.files[0]); music = (await resample(toMono(b), b.sampleRate, SR)).subarray(0, Math.ceil(secs * SR)); let pk = 0; for (const x of music) pk = Math.max(pk, Math.abs(x)); music = music.map((x) => (x / (pk || 1)) * 0.5); } else music = await musicBed(ms.value === "file" ? "calm" : ms.value, secs);
      const mix = duckMix(voiceCache.f, music, lead, +duck.value); out.replaceChildren(player(mix), h("div", { class: "row gap-s wrap" }, h("button", { class: "btn soft", onclick: () => dl(wavBlob(mix), "nabra-ad.wav") }, "تنزيل الإعلان WAV"), h("button", { class: "btn ghost", onclick: () => dl(wavBlob(voiceCache.f), "nabra-voice-only.wav") }, "الصوت بدون موسيقى")));
      stat.textContent = `جاهز · ${fmtT(mix.length / SR)} · غيّر الموسيقى أو مستوى الخفض وأعد التوليد بدون استهلاك طلب صوت جديد.`; }
    catch (e) { stat.textContent = errMsg(e.code); toast(errMsg(e.code), true); } finally { go.disabled = false; } };
  v.append(h("div", { class: "card pad stack" }, ta, h("div", { class: "row gap-s wrap" }, h("span", {}, "الصوت"), vs, h("span", {}, "اللهجة"), ds, h("span", {}, "الموسيقى"), ms, mf), h("div", { class: "row gap-s wrap" }, h("span", {}, "خفض الموسيقى تحت الصوت"), duck, dv), h("div", { class: "row gap-s" }, go), stat, out),
    h("p", { class: "muted small" }, "الموسيقى الجاهزة مولّدة على جهازك (نغمات بسيطة بدون حقوق). لو رفعت موسيقاك تأكد إن عندك حق استخدامها. " + QURAN_NOTE));
}

// ======================= PRONUNCIATION =======================
function pronView() {
  const v = view("pron", head("قاموس النطق", "علّم نبرة كيف تنطق أسماء علامتك والمصطلحات. ينطبق تلقائيًا على كل توليد صوت من هذا الجهاز."));
  const get = () => JSON.parse(localStorage.getItem("ramsa.pron") || "[]"), set = (d) => localStorage.setItem("ramsa.pron", JSON.stringify(d));
  if (!localStorage.getItem("ramsa.pron")) set([{ from: "Alcode", to: "ألكود" }, { from: "AI", to: "إيه آي" }]);
  const box = h("div", { class: "stack" }), test = h("input", { class: "input", value: "منصة Alcode تستخدم AI عشان تنشر كتبك." }), tout = h("div", { class: "muted small" }), ta = h("div", {});
  const draw = () => { const d = get(); box.replaceChildren(...d.map((x, i) => h("div", { class: "char-row" }, h("input", { class: "input", dir: "auto", value: x.from, placeholder: "الكلمة كما تنكتب", oninput: (e) => { d[i].from = e.target.value; set(d); upd(); } }), h("input", { class: "input", dir: "auto", value: x.to, placeholder: "كيف تنقال", oninput: (e) => { d[i].to = e.target.value; set(d); upd(); } }), h("button", { class: "link-btn", onclick: () => { d.splice(i, 1); set(d); draw(); } }, "✕"))), h("div", { class: "row gap-s wrap" }, h("button", { class: "btn sm soft", onclick: () => { d.push({ from: "", to: "" }); set(d); draw(); } }, "+ كلمة"), h("button", { class: "btn sm ghost", onclick: () => dl(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }), "nabra-pronunciation.json") }, "تصدير"), h("label", { class: "btn sm ghost" }, "استيراد", h("input", { type: "file", accept: ".json", hidden: true, onchange: async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j)) throw 0; set(j.filter((x) => x.from)); draw(); toast("تم الاستيراد."); } catch { toast("ملف غير صالح.", true); } } })))); upd(); };
  const upd = () => (tout.textContent = "بيتقال: " + applyPron(test.value)); test.oninput = upd;
  const play = h("button", { class: "btn primary" }, "اسمع"); play.onclick = async () => { play.disabled = true; try { ta.replaceChildren(player(await say(test.value, "Kore", "ae", "warm"))); } catch (e) { toast(errMsg(e.code), true); } finally { play.disabled = false; } };
  v.append(h("div", { class: "card pad stack" }, h("div", { class: "char-row muted small" }, h("b", {}, "الكلمة"), h("b", {}, "النطق"), h("span")), box), h("div", { class: "card pad stack" }, h("h3", { class: "h3" }, "جرّب"), test, tout, h("div", {}, play), ta), h("p", { class: "muted small" }, "القاموس محفوظ على هذا الجهاز فقط، ويطبَّق على النطق والكتب الصوتية والإعلانات والبودكاست."));
  draw();
}

// ======================= DEVELOPER API =======================
function apiView() {
  const v = view("api", head("للمطورين", "نفس المحرك اللي يشغّل نبرة، عبر طلب HTTP واحد."));
  const curl = `curl -X POST '${API_URL}' \\\n  -H 'content-type: application/json' \\\n  -d '{"mode":"tts","text":"هلا والله، شحالك؟","voice":"Kore","dialect":"ae","style":"warm","pace":"normal"}'`;
  const js = `const r = await fetch("${API_URL}", {\n  method: "POST", headers: { "content-type": "application/json" },\n  body: JSON.stringify({ mode: "tts", text: "هلا والله", voice: "Kore", dialect: "ae" })\n});\nconst { audio, mime } = await r.json(); // audio = base64 PCM 16-bit mono (rate in mime) أو WAV`;
  const docs = [["tts", "نص → صوت", `{ mode:"tts", text, voice, dialect, style?: warm|calm|formal|excited|ad|story, pace?: slow|normal|fast }`, `{ audio: base64, mime }`], ["srt", "صوت → ترجمة بالتوقيت", `{ mode:"srt", audio: base64 WAV, mime, translate?: bool }`, `{ cues:[{start,end,text}] }`], ["dub", "صوت → مقاطع مترجمة للدبلجة", `{ mode:"dub", audio: base64 WAV, mime, target: dialect }`, `{ segments:[{start,end,speaker,gender,text,tr}] }`], ["podcast_script", "موضوع → حوار بودكاست", `{ mode:"podcast_script", topic, dialect, turns?: 4-14 }`, `{ lines:[…] }`]];
  const pre = (t) => h("pre", { class: "code" }, t);
  const pt = h("textarea", { class: "st-editor", dir: "auto", style: "min-height:80px" }); pt.value = "هلا والله، هذا تجربة من صفحة المطورين.";
  const pv = voiceOpts(sel(), "Kore"), pd = dialectSelect(sel(), "ae"), pres = pre("// الرد بيظهر هنا"), pa = h("div", {}), pg = h("button", { class: "btn primary" }, "أرسل الطلب");
  pg.onclick = async () => { pg.disabled = true; const t0 = performance.now(); try { const r = await api("tts", { text: pt.value, voice: pv.value, dialect: pd.value, style: "warm", pace: "normal" }); pres.textContent = JSON.stringify({ mime: r.mime, audio: r.audio.slice(0, 48) + `… (${Math.round(r.audio.length / 1024)} KB base64)`, ms: Math.round(performance.now() - t0) }, null, 2); const { f, sr } = pcm(r); pa.replaceChildren(player(sr === SR ? f : await resample(f, sr, SR))); } catch (e) { pres.textContent = JSON.stringify({ error: e.code }, null, 2); } finally { pg.disabled = false; } };
  const wv = voiceOpts(sel(), "Kore"), wd = dialectSelect(sel(), "ae"), wcode = pre("");
  const snippet = () => `<!-- ودجت نبرة: زر «اسمع» يقرأ نص العنصر المحدد -->\n<button id="nabra-listen">🔊 اسمع</button>\n<script>\ndocument.getElementById("nabra-listen").onclick = async (e) => {\n  const text = (document.querySelector("article") || document.body).innerText.slice(0, 1200);\n  e.target.disabled = true;\n  const r = await fetch("${API_URL}", { method: "POST", headers: { "content-type": "application/json" },\n    body: JSON.stringify({ mode: "tts", text, voice: "${wv.value}", dialect: "${wd.value}" }) }).then((x) => x.json());\n  const b = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));\n  const rate = +(/rate=(\\d+)/.exec(r.mime || "")?.[1] || 24000);\n  const ctx = new AudioContext(), pcm = new Int16Array(b.buffer.slice(0, b.length - (b.length % 2)));\n  const buf = ctx.createBuffer(1, pcm.length, rate); buf.getChannelData(0).set(Float32Array.from(pcm, (s) => s / 32768));\n  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start(); e.target.disabled = false;\n};\n<\/script>`;
  const upd = () => (wcode.textContent = snippet()); wv.onchange = wd.onchange = upd; upd();
  v.append(h("div", { class: "card pad stack" }, h("h3", { class: "h3" }, "البداية السريعة"), pre(curl), pre(js)),
    h("div", { class: "card pad stack" }, h("h3", { class: "h3" }, "الأوضاع المتاحة"), ...docs.map(([m, t, req, res]) => h("div", { class: "stack" }, h("b", {}, `${m} · ${t}`), pre("الطلب: " + req + "\nالرد:  " + res))), h("p", { class: "muted small" }, "الأصوات: " + VOICES.map((x) => x.v).join(", ")), h("p", { class: "muted small" }, "اللهجات: " + DIALECTS.map(([k]) => k).join(", ")), h("p", { class: "muted small" }, "الأخطاء ترجع { error: code } مثل rate_limit, busy, empty_text, too_long, quran_blocked.")),
    h("div", { class: "card pad stack" }, h("h3", { class: "h3" }, "جرّب مباشرة"), pt, h("div", { class: "row gap-s wrap" }, pv, pd, pg), pres, pa),
    h("div", { class: "card pad stack" }, h("h3", { class: "h3" }, "ودجت للتضمين"), h("div", { class: "row gap-s wrap" }, wv, wd, h("button", { class: "btn sm soft", onclick: () => navigator.clipboard?.writeText(snippet()).then(() => toast("انتسخ الكود.")) }, "نسخ الكود")), wcode),
    h("p", { class: "muted small" }, "صراحة: هذا endpoint تجريبي عام بدون مفاتيح API ولا اتفاقية مستوى خدمة، ويعمل على الطبقة المجانية لـ Gemini فيه حدود طلبات (خصوصًا للصوت). للإنتاج تحتاج مفاتيح لكل عميل، حدود استخدام، وفوترة — غير موجودة حاليًا."));
}

// ======================= PROJECTS =======================
function projectsView() {
  const v = view("projects", head("مشاريعي", "كل شغلك محفوظ على هذا الجهاز. صدّره نسخة احتياطية أو انقله لجهاز ثاني."));
  const list = h("div", { class: "stack" });
  const LABEL = { book: "الكتاب الصوتي", pron: "قاموس النطق", usage: "سجل الاستخدام", favs: "الأصوات المفضلة", agent: "إعدادات الوكيل" };
  const draw = () => { const keys = Object.keys(localStorage).filter((k) => k.startsWith("ramsa.")).sort(); list.replaceChildren(...(keys.length ? keys.map((k) => { const n = k.slice(6), sz = (localStorage.getItem(k) || "").length; return h("div", { class: "card proj" }, h("div", { class: "f1" }, h("b", {}, LABEL[n] || n), h("div", { class: "muted small" }, `${(sz / 1024).toFixed(1)} KB`)), h("button", { class: "btn sm ghost", onclick: () => { if (confirm("حذف «" + (LABEL[n] || n) + "» من هذا الجهاز؟")) { localStorage.removeItem(k); draw(); } } }, "حذف")); }) : [h("div", { class: "empty" }, "ما في بيانات محفوظة بعد.")])); };
  const exp = () => { const o = {}; for (const k of Object.keys(localStorage)) if (k.startsWith("ramsa.")) o[k] = localStorage.getItem(k); dl(new Blob([JSON.stringify({ app: "ramsa", v: 1, at: new Date().toISOString(), data: o }, null, 1)], { type: "application/json" }), `nabra-backup-${new Date().toISOString().slice(0, 10)}.json`); };
  const imp = async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); if (j.app !== "ramsa" || !j.data) throw 0; let n = 0; for (const [k, val] of Object.entries(j.data)) if (k.startsWith("ramsa.") && typeof val === "string") { localStorage.setItem(k, val); n++; } draw(); toast(`تم استيراد ${n} عنصر. حدّث الصفحة لتطبيقها.`); } catch { toast("ملف نسخة احتياطية غير صالح.", true); } e.target.value = ""; };
  v.append(h("div", { class: "row gap-s wrap" }, h("button", { class: "btn primary", onclick: exp }, "تصدير الكل"), h("label", { class: "btn soft" }, "استيراد نسخة", h("input", { type: "file", accept: ".json", hidden: true, onchange: imp }))), list, h("p", { class: "muted small" }, "الملفات الصوتية الكبيرة ما تنحفظ هنا (حجم المتصفح محدود)، نزّلها WAV من كل أداة. ما في مزامنة سحابية."));
  window.__studio.drawProjects = draw; draw();
}

window.__studio = { route: (id) => { if (id === "projects") window.__studio.drawProjects?.(); } };
studioView(); dubView(); advoView(); pronView(); apiView(); projectsView();
L.route();

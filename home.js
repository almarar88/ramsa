// نبرة — home page interactions, scroll reveals, live demo, dialect showcase.
const L = window.__ramsa.lib;
const { h, $, $$, api, toast, errMsg, audioToWav, actx, VOICES, DIALECTS, DGROUP, REGIONS, DQUAL, DNAME, dialectSelect, SAMPLE_TEXT } = L;
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- scroll reveal (all pages) ----
const io = "IntersectionObserver" in window && !RM ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }) : null;
const watch = () => $$(".reveal:not(.in)").forEach((el, i) => { if (!io) return el.classList.add("in"); el.style.setProperty("--d", (i % 4) * 70 + "ms"); io.observe(el); });
watch(); addEventListener("hashchange", () => setTimeout(watch, 50));
// count-up
const cio = io && new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) return; cio.unobserve(e.target); const n = +e.target.dataset.count, t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 900); e.target.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }), { threshold: 0.6 });
$$("[data-count]").forEach((el) => cio?.observe(el));

// ---- shared level from whatever audio plays on the home page ----
let level = 0, analyser = null, buf = null;
function connect(audioEl) {
  try { const c = actx(); if (!audioEl._src) { audioEl._src = c.createMediaElementSource(audioEl); } analyser = c.createAnalyser(); analyser.fftSize = 512; buf = new Uint8Array(analyser.fftSize); audioEl._src.connect(analyser); analyser.connect(c.destination); } catch { analyser = null; }
}
function readLevel() { if (!analyser) return 0; analyser.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const x = (v - 128) / 128; s += x * x; } return Math.sqrt(s / buf.length); }

// ---- animated orb (hero background) ----
const orb = $("#heroOrb");
function drawOrb(t) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = orb.clientWidth, hh = orb.clientHeight; if (!w) return;
  if (orb.width !== w * dpr) { orb.width = w * dpr; orb.height = hh * dpr; }
  const g = orb.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
  const cx = w * (innerWidth < 760 ? 0.5 : 0.28), cy = hh * (innerWidth < 760 ? 0.82 : 0.5), R = Math.min(w, hh) * (innerWidth < 760 ? 0.42 : 0.34) * (1 + level * 1.4);
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  for (let k = 0; k < 3; k++) {
    g.beginPath(); const N = 90;
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; const r = R * (1 - k * 0.16) * (1 + 0.05 * Math.sin(a * 3 + t / 900 + k) + 0.035 * Math.sin(a * 5 - t / 700 + k * 2) + level * 0.25 * Math.sin(a * 7 + t / 120)); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    const gr = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.1); const cols = [["#2cc2a7", "#0f8a7e"], ["#e9c46a", "#c99a2e"], ["#5fd6c0", "#0d5c57"]][k];
    gr.addColorStop(0, cols[0] + (dark ? "55" : "40")); gr.addColorStop(1, cols[1] + "00"); g.fillStyle = gr; g.fill();
  }
}
let raf = 0;
function loop(t) { const target = readLevel() * 3; level += (target - level) * 0.25; if (!$("#v-home").hidden) { drawOrb(t); drawWave(); } raf = requestAnimationFrame(loop); }
if (orb) { if (RM) { drawOrb(0); addEventListener("resize", () => drawOrb(0)); } else raf = requestAnimationFrame(loop); }

// ---- live demo ----
const cv = $("#ldWave"); const hist = new Array(64).fill(0);
function drawWave() {
  if (!cv) return; const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, hh = cv.clientHeight || 56; if (!w) return; if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = hh * dpr; }
  hist.push(Math.min(1, level * 1.2)); hist.shift(); const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
  const n = hist.length, bw = w / n; g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--acc") || "#0f8a7e";
  hist.forEach((v, i) => { const t = performance.now() / 600; const idle = RM ? 0.06 : 0.05 + 0.04 * Math.sin(i / 3 + t); const bh = Math.max(3, (v || idle) * hh * 0.9); g.globalAlpha = 0.35 + 0.65 * (i / n); g.beginPath(); g.roundRect?.(i * bw + bw * 0.2, (hh - bh) / 2, bw * 0.6, bh, 3) ?? g.rect(i * bw + bw * 0.2, (hh - bh) / 2, bw * 0.6, bh); g.fill(); });
  g.globalAlpha = 1;
}
if (RM) drawWave();
const ldD = $("#ldDialect"), ldV = $("#ldVoice");
if (ldD) {
  dialectSelect(ldD, "ae");
  ldV.replaceChildren(...VOICES.map((v) => h("option", { value: v.id }, `${v.name} · ${v.g === "m" ? "رجالي" : "نسائي"} · ${v.desc}`))); ldV.value = "maitha";
  const player = new Audio(); player.crossOrigin = "anonymous"; let cache = new Map();
  ldD.onchange = () => { const t = $("#ldText"); if (!t.dataset.touched) t.value = SAMPLE_TEXT[ldD.value] || t.value; t.dir = ldD.value === "en" ? "ltr" : "rtl"; };
  $("#ldText").oninput = (e) => (e.target.dataset.touched = "1");
  const play = (url) => { if (!player._src) connect(player); actx().resume?.(); player.src = url; return player.play(); };
  $("#ldGo").onclick = async (e) => {
    const b = e.currentTarget, text = $("#ldText").value.trim(); if (!text) return toast("اكتب نص أول.", true);
    const v = VOICES.find((x) => x.id === ldV.value); const key = [text, v.v, ldD.value].join("|");
    if (cache.has(key)) return play(cache.get(key));
    b.classList.add("loading"); b.disabled = true;
    try { const r = await api("tts", { text, voice: v.v, dialect: ldD.value, style: "warm", pace: "normal" }, 90000); const url = URL.createObjectURL(new Blob([audioToWav(r.audio, r.mime)], { type: "audio/wav" })); cache.set(key, url); await play(url); window.__ramsa.lib.track?.("tts", text.length); }
    catch (er) { toast(errMsg(er.code), true); } finally { b.classList.remove("loading"); b.disabled = false; }
  };
  $("#heroPlay").onclick = () => { if (!player.paused && player.src.endsWith("hero.mp3")) return player.pause(); play("samples/hero.mp3"); };
}

// ---- dialect showcase ----
const dmap = $("#dmap");
if (dmap) {
  const a = new Audio(); let cur = null;
  const btn = (k) => { const b = h("button", { class: "dchip" + (DQUAL[k] === "weak" ? " weak" : ""), title: DQUAL[k] === "weak" ? "تجريبي: النطق قريب لكن مو دائمًا أصلي" : "" }, h("span", { class: "eq" }, h("i"), h("i"), h("i")), DNAME[k], DQUAL[k] === "weak" ? h("small", {}, "تجريبي") : null);
    b.onclick = async () => { if (cur === b && !a.paused) { a.pause(); return; } $$(".dchip.on", dmap).forEach((x) => x.classList.remove("on")); cur = b; b.classList.add("on");
      if (!a._src) connect(a); actx().resume?.(); a.src = `samples/dial-${k}.mp3`; a.onended = a.onpause = () => b.classList.remove("on");
      a.play().catch(async () => { b.classList.add("loading"); try { const v = VOICES.find((x) => x.d === k) || VOICES[1]; const r = await api("tts", { text: SAMPLE_TEXT[k], voice: v.v, dialect: k, style: "warm", pace: "normal" }); a.src = URL.createObjectURL(new Blob([audioToWav(r.audio, r.mime)], { type: "audio/wav" })); await a.play(); } catch (er) { toast(errMsg(er.code), true); b.classList.remove("on"); } finally { b.classList.remove("loading"); } }); };
    return b; };
  dmap.replaceChildren(...REGIONS.map(([g, gl]) => h("div", { class: "dregion r-" + g }, h("b", {}, gl), h("div", { class: "dchips" }, ...DIALECTS.filter(([k]) => DGROUP[k] === g).map(([k]) => btn(k))))),
    h("p", { class: "muted small dnote" }, "«تجريبي» = اختبرناها ولقينا النطق قريب لكن مو دائمًا أصلي. اللهجات الخليجية والمصرية والشامية والفصحى الأقوى."));
}

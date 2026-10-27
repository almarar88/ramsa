// نبرة — مركز الاتصال الذكي (Call Center)
const R = window.__ramsa, L = R.lib;
const { h, $, $$, ico, api, toast, errMsg, store, Mic, concat, resample, encodeWav, audioToWav, decodeFile, makePlayer, fmtT, rmsOf, VOICES, AGENT_VOICES, DIALECT_AR, dlText, bindDrop, b64ToBytes, bytesToB64, actx, toMono, playSample, API_URL } = L;
// Skip null/false children in DOM insertion helpers (conditional UI parts).
for (const m of ["append", "replaceChildren", "prepend"]) { const o = Element.prototype[m]; Element.prototype[m] = function (...k) { return o.apply(this, k.filter((x) => x != null && x !== false)); }; }
const PHONE_FN = API_URL.replace(/\/ramsa$/, "/ramsa-phone");
const ECHO_URL = API_URL + "?echo=1";

// ---------- workspace ----------
let WS = store.get("ccWs", "");
if (!/^[A-Za-z0-9_-]{16,64}$/.test(WS)) { const a = new Uint8Array(18); crypto.getRandomValues(a); WS = "ws_" + [...a].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); store.set("ccWs", WS); }

// ---------- profile ----------
const DAYS = [["sun", "الأحد"], ["mon", "الاثنين"], ["tue", "الثلاثاء"], ["wed", "الأربعاء"], ["thu", "الخميس"], ["fri", "الجمعة"], ["sat", "السبت"]];
const ROUTES_IVR = [["booking", "الحجوزات"], ["order_status", "حالة الطلب"], ["complaint", "الشكاوى"], ["callback", "معاودة اتصال"], ["faq", "استفسارات عامة"], ["transfer", "موظف خدمة العملاء"]];
const SAMPLE = () => ({
  name: "عيادة ابتسامة الخليج لطب الأسنان", agent_name: "سلامة", industry: "clinic", about: "عيادة أسنان في دبي (شركة تجريبية لغرض العرض: كل البيانات مثال).", human_phone: "", notify: "whatsapp",
  hours: Object.fromEntries(DAYS.map(([d]) => [d, { open: d !== "fri", from: d === "sat" ? "10:00" : "09:00", to: "21:00" }])),
  kb: "العنوان: دبي، جميرا، شارع الوصل، بناية 12، الطابق الأول.\nالمواقف مجانية أمام العيادة.\nطرق الدفع: نقدًا أو بالبطاقة أو Apple Pay.\nالأطباء: د. مريم (تقويم)، د. خالد (زراعة وتجميل).\nالطوارئ: في حالات النزيف الشديد أو الإصابة القوية يُنصح بالتوجه لأقرب طوارئ.",
  faqs: [{ q: "تقبلون التأمين؟", a: "نعم، نقبل أغلب شركات التأمين الرئيسية، ويُفضّل التأكد من التغطية قبل الموعد." }, { q: "هل يوجد خصم للعائلات؟", a: "خصم 10٪ على التنظيف عند حجز 3 أفراد أو أكثر في نفس اليوم." }],
  services: [{ name: "كشف وفحص", price: "150 درهم", note: "" }, { name: "تنظيف أسنان", price: "300 درهم", note: "45 دقيقة" }, { name: "تبييض", price: "1200 درهم", note: "جلسة واحدة" }, { name: "حشوة تجميلية", price: "من 350 درهم", note: "حسب الحالة" }],
  orders: [{ id: "4521", status: "جاهز للاستلام من الاستقبال", item: "واقي أسنان ليلي", eta: "اليوم" }, { id: "7310", status: "قيد التصنيع في المختبر", item: "تركيبة تقويم شفافة", eta: "الخميس القادم" }],
  policies: "إلغاء أو تعديل الموعد مجاني قبل 24 ساعة. الإلغاء المتأخر قد يحتسب عليه 50 درهم.\nالتأخير أكثر من 15 دقيقة قد يؤدي لإعادة جدولة الموعد.\nالمبالغ المدفوعة للتبييض غير مستردة بعد بدء الجلسة.",
  escalation: "حوّل لموظف إذا: طلب المتصل موظفًا صراحة، أو حالة طوارئ طبية، أو شكوى عن طبيب، أو غضب شديد بعد محاولتين.\nلا تعطِ نصائح طبية تشخيصية.",
  tone: "ودودة ومهنية بلهجة إماراتية", voice: "maitha", dialect_mode: "emirati",
  greeting: "هلا وغلا، معاك سلامة من عيادة ابتسامة الخليج. شو أقدر أخدمك اليوم؟", ivr_on: true,
  ivr: [{ key: "1", label: "الحجوزات", route: "booking" }, { key: "2", label: "حالة الطلب", route: "order_status" }, { key: "3", label: "الشكاوى", route: "complaint" }, { key: "0", label: "موظف خدمة العملاء", route: "transfer" }],
  webhooks: { booking: "", order_status: "", ticket: "", callback: "" }, webhook_secret: "", _sample: true,
});
let P = store.get("ccProfile", null) || SAMPLE();
let DEMO = null;
const saveP = () => { if (DEMO) return; delete P._sample; store.set("ccProfile", P); P._dirty = true; };
const voiceOf = (id) => VOICES.find((v) => v.id === id) || VOICES[1];
function ivrText(p = P) {
  if (!p.ivr_on || !p.ivr?.length) return "";
  return p.ivr.filter((x) => x.label).map((x) => `${x.label} اضغط ${x.key}`).join("، ") + "، أو قول طلبك مباشرة.";
}
const greetText = (p = P) => [p.greeting || `هلا وغلا، معاك ${p.agent_name || "سلامة"} من ${p.name || "الشركة"}. شو أقدر أخدمك؟`, ivrText(p)].filter(Boolean).join(" ");
const profileForApi = () => { const { _sample, _dirty, ...x } = P; return x; };
function isOpenNow(p = P) { const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 240) * 60000); const day = DAYS[d.getDay()][0]; const v = p.hours?.[day]; if (!v?.open) return false; const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; return v.to > v.from ? hm >= v.from && hm < v.to : hm >= v.from || hm < v.to; }

// ---------- small UI helpers ----------
const field = (label, el, cls = "") => h("label", { class: "field wide " + cls }, h("span", {}, label), el);
const inp = (val, on, attrs = {}) => { const e = h("input", { class: "inp", dir: "auto", ...attrs }); e.value = val ?? ""; e.oninput = () => { on(e.value); saveP(); }; return e; };
const ta = (val, on, attrs = {}) => { const e = h("textarea", { class: "kbta", dir: "auto", ...attrs }); e.value = val ?? ""; e.oninput = () => { on(e.value); saveP(); }; return e; };
const sel = (opts, val, on) => { const e = h("select", {}, ...opts.map(([v, l]) => h("option", { value: v }, l))); e.value = val ?? opts[0][0]; e.onchange = () => { on(e.value); saveP(); }; return e; };
const chip = (t, cls = "") => h("span", { class: "chip sm " + cls }, t);
const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows) => "\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\n");
const SENT_AR = { positive: "إيجابي", neutral: "محايد", negative: "سلبي", angry: "غاضب" };
const SENT_C = { positive: "#16a34a", neutral: "#64748b", negative: "#d97706", angry: "#dc2626" };
const INTENT_AR = { BOOKING: "حجز", ORDER_STATUS: "حالة طلب", COMPLAINT: "شكوى", CALLBACK: "معاودة اتصال", FAQ: "استفسار", PRICING: "أسعار", HOURS: "الدوام", TRANSFER: "تحويل", PAYMENT: "دفع", SURVEY: "استبيان", GREETING: "تحية", GOODBYE: "وداع", SMALL_TALK: "دردشة", UNKNOWN: "غير واضح", OTHER: "أخرى" };
const ACT_AR = { create_booking: "حجز موعد", order_status: "استعلام عن طلب", create_ticket: "تذكرة شكوى", request_callback: "طلب معاودة اتصال", transfer: "تحويل لموظف", end_call: "إنهاء المكالمة", campaign_result: "نتيجة الحملة" };

// ---------- DOCX text (zip + deflate-raw) ----------
async function docxText(file) {
  const buf = new Uint8Array(await file.arrayBuffer()); const dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("zip");
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    if (name === "word/document.xml") {
      const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true); const data = buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
      const xml = method === 0 ? new TextDecoder().decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
      return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error("nodoc");
}

// ================= SETUP WIZARD =================
const STEPS = [["biz", "النشاط"], ["hours", "ساعات العمل"], ["kb", "المعرفة"], ["svc", "الخدمات والأسعار"], ["pol", "السياسات والتصعيد"], ["voice", "الصوت والترحيب"], ["act", "الإجراءات والربط"], ["done", "المراجعة والنشر"]];
let wz = 0;
function rowsEditor(list, cols, onChange, addLabel) {
  const box = h("div", { class: "col sm-gap" });
  const render = () => {
    box.replaceChildren(...list.map((row, i) => h("div", { class: "erow" }, ...cols.map(([k, ph, w, type]) => { const e = type === "select" ? sel(ph, row[k], (v) => { row[k] = v; onChange(); }) : inp(row[k], (v) => { row[k] = v; onChange(); }, { placeholder: ph, style: w ? `flex:${w}` : "" }); if (type === "select") e.style.flex = w || 1; return e; }),
      h("button", { class: "btn sm soft", "aria-label": "حذف", title: "حذف", onclick: () => { list.splice(i, 1); onChange(); saveP(); render(); } }, "×"))),
      h("button", { class: "btn sm soft", style: "align-self:flex-start", onclick: () => { list.push(Object.fromEntries(cols.map(([k]) => [k, ""]))); render(); box.querySelector(".erow:last-of-type input")?.focus(); } }, "+ " + addLabel));
  };
  render(); return box;
}
const STEP_UI = {
  biz: () => [
    h("div", { class: "row wrap gap" }, field("اسم الشركة / النشاط", inp(P.name, (v) => (P.name = v), { placeholder: "مثلًا: عيادة ابتسامة الخليج" }), "f1"), field("اسم الموظف الآلي", inp(P.agent_name, (v) => (P.agent_name = v), { placeholder: "سلامة" }), "f1")),
    field("نبذة قصيرة عن النشاط", ta(P.about, (v) => (P.about = v), { style: "min-height:80px", placeholder: "شو تقدمون، ولمن، ووين" })),
    h("div", { class: "row wrap gap" }, field("المجال", sel([["clinic", "عيادة / صحة"], ["restaurant", "مطعم"], ["retail", "متجر / توصيل"], ["realestate", "عقارات"], ["auto", "سيارات"], ["telecom", "اتصالات / خدمات"], ["gov", "جهة خدمية"], ["other", "أخرى"]], P.industry, (v) => (P.industry = v)), "f1"),
      field("قناة إشعار العميل", sel([["whatsapp", "واتساب"], ["sms", "رسالة نصية SMS"]], P.notify, (v) => (P.notify = v)), "f1")),
    field("رقم التحويل للموظف البشري (للخط الحقيقي)", inp(P.human_phone, (v) => (P.human_phone = v), { placeholder: "+9714XXXXXXX", class: "inp ltr", inputmode: "tel" })),
  ],
  hours: () => [h("div", { class: "row gap wrap" }, h("button", { class: "btn sm soft", onclick: () => { DAYS.forEach(([d]) => (P.hours[d] = { open: true, from: "00:00", to: "23:59" })); saveP(); renderWz(); } }, "24/7"), h("button", { class: "btn sm soft", onclick: () => { DAYS.forEach(([d]) => (P.hours[d] = { open: !["fri"].includes(d), from: "09:00", to: "21:00" })); saveP(); renderWz(); } }, "9 الصبح – 9 الليل (الجمعة إجازة)"), h("button", { class: "btn sm soft", onclick: () => { DAYS.forEach(([d]) => (P.hours[d] = { open: !["sat", "sun"].includes(d), from: "07:30", to: "15:30" })); saveP(); renderWz(); } }, "دوام حكومي")),
    h("div", { class: "hours" }, ...DAYS.map(([d, l]) => { P.hours ||= {}; const v = (P.hours[d] ||= { open: true, from: "09:00", to: "21:00" }); const cb = h("input", { type: "checkbox" }); cb.checked = !!v.open; const f = h("input", { type: "time", class: "inp", value: v.from }), t = h("input", { type: "time", class: "inp", value: v.to });
      const sync = () => { v.open = cb.checked; v.from = f.value; v.to = t.value; f.disabled = t.disabled = !cb.checked; saveP(); }; cb.onchange = f.onchange = t.onchange = sync; f.disabled = t.disabled = !cb.checked;
      return h("div", { class: "hrow2" }, h("label", { class: "check" }, cb, " " + l), f, h("span", { class: "muted" }, "إلى"), t); })),
    h("p", { class: "muted small" }, "الوقت حسب توقيت الإمارات. خارج الدوام يعرض الموظف الآلي معاودة الاتصال بدل التحويل لموظف.")],
  kb: () => {
    const status = h("div", { class: "muted small" }); const input = h("input", { type: "file", accept: ".pdf,.docx,.txt,.md,.csv,application/pdf,text/plain", hidden: true });
    const drop = h("label", { class: "drop", style: "min-height:110px" }, input, h("b", {}, "ارفع ملف PDF أو Word أو نص"), h("span", { class: "muted" }, "نستخرج منه المعرفة، الأسئلة الشائعة، الخدمات والأسعار، والسياسات"));
    bindDrop(drop, input, async (file) => {
      if (file.size > 8e6) return toast("الملف أكبر من 8 ميجا.", true);
      status.textContent = "نقرأ الملف ونستخرج المعرفة… (قد يأخذ دقيقة)"; drop.classList.add("loading");
      try {
        let payload; const nm = file.name.toLowerCase();
        if (nm.endsWith(".pdf") || file.type === "application/pdf") payload = { data: bytesToB64(new Uint8Array(await file.arrayBuffer())), mime: "application/pdf" };
        else if (nm.endsWith(".docx")) payload = { text: await docxText(file) };
        else if (nm.endsWith(".doc")) throw Object.assign(new Error(), { code: "doc_old" });
        else payload = { text: await file.text() };
        const r = await api("cc_doc", payload, 150000);
        let added = [];
        if (r.kb) { P.kb = (P.kb ? P.kb + "\n\n" : "") + `— من الملف ${file.name} —\n` + r.kb; added.push("المعرفة"); }
        if (r.faqs?.length) { P.faqs = [...(P.faqs || []), ...r.faqs.filter((x) => x.q)]; added.push(`${r.faqs.length} سؤال`); }
        if (r.services?.length) { P.services = [...(P.services || []), ...r.services.filter((x) => x.name)]; added.push(`${r.services.length} خدمة`); }
        if (r.policies) { P.policies = (P.policies ? P.policies + "\n" : "") + r.policies; added.push("السياسات"); }
        if (r.hours_text) P.kb += `\nساعات العمل حسب الملف: ${r.hours_text}`;
        if (!P.name && r.name) P.name = r.name; if (!P.about && r.about) P.about = r.about;
        saveP(); renderWz(); toast(added.length ? "تمت الإضافة: " + added.join("، ") : "ما لقينا معلومات واضحة في الملف.");
      } catch (e) { status.textContent = ""; toast(e.code === "doc_old" ? "صيغة .doc القديمة غير مدعومة. احفظ الملف كـ DOCX أو PDF." : e.message === "zip" || e.message === "nodoc" ? "ما قدرنا نقرأ ملف Word هذا." : errMsg(e.code), true); }
      finally { drop.classList.remove("loading"); }
    });
    return [drop, status, field("قاعدة المعرفة (الموظف ما يجاوب إلا منها)", ta(P.kb, (v) => (P.kb = v), { style: "min-height:180px", placeholder: "العنوان، طرق الدفع، الإجراءات، أي معلومة تهم العميل…" })),
      h("h3", { class: "h3" }, "الأسئلة الشائعة"), rowsEditor((P.faqs ||= []), [["q", "السؤال", 1], ["a", "الجواب", 2]], saveP, "سؤال")];
  },
  svc: () => [h("h3", { class: "h3" }, "الخدمات / المنتجات والأسعار"), rowsEditor((P.services ||= []), [["name", "الخدمة", 2], ["price", "السعر (مثلًا 150 درهم)", 1], ["note", "ملاحظة", 1]], saveP, "خدمة"),
    h("h3", { class: "h3", style: "margin-top:18px" }, "طلبات تجريبية (لاختبار الاستعلام عن الطلب)"), h("p", { class: "muted small" }, "تُستخدم فقط إذا ما ربطت ويبهوك «حالة الطلب» بنظامك."), rowsEditor((P.orders ||= []), [["id", "رقم الطلب", 1], ["item", "المنتج", 2], ["status", "الحالة", 2], ["eta", "الموعد المتوقع", 1]], saveP, "طلب")],
  pol: () => [field("السياسات (الإلغاء، الاسترجاع، التوصيل، الضمان…)", ta(P.policies, (v) => (P.policies = v), { style: "min-height:130px" })),
    field("قواعد التصعيد والتحويل لموظف", ta(P.escalation, (v) => (P.escalation = v), { style: "min-height:110px", id: "wzEsc" })),
    h("div", { class: "chips" }, ...["حوّل فورًا إذا طلب المتصل موظفًا", "حوّل عند الغضب الشديد بعد محاولتين", "حوّل أي شكوى مالية أكثر من 500 درهم", "لا تعطِ أي وعود بخصومات", "اطلب رقم الطلب قبل أي استعلام"].map((t) => h("button", { class: "chip", onclick: () => { P.escalation = (P.escalation ? P.escalation.trim() + "\n" : "") + t + "."; saveP(); $("#wzEsc").value = P.escalation; } }, "+ " + t)))],
  voice: () => {
    const vs = AGENT_VOICES.concat(VOICES.filter((v) => v.d === "en"));
    const pick = h("div", { class: "vpick" }, ...vs.map((v) => { const b = h("button", { class: "vopt2" + (P.voice === v.id ? " on" : ""), onclick: () => { P.voice = v.id; saveP(); $$(".vopt2", pick).forEach((x) => x.classList.toggle("on", x === b)); } }, h("b", {}, v.name), h("small", {}, `${{ ae: "إماراتي", sa: "سعودي", kw: "كويتي", eg: "مصري", en: "English" }[v.d]} · ${v.desc}`), h("span", { class: "mini-play", role: "button", "aria-label": "اسمع", onclick: (e) => { e.stopPropagation(); playSample(v, e.currentTarget); } }, ico("M8 5v14l11-7z"))); return b; }));
    return [h("h3", { class: "h3" }, "صوت الموظف"), pick,
      h("div", { class: "row wrap gap" }, field("النبرة", sel([["ودودة ومهنية بلهجة إماراتية", "ودودة ومهنية"], ["رسمية وراقية", "رسمية وراقية"], ["مرحة وخفيفة دم", "مرحة"], ["هادئة ومطمئنة", "هادئة ومطمئنة"], ["فاخرة لعملاء VIP", "فاخرة VIP"]], P.tone, (v) => (P.tone = v)), "f1"),
        field("اللهجة", sel([["emirati", "إماراتي دائمًا (يفهم كل اللهجات)"], ["mirror", "يرد بلهجة المتصل (الافتراضي إماراتي)"]], P.dialect_mode, (v) => (P.dialect_mode = v)), "f1")),
      field("رسالة الترحيب", ta(P.greeting, (v) => (P.greeting = v), { style: "min-height:70px" })),
      h("label", { class: "check" }, (() => { const c = h("input", { type: "checkbox" }); c.checked = !!P.ivr_on; c.onchange = () => { P.ivr_on = c.checked; saveP(); renderWz(); }; return c; })(), " قائمة رد آلي (IVR) بعد الترحيب: «اضغط 1…» مع إمكانية الكلام المباشر"),
      P.ivr_on ? rowsEditor((P.ivr ||= []), [["key", "الرقم", 0.4], ["label", "الوصف المنطوق", 2], ["route", ROUTES_IVR, 1.4, "select"]], saveP, "خيار") : null,
      h("div", { class: "muted small" }, "المعاينة: «" + greetText() + "»")];
  },
  act: () => {
    const wh = (P.webhooks ||= {});
    const one = (k, l) => h("div", { class: "erow" }, h("span", { class: "whl" }, l), inp(wh[k], (v) => (wh[k] = v.trim()), { class: "inp ltr", placeholder: "https://your-system.com/hooks/" + k, style: "flex:3" }), h("button", { class: "btn sm soft", title: "مستقبل تجريبي من نبرة", onclick: (e) => { wh[k] = ECHO_URL; saveP(); e.currentTarget.previousSibling.value = ECHO_URL; } }, "تجريبي"));
    return [h("p", { class: "muted" }, "لما يحتاج الموظف ينفّذ إجراء، يرسل طلب POST بصيغة JSON لنظامك. إذا ما حطيت رابط، تنحفظ العملية في قاعدة البيانات التجريبية لنبرة وتظهر في لوحة التحكم."),
      one("booking", "الحجوزات"), one("order_status", "حالة الطلب"), one("ticket", "الشكاوى والتذاكر"), one("callback", "معاودة الاتصال"),
      field("مفتاح توقيع الويبهوك (اختياري: يُرسل كـ HMAC-SHA256 في X-Nabra-Signature)", inp(P.webhook_secret, (v) => (P.webhook_secret = v), { class: "inp ltr", placeholder: "secret", type: "password", autocomplete: "off" })),
      h("details", { class: "code-help" }, h("summary", {}, "شكل الطلب والرد المتوقع"), h("pre", { class: "code ltr" }, `POST {your url}\nHeaders: X-Nabra-Event: booking | order_status | ticket | callback\n         X-Nabra-Signature: sha256=<hmac of body>  (if secret set)\nBody: {"event":"booking","params":{"service":"تنظيف أسنان","date":"2026-10-28","time":"17:00","name":"أحمد","phone":"+9715..."},\n       "call":{"id":"...","caller":"+9715...","company":"..."},"sent_at":"ISO"}\n\nExpected reply (JSON, within 6s):\n  booking/ticket/callback → {"ref":"BK-1234"}\n  order_status → {"found":true,"status":"...","eta":"...","item":"..."}`)),
      h("p", { class: "muted small" }, "تنبيه: مفتاح التوقيع ينحفظ مع إعدادات الشركة على جهازك وفي قاعدة بيانات نبرة عند النشر. استخدم مفتاح مخصص لهذا الغرض فقط.")];
  },
  done: () => {
    const miss = []; if (!P.name) miss.push("اسم الشركة"); if (!P.kb && !(P.faqs || []).length) miss.push("المعرفة أو الأسئلة الشائعة"); if (!(P.services || []).length) miss.push("الخدمات");
    const pub = store.get("ccCompanyId", "");
    const out = h("div", { class: "col" });
    const btn = h("button", { class: "btn primary lg" }, h("span", { class: "btxt" }, pub ? "حدّث النسخة المنشورة" : "انشر الإعدادات"), h("span", { class: "spin" }));
    btn.onclick = async () => { btn.classList.add("loading"); try { const r = await api("cc_company", { ws: WS, profile: profileForApi() }); store.set("ccCompanyId", r.id); toast("تم النشر ✓"); renderWz(); } catch (e) { toast(errMsg(e.code), true); } finally { btn.classList.remove("loading"); } };
    out.append(...[
      h("div", { class: "review" }, ...[["الشركة", P.name || "—"], ["الموظف الآلي", `${P.agent_name || "سلامة"} · صوت ${voiceOf(P.voice).name}`], ["الدوام الآن", isOpenNow() ? "مفتوح" : "مغلق"], ["المعرفة", `${(P.kb || "").length} حرف · ${(P.faqs || []).length} سؤال شائع`], ["الخدمات", `${(P.services || []).length} خدمة`], ["IVR", P.ivr_on ? `${P.ivr.length} خيارات` : "بدون"], ["الويبهوكات", Object.values(P.webhooks || {}).filter(Boolean).length + " مربوطة (والباقي على قاعدة البيانات التجريبية)"]].map(([k, v]) => h("div", {}, h("span", { class: "muted" }, k), h("b", {}, v)))),
      miss.length ? h("div", { class: "warn" }, "ناقص: " + miss.join("، ") + ". تقدر تجرّب، بس الموظف بيقول «ما عندي معلومة» أكثر.") : null,
      h("div", { class: "row gap wrap" }, h("a", { class: "btn primary lg", href: "#cccall" }, "📞 جرّب مكالمة الحين"), btn),
      pub ? h("div", { class: "col sm-gap" }, h("h3", { class: "h3" }, "ربط رقم هاتف حقيقي (Twilio)"), h("p", { class: "muted small" }, "حط هذا الرابط في إعدادات الرقم عند Twilio ← A call comes in ← Webhook (HTTP POST):"),
        h("div", { class: "copyrow" }, h("input", { class: "inp ltr", readonly: true, value: `${PHONE_FN}?ws=${WS}&co=${pub}` }), h("button", { class: "btn sm soft", onclick: (e) => { navigator.clipboard.writeText(e.currentTarget.previousSibling.value).then(() => toast("تم النسخ ✓")); } }, "نسخ")),
        h("a", { class: "link small", href: "https://github.com/almarar88/ramsa/blob/main/PHONE.md", target: "_blank", rel: "noopener" }, "دليل الربط والمتطلبات والتكاليف ←")) : h("p", { class: "muted small" }, "بعد النشر يطلع لك رابط ربط رقم هاتف حقيقي.")].filter(Boolean));
    return [out];
  },
};
function renderWz() {
  $("#wzSteps").replaceChildren(...STEPS.map(([k, l], i) => h("button", { class: "wstep" + (i === wz ? " on" : i < wz ? " done" : ""), onclick: () => { wz = i; renderWz(); } }, h("i", {}, i < wz ? "✓" : i + 1), h("span", {}, l))));
  $("#wzBody").replaceChildren(h("h2", { class: "h2" }, STEPS[wz][1]), ...STEP_UI[STEPS[wz][0]]().filter(Boolean));
  $("#wzPrev").disabled = wz === 0; $("#wzNext").textContent = wz === STEPS.length - 1 ? "روح للوحة التحكم" : "التالي";
  $("#wzSteps .on")?.scrollIntoView({ block: "nearest", inline: "center" });
}
$("#wzPrev").onclick = () => { if (wz > 0) { wz--; renderWz(); scrollTo({ top: 0 }); } };
$("#wzNext").onclick = () => { if (wz < STEPS.length - 1) { wz++; renderWz(); scrollTo({ top: 0 }); } else location.hash = "cc"; };
$("#wzSample").onclick = () => { if (!P._sample && !confirm("بنستبدل إعداداتك الحالية بمثال العيادة. متأكد؟")) return; P = SAMPLE(); saveP(); renderWz(); toast("عبّينا مثال عيادة ابتسامة الخليج (بيانات تجريبية)."); };

// ================= AUDIO FX =================
const idb = (() => { let p; const open = () => (p ||= new Promise((res, rej) => { const r = indexedDB.open("ramsa-cc", 1); r.onupgradeneeded = () => { r.result.createObjectStore("rec"); r.result.createObjectStore("tts"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
  return { get: (s, k) => tx(s, "readonly", (o) => o.get(k)).catch(() => null), set: (s, k, v) => tx(s, "readwrite", (o) => o.put(v, k)).catch(() => null), keys: (s) => tx(s, "readonly", (o) => o.getAllKeys()).catch(() => []) }; })();
const fx = {
  nodes: [], timer: null,
  stop() { clearInterval(this.timer); this.timer = null; this.nodes.forEach((n) => { try { n.stop(); } catch {} }); this.nodes = []; },
  tone(freqs, dur, vol = 0.08, at = 0) { const c = actx(), t = c.currentTime + at; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur - 0.03); g.gain.linearRampToValueAtTime(0, t + dur); g.connect(c.destination);
    freqs.forEach((f) => { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.02); this.nodes.push(o); }); },
  ringback() { this.stop(); const cyc = () => { this.tone([400, 450], 0.4, 0.06); this.tone([400, 450], 0.4, 0.06, 0.6); }; cyc(); this.timer = setInterval(cyc, 3000); },
  ringtone() { this.stop(); const cyc = () => { [0, 0.18, 0.36, 0.54].forEach((t, i) => this.tone([[659, 784, 988, 784][i]], 0.16, 0.07, t)); [1.1, 1.28, 1.46, 1.64].forEach((t, i) => this.tone([[659, 784, 988, 1175][i]], 0.16, 0.07, t)); }; cyc(); this.timer = setInterval(cyc, 2600); },
  dtmf(k) { const R = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], "*": [941, 1209], 0: [941, 1336], "#": [941, 1477] }[k]; if (R) this.tone(R, 0.15, 0.05); },
  hold(vol = 0.05) { this.stop(); const seq = [[523, 659, 784], [440, 523, 659], [349, 440, 523], [392, 494, 587]]; let i = 0;
    const bar = () => { const ch = seq[i++ % seq.length]; ch.forEach((f, j) => { this.tone([f], 0.5, vol * 0.7, j * 0.25); this.tone([f * 2], 0.25, vol * 0.25, j * 0.25 + 0.5); }); this.tone([ch[0] / 2], 1.6, vol * 0.6); };
    bar(); this.timer = setInterval(bar, 1800); },
  beep() { this.tone([480, 620], 0.25, 0.05); this.tone([480, 620], 0.25, 0.05, 0.35); },
};
async function wavTo16k(wavBytes) { const b = await actx().decodeAudioData(wavBytes.slice().buffer); return resample(toMono(b), b.sampleRate, 16000); }
async function cachedTts(text, voice) {
  const key = voice + "|" + text; const hit = await idb.get("tts", key); if (hit) return hit;
  const r = await api("tts", { text, voice, dialect: "ae", style: "warm", pace: "normal" }, 90000); const wav = audioToWav(r.audio, r.mime); idb.set("tts", key, wav); return wav;
}

// ================= SIMULATOR =================
const sim = { st: "idle", audio: new Audio(), hist: [], lines: [], rec: [], acts: [], notes: [], t0: 0, timer: null, mic: null, muted: false, busy: false, phase: "", lat: [], barge: 0, langs: new Set(), dialects: new Set(), out: null, transferred: false, callId: "" };
sim.audio.setAttribute("playsinline", "");
const phone = $("#phone");
const callerNo = () => DEMO ? DEMO.me.phone : store.get("ccCaller", "+971 50 123 4567");
function setChips() {
  const last = [...sim.lines].reverse().find((l) => l.role === "user" && l.intent);
  $("#simChips").replaceChildren(...[last?.lang ? chip(last.lang === "en" ? "EN" : "AR", "ltr") : null, last?.dialect ? chip(DIALECT_AR[last.dialect] || last.dialect, "ar") : null, last?.intent ? chip(INTENT_AR[last.intent] || last.intent) : null, last?.sentiment ? h("span", { class: "chip sm", style: `color:${SENT_C[last.sentiment]}` }, "● " + SENT_AR[last.sentiment]) : null, sim.lat.length ? chip(`⚡ ${(sim.lat.at(-1) / 1000).toFixed(1)} ث`, "ltr") : null].filter(Boolean));
}
function logLine(l) {
  const box = $("#simLog"); $(".empty", box)?.remove();
  const meta = [l.intent && chip(INTENT_AR[l.intent] || l.intent), l.sentiment && h("span", { class: "chip sm", style: `color:${SENT_C[l.sentiment]}` }, "● " + SENT_AR[l.sentiment]), l.dialect && chip(DIALECT_AR[l.dialect] || l.dialect, "ar"), l.ms && chip(`${(l.ms / 1000).toFixed(1)} ث`, "ltr"), l.barged && chip("قاطعه المتصل", "gold")].filter(Boolean);
  const el = l.role === "system" ? h("div", { class: "sl sys" }, l.text) : h("div", { class: "sl " + l.role }, h("div", { class: "who" }, l.role === "agent" ? P.agent_name || "سلامة" : "المتصل", h("small", {}, fmtT(l.t))), h("div", { class: "bub", dir: "auto" }, l.text, l.en ? h("div", { class: "en", dir: "ltr" }, l.en) : null), meta.length ? h("div", { class: "meta" }, ...meta) : null);
  box.append(el); box.scrollTop = box.scrollHeight; l.el = el; return el;
}
const addLine = (l) => { l.t = sim.t0 ? (Date.now() - sim.t0) / 1000 : 0; sim.lines.push(l); if (l.role !== "system" || l.hist) sim.hist.push({ role: l.role, text: l.text }); logLine(l); setChips(); caption(l); return l; };
function caption(l) { const c = $(".ph-cap", phone); if (c && l.role !== "system") { c.textContent = l.text; c.dataset.who = l.role; } }
function addAct(a, r) {
  const box = $("#simActs"); $(".empty", box)?.remove();
  const ok = r ? r.type === "order_status" ? r.order?.found !== false : !!r.ref : true;
  const det = r?.ref ? `رقم المرجع ${r.ref}` : r?.order ? (r.order.found === false ? `طلب ${r.order.order_id || ""} غير موجود` : `${r.order.item || ""} · ${r.order.status || ""}`) : a.params?.reason || "";
  box.prepend(h("div", { class: "act-card " + (ok ? "ok" : "bad") }, h("b", {}, (ok ? "✓ " : "! ") + (ACT_AR[a.type] || a.type)), h("div", { class: "small" }, det), r ? h("div", { class: "muted small ltr" }, r.source === "webhook" ? `webhook ✓ ${r.webhook?.ms ?? ""}ms` : r.webhook ? `webhook ✗ (${r.webhook.error || r.webhook.status}) → demo DB` : r.saved ? "saved → Nabra demo DB" : r.type === "order_status" ? "demo orders" : "local") : null,
    a.params && Object.keys(a.params).length ? h("div", { class: "params ltr" }, Object.entries(a.params).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")) : null));
  sim.acts.push({ type: a.type, params: a.params, ref: r?.ref, source: r?.source, ok });
}
function addNote(n) {
  const box = $("#simNotes"); $(".empty", box)?.remove();
  box.append(h("div", { class: "wa-msg" }, h("div", { class: "wa-top" }, n.channel === "sms" ? "SMS" : "WhatsApp", h("span", { class: "ltr" }, " → " + n.to)), h("div", { dir: "auto" }, n.text), h("small", {}, new Date().toLocaleTimeString("ar-AE", { hour: "2-digit", minute: "2-digit" }) + " ✓✓ (محاكاة)")));
  sim.notes.push(n);
}
const avatarCo = () => h("div", { class: "ph-av" }, (P.name || "ر").trim()[0]);
function screen(kind) {
  sim.st = kind; phone.dataset.st = kind;
  const top = h("div", { class: "ph-status ltr" }, h("span", {}, new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })), h("span", {}, "5G ▮▮▮"));
  if (kind === "idle") {
    const no = h("input", { class: "ph-inp ltr", value: callerNo(), inputmode: "tel", "aria-label": "رقمك" }); no.onchange = () => store.set("ccCaller", no.value);
    phone.replaceChildren(top, h("div", { class: "ph-idle" }, avatarCo(), h("h3", {}, P.name || "شركتك"), h("div", { class: "ph-sub" }, `خدمة العملاء · ${isOpenNow() ? "مفتوح الحين" : "مغلق الحين"}`), P.scenario ? h("div", { class: "ph-tag" }, "تجربة، ليست جهة حقيقية") : P._sample ? h("div", { class: "ph-tag" }, "شركة تجريبية · عدّلها من إعداد الشركة") : null,
      h("label", { class: "ph-field" }, h("span", {}, "رقمك (يشوفه الموظف الآلي)"), no),
      h("button", { class: "ph-call", "aria-label": "اتصال", onclick: dial }, ico("M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z")),
      h("div", { class: "ph-hint" }, "اضغط اتصال، وتكلّم بلهجتك. تقدر تقاطع، تضغط أرقام، تطلب موظف، أو تتكلم إنجليزي.")));
  } else if (kind === "dialing") {
    phone.replaceChildren(top, h("div", { class: "ph-dial" }, avatarCo(), h("h3", {}, P.name), h("div", { class: "ph-sub pulse" }, "جاري الاتصال…"), h("div", { class: "ph-sp" }), endBtn()));
  } else if (kind === "incoming") {
    phone.replaceChildren(top, h("div", { class: "ph-dial incoming" }, avatarCo(), h("h3", {}, P.name), h("div", { class: "ph-sub pulse" }, "مكالمة واردة · " + (sim.out?.typeLabel || "")), h("div", { class: "ph-sp" }),
      h("div", { class: "row between ph-ans" }, h("button", { class: "ph-end", "aria-label": "رفض", onclick: () => { fx.stop(); sim.out = null; screen("idle"); toast("رفضت المكالمة."); } }, ico("M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.4 11.4 0 0 0-2.66 1.85 1 1 0 0 1-1.41 0L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.49a1 1 0 0 1-1.41 0 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z")), h("button", { class: "ph-call", "aria-label": "رد", onclick: answer }, ico("M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z")))));
  } else if (kind === "live" || kind === "human") {
    const btn = (id, label, d, on) => h("button", { class: "ph-btn", id, onclick: on }, h("i", {}, ico(d)), h("span", {}, label));
    phone.replaceChildren(top, h("div", { class: "ph-live" }, h("div", { class: "ph-head" }, avatarCo(), h("h3", {}, kind === "human" ? "موظف خدمة العملاء" : P.name), h("div", { class: "ph-sub ltr", id: "phTime" }, "00:00")),
      h("div", { class: "ph-state", id: "phState" }, ""), h("div", { class: "ph-orb", id: "phOrb" }, h("span"), h("span"), h("span")), h("div", { class: "ph-cap", dir: "auto" }, ""),
      h("div", { class: "ph-grid" }, btn("phMute", "كتم", "M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zm-7 8h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z", toggleMute), btn("phKeys", "الأرقام", "M5 4h3v3H5zm5.5 0h3v3h-3zM16 4h3v3h-3zM5 9.5h3v3H5zm5.5 0h3v3h-3zm5.5 0h3v3h-3zM5 15h3v3H5zm5.5 0h3v3h-3zm5.5 0h3v3h-3zM10.5 20h3v2h-3z", () => $(".ph-pad", phone).classList.toggle("open")),
        btn("phHold", "انتظار", "M6 5h4v14H6zm8 0h4v14h-4z", toggleHold), btn("phXfer", "تحويل لموظف", "M16 3l5 5-5 5V9.5h-6v-3h6zM8 11l-5 5 5 5v-3.5h6v-3H8z", () => transfer("طلب المتصل من زر التحويل"))),
      h("div", { class: "ph-pad" }, ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => h("button", { onclick: () => pressKey(k) }, k))), endBtn()));
    if (kind === "human") { $("#phXfer").disabled = true; $("#phKeys").disabled = true; }
    tick();
  } else if (kind === "ended") {
    phone.replaceChildren(top, h("div", { class: "ph-ended" }, h("h3", {}, "انتهت المكالمة"), h("div", { class: "ph-sub ltr" }, fmtT(sim.dur)), h("div", { id: "phSum", class: "ph-sum" }, h("div", { class: "spinner" }), h("div", { class: "muted small" }, "نجهّز ملخص المكالمة…"))));
  }
}
const endBtn = () => h("button", { class: "ph-end", "aria-label": "إنهاء المكالمة", onclick: () => hangup("user") }, ico("M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.4 11.4 0 0 0-2.66 1.85 1 1 0 0 1-1.41 0L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.49a1 1 0 0 1-1.41 0 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z"));
function tick() { const t = $("#phTime"); if (t && sim.t0) { const s = Math.floor((Date.now() - sim.t0) / 1000); t.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; } }
function setPhase(p, label) {
  sim.phase = p; const s = $("#phState"); if (s) s.textContent = label ?? { listening: "يسمعك… تكلّم", thinking: "يفكّر…", speaking: `${P.agent_name || "سلامة"} يتكلم · تقدر تقاطعه`, hold: "المكالمة على الانتظار", muted: "المايك مكتوم", wait: "لحظة من فضلك…" }[p] ?? "";
  phone.dataset.phase = p;
}
function resetSim() {
  fx.stop(); sim.audio.pause(); sim.hist = []; sim.lines = []; sim.rec = []; sim.acts = []; sim.notes = []; sim.lat = []; sim.barge = 0; sim.langs = new Set(); sim.dialects = new Set(); sim.transferred = false; sim.muted = false; sim.ivrChoice = ""; sim.ended = false; sim.endReq = false;
  sim.callId = "call_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  $("#simLog").replaceChildren(); $("#simActs").replaceChildren(h("div", { class: "empty sm" }, "ما فيه إجراءات بعد.")); $("#simNotes").replaceChildren(h("div", { class: "empty sm" }, "رسائل الواتساب/SMS تظهر هنا.")); $("#simChips").replaceChildren();
}
function playWav(wav, recordIt = true) {
  return new Promise((res) => {
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" })); const a = sim.audio; a.src = url; setPhase("speaking");
    const entry = recordIt ? { who: "agent", wav, cut: null } : null; if (entry) sim.rec.push(entry);
    const fin = (barged) => { a.onended = a.onerror = a.onpause = null; if (entry && barged) entry.cut = a.currentTime; URL.revokeObjectURL(url); res(!!barged); };
    a.onended = () => fin(false); a.onerror = () => fin(false); a.onpause = () => fin(!a.ended);
    a.play().catch(() => { toast("المتصفح منع تشغيل الصوت. اضغط في أي مكان وجرّب.", true); fin(false); });
  });
}
async function speakLine(text, wav, en) {
  const l = addLine({ role: "agent", text, en }); if (!wav) return false;
  const barged = await playWav(wav); if (barged) { l.barged = true; const m = l.el?.querySelector(".meta"); if (m) m.append(chip("قاطعه المتصل", "gold")); else l.el?.append(h("div", { class: "meta" }, chip("قاطعه المتصل", "gold"))); sim.barge++; }
  return barged;
}
async function dial() {
  L.unlockAudio?.(); resetSim(); sim.out = null; screen("dialing"); fx.ringback();
  if (liveWanted()) {
    const t0 = performance.now(); const lp = liveOpen().catch((e) => { console.warn("live", e); liveClose(); return false; });
    const minRing = new Promise((r) => setTimeout(r, 2400)); const [ok] = await Promise.all([lp, minRing]);
    if (sim.st !== "dialing") { liveClose(); return; }
    if (ok) {
      fx.stop(); fx.tone([1400], 0.06, 0.03); connect(); ambience(true); sim.engine = "live";
      addLine({ role: "system", text: `⚡ وضع المكالمة المباشرة (full-duplex) · ${live.model} · تجهيز ${Math.round(performance.now() - t0)}ms · تكلّم بشكل طبيعي وقاطع متى ما تبي` });
      setPhase("thinking", "يرد…"); liveText(`[نظام] بدأت المكالمة الآن. رحّب بالمتصل بهذه الجملة: «${greetText()}»`); return;
    }
    addLine({ role: "system", text: "تعذّر وضع البث المباشر — نستخدم المحرك العادي." });
  }
  sim.engine = "pipeline"; cachedTts("تمام، لحظة.", voiceOf(P.voice).v).then((w) => { sim.filler = w; }).catch(() => {});
  const voice = voiceOf(P.voice).v; const gtext = greetText();
  const gp = cachedTts(gtext, voice).catch((e) => ({ err: e }));
  const minRing = new Promise((r) => setTimeout(r, 4200));
  let micOk = startMic(); const [g] = await Promise.all([gp, minRing]);
  if (sim.st !== "dialing") return;
  if (!(await micOk)) { fx.stop(); screen("idle"); return; }
  fx.stop(); fx.tone([1400], 0.06, 0.03);
  connect();
  if (g?.err) { addLine({ role: "system", text: "تعذّر توليد صوت الترحيب (" + errMsg(g.err.code) + "). نكمل نصيًا." }); addLine({ role: "agent", text: gtext }); setPhase("listening"); return; }
  const barged = await speakLine(gtext, g); if (!barged && sim.st === "live") setPhase("listening");
}
function connect() { sim.t0 = Date.now(); screen("live"); clearInterval(sim.timer); sim.timer = setInterval(tick, 1000); addLine({ role: "system", text: sim.out ? `مكالمة صادرة (${sim.out.typeLabel}) إلى ${sim.out.contact.name || ""}` : `بدأت المكالمة من ${callerNo()} · ${new Date().toLocaleString("ar-AE")}` }); }
async function answer() {
  L.unlockAudio?.(); fx.stop(); if (!(await startMic())) { screen("idle"); return; }
  connect(); setPhase("thinking");
  await agentTurn({ text: "ألو؟" }, true);
}
async function startMic() {
  const mic = new Mic(); let pre = [], cur = null, silent = 0, voicedRun = 0, floor = 0.008, barge = 0;
  try {
    await mic.start((d, r) => {
      const orb = $("#phOrb"); if (orb) orb.style.setProperty("--lvl", Math.min(1, r * 9).toFixed(2));
      if (sim.muted || !["live", "human"].includes(sim.st)) return;
      floor = r < floor ? floor * 0.9 + r * 0.1 : floor * 0.9995 + r * 0.0005; const thr = Math.max(0.015, floor * 3); const fr = d.length / mic.sr;
      if (sim.phase === "speaking") { if (r > Math.max(0.06, thr * 3)) { barge += fr; if (barge > 0.3) { barge = 0; cur = { chunks: [...pre, d], speech: 0.3 }; silent = 0; sim.audio.pause(); setPhase("listening", "أسمعك…"); } } else { barge = Math.max(0, barge - fr); pre.push(d); if (pre.length > 8) pre.shift(); } return; }
      if (sim.phase !== "listening") return;
      pre.push(d); if (pre.length > 8) pre.shift();
      if (!cur) { if (r > thr) { voicedRun += fr; if (voicedRun > 0.12) { cur = { chunks: [...pre], speech: voicedRun }; silent = 0; setPhase("listening", "أسمعك…"); } } else voicedRun = 0; return; }
      cur.chunks.push(d); if (r > thr) { cur.speech += fr; silent = 0; } else silent += fr;
      const dur = cur.chunks.length * fr;
      if ((silent > 0.8 && cur.speech > 0.35) || dur > 15) { const f = concat(cur.chunks); cur = null; voicedRun = 0; silent = 0; pre = []; setPhase("thinking"); userAudio(f, mic.sr); }
      else if (silent > 2.5 && cur.speech <= 0.35) { cur = null; voicedRun = 0; setPhase("listening"); }
    });
  } catch (e) { toast(errMsg(e.code), true); return false; }
  sim.mic = mic; return true;
}
async function userAudio(f, sr) {
  const f16 = await resample(f, sr, 16000); sim.rec.push({ who: "user", f32: f16 });
  if (sim.st === "human") { addLine({ role: "user", text: "(كلام المتصل للموظف البشري — محاكاة)" }); setPhase("listening", "الموظف البشري يسمعك (محاكاة)"); return; }
  await agentTurn({ audio: bytesToB64(encodeWav(f16, 16000)), mime: "audio/wav" });
}
function pressKey(k) {
  fx.dtmf(k); if (live.active) { if (sim.st !== "live") return; liveStopAudio(false); sim.ivrChoice ||= k; addLine({ role: "user", text: `⌨️ ضغط ${k}` }); liveText(`[نظام] المتصل ضغط الرقم ${k} من لوحة المفاتيح.`); return; } if (sim.st !== "live" || sim.phase === "thinking") return;
  if (sim.phase === "speaking") sim.audio.pause();
  sim.ivrChoice ||= k; addLine({ role: "user", text: `⌨️ ضغط ${k}` }); setPhase("thinking"); agentTurn({ dtmf: k });
}
function toggleMute() { sim.muted = !sim.muted; $("#phMute")?.classList.toggle("on", sim.muted); setPhase(sim.muted ? "muted" : "listening"); }
function toggleHold() {
  if (sim.phase === "hold") { fx.stop(); $("#phHold")?.classList.remove("on"); setPhase("listening"); addLine({ role: "system", text: "رجع المتصل من الانتظار" }); if (live.active) liveText("[نظام] المتصل رجع من الانتظار، رحّب فيه بكلمة قصيرة."); return; }
  sim.audio.pause(); if (live.active) liveStopAudio(false); fx.hold(); $("#phHold")?.classList.add("on"); setPhase("hold"); addLine({ role: "system", text: "المتصل حط المكالمة على الانتظار" });
}
let waitT = null;
async function agentTurn(payload, opening = false) {
  if (sim.busy) return; sim.busy = true; const t0 = Date.now();
  if (payload.audio && sim.filler && sim.engine === "pipeline") { const u = URL.createObjectURL(new Blob([sim.filler], { type: "audio/wav" })); const fa = new Audio(u); fa.play().catch(() => {}); fa.onended = () => URL.revokeObjectURL(u); } // instant acknowledgement while the slow pipeline works
  clearTimeout(waitT); waitT = setTimeout(() => { if (sim.phase === "thinking") { fx.hold(0.025); setPhase("wait"); } }, 3500);
  const state = { caller: callerNo().replace(/\s/g, ""), ...(sim.out ? { direction: "outbound", campaign_type: sim.out.typeLabel, contact: sim.out.contact, script: sim.out.script } : {}) };
  let r;
  try { r = await api("cc_turn", { ...payload, ws: WS, profile: profileForApi(), history: sim.hist.slice(-14), state, voice: voiceOf(P.voice).v, call_id: sim.callId }, 90000); }
  catch (e) { clearTimeout(waitT); fx.stop(); sim.busy = false; if (sim.st !== "live") return; addLine({ role: "system", text: errMsg(e.code) }); const sorry = "المعذرة، صار عندي ضغط بسيط. ممكن تعيد كلامك؟"; let w = null; try { w = await cachedTts(sorry, voiceOf(P.voice).v); } catch {} await speakLine(sorry, w); setPhase("listening"); return; }
  clearTimeout(waitT); fx.stop(); sim.busy = false; if (sim.st !== "live") return;
  const ms = Date.now() - t0; sim.lat.push(ms);
  const heard = (r.heard || payload.text || "").trim();
  if (opening) addLine({ role: "user", text: "ألو؟" });
  else if (payload.audio) { if (heard) addLine({ role: "user", text: heard, en: r.heard_en, intent: r.intent, sentiment: r.sentiment, dialect: r.dialect, lang: r.lang }); else addLine({ role: "system", text: "ما وضح الكلام" }); }
  else if (payload.dtmf) { const u = [...sim.lines].reverse().find((l) => l.role === "user"); if (u) Object.assign(u, { intent: r.intent }); }
  if (r.lang) { if (sim.langs.size && !sim.langs.has(r.lang)) addLine({ role: "system", text: r.lang === "en" ? "🌐 المتصل حوّل للإنجليزية — الموظف يرد بالإنجليزي" : "🌐 المتصل رجع للعربي" }); sim.langs.add(r.lang); }
  if (r.dialect && r.dialect !== "unknown") sim.dialects.add(r.dialect);
  const a = r.action || {};
  if (a.type && a.type !== "none" && (a.ready || ["transfer", "end_call"].includes(a.type))) {
    if (a.type !== "end_call") addAct(a, r.action_result);
    if (r.action_result?.notification?.text) addNote(r.action_result.notification);
    if (a.type === "campaign_result") sim.campaignResult = a.params;
  }
  const wav = r.tts?.audio ? audioToWav(r.tts.audio, r.tts.mime) : null;
  if (r.tts_error) addLine({ role: "system", text: "الرد نصي فقط (" + errMsg(r.tts_error) + ")" });
  const lastAgent = { ms };
  const barged = r.reply ? await speakLine(r.reply, wav, r.reply_en) : false;
  const al = [...sim.lines].reverse().find((l) => l.role === "agent"); if (al) { al.ms = ms; al.el?.querySelector(".who small")?.after(chip(`${(ms / 1000).toFixed(1)} ث`, "ltr")); }
  setChips(); void lastAgent;
  if (sim.st !== "live") return;
  if (a.type === "transfer") return transfer(a.params?.reason || "حسب قواعد التصعيد");
  if (a.type === "end_call" && !barged) return hangup("agent");
  if (!barged) setPhase(sim.muted ? "muted" : "listening");
}
async function transfer(reason) {
  if (sim.st !== "live") return; sim.transferred = true; sim.audio.pause();
  const open = isOpenNow();
  if (!sim.acts.some((x) => x.type === "transfer")) addAct({ type: "transfer", params: { reason } }, null);
  addLine({ role: "system", text: `🔁 تحويل لموظف بشري · السبب: ${reason}` });
  setPhase("hold", open ? "جاري تحويلك لموظف… (موسيقى انتظار)" : "جاري التحويل… (الدوام مغلق)"); fx.hold();
  await new Promise((r) => setTimeout(r, 5000)); fx.stop(); if (sim.st !== "live") return;
  screen("human"); setPhase("listening", "موظف بشري (محاكاة) · استلم ملخص المكالمة");
  const brief = h("div", { class: "brief" }, h("b", {}, "📋 ملخص التسليم للموظف"), h("div", {}, "السبب: " + reason), h("div", {}, "اللهجة: " + ([...sim.dialects].map((d) => DIALECT_AR[d] || d).join("، ") || "—")),
    h("div", {}, "آخر طلب: «" + ([...sim.lines].reverse().find((l) => l.role === "user" && !l.text.startsWith("⌨️"))?.text || "—") + "»"), h("div", {}, "إجراءات: " + (sim.acts.filter((x) => x.type !== "transfer").map((x) => ACT_AR[x.type] + (x.ref ? " " + x.ref : "")).join("، ") || "لا يوجد")),
    h("div", { class: "muted small" }, P.human_phone ? `في الخط الحقيقي تتحوّل المكالمة إلى ${P.human_phone}.` : "في الخط الحقيقي تتحوّل المكالمة لرقم الموظف المحدد في الإعداد."));
  $("#simLog").append(h("div", { class: "sl sys wide" }, brief)); $("#simLog").scrollTop = 1e9;
}
async function hangup(by) {
  if (!["live", "human", "dialing"].includes(sim.st)) return;
  const wasDialing = sim.st === "dialing"; if (live.active || live.ws) { flushUser(); flushAgent(false); liveClose(); } fx.stop(); sim.audio.pause(); sim.mic?.stop(); sim.mic = null; clearInterval(sim.timer); clearTimeout(waitT); sim.busy = false;
  if (wasDialing) { screen("idle"); return; }
  sim.dur = (Date.now() - sim.t0) / 1000; fx.beep();
  addLine({ role: "system", text: by === "agent" ? "أنهى الموظف المكالمة بعد الوداع" : "أنهى المتصل المكالمة" });
  screen("ended"); await finishCall();
}
async function buildRecording() {
  const parts = []; const gap = new Float32Array(16000 * 0.25);
  for (const x of sim.rec) { try { let f = x.f32 || (await wavTo16k(x.wav)); if (x.cut != null) f = f.subarray(0, Math.floor(x.cut * 16000)); parts.push(f, gap); } catch {} }
  return parts.length ? encodeWav(concat(parts), 16000) : null;
}
async function finishCall() {
  const transcript = sim.lines.filter((l) => l.role !== "system" || l.text.startsWith("🔁")).map((l) => ({ role: l.role, text: l.text, t: Math.round(l.t), intent: l.intent, sentiment: l.sentiment, dialect: l.dialect, lang: l.lang, ms: l.ms }));
  const meta = { call_id: sim.callId, company: P.name, agent: P.agent_name || "سلامة", voice: voiceOf(P.voice).name, direction: sim.out ? "outbound" : "inbound", channel: "simulator", caller: sim.out ? sim.out.contact.phone : callerNo(), started_at: new Date(sim.t0).toISOString(), duration: Math.round(sim.dur), turns: transcript.filter((l) => l.role === "user").length, avg_latency: sim.lat.length ? Math.round(sim.lat.reduce((a, b) => a + b, 0) / sim.lat.length) : null, transferred: sim.transferred, actions: sim.acts, notifications: sim.notes, dialects: [...sim.dialects], langs: [...sim.langs], barge_ins: sim.barge, ivr_choice: sim.ivrChoice || "", campaign: sim.out ? { type: sim.out.type, contact: sim.out.contact, result: sim.campaignResult || null } : null };
  const recP = buildRecording();
  let res = null; try { res = await api("cc_summary", { ws: WS, transcript, meta }, 90000); } catch (e) { res = { error: e.code }; }
  const wav = await recP; const key = res?.id || sim.callId; if (wav) await idb.set("rec", key, wav);
  const a = res?.analysis; const box = $("#phSum"); if (!box) return;
  const record = { id: res?.id, created_at: new Date().toISOString(), status: a?.resolved ? "resolved" : "open", data: { ...meta, transcript, analysis: a } };
  const stars = h("div", { class: "stars" }, ...[1, 2, 3, 4, 5].map((n) => h("button", { "aria-label": `${n} نجوم`, onclick: async () => { $$("button", stars).forEach((b, i) => b.classList.toggle("on", i < n)); record.data.csat = n; toast("شكرًا على التقييم ✓"); if (res?.id) api("cc_update", { ws: WS, id: res.id, data: record.data }).catch(() => {}); } }, "★")));
  box.replaceChildren(...(a ? [h("div", { class: "row gap wrap center" }, chip(INTENT_AR[a.intent] || a.intent), h("span", { class: "chip sm", style: `color:${SENT_C[a.sentiment]}` }, "● " + (SENT_AR[a.sentiment] || "")), chip(a.resolved ? "✓ انحلّت" : sim.transferred ? "محوّلة لموظف" : "تحتاج متابعة", a.resolved ? "ok" : "gold")),
    h("p", { class: "lh small", dir: "auto" }, a.summary), a.follow_up ? h("p", { class: "small muted" }, "المتابعة: " + a.follow_up) : null] : [h("p", { class: "muted small" }, "ما قدرنا نجهّز الملخص الحين (" + errMsg(res?.error) + ").")]),
    h("div", { class: "small" }, "قيّم المكالمة (CSAT):"), stars, wav ? makePlayer({ title: "تسجيل المكالمة", wav, filename: `nabra-call-${sim.callId}.wav` }) : null,
    h("div", { class: "row gap center" }, h("button", { class: "btn sm primary", onclick: () => { sim.out = null; screen("idle"); } }, "مكالمة جديدة"), h("a", { class: "btn sm soft", href: "#cc" }, "لوحة التحكم")),
    res?.save_error || (!res?.id && a) ? h("div", { class: "muted small" }, "تنبيه: ما انحفظت في قاعدة البيانات.") : null);
  dash.cache = null;
}

// ================= LIVE (full-duplex Gemini Live over WebSocket) =================
// Hands-free: one getUserMedia stream (AEC/NS/AGC) streams PCM16@16k the whole call; server-side VAD ends turns (~450ms);
// agent audio streams back as PCM@24k and is scheduled gaplessly; barge-in stops playback instantly (local + server "interrupted").
const LIVE_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=";
const WORKLET = `class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("ramsa-cap",P)`;
let workletP = null;
const live = { active: false };
const liveWanted = () => store.get("ccLive", true) && "WebSocket" in window && !!(window.AudioWorkletNode);
const i16b64 = (f) => { const b = new Uint8Array(f.length * 2), v = new DataView(b.buffer); for (let i = 0; i < f.length; i++) v.setInt16(i * 2, Math.max(-1, Math.min(1, f[i])) * 32767, true); return bytesToB64(b); };
function lin(f, from, to) { const n = Math.floor(f.length * to / from), o = new Float32Array(n), r = from / to; for (let i = 0; i < n; i++) { const x = i * r, k = Math.floor(x), t = x - k; o[i] = f[k] + ((f[k + 1] ?? f[k]) - f[k]) * t; } return o; }
async function liveOpen() {
  const L2 = live; Object.assign(L2, { active: false, ws: null, ready: false, srcs: [], next: 0, uText: "", aText: "", uF: [], aF: [], lastVoice: 0, speakingUser: false, firstOut: false, endReq: false, transferReq: null, closed: false, floor: 0.008, barge: 0, turnT0: 0 });
  const c = actx();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  L2.stream = stream;
  const tokP = api("live_token", { ws: WS, profile: profileForApi(), state: { caller: callerNo().replace(/\s/g, "") }, voice: voiceOf(P.voice).v }, 15000);
  workletP ||= c.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
  await workletP; const tk = await tokP;
  const src = c.createMediaStreamSource(stream), node = new AudioWorkletNode(c, "ramsa-cap"), mute = c.createGain(); mute.gain.value = 0;
  src.connect(node); node.connect(mute); mute.connect(c.destination); L2.src = src; L2.node = node; L2.out = c.createGain(); L2.out.connect(c.destination);
  let acc = [], accN = 0; const per = Math.round(c.sampleRate * 0.04);
  node.port.onmessage = (e) => { acc.push(e.data); accN += e.data.length; if (accN < per) return; const f = concat(acc); acc = []; accN = 0; liveMicFrame(f, c.sampleRate); };
  const ws = new WebSocket(LIVE_WS + encodeURIComponent(tk.token)); L2.ws = ws; L2.model = tk.model;
  await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error("live_timeout")), 8000);
    ws.onopen = () => ws.send(JSON.stringify({ setup: tk.setup }));
    ws.onmessage = async (e) => { const m = JSON.parse(typeof e.data === "string" ? e.data : await e.data.text()); if (m.setupComplete) { clearTimeout(to); L2.ready = true; ws.onmessage = (ev) => liveMsg(ev); res(); } };
    ws.onclose = (e) => { clearTimeout(to); rej(new Error("live_closed " + e.code)); }; });
  ws.onclose = (e) => liveClosed(e); L2.active = true; return true;
}
function liveSend(o) { if (live.ws?.readyState === 1) live.ws.send(JSON.stringify(o)); }
function liveText(t) { liveSend({ clientContent: { turns: [{ role: "user", parts: [{ text: t }] }], turnComplete: true } }); }
function liveMicFrame(f, sr) {
  const r = rmsOf(f); const orb = $("#phOrb"); if (orb) orb.style.setProperty("--lvl", Math.min(1, r * 9).toFixed(2));
  if (!live.active) return;
  const f16 = lin(f, sr, 16000); const playing = live.next > actx().currentTime + 0.02;
  const silent = sim.muted || sim.phase === "hold" || sim.st !== "live";
  live.floor = r < live.floor ? live.floor * 0.9 + r * 0.1 : live.floor * 0.999 + r * 0.001; const thr = Math.max(0.015, live.floor * 3);
  if (!silent) {
    if (playing) { if (r > Math.max(0.06, thr * 3)) { live.barge += 0.04; if (live.barge >= 0.24) { live.barge = 0; liveStopAudio(true); } } else live.barge = Math.max(0, live.barge - 0.04); }
    else if (r > thr) { live.lastVoice = performance.now(); if (!live.speakingUser) { live.speakingUser = true; setPhase("listening", "أسمعك…"); } }
    if (!playing || live.barge > 0) live.uF.push(f16);
    if (live.uF.length > 400) live.uF.shift();
  }
  liveSend({ realtimeInput: { audio: { data: i16b64(silent ? new Float32Array(f16.length) : f16), mimeType: "audio/pcm;rate=16000" } } });
}
function liveStopAudio(barged) {
  const was = live.next > actx().currentTime + 0.02;
  live.srcs.forEach((s) => { try { s.stop(); } catch {} }); live.srcs = []; live.next = 0;
  if (barged && was && !live.bargedTurn) { live.bargedTurn = true; sim.barge++; setPhase("listening", "أسمعك…"); }
}
function flushUser() {
  if (live.uText.trim()) { addLine({ role: "user", text: live.uText.trim() }); }
  if (live.uF.length && live.uText.trim()) sim.rec.push({ who: "user", f32: concat(live.uF) });
  live.uText = ""; live.uF = []; live.speakingUser = false;
}
function flushAgent(interrupted) {
  const t = live.aText.trim();
  if (t) { const l = addLine({ role: "agent", text: t, ms: live.turnMs, barged: interrupted || live.bargedTurn }); if (live.turnMs) l.ms = live.turnMs; }
  if (live.aF.length) sim.rec.push({ who: "agent", f32: lin(concat(live.aF), 24000, 16000) });
  // safety net: the model sometimes announces a transfer without calling the tool
  if (!interrupted && !live.transferReq && /(بحو[ّ]?لك|أحو[ّ]?لك|نحو[ّ]?لك)/.test(t) && !sim.acts.some((x) => x.type === "transfer")) { live.transferReq = "طلب المتصل موظف بشري"; addAct({ type: "transfer", params: { reason: live.transferReq } }, null); }
  live.aText = ""; live.aF = []; live.firstOut = false; live.turnMs = 0; live.bargedTurn = false;
}
async function liveMsg(e) {
  const m = JSON.parse(typeof e.data === "string" ? e.data : await e.data.text()); const sc = m.serverContent;
  if (m.goAway) addLine({ role: "system", text: "الجلسة قاربت حدها الزمني — قد تنقطع قريبًا." });
  if (sc) {
    if (sc.inputTranscription?.text) { live.uText += sc.inputTranscription.text; caption({ role: "user", text: live.uText }); }
    if (sc.interrupted) { liveStopAudio(true); flushAgent(true); }
    const parts = sc.modelTurn?.parts || [];
    for (const p of parts) if (p.inlineData?.data) {
      if (!live.firstOut) { live.firstOut = true; if (live.uText.trim() && live.lastVoice) { const ms = Math.round(performance.now() - live.lastVoice); live.turnMs = ms; sim.lat.push(ms); } flushUser(); setPhase("speaking"); }
      liveQueue(p.inlineData.data);
    }
    if (sc.outputTranscription?.text) { if (!live.firstOut) flushUser(); live.aText += sc.outputTranscription.text; caption({ role: "agent", text: live.aText }); }
    if (sc.turnComplete) { if (!live.firstOut) flushUser(); flushAgent(false); setChips(); liveAfterPlayback(); }
  }
  if (m.toolCall) for (const fc of m.toolCall.functionCalls || []) liveTool(fc);
}
function liveQueue(b64) {
  const c = actx(), by = b64ToBytes(b64), v = new DataView(by.buffer, by.byteOffset, by.byteLength), n = by.byteLength >> 1, f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = v.getInt16(i * 2, true) / 32768; live.aF.push(f);
  const buf = c.createBuffer(1, n, 24000); buf.copyToChannel(f, 0); const s = c.createBufferSource(); s.buffer = buf; s.connect(live.out);
  const t = Math.max(c.currentTime + 0.03, live.next); s.start(t); live.next = t + buf.duration; live.srcs.push(s);
  s.onended = () => { live.srcs = live.srcs.filter((x) => x !== s); };
}
function liveAfterPlayback() {
  const wait = Math.max(0, (live.next - actx().currentTime) * 1000) + 150;
  setTimeout(() => {
    if (!live.active || sim.st !== "live") return;
    if (live.next > actx().currentTime + 0.05) return liveAfterPlayback();
    if (live.transferReq) { const r = live.transferReq; live.transferReq = null; liveClose(); return transfer(r); }
    if (live.endReq) return hangup("agent");
    if (sim.phase === "speaking" || sim.phase === "thinking") setPhase(sim.muted ? "muted" : "listening");
  }, wait);
}
async function liveTool(fc) {
  const args = fc.args || {}; let result = { ok: true };
  if (fc.name === "transfer") { live.transferReq = args.reason || "حسب قواعد التصعيد"; addAct({ type: "transfer", params: args }, null); }
  else if (fc.name === "end_call") live.endReq = true;
  else {
    setPhase("thinking", "لحظة… يشيّك على النظام"); const a = { type: fc.name, params: args };
    try { const r = await api("cc_action", { ws: WS, profile: profileForApi(), action: a, state: { caller: callerNo().replace(/\s/g, "") }, call_id: sim.callId }, 20000); result = r.result || {}; addAct(a, result); if (result.notification?.text) addNote(result.notification); }
    catch (e) { result = { ok: false, error: e.code || "failed" }; addLine({ role: "system", text: "تعذّر تنفيذ الإجراء (" + errMsg(e.code) + ")" }); }
  }
  if (fc.name === "transfer" || fc.name === "end_call") return; // no response: the agent already said its line; replying would make it repeat itself
  const { notification, ...slim } = result || {};
  liveSend({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result: slim } }] } });
}
function liveClose() {
  live.active = false; live.closed = true; try { live.ws?.close(); } catch {} liveStopAudio(false);
  try { live.node?.port && (live.node.port.onmessage = null); live.src?.disconnect(); live.node?.disconnect(); } catch {}
  live.stream?.getTracks().forEach((t) => t.stop()); live.stream = null; ambience(false);
}
async function liveClosed(e) {
  if (live.closed || !live.active) return; live.active = false; liveStopAudio(false); flushUser(); flushAgent(false);
  if (sim.st !== "live") return;
  addLine({ role: "system", text: `انقطع البث المباشر (${e.code}). نكمل بالمحرك العادي بدون ما تنقطع المكالمة.` });
  live.stream?.getTracks().forEach((t) => t.stop()); live.closed = true; setPhase("listening");
  if (await startMic()) setPhase("listening");
}
function ambience(on) {
  const c = actx();
  if (!on) { try { live.amb?.stop(); } catch {} live.amb = null; return; }
  const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let last = 0;
  for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const s = c.createBufferSource(); s.buffer = b; s.loop = true; const lp = c.createBiquadFilter(); lp.type = "bandpass"; lp.frequency.value = 900; lp.Q.value = 0.6;
  const g = c.createGain(); g.gain.value = 0.012; s.connect(lp); lp.connect(g); g.connect(c.destination); s.start(); live.amb = s;
}

// ================= DASHBOARD =================
const dash = { tab: "overview", cache: null, rows: [], q: "", fI: "", fS: "" };
const TABS = [["overview", "نظرة عامة"], ["calls", "سجل المكالمات"], ["queue", "قائمة المتابعة"], ["records", "الحجوزات والتذاكر"], ["phone", "ربط رقم حقيقي"]];
function demoRows() {
  // Clearly-labelled synthetic sample data for previewing the dashboard (not real calls).
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const intents = ["BOOKING", "BOOKING", "BOOKING", "ORDER_STATUS", "FAQ", "PRICING", "COMPLAINT", "CALLBACK", "HOURS"]; const sents = ["positive", "positive", "neutral", "neutral", "neutral", "negative", "angry"];
  const sums = { BOOKING: "حجز موعد تنظيف أسنان وتأكيد الموعد بالواتساب.", ORDER_STATUS: "استعلام عن حالة طلب تركيبة وإبلاغ العميل بالموعد.", FAQ: "سؤال عن قبول التأمين والمواقف.", PRICING: "استفسار عن سعر التبييض.", COMPLAINT: "شكوى من التأخير في الموعد وفتح تذكرة.", CALLBACK: "طلب معاودة اتصال من الطبيب.", HOURS: "سؤال عن الدوام يوم الجمعة." };
  return Array.from({ length: 64 }, (_, i) => { const it = intents[Math.floor(rnd() * intents.length)]; const se = it === "COMPLAINT" ? (rnd() > 0.5 ? "angry" : "negative") : sents[Math.floor(rnd() * 5)]; const tr = it === "COMPLAINT" ? rnd() > 0.5 : rnd() > 0.93; const res = !tr && it !== "CALLBACK" && rnd() > 0.12;
    const hr = [9, 10, 10, 11, 11, 12, 13, 16, 17, 17, 18, 19, 20, 21][Math.floor(rnd() * 14)]; const d = new Date(); d.setDate(d.getDate() - Math.floor(rnd() * 7)); d.setHours(hr, Math.floor(rnd() * 60));
    const dir = rnd() > 0.85 ? "outbound" : "inbound";
    return { id: "demo-" + i, demo: true, created_at: d.toISOString(), status: res ? "resolved" : "open", kind: "call", data: { call_id: "demo" + i, company: P.name, agent: tr ? "موظف بشري" : P.agent_name || "سلامة", direction: dir, channel: rnd() > 0.7 ? "phone" : "simulator", caller: "+97150" + String(1000000 + Math.floor(rnd() * 8999999)), started_at: d.toISOString(), duration: 40 + Math.floor(rnd() * 260), turns: 2 + Math.floor(rnd() * 8), avg_latency: 1800 + Math.floor(rnd() * 4000), transferred: tr, csat: rnd() > 0.4 ? Math.max(1, Math.min(5, Math.round((se === "positive" ? 4.6 : se === "neutral" ? 4 : 2.3) + (rnd() - 0.5)))) : null, dialects: [["emirati", "emirati", "saudi", "kuwaiti", "egyptian"][Math.floor(rnd() * 5)]], langs: [rnd() > 0.85 ? "en" : "ar"], transcript: [], analysis: { summary: sums[it] || "مكالمة تجريبية.", intent: it, sentiment: se, resolved: res, csat_pred: se === "positive" ? 5 : se === "neutral" ? 4 : 2, follow_up: res ? "" : "التواصل مع العميل لإكمال الطلب." } } }; });
}
async function loadDash(force) {
  if (dash.cache && !force) return dash.cache;
  try { const r = await api("cc_list", { ws: WS }, 30000); dash.cache = r.rows || []; } catch (e) { toast(errMsg(e.code), true); dash.cache = dash.cache || []; }
  return dash.cache;
}
const callsOf = (rows) => rows.filter((r) => r.kind === "call").concat($("#ccDemo").checked ? demoRows() : []).sort((a, b) => b.created_at.localeCompare(a.created_at));
function kpis(calls) {
  const n = calls.length, avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const resolved = calls.filter((c) => c.data.analysis?.resolved).length; const csU = calls.map((c) => c.data.csat).filter(Boolean); const csP = calls.map((c) => c.data.analysis?.csat_pred).filter(Boolean);
  return { n, res: n ? Math.round((100 * resolved) / n) : null, csat: avg(csU), csatPred: avg(csP), csatN: csU.length, aht: avg(calls.map((c) => c.data.duration || 0)), lat: avg(calls.map((c) => c.data.avg_latency).filter(Boolean)), xfer: n ? Math.round((100 * calls.filter((c) => c.data.transferred).length) / n) : null };
}
const bars = (pairs, color = "var(--acc)", fmt = (v) => v) => { const mx = Math.max(1, ...pairs.map((p) => p[1])); return h("div", { class: "hbars" }, ...pairs.map(([l, v, c]) => h("div", { class: "hb" }, h("span", {}, l), h("div", { class: "tb" }, h("i", { style: `width:${(v / mx) * 100}%;background:${c || color}` })), h("b", {}, fmt(v))))); };
function overview(calls, rows) {
  const k = kpis(calls); const stat = (v, l, sub) => h("div", { class: "card stat" }, h("b", {}, v ?? "—"), h("span", {}, l), sub ? h("small", { class: "muted" }, sub) : null);
  const hours = Array.from({ length: 24 }, (_, i) => calls.filter((c) => new Date(c.created_at).getHours() === i).length); const hm = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  const by = (f) => { const m = {}; calls.forEach((c) => { const v = f(c); if (v) m[v] = (m[v] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const agents = {}; calls.forEach((c) => { const a = c.data.transferred ? "موظف بشري (بعد التحويل)" : `${c.data.agent || "سلامة"} (ذكاء اصطناعي)`; (agents[a] ||= []).push(c); });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const open = rows.filter((r) => ["ticket", "callback"].includes(r.kind) && r.status === "open").length + calls.filter((c) => !c.data.analysis?.resolved && c.status !== "resolved").length;
  return [
    h("div", { class: "stats six" }, stat(k.n, "إجمالي المكالمات"), stat(k.res != null ? k.res + "٪" : null, "نسبة الحل من أول مكالمة"), stat(k.csat ? k.csat.toFixed(1) + " / 5" : k.csatPred ? k.csatPred.toFixed(1) + " / 5" : null, "رضا العملاء CSAT", k.csat ? `${k.csatN} تقييم` : k.csatPred ? "تقدير الذكاء الاصطناعي" : ""), stat(k.aht ? fmtT(k.aht) : null, "متوسط مدة المكالمة"), stat(k.lat ? (k.lat / 1000).toFixed(1) + " ث" : null, "متوسط زمن الرد"), stat(k.xfer != null ? k.xfer + "٪" : null, "تحويل لموظف", `${open} بانتظار المتابعة`)),
    h("div", { class: "grid-2" },
      h("div", { class: "card pad" }, h("h3", { class: "h3" }, "ساعات الذروة", k.n ? h("small", { class: "muted" }, ` · الأعلى ${peak}:00`) : null), h("div", { class: "hours-chart" }, ...hours.map((v, i) => h("div", { class: "hc", title: `${i}:00 · ${v}` }, h("i", { style: `height:${(v / hm) * 100}%` }), i % 3 === 0 ? h("small", {}, i) : h("small", {}, ""))))),
      h("div", { class: "card pad" }, h("h3", { class: "h3" }, "آخر 7 أيام"), h("div", { class: "hours-chart days" }, ...days.map((d) => { const v = calls.filter((c) => { const t = new Date(c.created_at); return t >= d && t < new Date(+d + 864e5); }).length; const mx = Math.max(1, ...days.map((dd) => calls.filter((c) => { const t = new Date(c.created_at); return t >= dd && t < new Date(+dd + 864e5); }).length)); return h("div", { class: "hc" }, h("em", {}, v || ""), h("i", { style: `height:${(v / mx) * 100}%` }), h("small", {}, d.toLocaleDateString("ar-AE", { weekday: "short" }))); })))),
    h("div", { class: "grid-2" },
      h("div", { class: "card pad" }, h("h3", { class: "h3" }, "أسباب الاتصال"), by((c) => c.data.analysis?.intent).length ? bars(by((c) => INTENT_AR[c.data.analysis?.intent] || c.data.analysis?.intent)) : h("div", { class: "empty sm" }, "لا يوجد بعد")),
      h("div", { class: "card pad" }, h("h3", { class: "h3" }, "مشاعر المتصلين"), (() => { const m = by((c) => c.data.analysis?.sentiment); const tot = calls.length || 1; return m.length ? h("div", {}, h("div", { class: "sbar" }, ...m.map(([s, v]) => h("i", { style: `width:${(v / tot) * 100}%;background:${SENT_C[s]}`, title: SENT_AR[s] }))), bars(m.map(([s, v]) => [SENT_AR[s] || s, v, SENT_C[s]]))) : h("div", { class: "empty sm" }, "لا يوجد بعد"); })(),
        h("h3", { class: "h3", style: "margin-top:14px" }, "اللهجات"), by((c) => c.data.dialects?.[0]).length ? bars(by((c) => DIALECT_AR[c.data.dialects?.[0]] || c.data.dialects?.[0])) : h("div", { class: "empty sm" }, "لا يوجد بعد"))),
    h("div", { class: "card pad" }, h("h3", { class: "h3" }, "أداء الموظفين"), Object.keys(agents).length ? h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ...["الموظف", "المكالمات", "نسبة الحل", "متوسط المدة", "زمن الرد", "CSAT", "متوسط الأدوار"].map((x) => h("th", {}, x)))),
      h("tbody", {}, ...Object.entries(agents).map(([a, cs]) => { const kk = kpis(cs); return h("tr", {}, h("td", {}, a), h("td", {}, cs.length), h("td", {}, kk.res + "٪"), h("td", {}, fmtT(kk.aht)), h("td", {}, a.startsWith("موظف بشري") ? "—" : kk.lat ? (kk.lat / 1000).toFixed(1) + " ث" : "—"), h("td", {}, kk.csat ? kk.csat.toFixed(1) : kk.csatPred ? "~" + kk.csatPred.toFixed(1) : "—"), h("td", {}, (cs.reduce((x, c) => x + (c.data.turns || 0), 0) / cs.length).toFixed(1))); })))) : h("div", { class: "empty sm" }, "ما فيه مكالمات بعد. جرّب مكالمة من المحاكي.")),
  ];
}
function callRow(c) {
  const a = c.data.analysis || {}; const d = new Date(c.created_at);
  const tr = h("tr", { class: "click", onclick: () => openCall(c) }, h("td", { class: "ltr" }, d.toLocaleString("ar-AE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })), h("td", { class: "ltr" }, c.data.caller || "—"), h("td", {}, c.data.direction === "outbound" ? "↗ صادرة" : "↙ واردة", c.data.channel === "phone" ? " · هاتف" : ""), h("td", { class: "ltr" }, fmtT(c.data.duration)),
    h("td", {}, INTENT_AR[a.intent] || a.intent || "—"), h("td", {}, h("span", { style: `color:${SENT_C[a.sentiment]}` }, "● "), SENT_AR[a.sentiment] || "—"), h("td", {}, a.resolved ? chip("انحلّت", "ok") : c.data.transferred ? chip("محوّلة", "gold") : chip("متابعة", "gold")), h("td", {}, c.data.csat ? "★".repeat(c.data.csat) : a.csat_pred ? h("span", { class: "muted" }, "~" + a.csat_pred) : "—"), h("td", {}, c.demo ? chip("تجريبي") : ""));
  return tr;
}
function callsTab(calls) {
  const q = h("input", { class: "inp", placeholder: "بحث في الملخص أو الرقم…", value: dash.q, dir: "auto" });
  const fi = h("select", {}, h("option", { value: "" }, "كل الأسباب"), ...Object.entries(INTENT_AR).map(([k, v]) => h("option", { value: k }, v))); fi.value = dash.fI;
  const fs = h("select", {}, h("option", { value: "" }, "كل المشاعر"), ...Object.entries(SENT_AR).map(([k, v]) => h("option", { value: k }, v))); fs.value = dash.fS;
  const body = h("tbody");
  const apply = () => { dash.q = q.value; dash.fI = fi.value; dash.fS = fs.value; const qq = q.value.trim(); const list = calls.filter((c) => (!fi.value || c.data.analysis?.intent === fi.value) && (!fs.value || c.data.analysis?.sentiment === fs.value) && (!qq || JSON.stringify([c.data.caller, c.data.analysis?.summary, c.data.transcript?.map((t) => t.text)]).includes(qq)));
    body.replaceChildren(...(list.length ? list.map(callRow) : [h("tr", {}, h("td", { colspan: 9 }, h("div", { class: "empty" }, calls.length ? "ما فيه نتائج." : "ما فيه مكالمات بعد. جرّب من «مكالمة تجريبية».")))])); };
  q.oninput = fi.onchange = fs.onchange = apply; apply();
  return [h("div", { class: "row gap wrap filters" }, q, fi, fs), h("div", { class: "card tbl-wrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ...["الوقت", "المتصل", "النوع", "المدة", "السبب", "المشاعر", "الحالة", "CSAT", ""].map((x) => h("th", {}, x)))), body))];
}
async function openCall(c) {
  const a = c.data.analysis || {};
  const rec = c.demo ? null : await idb.get("rec", c.id) || await idb.get("rec", c.data.call_id);
  const dlg = h("dialog", { class: "drawer" });
  dlg.append(h("div", { class: "row between" }, h("h2", { class: "h2" }, "تفاصيل المكالمة"), h("button", { class: "btn sm soft", onclick: () => dlg.close() }, "إغلاق")),
    h("div", { class: "row gap wrap" }, chip(new Date(c.created_at).toLocaleString("ar-AE")), chip(fmtT(c.data.duration), "ltr"), chip(INTENT_AR[a.intent] || "—"), h("span", { class: "chip sm", style: `color:${SENT_C[a.sentiment]}` }, "● " + (SENT_AR[a.sentiment] || "—")), chip(a.resolved ? "انحلّت" : "تحتاج متابعة", a.resolved ? "ok" : "gold"), c.data.avg_latency ? chip(`زمن الرد ${(c.data.avg_latency / 1000).toFixed(1)} ث`) : null, c.demo ? chip("بيانات تجريبية") : null),
    h("h3", { class: "h3" }, "ملخص الذكاء الاصطناعي"), h("p", { class: "lh" }, a.summary || "—"), a.follow_up ? h("p", { class: "small" }, h("b", {}, "المتابعة: "), a.follow_up) : null, a.tags?.length ? h("div", { class: "chips" }, ...a.tags.map((t) => chip(t))) : null,
    rec ? makePlayer({ title: "تسجيل المكالمة", wav: rec, filename: `call-${c.id}.wav` }) : h("p", { class: "muted small" }, c.data.channel === "phone" ? "التسجيل متاح من لوحة Twilio (إن فعّلت التسجيل)." : "التسجيل محفوظ فقط على الجهاز اللي تمت منه المكالمة."),
    c.data.actions?.length ? h("div", {}, h("h3", { class: "h3" }, "الإجراءات"), ...c.data.actions.map((x) => h("div", { class: "small" }, `• ${ACT_AR[x.type] || x.type}${x.ref ? " · " + x.ref : ""}${x.source ? " · " + x.source : ""}`))) : null,
    h("h3", { class: "h3" }, "النص الكامل"), h("div", { class: "sim-log in-dlg" }, ...(c.data.transcript?.length ? c.data.transcript.map((l) => h("div", { class: "sl " + l.role }, l.role === "system" ? l.text : [h("div", { class: "who" }, l.role === "agent" ? c.data.agent || "سلامة" : "المتصل", h("small", {}, fmtT(l.t))), h("div", { class: "bub", dir: "auto" }, l.text)])) : [h("div", { class: "empty sm" }, "لا يوجد نص.")])),
    !c.demo && c.id ? h("div", { class: "row gap" }, c.status !== "resolved" ? h("button", { class: "btn sm primary", onclick: async () => { try { await api("cc_update", { ws: WS, id: c.id, status: "resolved" }); c.status = "resolved"; toast("تم تعليمها كمحلولة ✓"); dlg.close(); renderDash(true); } catch (e) { toast(errMsg(e.code), true); } } }, "تعليم كمحلولة") : null) : null);
  document.body.append(dlg); dlg.addEventListener("close", () => dlg.remove()); dlg.showModal();
}
function queueTab(calls, rows) {
  const items = [...rows.filter((r) => ["ticket", "callback"].includes(r.kind) && r.status === "open").map((r) => ({ r, t: r.kind === "ticket" ? "تذكرة" : "معاودة اتصال", text: r.data.params?.summary || r.data.params?.reason || "", who: r.data.params?.name || r.data.caller || "", ref: r.ref })),
    ...calls.filter((c) => !c.data.analysis?.resolved && c.status !== "resolved").map((c) => ({ r: c, t: c.data.transferred ? "مكالمة محوّلة" : "مكالمة غير محلولة", text: c.data.analysis?.follow_up || c.data.analysis?.summary || "", who: c.data.caller, call: true }))].sort((a, b) => b.r.created_at.localeCompare(a.r.created_at));
  if (!items.length) return [h("div", { class: "card pad" }, h("div", { class: "empty" }, "ما فيه شي بانتظار المتابعة 👌"))];
  return [h("div", { class: "col sm-gap" }, ...items.map((x) => h("div", { class: "card qitem" }, h("div", { class: "f1" }, h("div", { class: "row gap wrap" }, chip(x.t, x.t.includes("تذكرة") ? "gold" : ""), x.ref ? chip(x.ref, "ltr") : null, x.r.demo ? chip("تجريبي") : null, h("small", { class: "muted" }, new Date(x.r.created_at).toLocaleString("ar-AE"))), h("div", { dir: "auto" }, x.text), h("small", { class: "muted ltr" }, x.who)),
    h("div", { class: "row gap" }, x.call ? h("button", { class: "btn sm soft", onclick: () => openCall(x.r) }, "التفاصيل") : null, !x.r.demo ? h("button", { class: "btn sm primary", onclick: async (e) => { e.currentTarget.disabled = true; try { await api("cc_update", { ws: WS, id: x.r.id, status: "resolved" }); x.r.status = "resolved"; toast("تم ✓"); renderDash(); } catch (er) { toast(errMsg(er.code), true); } } }, "تم الحل") : null))))];
}
function recordsTab(rows) {
  const sect = (kind, title, cols, map) => { const list = rows.filter((r) => r.kind === kind); return h("div", { class: "card pad" }, h("h3", { class: "h3" }, `${title} (${list.length})`), list.length ? h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ...cols.map((c) => h("th", {}, c)))), h("tbody", {}, ...list.map((r) => h("tr", {}, ...map(r).map((v) => h("td", { dir: "auto" }, v ?? "—"))))))) : h("div", { class: "empty sm" }, "لا يوجد بعد")); };
  const t = (r) => new Date(r.created_at).toLocaleString("ar-AE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return [sect("booking", "الحجوزات", ["المرجع", "الخدمة", "الموعد", "الاسم", "الهاتف", "المصدر", "أُنشئ"], (r) => [r.ref, r.data.params?.service, `${r.data.params?.date || ""} ${r.data.params?.time || ""}`, r.data.params?.name, r.data.params?.phone || r.data.caller, r.data.source === "webhook" ? "ويبهوك" : "قاعدة نبرة", t(r)]),
    sect("ticket", "التذاكر والشكاوى", ["المرجع", "النوع", "الأهمية", "الملخص", "الحالة", "أُنشئ"], (r) => [r.ref, r.data.params?.category, r.data.params?.severity, r.data.params?.summary, r.status === "open" ? "مفتوحة" : "محلولة", t(r)]),
    sect("callback", "طلبات معاودة الاتصال", ["المرجع", "الاسم", "الهاتف", "الوقت المفضل", "السبب", "الحالة"], (r) => [r.ref, r.data.params?.name, r.data.params?.phone || r.data.caller, r.data.params?.preferred_time, r.data.params?.reason, r.status === "open" ? "مفتوح" : "تم"]),
    sect("notification", "إشعارات العملاء (محاكاة واتساب/SMS)", ["القناة", "إلى", "الرسالة", "الوقت"], (r) => [r.data.channel === "sms" ? "SMS" : "واتساب", r.data.to, r.data.text, t(r)])];
}
function phoneTab() {
  const pub = store.get("ccCompanyId", "");
  const url = pub ? `${PHONE_FN}?ws=${WS}&co=${pub}` : "";
  return [h("div", { class: "grid-2" },
    h("div", { class: "card pad col" }, h("h3", { class: "h3" }, "الجسر جاهز على الخادم"), h("p", { class: "lh small" }, "بنينا جسر Twilio جاهز (دالة ramsa-phone). أول ما يكون عندك رقم من Twilio، حط الرابط هذا في إعدادات الرقم، والمكالمات الحقيقية بتنرد بالموظف الآلي وتنحفظ في هذي اللوحة."),
      url ? h("div", { class: "copyrow" }, h("input", { class: "inp ltr", readonly: true, value: url }), h("button", { class: "btn sm soft", onclick: () => navigator.clipboard.writeText(url).then(() => toast("تم النسخ ✓")) }, "نسخ")) : h("div", { class: "warn" }, "انشر إعدادات الشركة أول من «إعداد الشركة ← المراجعة والنشر» عشان يطلع لك رابط الربط."),
      h("ol", { class: "steps small" }, h("li", {}, "سوّ حساب Twilio واشترِ رقم صوتي (الأرقام الإماراتية تحتاج وثائق، أو ابدأ برقم دولي للتجربة)."), h("li", {}, "Phone Numbers ← رقمك ← Voice ← A call comes in ← Webhook ← الصق الرابط (HTTP POST)."), h("li", {}, "اختياري: حط TWILIO_AUTH_TOKEN كسر في Supabase عشان نتحقق من توقيع Twilio."), h("li", {}, "اتصل على الرقم. المكالمة تظهر هنا بعد ما تنتهي.")),
      h("a", { class: "btn soft", href: "https://github.com/almarar88/ramsa/blob/main/PHONE.md", target: "_blank", rel: "noopener" }, "الدليل الكامل: المتطلبات، الأنظمة، التكاليف")),
    h("div", { class: "card pad col" }, h("h3", { class: "h3" }, "الواقع بصراحة"), h("ul", { class: "lh small" },
      h("li", {}, "الأرقام الإماراتية الجغرافية عند Twilio للاستقبال فقط، والأرقام المجانية 800 تحتاج خطاب تفويض (LOA)، والتوفر غير مضمون."),
      h("li", {}, "خدمات الصوت عبر الإنترنت في الإمارات منظّمة من هيئة TDRA: تحتاج تعاون مع e& أو du أو موافقة من الهيئة. للإنتاج الأنسب: SIP trunk من e&/du أو مزوّد معتمد، أو تحويل رقمك الحالي للجسر."),
      h("li", {}, "صوت الخط الحقيقي في الجسر: Amazon Polly (Hala/Zayd بلهجة خليجية) لسرعة الرد، أو Gemini (أصوات نبرة) مع تأخير أعلى."),
      h("li", {}, "التكلفة التقريبية عند Twilio (حسب صفحة الأسعار اليوم): التعرّف على الكلام 0.02$ لكل مقطع، الصوت العصبي 0.0032$ لكل 100 حرف، والاتصال الصادر داخل الإمارات 0.30–0.36$ للدقيقة، والأرقام تبدأ من 1$ شهريًا وتختلف حسب الدولة."))))];
}
async function renderDash(force) {
  const body = $("#ccBody"); $("#ccTabs").replaceChildren(...TABS.map(([k, l]) => h("button", { class: dash.tab === k ? "on" : "", onclick: () => { dash.tab = k; renderDash(); } }, l)));
  renderCompanyCard();
  if (!dash.cache || force) body.replaceChildren(h("div", { class: "card pad" }, h("div", { class: "spinner" })));
  const rows = await loadDash(force); const calls = callsOf(rows);
  $("#ccDemoNote")?.remove(); if ($("#ccDemo").checked) $("#ccBody").before(h("div", { class: "warn", id: "ccDemoNote" }, "تعرض الحين بيانات تجريبية مولّدة (64 مكالمة) لمعاينة اللوحة، مميّزة بكلمة «تجريبي». أطفئ الخيار لعرض مكالماتك الفعلية فقط."));
  body.replaceChildren(...{ overview: () => overview(calls, rows), calls: () => callsTab(calls), queue: () => queueTab(calls, rows), records: () => recordsTab(rows), phone: phoneTab }[dash.tab]());
}
function renderCompanyCard() {
  $("#ccCompany").replaceChildren(h("div", { class: "card co-card" }, h("div", { class: "ph-av sm" }, (P.name || "ر").trim()[0]), h("div", { class: "f1" }, h("b", {}, P.name || "شركتك"), h("div", { class: "muted small" }, `${P.agent_name || "سلامة"} · صوت ${voiceOf(P.voice).name} · ${P.dialect_mode === "mirror" ? "يرد بلهجة المتصل" : "إماراتي"} · ${isOpenNow() ? "🟢 مفتوح الحين" : "🔴 مغلق الحين"}`)),
    P._sample ? chip("مثال تجريبي", "gold") : store.get("ccCompanyId", "") ? chip("منشور ✓", "ok") : chip("غير منشور"), h("a", { class: "btn sm soft", href: "#ccsetup" }, "تعديل")));
}
$("#ccDemo").onchange = () => renderDash(); $("#ccRefresh").onclick = () => renderDash(true);
$("#ccCsv").onclick = async () => {
  const calls = callsOf(await loadDash());
  if (!calls.length) return toast("ما فيه مكالمات للتصدير.");
  dlText(csv([["id", "datetime", "caller", "direction", "channel", "duration_sec", "intent", "sentiment", "resolved", "transferred", "csat", "csat_predicted", "avg_latency_ms", "turns", "dialect", "summary", "follow_up", "actions", "demo"],
    ...calls.map((c) => { const a = c.data.analysis || {}; return [c.id, c.created_at, c.data.caller, c.data.direction, c.data.channel, c.data.duration, a.intent, a.sentiment, a.resolved, c.data.transferred, c.data.csat ?? "", a.csat_pred ?? "", c.data.avg_latency ?? "", c.data.turns, (c.data.dialects || []).join("|"), a.summary, a.follow_up, (c.data.actions || []).map((x) => x.type + (x.ref ? ":" + x.ref : "")).join("|"), c.demo ? "yes" : ""]; })]), `nabra-calls-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
};

// ================= CAMPAIGNS =================
const CAMP = {
  reminder: { label: "تذكير بموعد", script: "ذكّر العميل بموعده (التاريخ والوقت في بياناته)، واطلب منه تأكيد الحضور أو إعادة الجدولة. إذا يبي يغيّر، اعرض موعد ثاني واطلب تأكيده.", contacts: "أحمد المري, +971501112233, موعد تنظيف باجر الساعة 5 العصر\nفاطمة الكعبي, +971502223344, موعد كشف الخميس 10 الصبح\nسعيد النعيمي, +971503334455, موعد تبييض السبت 6 المسا" },
  payment: { label: "متابعة دفعة مستحقة", script: "ذكّر العميل بلطف باحترام بوجود مبلغ مستحق (في بياناته)، واعرض طرق الدفع (رابط دفع بالواتساب أو في العيادة)، وسجّل موعد الدفع اللي يلتزم فيه. لا تهدد ولا تضغط.", contacts: "خالد الشامسي, +971504445566, مبلغ 450 درهم لجلسة حشوة\nمريم الظاهري, +971505556677, مبلغ 1200 درهم لجلسة تبييض" },
  survey: { label: "استبيان رضا", script: "اشكر العميل على زيارته الأخيرة، واسأله: من 1 إلى 5 شكثر راضي عن الخدمة؟ واسأل سؤال واحد: شو أكثر شي عجبك أو تبينا نحسّنه؟ المكالمة أقل من دقيقة.", contacts: "عبدالله البلوشي, +971506667788, زار العيادة أمس للتنظيف\nنورة الهاملي, +971507778899, زارت العيادة الأسبوع الماضي للكشف\nحمد السويدي, +971508889900, زار العيادة للتبييض" },
};
const OUT_AR = { confirmed: "أكّد", declined: "رفض", paid: "دفع", promised: "وعد بالدفع", reschedule: "يبا يغيّر الموعد", survey_done: "أكمل الاستبيان", no_interest: "غير مهتم", callback: "معاودة اتصال", no_answer: "ما رد" };
const OUT_C = { confirmed: "ok", paid: "ok", survey_done: "ok", promised: "ok", reschedule: "gold", callback: "gold", declined: "bad", no_interest: "bad", no_answer: "" };
let camp = store.get("ccCamp", { type: "reminder", script: CAMP.reminder.script, contacts: CAMP.reminder.contacts, results: [] });
const parseContacts = () => $("#coContacts").value.split("\n").map((l) => l.split(/[,،]/).map((x) => x.trim())).filter((x) => x[0]).slice(0, 10).map(([name, phone, ...d]) => ({ name, phone: phone || "", detail: d.join("، ") }));
function renderCamp() {
  $("#coType").value = camp.type; $("#coScript").value = camp.script; $("#coContacts").value = camp.contacts;
  const rs = camp.results || []; const cnt = (f) => rs.filter(f).length;
  $("#coStats").replaceChildren(...[[rs.length, "مكالمات"], [cnt((r) => ["confirmed", "paid", "survey_done", "promised"].includes(r.outcome)), "نتيجة إيجابية"], [cnt((r) => ["reschedule", "callback"].includes(r.outcome)), "تحتاج متابعة"], [cnt((r) => ["declined", "no_interest", "no_answer"].includes(r.outcome)), "رفض / ما رد"]].map(([v, l]) => h("div", { class: "card stat" }, h("b", {}, v), h("span", {}, l))));
  const contacts = parseContacts();
  $("#coRes").replaceChildren(...(contacts.length ? contacts.map((c, i) => { const r = rs.find((x) => x.phone === c.phone && x.name === c.name);
    return h("div", { class: "camp-row" }, h("div", { class: "row between wrap gap" }, h("div", {}, h("b", {}, c.name), h("small", { class: "muted ltr" }, " " + c.phone), h("div", { class: "small muted" }, c.detail)), h("div", { class: "row gap" }, r ? h("span", { class: "chip sm " + (OUT_C[r.outcome] || "") }, OUT_AR[r.outcome] || r.outcome) : r === undefined && camp.running === i ? h("span", { class: "chip sm" }, "يتصل…") : null, h("button", { class: "btn sm soft", onclick: () => callMe(c) }, "📞 اتصل فيني"))),
      r ? h("details", {}, h("summary", { class: "small" }, (r.score ? `التقييم ${r.score}/5 · ` : "") + (r.detail || r.summary || "")), h("div", { class: "sim-log in-dlg" }, ...(r.lines || []).map((l) => h("div", { class: "sl " + (l.who === "agent" ? "agent" : "user") }, h("div", { class: "bub", dir: "auto" }, l.text)))), h("div", { class: "muted small" }, "محادثة محاكاة لاختبار النص — مو مكالمة حقيقية.")) : null); }) : [h("div", { class: "empty" }, "أضف جهات اتصال.")]));
}
const saveCamp = () => { camp.type = $("#coType").value; camp.script = $("#coScript").value; camp.contacts = $("#coContacts").value; store.set("ccCamp", camp); };
$("#coType").onchange = () => { const t = $("#coType").value; camp.type = t; camp.script = CAMP[t].script; camp.contacts = CAMP[t].contacts; camp.results = []; store.set("ccCamp", camp); renderCamp(); };
$("#coScript").oninput = saveCamp; $("#coContacts").oninput = () => { saveCamp(); renderCamp(); };
$("#coSample").onclick = () => { const t = $("#coType").value; camp.script = CAMP[t].script; camp.contacts = CAMP[t].contacts; camp.results = []; store.set("ccCamp", camp); renderCamp(); };
$("#coRun").onclick = async (ev) => {
  const btn = ev.currentTarget; saveCamp(); const contacts = parseContacts(); if (!contacts.length) return toast("أضف جهات اتصال أول.", true);
  btn.classList.add("loading"); camp.results = []; const personas = ["متعاون ومستعجل", "متردد ويسأل سؤال", "مشغول ويطلب يتصلون بعدين", "متعاون جدًا", "يرفض بأدب"];
  for (let i = 0; i < contacts.length; i++) {
    camp.running = i; renderCamp();
    try { const r = await api("cc_campaign", { profile: profileForApi(), type: CAMP[camp.type].label, script: camp.script, contact: contacts[i], persona: personas[i % personas.length] }, 60000); camp.results.push({ ...contacts[i], ...r }); }
    catch (e) { camp.results.push({ ...contacts[i], outcome: "error", detail: errMsg(e.code) }); if (e.code === "rate_limit") { toast(errMsg(e.code), true); break; } }
    store.set("ccCamp", camp);
  }
  camp.running = null; btn.classList.remove("loading"); renderCamp();
  api("cc_company", { ws: WS, profile: profileForApi() }).catch(() => {});
};
$("#coCsv").onclick = () => { if (!camp.results?.length) return toast("شغّل الحملة أول."); dlText(csv([["name", "phone", "detail", "outcome", "result", "score", "sentiment", "summary"], ...camp.results.map((r) => [r.name, r.phone, r.detail, r.outcome, r.detail, r.score ?? "", r.sentiment ?? "", r.summary ?? ""])]), `nabra-campaign-${camp.type}.csv`, "text/csv"); };
function callMe(c) { sessionStorage.setItem("ccOut", JSON.stringify({ contact: c, type: camp.type, typeLabel: CAMP[camp.type].label, script: camp.script })); location.hash = "cccall?out=1"; }

// ================= ROUTE HOOK =================
let curView = "";
function onRoute(view) {
  if (curView === "cccall" && view !== "cccall" && ["live", "human", "dialing"].includes(sim.st)) hangup("user");
  if (curView === "cccall" && view !== "cccall" && sim.st === "incoming") { fx.stop(); screen("idle"); }
  curView = view;
  if (view === "ccsetup") renderWz();
  if (view === "cc") renderDash();
  if (view === "ccout") renderCamp();
  const busy = ["live", "human", "dialing", "incoming"].includes(sim.st);
  const dm = view === "cccall" && /[?&]demo=(\w+)/.exec(location.hash); const sc = dm && window.__scen?.[dm[1]];
  if (sc && !busy && DEMO !== sc) { DEMO = sc; P = structuredClone(sc.p); resetSim(); screen("idle"); demoCard(); }
  else if (!sc && DEMO && !busy && !(view === "cccall" && /demo=/.test(location.hash))) { DEMO = null; P = store.get("ccProfile", null) || SAMPLE(); demoCard(); if (view === "cccall") screen("idle"); }
  if (view === "cccall") {
    const out = /[?&]out=1/.test(location.hash) && sessionStorage.getItem("ccOut");
    if (out && !["live", "human"].includes(sim.st)) { sessionStorage.removeItem("ccOut"); resetSim(); sim.out = JSON.parse(out); screen("incoming"); fx.ringtone(); history.replaceState(null, "", "#cccall"); }
    else if (!["live", "human", "ended", "dialing", "incoming"].includes(sim.st)) screen("idle");
  }
}
function demoCard() {
  $("#simDemo")?.remove(); if (!DEMO) return; const d = DEMO;
  $("#v-cccall .cc-side").prepend(h("div", { class: "card pad demo-card", id: "simDemo" }, h("div", { class: "row between wrap" }, h("b", {}, d.ico + " " + d.title), h("span", { class: "demo-badge" }, "تجربة، ليست جهة حقيقية")),
    h("div", { class: "small" }, h("b", {}, "بياناتك التجريبية: "), `${d.me.name} · ${d.me.phone} · ${d.me.hint}`), h("div", { class: "muted small" }, "التحقق المطلوب: " + d.verify),
    h("div", { class: "scen-tasks" }, h("span", { class: "muted small" }, "جرّب تقول:"), ...d.try.map((t) => h("span", { class: "chip sm" }, "«" + t + "»"))),
    h("a", { class: "link-btn small", href: "#ccdemo" }, "← سيناريو ثاني")));
}
window.__cc = { route: onRoute, sim, live, P: () => P, WS, dash };
onRoute((location.hash.slice(1) || "home").split("?")[0]);

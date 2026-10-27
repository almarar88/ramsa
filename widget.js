(function () {
  var s = document.currentScript; if (!s) return;
  var base = s.src.replace(/widget\.js.*$/, ""), cfg = s.getAttribute("data-agent") || "", label = s.getAttribute("data-label") || "كلّمنا";
  var btn = document.createElement("button"), frame = null, open = false;
  btn.setAttribute("aria-label", label); btn.innerHTML = '<svg viewBox="12 6 40 46" width="28" height="28" fill="none" stroke="#fff" stroke-linecap="round"><path d="M17 24v7a15 15 0 0 0 30 0v-7" stroke-width="5.5"/><circle cx="32" cy="17" r="4.4" fill="#f2c46d" stroke="none"/><path d="M26 11.5a8 8 0 0 0 0 11M38 11.5a8 8 0 0 1 0 11" stroke="#f2c46d" stroke-width="2.6"/></svg>';
  btn.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:2147483646;width:62px;height:62px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#0d5c57,#0f8a7e);box-shadow:0 10px 30px rgba(15,138,126,.45);display:flex;align-items:center;justify-content:center";
  btn.onclick = function () {
    if (!frame) { frame = document.createElement("iframe"); frame.src = base + "index.html?embed=1#agent?c=" + cfg; frame.allow = "microphone; autoplay"; frame.title = label;
      frame.style.cssText = "position:fixed;bottom:92px;left:20px;z-index:2147483647;width:min(380px,calc(100vw - 40px));height:min(620px,calc(100vh - 120px));border:0;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);background:#f6f4ef"; document.body.appendChild(frame); open = true; return; }
    open = !open; frame.style.display = open ? "block" : "none";
  };
  document.body.appendChild(btn);
})();

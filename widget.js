(function () {
  var s = document.currentScript; if (!s) return;
  var base = s.src.replace(/widget\.js.*$/, ""), cfg = s.getAttribute("data-agent") || "", label = s.getAttribute("data-label") || "كلّمنا";
  var btn = document.createElement("button"), frame = null, open = false;
  btn.setAttribute("aria-label", label); btn.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="#fff"><path d="M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zm-7 8h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z"/></svg>';
  btn.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:2147483646;width:62px;height:62px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#0d5c57,#0f8a7e);box-shadow:0 10px 30px rgba(15,138,126,.45);display:flex;align-items:center;justify-content:center";
  btn.onclick = function () {
    if (!frame) { frame = document.createElement("iframe"); frame.src = base + "index.html?embed=1#agent?c=" + cfg; frame.allow = "microphone; autoplay"; frame.title = label;
      frame.style.cssText = "position:fixed;bottom:92px;left:20px;z-index:2147483647;width:min(380px,calc(100vw - 40px));height:min(620px,calc(100vh - 120px));border:0;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);background:#f6f4ef"; document.body.appendChild(frame); open = true; return; }
    open = !open; frame.style.display = open ? "block" : "none";
  };
  document.body.appendChild(btn);
})();

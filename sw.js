const C = "nabra-v11";
const SHELL = ["./", "index.html", "styles.css?v=4", "app.js?v=10", "cc.js?v=4", "cc.css?v=1", "design.css?v=3", "home.js?v=2", "studio.js?v=2", "scenarios.js?v=1", "manifest.json", "icons/logo.svg", "icons/icon-192.png", "icons/favicon-64.png", "icons/logo-dark.svg", "samples/hero.mp3", "widget.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match("index.html"))));
});

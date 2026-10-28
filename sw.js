// 離線快取。改了任何檔案就把 VER 加一，舊快取會被清掉。
const VER = "ks-v25";
const CORE = ["./", "index.html", "style.css", "app.js", "sync.js", "data/subjects.js", "data/chn.js", "data/eng.js", "data/con.js", "data/jur.js", "data/adm.js", "data/alaw.js", "data/pol.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  // 有網路先抓新檔（略過瀏覽器快取），沒網路才用離線快取
  e.respondWith(
    (sameOrigin ? fetch(req.url, { cache: "no-cache" }) : fetch(req)).then((res) => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

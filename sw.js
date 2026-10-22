const CACHE = "world-hunter-v11-sicily-content";
const CORE = ["./", "./index.html", "./admin.html", "./admin.js", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon.svg", "./assets/explorer-avatar.png", "./content/coordinate_audit.json", "./content/cards.json", "./content/quizzes.json", "./content/sources.json", "./content/review_queue.json"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match("./index.html"))));
  }
});
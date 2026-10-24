// Service worker: caches the game so it works offline once installed.
// Bump CACHE whenever the game files change. Navigation is network-first so a
// deployed update is picked up as soon as the player is online.
const CACHE = "orbit-runner-v11";
const FILES = ["./", "./index.html", "./config.js", "./game.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  if (e.request.mode === "navigate") {
    // network-first: fresh game when online, cached game when offline
    e.respondWith(
      fetch(e.request)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // assets: cache-first, with a background refresh of the cached copy
  e.respondWith(
    caches.match(e.request).then(r => {
      const network = fetch(e.request)
        .then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
        .catch(() => null);
      return r || network.then(res => res || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } }));
    })
  );
});

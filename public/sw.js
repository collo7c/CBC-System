// Service worker: lets the teacher dashboard open and work with no connection.
// Strategy: network first (always fresh when online), fall back to the last saved copy when offline.
const VERSION = "cbc-v2";
const SHELL = [
  "/", "/index.html", "/teacher.html",
  "/css/style.css", "/js/api.js", "/js/offline.js", "/js/teacher.js", "/js/assessments.js",
];
// API reads the teacher dashboard needs while offline. Writes (POST) are never touched here.
const CACHEABLE_API = ["/api/learners", "/api/curriculum/", "/api/resources", "/api/records", "/api/schools"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/uploads/")) return;
  if (url.pathname.startsWith("/api/") && !CACHEABLE_API.some((p) => url.pathname.startsWith(p))) {
    return; // e.g. /api/health must always hit the real network so the Online/Offline badge is honest
  }
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "You are offline and this has not been saved yet." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

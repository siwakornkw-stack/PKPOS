// Service worker for installability only. It intentionally does NOT cache
// /_next/static assets: Vercel already serves them with immutable, long-lived
// cache headers, and a cache-first SW that outlives deploys can serve a stale
// mix of old+new build chunks -> "Cannot read properties of undefined (reading
// 'call')" / pages stuck on the loading boundary. So: no asset caching here, and
// on activate we delete every old cache (kills the previous resto-pos-static-v1).
const CACHE = "resto-pos-v2-nocache";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) // wipe ALL old caches
      .then(() => self.clients.claim())
  );
});

// Pass everything through to the network. Nothing is cached, so no stale chunks.
self.addEventListener("fetch", () => {});

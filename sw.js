// Service Worker بسيط — يخزّن الهيكل الأساسي فقط (وليس البيانات الحية)
// posts.json و gallery.json يُجلَبان دوماً من الشبكة مباشرة (network-first)
// حتى تبقى البيانات محدّثة دوماً.

const CACHE_NAME = "gamestore-shell-v1";
const SHELL_FILES = [
  "./index.html",
  "./app.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // البيانات الحية: دائماً من الشبكة، بدون أي كاش
  if (url.includes("posts.json") || url.includes("gallery.json") || url.includes("workers.dev")) {
    return; // اترك الطلب يذهب للشبكة مباشرة بدون اعتراض
  }

  // هيكل الموقع: جرّب الكاش أولاً، ثم الشبكة كبديل
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

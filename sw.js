// Service Worker — يخزّن الهيكل الأساسي فقط (وليس البيانات الحية)
// games.json يُجلب دومًا من الشبكة مباشرة (Network-only) حتى تبقى بيانات
// الألعاب محدّثة دومًا مهما كانت نسخة الكاش.
//
// ⚠️ تعديل هذه النسخة: الهيكل (index.html / app.js / manifest.json) صار
// يُجلب بأسلوب "الشبكة أولاً" (Network-first) بدل "الكاش أولاً". هذا يعني
// أي تحديث تنشره على app.js/index.html ينعكس تلقائيًا عند أول زيارة تالية
// بوجود إنترنت، بدون الحاجة لتذكّر رفع رقم CACHE_NAME يدويًا في كل مرة.
// الكاش يبقى فقط كبديل احتياطي عند انقطاع الاتصال.

const CACHE_NAME = "gamestore-shell-v2";
const SHELL_FILES = [
  "./",
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

  // البيانات الحية: games.json يجب أن يصل دائمًا طازجًا من الشبكة، بدون أي كاش
  if (url.includes("games.json")) {
    return; // اترك الطلب يذهب للشبكة مباشرة بدون اعتراض
  }

  // صور المنشورات (images/<msg_id>.jpg): ثابتة ولا تتغيّر بعد رفعها،
  // فيصح تخزينها طويل الأمد — كاش أولاً مع تحديث الكاش من أول تحميل فعلي
  if (url.includes("/images/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        });
      })
    );
    return;
  }

  // هيكل الموقع (index.html / app.js / manifest.json وغيرها):
  // الشبكة أولاً — لضمان وصول آخر تحديث دائمًا عند توفر إنترنت،
  // مع اللجوء للكاش فقط إذا تعذّر الاتصال (وضع عدم الاتصال).
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

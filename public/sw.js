// public/sw.js
// Service worker minimal -- 2 tujuan:
//   1. Syarat teknis "installable PWA" di Chrome desktop (Android lebih
//      longgar, tapi desktop Chrome MEMANG minta ada service worker
//      dengan fetch handler sebelum mau nawarin "Install app").
//   2. Cache dasar buat asset statis (ikon, manifest) -- BUKAN cache
//      halaman aplikasi/data (data selalu harus fresh dari server,
//      app ini bukan aplikasi offline-first).
//
// Sengaja SEDERHANA -- gak nyoba nyimpen data Supabase/halaman dinamis
// offline, biar gak ada risiko orang lihat data basi tanpa sadar.

const CACHE_NAME = "i1cctv-static-v1";
const STATIC_ASSETS = ["/manifest.json", "/icon-192.png", "/icon-512.png", "/apple-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {
      // Gagal cache di awal (misal offline pas install) -- gak fatal,
      // service worker tetap aktif, cuma belum ke-cache aja.
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Cuma tangani asset statis yang di-cache di atas -- request lainnya
  // (halaman, API, Supabase) SELALU lewat network langsung, gak pernah
  // di-intercept, biar data yang ditampilkan selalu yang terbaru.
  if (request.method !== "GET" || !STATIC_ASSETS.some((path) => request.url.endsWith(path))) {
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

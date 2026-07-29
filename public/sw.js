// Deliberately minimal -- FirmTrack is a live-data (Supabase-backed) app,
// so caching pages or API responses would risk serving stale/wrong data.
// This service worker exists to satisfy PWA installability, not to
// provide real offline functionality: network-first for navigations,
// falling back to a small static offline page only when the network
// request itself fails. Everything else (API calls, static assets)
// passes straight through, uncached.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('firmtrack-shell-v1').then((cache) => cache.add('/offline.html')))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(() => caches.match('/offline.html').then((res) => res || Response.error()))
  )
})

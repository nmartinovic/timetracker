// sw.js
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `tt-static-${CACHE_VERSION}`;

// List everything needed offline. Paths are relative to sw.js scope.
const ASSET_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/timer.js',
  './js/ui.js',
  './js/utils.js'
  // (icons are requested by the OS; you can add them here too if you want)
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(ASSET_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => (k.startsWith('tt-static-') && k !== STATIC_CACHE) ? caches.delete(k) : null)
    );
  })());
  self.clients.claim();
});

// Navigation requests: network-first (fallback to cache for offline)
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GETs
  if (req.method !== 'GET') return;

  // HTML page navigations
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put('./index.html', net.clone());
        return net;
      } catch (e) {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match('./index.html')) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Static assets: cache-first
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      // Only cache same-origin requests
      if (new URL(req.url).origin === location.origin) cache.put(req, net.clone());
      return net;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});

// Clicking a notification: focus/open the app (useful if you later show SW notifications)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action; // e.g., 'continue-countup' if you add actions later
  const data = event.notification.data || {};

  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let client = clientsArr.find(c => 'focus' in c) || null;
    if (client) {
      await client.focus();
    } else {
      client = await self.clients.openWindow('./');
    }
    // If you wire SW actions later, postMessage to the page here:
    if (client && action) {
      client.postMessage({ type: 'NOTIFICATION_ACTION', action, data });
    }
  })());
});

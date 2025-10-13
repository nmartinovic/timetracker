// sw.js
const CACHE_VERSION = 'v1.0.2';                 // ⬅ bump this
const STATIC_CACHE = `tt-static-${CACHE_VERSION}`;

const ASSET_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/timer.js',
  './js/ui.js',
  './js/utils.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(ASSET_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k.startsWith('tt-static-') && k !== STATIC_CACHE) ? caches.delete(k) : null));
  })());
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 1) HTML navigations → network first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put('./index.html', net.clone());
        return net;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match('./index.html')) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // 2) JS & CSS → network first (fixes "stuck old code")
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        if (new URL(req.url).origin === location.origin) cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // 3) Everything else → cache first
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      if (new URL(req.url).origin === location.origin) cache.put(req, net.clone());
      return net;
    } catch {
      return cached || Response.error();
    }
  })());
});

// Keep your existing notificationclick handler if you had one:
self.addEventListener('notificationclick', event => {
  const { action } = event;
  const data = event.notification.data || {};
  event.notification.close();

  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let client = clientsArr.find(c => 'focus' in c) || null;
    if (client) await client.focus();
    else client = await self.clients.openWindow('./');
    if (client) client.postMessage({ type: action ? 'CONTINUE_COUNTUP' : 'NOTIFICATION_CLICK', data });
  })());
});

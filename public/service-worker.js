const CACHE_NAME = 'edutrack-shell-v1';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/experience.css',
  '/app.js',
  '/experience.js',
  '/routine-ui.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/edutrack-icon.svg',
  '/icons/edutrack-180.png',
  '/icons/edutrack-192.png',
  '/icons/edutrack-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('edutrack-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || caches.match('/index.html')));
    return;
  }

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) await caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error('This Edutrack asset is not available offline.');
      }
    })());
  }
});

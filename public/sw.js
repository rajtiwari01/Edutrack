const CACHE_NAME = 'edutrack-shell-v6';
const SHELL_ASSETS = [
  '/',
  '/styles.css',
  '/app.js',
  '/notifications.js',
  '/pwa.js',
  '/roles.js',
  '/vendor/qrcode-generator.js',
  '/vendor/jsQR.js',
  '/manifest.webmanifest',
  '/icons/edutrack-icon.svg',
  '/icons/edutrack-icon-192.png',
  '/icons/edutrack-icon-512.png',
  '/offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('edutrack-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    })));
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { title: 'Edutrack update', body: event.data?.text() || '' }; }
  const title = String(payload.title || 'Edutrack update').slice(0, 120);
  const body = String(payload.body || 'There is a new college update.').slice(0, 240);
  const tag = String(payload.tag || 'edutrack-update').slice(0, 120);
  let target = '/';
  try { const url = new URL(payload.url || '/', self.location.origin); if (url.origin === self.location.origin) target = url.pathname + url.search + url.hash; } catch { /* Keep the same-origin app home. */ }
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/edutrack-icon-192.png',
    badge: '/icons/edutrack-icon-192.png',
    tag,
    renotify: false,
    data: { url: target }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  const sameOriginUrl = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) return client.navigate(sameOriginUrl);
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(sameOriginUrl);
  }));
});

// Cache-first shell, network-first data, so the app opens fast and works offline.
const VERSION = 'pt-v2';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/core.js', 'js/states.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const networkFirst = url.pathname.includes('/data/');
  e.respondWith(networkFirst
    ? fetch(e.request).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request))
    : caches.match(e.request).then((m) => m || fetch(e.request)));
});

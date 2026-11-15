/* Seeti service worker — generated at build time. */
const VERSION = '__VERSION__';
const APP_CACHE = `seeti-app-${VERSION}`;
const MODEL_CACHE = 'seeti-model-v1';
const PRECACHE = __PRECACHE__;

// Hosts that serve the YAMNet model files (TF Hub redirects to Kaggle / Google Storage).
const MODEL_HOSTS = ['tfhub.dev', 'www.kaggle.com', 'kaggle.com', 'storage.googleapis.com', 'www.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('seeti-app-') && k !== APP_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App shell: network first for pages, fall back to cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        caches.open(APP_CACHE).then((c) => c.put('/', res.clone()));
        return res;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, APP_CACHE));
    return;
  }

  if (MODEL_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h)) || url.hostname.endsWith('kaggleusercontent.com')) {
    event.respondWith(cacheFirst(req, MODEL_CACHE));
  }
});

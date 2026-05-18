const CACHE_NAME = 'deco-quiz-v1';
const FILES_TO_CACHE = [
  './index.html',
  './style.css',
  './app.js',
  './questions.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      if (response) return response;
      // For navigation requests, fallback to cached index.html
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return fetch(e.request);
    })
  );
});

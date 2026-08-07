const CACHE_NAME = 'eqs-consulta-v8';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './chamados.csv',
    './manifest.json',
    './logo-eqs.webp',
    './logo-eqs-dark.png',
    './fonts/archivo-latin-wght-normal.woff2',
    './fonts/barlow-latin-400-normal.woff2',
    './fonts/barlow-latin-500-normal.woff2',
    './fonts/barlow-latin-600-normal.woff2',
    './fonts/barlow-latin-700-normal.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname.endsWith('/chamados.csv') || url.pathname.endsWith('/app.js')) {
        event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
        }))
    );
});

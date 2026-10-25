const CACHE_NAME = 'eqs-consulta-v37';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './supabase-config.js',
    './manifest.json',
    './logo-eqs.webp',
    './logo-eqs-dark.png',
    './claro-logo.png',
    './assets/github.svg',
    './assets/linkedin.svg',
    './assets/hero-telecom-access.png',
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
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;
    if (url.pathname.endsWith('/chamados.csv')) {
        event.respondWith(fetch(event.request, { cache: 'no-store' }));
        return;
    }
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.css')) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).then(async (response) => {
                if (response.ok) {
                    const clone = response.clone();
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(event.request, clone);
                }
                return response;
            }).catch(() => caches.match(event.request, { ignoreSearch: true }))
        );
        return;
    }
    if (url.pathname.endsWith('/app.js') || url.pathname.endsWith('/supabase-config.js')) {
        event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request, { ignoreSearch: true })));
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

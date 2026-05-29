const CACHE_NAME = 'eqs-consulta-v5';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './app.js',
    './detail.html',
    './detail.css',
    './detail.js',
    './fundo.webp',
    './logo-eqs.webp',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@500;700;800&display=swap'
];

// Instalar: cacheia assets estáticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Ativar: limpa caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network first para dados, Cache first para assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Requisições para Google Sheets ou proxies: sempre network
    if (url.href.includes('docs.google.com') || url.href.includes('corsproxy.io') || url.href.includes('allorigins.win')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Assets estáticos: cache first, fallback to network
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                // Cache new assets dynamically
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});

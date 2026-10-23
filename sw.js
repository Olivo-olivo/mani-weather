'use strict';
const CACHE = 'mani-weather-shell-v34';
const ASSETS = ['./', './index.html', './style.css?v=28', './app.js?v=29', './moon.js?v=1', './vendor/astronomy-2.1.19.min.js', './pwa.js?v=3', './manifest.webmanifest', './icon.svg', './night-partly-cloudy.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mani-weather-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Forecasts and radar bypass this cache; the app dates its saved forecast explicitly.
  const navigation = request.mode === 'navigate';
  if (!navigation && !assetURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response.ok) return response;
      throw new Error('App resource unavailable');
    } catch (_) {
      const saved = await cache.match(request) || (navigation && await cache.match(new URL('./index.html', scope).href));
      return saved || new Response('Mani Weather is unavailable offline. Reconnect and try again.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } finally { clearTimeout(timer); }
  })());
});


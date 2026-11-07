// Service worker: la app abre sin conexión. Primero intenta la red (así las versiones nuevas llegan solas) y, si falla, usa lo guardado.
const CACHE = 'pomodoro-v1';
const BASE = ['./', 'index.html', 'agenda.js', 'agenda.css', 'acuarela.css', 'nube.js', 'manifest.webmanifest', 'img/app/icono-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Drive, Google y Spotify van directo a la red
  const esImagen = url.pathname.includes('/img/');
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (esImagen) {
      const guardada = await cache.match(req);
      if (guardada) return guardada;
    }
    try {
      const r = await fetch(req);
      if (r && r.ok) cache.put(req, r.clone());
      return r;
    } catch {
      const g = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
      if (g) return g;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      return Response.error();
    }
  })());
});

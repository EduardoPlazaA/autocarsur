/*
 * AutoCarSur · service worker (iPhone, Mac y Android; app agregada al inicio o en el navegador).
 * Página (HTML): pide SIEMPRE primero la versión publicada; si no responde en 3 s (mala señal o sin internet) abre la guardada.
 *   Así cada publicación se ve en la apertura siguiente, aunque la app nunca se haya cerrado del todo.
 * Íconos y manifiesto: lo guardado al instante y la versión publicada en segundo plano.
 * Librerías de cdnjs (versión fija en la dirección): se guardan una vez.
 * Las consultas a Apps Script (POST) y todo lo de Google nunca pasan por aquí: los datos siempre vienen del servidor.
 */
const CACHE = 'acs-v2'; // subir el número al cambiar este archivo de forma importante
const BASE = ['./', './index.html', './dashboard.html', './manifest.webmanifest', './logo.jpg', './apple-touch-icon.png', './icono-192.png', './icono-512.png'];
const ESPERA_RED_MS = 3000;

self.addEventListener('install', e => {
  // cache: 'reload' = directo de GitHub, sin pasar por la caché del navegador (que guarda hasta 10 min)
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const viejas = (await caches.keys()).filter(k => k !== CACHE);
    await Promise.all(viejas.map(k => caches.delete(k)));
    await self.clients.claim();
    // Venía de la versión anterior (que podía mostrar una pantalla vieja): recarga una vez las ventanas abiertas
    if (viejas.length) (await self.clients.matchAll({ type: 'window' })).forEach(c => { try { c.navigate(c.url); } catch (x) {} });
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const propio = url.origin === self.location.origin, cdn = url.hostname === 'cdnjs.cloudflare.com';
  if (!propio && !cdn) return; // Apps Script, Google y el resto: directo a la red

  if (cdn) {
    e.respondWith(caches.open(CACHE).then(c => c.match(r).then(m => m || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }))));
    return;
  }

  const clave = url.origin + url.pathname; // sin ?parámetros
  const traer = c => fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }))
    .then(res => { if (res.ok && res.type === 'basic') c.put(clave, res.clone()); return res; });

  if (r.mode === 'navigate' || /\.html$|\/$/.test(url.pathname)) { // la página: primero la red
    e.respondWith(caches.open(CACHE).then(async c => {
      const red = traer(c);
      e.waitUntil(red.catch(() => {}));
      const plazo = new Promise(ok => setTimeout(() => ok(null), ESPERA_RED_MS));
      const res = await Promise.race([red.catch(() => null), plazo]);
      if (res) return res;
      return (await c.match(clave)) || red; // sin red a tiempo: la guardada; si no hay guardada, se espera la red
    }));
    return;
  }

  e.respondWith(caches.open(CACHE).then(async c => { // íconos y manifiesto
    const guardada = await c.match(clave), red = traer(c).catch(() => guardada || Response.error());
    if (guardada) { e.waitUntil(red); return guardada; }
    return red;
  }));
});

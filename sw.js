/*
 * AutoCarSur · service worker (iPhone y Android, app agregada al inicio o en el navegador).
 * Abre la app al instante con la pantalla guardada en el teléfono y, en paralelo, trae la versión publicada:
 * si cambió, la guarda para la próxima apertura y avisa a la página (que se recarga sola si recién se abrió).
 * Solo guarda archivos de la página (HTML, íconos, librerías de cdnjs). Las consultas a Apps Script (POST)
 * y todo lo de Google nunca pasan por aquí: los datos siempre vienen del servidor.
 */
const CACHE = 'acs-v1'; // subir el número solo si cambia la lista BASE
const BASE = ['./', './index.html', './dashboard.html', './manifest.webmanifest', './logo.jpg', './apple-touch-icon.png', './icono-192.png', './icono-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const avisar = () => self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage('acs-nueva-version')));

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const propio = url.origin === self.location.origin, cdn = url.hostname === 'cdnjs.cloudflare.com';
  if (!propio && !cdn) return; // Apps Script, Google y el resto: directo a la red

  if (cdn) { // librerías con versión fija en la dirección: si ya está guardada, no se vuelve a bajar
    e.respondWith(caches.open(CACHE).then(c => c.match(r).then(m => m || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }))));
    return;
  }

  // Página e íconos: lo guardado al instante + la versión publicada en segundo plano
  e.respondWith(caches.open(CACHE).then(async c => {
    const clave = url.origin + url.pathname; // sin ?parámetros
    const guardada = await c.match(clave);
    // Petición nueva (una de navegación no admite opciones extra): pregunta siempre al servidor si hay versión nueva
    const red = fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' })).then(async res => {
      if (res.ok && res.type === 'basic') {
        const cambio = r.mode === 'navigate' && guardada && (await guardada.clone().text()) !== (await res.clone().text());
        await c.put(clave, res.clone());
        if (cambio) avisar();
      }
      return res;
    }).catch(() => guardada || Response.error());
    if (guardada) { e.waitUntil(red); return guardada; }
    return red;
  }));
});

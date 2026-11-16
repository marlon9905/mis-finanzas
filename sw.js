// Mis Finanzas: guarda la app en el iPhone para que abra sin internet.
// Sube VERSION cada vez que cambies archivos para que el teléfono tome la nueva versión.
const VERSION = 'v6';
importScripts('reminders.js');

const SHELL = 'finanzas-shell-' + VERSION;
const FONTS = 'finanzas-fonts';
const FILES = ['./', 'index.html', 'reminders.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('finanzas-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Tipografías de Google: se guardan la primera vez y luego salen del teléfono.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(c => c.match(req).then(hit => {
        const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
        return hit || net;
      }))
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // La página: primero la red (para recibir actualizaciones), si no hay internet la copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put('index.html', copy)); }
        return res;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }
  // Lo demás: copia guardada, y si no existe, la red.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

// Aviso diario: el servidor solo manda un "toque" vacío; el mensaje se arma aquí
// con el resumen que la app dejó guardado en el teléfono.
self.addEventListener('push', e => {
  e.waitUntil(
    remLoad().then(snap => {
      const b = remBrief(snap, new Date());
      return self.registration.showNotification(b.title, { body: b.body, icon: 'icons/icon-192.png', tag: 'finanzas-diario' });
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});

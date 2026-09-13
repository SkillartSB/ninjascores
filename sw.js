/* Service worker NinjaScores — minimal et sûr.
   Objectif : rendre l'app installable (TWA / PWA) et offrir un repli hors-ligne.
   Stratégie : network-first pour les navigations ; on ne met JAMAIS en cache
   les appels API (données live) — uniquement la coquille (shell) statique. */

const CACHE = 'ns-shell-v2';
const SHELL = [
  '/offline.html',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigations (ouverture d'une page) : réseau d'abord, repli hors-ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Icônes / favicon du shell : cache d'abord (rapide, stable).
  const url = new URL(req.url);
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req))
    );
  }
  // Tout le reste (JS, données API, images distantes) : pass-through réseau.
});

// Notifications en direct (voir api/push-goals.js). Payload JSON envoyé par web-push :
// {title, body, fixtureId, url, tag}. Un tag par événement (but à tel score, mi-temps,
// fin) : un nouveau but ne remplace plus la notification du but précédent.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'NinjaScores';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || (data.fixtureId ? 'ns-' + data.fixtureId : undefined),
      renotify: true,
      data: { fixtureId: data.fixtureId || null, url: data.url || '/' },
    })
  );
});

// Appui sur la notification : ouvre la fiche du match (dans l'onglet existant s'il y en a un).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w)).catch(() => (clients.openWindow ? clients.openWindow(url) : null));
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

const CACHE_NAME = 'talenco-v3';
const PRECACHE = ['/'];

// ── Install : précache minimal ──
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

// ── Activate : supprimer les anciens caches ──
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ),
  );
  self.clients.claim();
});

// ── Fetch : network-first, fallback cache ──
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});

// ── Push : afficher la notification ──
self.addEventListener('push', (e) => {
  let data = {
    title: 'Talenco 🇧🇯',
    body: 'Une nouvelle offre correspond à vos alertes !',
    url: '/',
  };

  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch { /* payload non-JSON ignoré */ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      vibrate: [200, 100, 200],
      tag: 'nouvelle-offre',
      renotify: true,
      data: { url: data.url },
      actions: [
        { action: 'voir', title: "Voir l'offre" },
        { action: 'ignorer', title: 'Ignorer' },
      ],
    }),
  );
});

// ── Notification click : ouvrir l'offre ──
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'ignorer') return;

  const url = e.notification.data?.url || '/';

  e.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(url) && 'focus' in client) return client.focus();
        }
        return clients.openWindow(url);
      }),
  );
});

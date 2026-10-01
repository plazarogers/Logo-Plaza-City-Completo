/* Service worker: notificaciones push + caché mínima del "cascarón" de la app. */
const CACHE = 'pcb-v4';
const SHELL = ['./', 'index.html', 'css/theme.css', 'css/app.css', 'js/app.js', 'js/i18n.js', 'js/api.js', 'icons/logo.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Red primero para todo; la caché solo sirve si no hay conexión. La API nunca se cachea.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('api.php')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && SHELL.some((p) => url.pathname.endsWith(p.replace('./', '/')) || url.pathname.endsWith('/' + p))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Plaza City', body: '', url: '#/', tag: undefined };
  try { data = { ...data, ...event.data.json() }; } catch { data.body = event.data ? event.data.text() : ''; }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icons/logo-192.png',
    badge: 'icons/badge-72.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '#/', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.registration.pushManager.subscribe(event.oldSubscription.options).then((sub) =>
    fetch('api.php?r=push/subscribe', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'X-Requested-With': 'plaza-booking' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })));
});

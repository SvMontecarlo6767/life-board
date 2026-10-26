/* Life Board – Service Worker. Zweck: App-Start auch bei schlechtem Netz.
   Strategie: Netz zuerst (damit Änderungen sofort ankommen), nur bei Fehler/Offline der zuletzt gespeicherte Stand.
   Gecacht wird nur die eigene Seite (HTML, Skripte, Styles, Icons) – nie Firebase, den Worker oder andere Anbieter. */
const CACHE = 'lb-shell-v11';
const SHELL = ['index.html', 'recovery.html', 'learn.html', 'puzzle.html', 'training.html', 'calendar.html', 'checkin.html', 'muster.html', 'news.html', 'journal-core.js', 'insights-core.js', 'theme.css', 'theme.js', 'fb.js', 'day.js', 'heute-labels.json', 'bg3d.js', 'hud-viz.js', 'learn-core.js', 'whoop-row.js', 'whoop-cache.js', 'push-client.js', 'sleep-lever.js', 'graph-stats.js', 'graph-full.js', 'sleep-card.js', 'calendar-core.js', 'calendar-store.js', 'training-core.js', 'training-text.js', 'training-viz.js', 'training-gym.js', 'training-multi.js', 'training.js', 'vendor/three.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
const SDK = /^https:\/\/www\.gstatic\.com\/firebasejs\//; // Firebase-Bibliothek: nötig, damit die Seiten offline überhaupt starten
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting())) });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin !== location.origin && !SDK.test(r.url)) return;
  if (u.origin === location.origin && !/\.(html|js|css|png|webmanifest|json)$/.test(u.pathname) && !u.pathname.endsWith('/')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(r);
      if (res && res.ok) c.put(r, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await c.match(r, { ignoreSearch: false }) || await c.match(r, { ignoreSearch: true });
      if (hit) return hit;
      if (r.mode === 'navigate') { const idx = await c.match('index.html'); if (idx) return idx }
      throw err;
    }
  })());
});
/* Benachrichtigungen vom Worker (Web Push): anzeigen und beim Antippen das Board öffnen */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {} } catch (x) { d = { title: 'Life Board', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Life Board', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || undefined, data: { url: d.url || 'checkin.html' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'checkin.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => x.url.startsWith(self.registration.scope)); if (c) { c.navigate(url).catch(() => {}); return c.focus() } return self.clients.openWindow(url) }));
});

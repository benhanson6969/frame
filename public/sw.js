// Frame service worker — shows call alerts on PC and phone, even when the
// Frame tab is in the background or closed. It caches nothing.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const kindOf = d => (d && d.video ? 'video' : 'voice');

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  event.waitUntil((async () => {
    // If Frame is open and visible on this device, the page rings by itself.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.some(w => w.visibilityState === 'visible');
    if (d.type === 'call') {
      if (visible) return;
      await self.registration.showNotification(`${d.from || 'Someone'} is calling you`, {
        body: `Incoming ${kindOf(d)} call on Frame · tap to answer`,
        tag: d.tag || 'frame-call', renotify: true, requireInteraction: true,
        icon: '/icon-192.png', badge: '/favicon-48.png',
        vibrate: [400, 200, 400, 200, 400, 200, 400],
        data: { url: '/?call=' + encodeURIComponent(d.code || '') },
        actions: [{ action: 'answer', title: 'Answer' }, { action: 'dismiss', title: 'Dismiss' }]
      });
    } else if (d.type === 'missed') {
      if (visible) return;
      await self.registration.showNotification('Missed call', {
        body: `${d.from || 'Someone'} tried to reach you (${kindOf(d)} call)`,
        tag: d.tag || 'frame-call', renotify: false,
        icon: '/icon-192.png', badge: '/favicon-48.png',
        data: { url: '/?chat=' + encodeURIComponent(d.code || '') }
      });
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        try { await w.focus(); } catch (e) {}
        w.postMessage({ frame: 'open', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

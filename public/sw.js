// Service Worker para Avisos ESJF
const CACHE_NAME = 'avisos-esjf-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Manipula cliques nas notificações
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Web Push - recebe do servidor (VAPID) mesmo com a aba fechada
self.addEventListener('push', (event) => {
  if (!event.data) {
    event.waitUntil(self.registration.showNotification('Novo Aviso ESJF 🔔', {
      body: 'Há um novo aviso disponível na ESJF.',
      icon: 'https://avisos-esjf.vercel.app/icon-192.png',
      badge: 'https://avisos-esjf.vercel.app/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: '/' }
    }));
    return;
  }

  try {
    let data;
    try { data = event.data.json(); } catch { data = { body: event.data.text() }; }
    const title = data.title || 'Novo Aviso ESJF 🔔';
    const options = {
      body: data.body || 'Há um novo aviso disponível.',
      icon: data.icon || 'https://avisos-esjf.vercel.app/icon-192.png',
      badge: data.badge || 'https://avisos-esjf.vercel.app/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      tag: 'avisos-esjf'
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Erro ao processar notificação push:', e);
  }
});

// Service worker do Firebase Cloud Messaging: mostra a notificação do alarme
// de agendamento quando o app está em segundo plano ou fechado.
// As chaves abaixo são públicas (mesmas NEXT_PUBLIC_FIREBASE_* já expostas no
// bundle do cliente) — não são segredo.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDa92YDLvsFQ7OP-9OAIUJiblL2ROUAI4o",
  authDomain: "studio-1937074168-6d495.firebaseapp.com",
  projectId: "studio-1937074168-6d495",
  storageBucket: "studio-1937074168-6d495.firebasestorage.app",
  messagingSenderId: "683856797459",
  appId: "1:683856797459:web:c9e4461dbeb37ebd5b84e6",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Lembrete de Agendamento';
  const body = payload.notification?.body || '';
  const link = payload.fcmOptions?.link || payload.data?.link || '/agenda';

  self.registration.showNotification(title, {
    body,
    icon: '/fiscal_x_hq.png',
    badge: '/fiscal_x_hq.png',
    data: { link },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/agenda';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(link) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});

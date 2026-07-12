'use client';

import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import app, { db } from '@/lib/firebase';

let messagingInstance: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (!(await isSupported())) return null;
  if (!messagingInstance) messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * Pede permissão de notificação, registra o service worker de push e salva o
 * token deste dispositivo no perfil do fiscal (users/{uid}.fcmTokens).
 */
export async function ativarAlertasNesteDispositivo(uid: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return { ok: false, error: 'Este navegador não suporta notificações push.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'Permissão de notificação negada.' };
    }

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, error: 'Push não suportado neste navegador.' };

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return { ok: false, error: 'Chave VAPID não configurada no servidor.' };

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, error: 'Não foi possível gerar o token de notificação.' };

    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro ao ativar alertas.' };
  }
}

/**
 * Escuta alarmes recebidos com o app em primeiro plano (aba aberta). Com o app
 * em segundo plano/fechado, quem mostra a notificação é o service worker.
 */
export async function escutarAlertasEmPrimeiroPlano(
  callback: (payload: { title?: string; body?: string }) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback({ title: payload.notification?.title, body: payload.notification?.body });
  });
}

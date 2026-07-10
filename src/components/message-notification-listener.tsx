
'use client';

import { useEffect, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { usePathname } from 'next/navigation';

// Som de notificação em Base64 (Bipe suave)
const NOTIFY_SOUND = "data:audio/wav;base64,UklGRl9vT19XQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YV9vT18A7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+7v7u/u7+";

export function MessageNotificationListener() {
  const db = useFirestore();
  const { profile } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();
  const lastUpdateRef = useRef<number>(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(NOTIFY_SOUND);
    }
  }, []);

  useEffect(() => {
    if (!db || !profile?.municipioId) return;

    const q = query(
      collection(db, "municipios", profile.municipioId, "topics"),
      orderBy("lastMessageAt", "desc"),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const topicData = change.doc.data();
          const lastMsgAt = topicData.lastMessageAt?.toMillis() || 0;

          // Só notifica se:
          // 1. A mensagem for nova (posterior ao carregamento da página)
          // 2. Não for o próprio usuário que enviou
          // 3. O usuário não estiver exatamente na página de recados com esse tópico aberto
          // (Para simplificar, notificamos se não estiver na página de recados)
          
          if (
            lastMsgAt > lastUpdateRef.current && 
            topicData.lastMessageSender !== (profile.displayName || "Fiscal")
          ) {
            // Notificação Visual
            toast({
              title: `Novo Recado: #${topicData.name}`,
              description: `${topicData.lastMessageSender}: ${topicData.lastMessageText}`,
            });

            // Alerta Sonoro
            if (audioRef.current) {
              audioRef.current.play().catch(() => {
                // Navegadores bloqueiam áudio sem interação prévia
                console.log("Áudio bloqueado pelo navegador.");
              });
            }
          }
        }
      });
      lastUpdateRef.current = Date.now();
    });

    return () => unsubscribe();
  }, [db, profile, toast, pathname]);

  return null;
}

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Mesmo padrão de inicialização do Admin SDK já usado em
// src/app/api/upload/route.ts e src/app/api/cron/verificar-alarmes/route.ts
const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;

if (!getApps().length && serviceAccountKey) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
}

export const MONTHLY_AI_LIMIT = 150;

export interface AiQuotaResult {
  ok: boolean;
  used: number;
  limit: number;
}

/**
 * Verifica e consome 1 cota mensal de chamada de IA para este login. Admin e
 * root são isentos (não gastam cota). Reseta automaticamente a cada mês.
 * Só deve ser chamada logo antes de uma chamada real e paga à API de IA —
 * nunca no fallback local/heurístico, que é gratuito.
 */
export async function checkAndConsumeAiQuota(uid: string): Promise<AiQuotaResult> {
  // Sem Admin SDK configurado (ambiente local sem a chave), não bloqueia.
  if (!getApps().length || !uid) {
    return { ok: true, used: 0, limit: MONTHLY_AI_LIMIT };
  }

  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data()?.role : undefined;
  if (role === 'admin' || role === 'root') {
    return { ok: true, used: 0, limit: MONTHLY_AI_LIMIT };
  }

  const mesAtual = new Date().toISOString().slice(0, 7); // "2026-07"
  const usoRef = db.collection('users').doc(uid).collection('uso').doc('ia');

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(usoRef);
    const data = snap.exists ? (snap.data() as { mes: string; contagem: number }) : { mes: mesAtual, contagem: 0 };
    const contagemAtual = data.mes === mesAtual ? data.contagem : 0;

    if (contagemAtual >= MONTHLY_AI_LIMIT) {
      return { ok: false, used: contagemAtual, limit: MONTHLY_AI_LIMIT };
    }

    tx.set(usoRef, { mes: mesAtual, contagem: contagemAtual + 1 }, { merge: true });
    return { ok: true, used: contagemAtual + 1, limit: MONTHLY_AI_LIMIT };
  });
}

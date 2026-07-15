import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeText } from './text-normalize';

const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;
if (!getApps().length && serviceAccountKey) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
}

/** Similaridade simples por sobreposição de palavras (Jaccard sobre o menor
 * conjunto) — suficiente pra achar "o exemplo mais parecido" num corpus
 * pequeno por município, sem precisar de embeddings/infra extra. */
function similarity(a: string, b: string): number {
  const wordsOf = (t: string) => new Set(normalizeText(t).split(/\s+/).filter((w) => w.length > 3));
  const wordsA = wordsOf(a);
  const wordsB = wordsOf(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  for (const w of wordsA) if (wordsB.has(w)) common++;
  return common / Math.min(wordsA.size, wordsB.size);
}

interface ExemploEncontrado {
  caseDescription: string;
  draftGerado: string;
  reportType: string;
}

/**
 * Busca, entre os rascunhos que o próprio fiscal já exportou antes (ver
 * src/lib/fiscal-ai-exemplos.ts), o mais parecido com o caso atual — usado
 * como referência de estilo no prompt da Claude. Roda no servidor via Admin
 * SDK (o fluxo de geração é uma Server Action, sem sessão de usuário
 * autenticada no SDK cliente do Firestore).
 */
export async function buscarMelhorExemplo(caseDescription: string, uid: string): Promise<ExemploEncontrado | null> {
  if (!getApps().length || !uid) return null;

  try {
    const db = getFirestore();
    const userSnap = await db.collection('users').doc(uid).get();
    const municipioId = userSnap.exists ? userSnap.data()?.municipioId : null;
    if (!municipioId) return null;

    const snap = await db.collection('fiscalAiExemplos').where('municipioId', '==', municipioId).limit(200).get();

    let melhor: { score: number; exemplo: ExemploEncontrado } | null = null;
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const score = similarity(caseDescription, data.caseDescription || '');
      if (score >= 0.3 && (!melhor || score > melhor.score)) {
        melhor = { score, exemplo: { caseDescription: data.caseDescription, draftGerado: data.draftGerado, reportType: data.reportType } };
      }
    });

    return melhor ? (melhor as { score: number; exemplo: ExemploEncontrado }).exemplo : null;
  } catch (e) {
    console.warn('Falha ao buscar exemplo de rascunho anterior:', e);
    return null;
  }
}

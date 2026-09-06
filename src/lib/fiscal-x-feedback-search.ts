import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { jaccardSimilarity } from './text-similarity';

const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_PRIVATE_KEY_JSON;
if (!getApps().length && serviceAccountKey) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)), storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
}

export interface CitacaoFiscalX {
  id: string;
  label: string;
  lawTitle: string;
  texto: string;
}

export interface PerguntaAnteriorSimilar {
  pergunta: string;
  resposta: string;
}

/**
 * "Aprender com o uso" aqui não é treinar o modelo (a API da Claude não
 * permite isso) — é buscar, entre as perguntas anteriores que os PRÓPRIOS
 * fiscais avaliaram com 👍, a mais parecida com a pergunta atual, e passá-la
 * como referência de estilo/tom pro prompt (ver ask-fiscal-x.ts). Nunca
 * aprende de respostas com 👎 nem sem avaliação — só do que já foi
 * confirmado como uma boa resposta por quem usa no campo. Mesmo padrão já
 * usado pros rascunhos de autuação em draft-examples-search.ts.
 */
export async function buscarPerguntaSimilarBemAvaliada(
  pergunta: string,
  municipioId: string | null
): Promise<PerguntaAnteriorSimilar | null> {
  if (!getApps().length) return null;

  try {
    const db = getFirestore();
    const snap = await db.collection('fiscalXPerguntas').where('feedback', '==', 'like').limit(200).get();

    let melhor: { score: number; item: PerguntaAnteriorSimilar } | null = null;
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      // Pergunta amarrada a um município só ensina outro fiscal do MESMO
      // município (pode envolver lei municipal específica); sem município
      // (dúvida de âmbito estadual/federal) vale de referência pra qualquer um.
      if (data.municipioId && data.municipioId !== municipioId) return;
      const score = jaccardSimilarity(pergunta, data.pergunta || '');
      if (score >= 0.3 && (!melhor || score > melhor.score)) {
        melhor = { score, item: { pergunta: data.pergunta, resposta: data.resposta } };
      }
    });

    return melhor ? (melhor as { score: number; item: PerguntaAnteriorSimilar }).item : null;
  } catch (e) {
    console.warn('Falha ao buscar pergunta similar bem avaliada:', e);
    return null;
  }
}

/** Grava a pergunta/resposta pra: (1) alimentar o aprendizado acima no
 * futuro, e (2) dar um id pros botões de 👍/👎 atualizarem depois. */
export async function salvarPerguntaFiscalX(data: {
  uid: string;
  municipioId: string | null;
  pergunta: string;
  resposta: string;
  citacoes: CitacaoFiscalX[];
}): Promise<string | null> {
  if (!getApps().length) return null;
  try {
    const db = getFirestore();
    const ref = await db.collection('fiscalXPerguntas').add({
      ...data,
      feedback: null,
      createdAt: new Date().toISOString(),
    });
    return ref.id;
  } catch (e) {
    console.warn('Falha ao salvar pergunta do Fiscal-X:', e);
    return null;
  }
}

export async function registrarFeedbackFiscalX(perguntaId: string, feedback: 'like' | 'dislike'): Promise<boolean> {
  if (!getApps().length || !perguntaId) return false;
  try {
    const db = getFirestore();
    await db.collection('fiscalXPerguntas').doc(perguntaId).update({ feedback });
    return true;
  } catch (e) {
    console.warn('Falha ao registrar feedback do Fiscal-X:', e);
    return false;
  }
}

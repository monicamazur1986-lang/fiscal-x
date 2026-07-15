import { doc, getDoc, getDocs, collection, query, where, limit, documentId } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase/init';
import { normalizeText, onlyDigits } from './text-normalize';
import type { AnvisaDataset } from './anvisa-datasets';

export const MAX_RESULTS = 50;

export interface AnvisaSyncMeta {
  lastSyncAt?: string;
  totalRows?: number;
  written?: number;
  skipped?: number;
  durationMs?: number;
}

function getDb() {
  const { db } = initializeFirebase();
  if (!db) throw new Error('Firebase não configurado.');
  return db;
}

/**
 * Busca no índice pré-sincronizado (ver src/lib/anvisa-sync.ts), em vez de ler
 * um CSV local — instantâneo, mas só retorna resultados depois que o cron
 * de sincronização já rodou pelo menos uma vez para este dataset.
 */
export async function searchAnvisaIndex(
  dataset: AnvisaDataset,
  rawQuery: string
): Promise<Record<string, string>[]> {
  const db = getDb();
  const registrosRef = collection(db, 'anvisaIndex', dataset.key, 'registros');
  const digits = onlyDigits(rawQuery);

  if (digits.length >= 6) {
    if (dataset.key === 'empresas') {
      // O CNPJ é o próprio ID do documento nesse dataset: tenta o ponto exato
      // primeiro (mais barato) e só cai pra busca por prefixo se não achar.
      const direct = await getDoc(doc(registrosRef, digits));
      if (direct.exists()) return [direct.data() as Record<string, string>];

      const prefixQuery = query(
        registrosRef,
        where(documentId(), '>=', digits),
        where(documentId(), '<', digits + ''),
        limit(MAX_RESULTS)
      );
      const snap = await getDocs(prefixQuery);
      return snap.docs.map((d) => d.data() as Record<string, string>);
    }

    const cnpjQuery = query(registrosRef, where('searchCnpj', '==', digits), limit(MAX_RESULTS));
    const snap = await getDocs(cnpjQuery);
    return snap.docs.map((d) => d.data() as Record<string, string>);
  }

  const normalized = normalizeText(rawQuery.trim());
  if (!normalized) return [];

  const nameQuery = query(
    registrosRef,
    where('searchName', '>=', normalized),
    where('searchName', '<=', normalized + ''),
    limit(MAX_RESULTS)
  );
  const snap = await getDocs(nameQuery);
  return snap.docs.map((d) => d.data() as Record<string, string>);
}

/** Lê os metadados da última sincronização (data, contagens) para exibir na tela. */
export async function getAnvisaSyncMeta(datasetKey: string): Promise<AnvisaSyncMeta | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, 'anvisaIndex', datasetKey));
  return snap.exists() ? (snap.data() as AnvisaSyncMeta) : null;
}

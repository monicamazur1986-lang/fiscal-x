import { normalizeText } from './text-normalize';

/** Similaridade simples por sobreposição de palavras (Jaccard sobre o menor
 * conjunto) — suficiente pra achar "o exemplo mais parecido" num corpus
 * pequeno por município, sem precisar de embeddings/infra extra. Usada tanto
 * pra rascunhos anteriores (draft-examples-search.ts) quanto para perguntas
 * anteriores do Fiscal-X (fiscal-x-feedback-search.ts). */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsOf = (t: string) => new Set(normalizeText(t).split(/\s+/).filter((w) => w.length > 3));
  const wordsA = wordsOf(a);
  const wordsB = wordsOf(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  for (const w of wordsA) if (wordsB.has(w)) common++;
  return common / Math.min(wordsA.size, wordsB.size);
}

import MiniSearch from 'minisearch';
import legislacaoData from '@/lib/legislacao.json';

export type LawPreference = 'todas' | 'municipal' | 'estadual';

export interface LegalArticle {
  id: string;
  label: string;
  texto: string;
  pena?: string;
  keywords?: string;
  lawKey: string;
  lawTitle: string;
}

interface IndexedArticle extends LegalArticle {
  searchText: string;
}

const allArticles: IndexedArticle[] = [];
Object.entries(legislacaoData).forEach(([lawKey, law]: [string, any]) => {
  law.artigos.forEach((art: any) => {
    allArticles.push({
      id: art.id,
      label: art.label,
      texto: art.texto,
      pena: art.pena,
      keywords: art.keywords,
      lawKey,
      lawTitle: law.titulo,
      // Pena não entra no texto pesquisável: seu vocabulário (advertência,
      // interdição, multa...) se repete em quase todos os artigos e dilui a relevância.
      searchText: `${art.texto} ${art.keywords || ''}`,
    });
  });
});

function normalize(term: string): string {
  return term.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const index = new MiniSearch<IndexedArticle>({
  idField: 'id',
  fields: ['searchText'],
  storeFields: ['id', 'label', 'texto', 'pena', 'keywords', 'lawKey', 'lawTitle'],
  processTerm: (term) => normalize(term),
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: { searchText: 1 },
  },
});
index.addAll(allArticles);

function matchesPreference(lawKey: string, pref: LawPreference): boolean {
  if (pref === 'municipal') return lawKey.includes('MUNICIPAL');
  if (pref === 'estadual') return lawKey.includes('ESTADUAL');
  return true;
}

/**
 * Busca artigos da legislação por relevância (ranking, prefixo e tolerância a erros de digitação),
 * em vez de exigir substring exata como o antigo `.includes()`.
 */
export function searchLegislacao(
  query: string,
  options?: { pref?: LawPreference; limit?: number }
): LegalArticle[] {
  const pref = options?.pref || 'todas';
  const limit = options?.limit ?? 10;

  const results = index.search(query);
  // Corta resultados fracamente relacionados: só mantém o que estiver a pelo
  // menos 50% da pontuação do melhor resultado, evitando citar artigo errado.
  // Vários incisos do Art. 63 repetem o mesmo texto-modelo genérico
  // ("descumprimento de normas legais e regulamentares, medidas, formalidades..."),
  // por isso o corte precisa ser mais rígido do que num corpus pequeno.
  const topScore = results[0]?.score ?? 0;
  const relevant = results.filter(r => r.score >= topScore * 0.5);

  const matched: LegalArticle[] = [];
  for (const r of relevant) {
    const art = allArticles.find(a => a.id === r.id);
    if (!art) continue;
    if (!matchesPreference(art.lawKey, pref)) continue;
    matched.push({
      id: art.id,
      label: art.label,
      texto: art.texto,
      pena: art.pena,
      keywords: art.keywords,
      lawKey: art.lawKey,
      lawTitle: art.lawTitle,
    });
    if (matched.length >= limit) break;
  }
  return matched;
}

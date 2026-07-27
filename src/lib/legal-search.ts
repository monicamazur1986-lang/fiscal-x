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
  /** Só presente em leis municipais — restringe a citação ao município dono
   * da lei, evitando que um fiscal de outro município receba fundamentação
   * do Código de Vigilância de um município que não é o seu. */
  municipioId?: string;
}

interface IndexedArticle extends LegalArticle {
  searchText: string;
}

// Os catálogos gerais de infração (Código Estadual Art. 63 e Código
// Municipal Art. 18) cobrem qualquer tipo de estabelecimento — por isso
// ganham vagas reservadas na busca (ver GENERAL_SLOTS), em vez de competir
// em pé de igualdade com legislação de nicho (farmácia, alimentação...) que
// tende a pontuar mais alto pra casos muito específicos e empurraria pra
// fora do top a infração geral que também se aplica (ex: falta de licença
// sanitária, que vale pra qualquer ramo).
const GENERAL_LAW_KEYS = new Set(['LEI_MUNICIPAL_2276_2017', 'LEI_ESTADUAL_13331_2001']);
const GENERAL_SLOTS = 3;

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
      municipioId: law.municipioId,
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

// Lei sem `municipioId` = nível estadual/federal, vale pra qualquer fiscal.
// Lei com `municipioId` só entra na busca se bater com o município de quem
// está gerando o rascunho — mesmo isolamento por município já aplicado nos
// roteiros (`roteiros/page.tsx`) e nas Storage Rules.
function matchesMunicipio(artMunicipioId: string | undefined, fiscalMunicipioId: string | undefined): boolean {
  if (!artMunicipioId) return true;
  return artMunicipioId === fiscalMunicipioId;
}

/**
 * Busca artigos da legislação por relevância (ranking, prefixo e tolerância a erros de digitação),
 * em vez de exigir substring exata como o antigo `.includes()`.
 */
export function searchLegislacao(
  query: string,
  options?: { pref?: LawPreference; limit?: number; municipioId?: string }
): LegalArticle[] {
  const pref = options?.pref || 'todas';
  const limit = options?.limit ?? 10;
  const municipioId = options?.municipioId;

  const results = index.search(query);

  const general: { art: IndexedArticle; score: number }[] = [];
  const specific: { art: IndexedArticle; score: number }[] = [];

  for (const r of results) {
    const art = allArticles.find(a => a.id === r.id);
    if (!art) continue;
    if (!matchesPreference(art.lawKey, pref)) continue;
    if (!matchesMunicipio(art.municipioId, municipioId)) continue;
    (GENERAL_LAW_KEYS.has(art.lawKey) ? general : specific).push({ art, score: r.score });
  }

  // Corta resultados fracamente relacionados dentro de cada grupo: só mantém
  // o que estiver a pelo menos 50% da pontuação do melhor resultado DAQUELE
  // grupo, evitando citar artigo errado. Vários incisos do Art. 63/Art. 18
  // repetem o mesmo texto-modelo genérico, por isso o corte precisa ser mais
  // rígido do que num corpus pequeno. O corte é por grupo (não global) pra
  // legislação de nicho não ser descartada só por pontuar abaixo do melhor
  // resultado geral, e vice-versa.
  const cut = (list: { art: IndexedArticle; score: number }[]) => {
    const topScore = list[0]?.score ?? 0;
    return list.filter(x => x.score >= topScore * 0.5);
  };

  const generalHits = cut(general).slice(0, GENERAL_SLOTS);
  const specificHits = cut(specific);

  return [...generalHits, ...specificHits].slice(0, limit).map(({ art }) => ({
    id: art.id,
    label: art.label,
    texto: art.texto,
    pena: art.pena,
    keywords: art.keywords,
    lawKey: art.lawKey,
    lawTitle: art.lawTitle,
    municipioId: art.municipioId,
  }));
}

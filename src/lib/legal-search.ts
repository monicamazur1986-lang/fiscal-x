import MiniSearch from 'minisearch';
import legislacaoData from '@/lib/legislacao.json';
import legalCatalog from '@/lib/legal-catalog.json';

export type LawPreference = 'todas' | 'municipal' | 'estadual' | string;
export type LawPreferenceSelection = LawPreference | LawPreference[];

export function normalizeLawPreferenceSelection(pref?: LawPreferenceSelection): LawPreference[] {
  if (!pref) return ['estadual'];
  const values = Array.isArray(pref) ? pref : [pref];
  return values.length ? values : ['estadual'];
}

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
  /** true quando a lei tem `biblioteca` preenchido em legislacao.json — RDC ou
   * resolução setorial (farmácia, alimentos, salão de beleza etc.). Os dois
   * códigos sanitários de base (Lei Estadual nº 13.331/2001 e, só em
   * Prudentópolis, a Lei Municipal nº 2.276/2017) não têm esse campo — é o
   * que os distingue da legislação "de biblioteca", que só deve entrar na
   * fundamentação quando selecionada individualmente (ver matchesPreference). */
  isBiblioteca: boolean;
}

// Os catálogos gerais de infração (Código Estadual Art. 63 e Código
// Municipal Art. 18) cobrem qualquer tipo de estabelecimento — por isso
// ganham vagas reservadas na busca (ver GENERAL_SLOTS), em vez de competir
// em pé de igualdade com legislação de nicho (farmácia, alimentação...) que
// tende a pontuar mais alto pra casos muito específicos e empurraria pra
// fora do top a infração geral que também se aplica (ex: falta de licença
// sanitária, que vale pra qualquer ramo).
export const GENERAL_LAW_KEYS = new Set(['LEI_MUNICIPAL_2276_2017', 'LEI_ESTADUAL_13331_2001']);
export const GENERAL_SLOTS = 3;

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
      isBiblioteca: !!law.biblioteca,
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

// Antes checava se lawKey continha literalmente "MUNICIPAL"/"ESTADUAL" — só a
// LEI_MUNICIPAL_2276_2017 e a LEI_ESTADUAL_13331_2001 batiam com isso. Toda
// legislação de nicho (ODONTOLOGIA, ALIMENTOS, ILPI, SALAO_BELEZA...) nunca
// aparecia quando o fiscal filtrava por "Código Estadual" ou "Código
// Municipal" — só entrava em "Base Integral". A distinção que realmente
// importa já existe por artigo: tem `municipioId` = é lei municipal; não tem
// = é estadual/federal (SESA, ANVISA), vale pra qualquer fiscal do estado.
//
// CORREÇÃO: "estadual" (a opção padrão, sempre presente) precisa significar
// só o Código Sanitário Estadual (Lei 13.331/2001) — não "qualquer lei sem
// município", que também inclui toda RDC/resolução setorial marcada como
// `biblioteca` em legislacao.json (farmácia, salão de beleza, alimentos...).
// Sem essa distinção, deixar a base legal no padrão ("Código Sanitário
// Estadual") já bastava pra misturar fundamentação de qualquer ramo no
// enquadramento — o padrão precisa ser sempre o código de base (estadual ou,
// só em Prudentópolis, o municipal); as leis de biblioteca só entram se
// selecionadas individualmente (`specificLawKeys`), como itens opcionais.
// Assinatura reduzida (não exige o IndexedArticle inteiro) — reaproveitada
// por src/lib/legal-vector-search.ts, cujos chunks (vindos de PDF ou de
// legislacao.json) têm esses 3 campos mas não os demais de IndexedArticle.
export function matchesPreference(art: { lawKey: string; municipioId?: string; isBiblioteca: boolean }, pref: LawPreferenceSelection): boolean {
  const prefs = normalizeLawPreferenceSelection(pref);
  const specificLawKeys = prefs.filter(value => value !== 'todas' && value !== 'municipal' && value !== 'estadual');

  if (prefs.includes('todas')) return true;
  if (specificLawKeys.includes(art.lawKey)) return true;
  if (art.isBiblioteca) return false;

  const isMunicipal = !!art.municipioId;
  const selectedMunicipal = prefs.includes('municipal');
  const selectedEstadual = prefs.includes('estadual');

  if (selectedMunicipal && selectedEstadual) return true;
  if (selectedMunicipal) return isMunicipal;
  if (selectedEstadual) return !isMunicipal;
  return false;
}

export interface ScoredHit<T> {
  item: T;
  score: number;
}

/**
 * Junta os resultados de uma busca (base geral automática + leis específicas
 * escolhidas pelo fiscal) numa lista final equilibrada. Usada tanto por
 * `searchLegislacao` (abaixo) quanto por `searchLegislacaoSemantic`
 * (legal-vector-search.ts) — antes cada uma duplicava sua própria versão do
 * mesmo agrupar+cortar, com risco de uma ficar desatualizada em relação à
 * outra (ver histórico de bugs no comentário de `matchesPreference`).
 *
 * Corrige um bug real: antes, TODA lei específica selecionada (qualquer uma
 * que não seja uma das duas bases gerais) caía num único balaio, cortado
 * pelo topo desse balaio inteiro — se o fiscal selecionasse Resolução + RDC
 * juntas e a Resolução pontuasse mais alto pra aquela consulta, a RDC
 * inteira sumia da fundamentação por não chegar perto da pontuação da
 * Resolução, mesmo tendo sido escolhida também. Agora cada lei específica
 * selecionada tem seu PRÓPRIO corte de relevância (relativo ao topo dela
 * mesma) e uma quantidade mínima garantida de vagas no resultado final —
 * mesma ideia que `GENERAL_SLOTS` já usa pra base geral, estendida a cada
 * lei específica escolhida.
 */
export function pickBalancedHits<T>(
  scored: ScoredHit<T>[],
  opts: {
    lawKeyOf: (item: T) => string;
    generalLawKeys: Set<string>;
    generalSlots: number;
    specificLawKeys: string[];
    minSlotsPerLaw: number;
    relativeCutoff: number;
    /** Só faz sentido pra métricas limitadas e comparáveis entre buscas
     * (ex.: similaridade de cosseno, 0 a 1) — evita que a vaga garantida
     * force a entrada de um trecho realmente sem relação só porque a lei
     * foi selecionada e não tinha nada melhor pra oferecer. */
    absoluteFloor?: number;
    limit: number;
  }
): T[] {
  const passesFloor = (h: ScoredHit<T>) => opts.absoluteFloor === undefined || h.score >= opts.absoluteFloor;
  const sorted = [...scored].sort((a, b) => b.score - a.score);

  const cutRelative = (list: ScoredHit<T>[]) => {
    const top = list[0]?.score ?? 0;
    return list.filter((h) => h.score >= top * opts.relativeCutoff && passesFloor(h));
  };

  const general = sorted.filter((h) => opts.generalLawKeys.has(opts.lawKeyOf(h.item)));
  const generalHits = cutRelative(general).slice(0, opts.generalSlots);

  const specific = sorted.filter((h) => !opts.generalLawKeys.has(opts.lawKeyOf(h.item)));

  // Uma lista por lei específica REALMENTE selecionada — só assim cada uma
  // compete pela própria pontuação, nunca contra o topo de outra lei
  // escolhida junto. Lei selecionada sem nenhum resultado simplesmente não
  // entra (nada pra garantir).
  const perLaw = opts.specificLawKeys
    .map((lawKey) => cutRelative(specific.filter((h) => opts.lawKeyOf(h.item) === lawKey)))
    .filter((list) => list.length > 0);

  // Reserva um mínimo de vagas de CADA lei antes de cortar pelo `limit`
  // total — sem isso, o corte final (por pontuação absoluta) reproduziria o
  // mesmo problema um nível acima, apagando uma lei inteira só por ela
  // pontuar mais baixo que as outras leis selecionadas. Pode fazer o
  // resultado passar um pouco do `limit` nominal quando muitas leis são
  // selecionadas de uma vez — preferível a apagar uma lei escolhida de
  // propósito pelo fiscal.
  const protectedHits: ScoredHit<T>[] = [];
  const leftover: ScoredHit<T>[] = [];
  perLaw.forEach((list) => {
    protectedHits.push(...list.slice(0, opts.minSlotsPerLaw));
    leftover.push(...list.slice(opts.minSlotsPerLaw));
  });

  const remainingBudget = Math.max(0, opts.limit - generalHits.length - protectedHits.length);
  const extra = [...leftover].sort((a, b) => b.score - a.score).slice(0, remainingBudget);

  return [...generalHits, ...protectedHits, ...extra].map((h) => h.item);
}

// Lei sem `municipioId` = nível estadual/federal, vale pra qualquer fiscal.
// Lei com `municipioId` só entra na busca se bater com o município de quem
// está gerando o rascunho — mesmo isolamento por município já aplicado nos
// roteiros (`roteiros/page.tsx`) e nas Storage Rules.
export function matchesMunicipio(artMunicipioId: string | undefined, fiscalMunicipioId: string | undefined): boolean {
  if (!artMunicipioId) return true;
  return artMunicipioId === fiscalMunicipioId;
}

/**
 * Busca artigos da legislação por relevância (ranking, prefixo e tolerância a erros de digitação),
 * em vez de exigir substring exata como o antigo `.includes()`.
 */
export function searchLegislacao(
  query: string,
  options?: { pref?: LawPreferenceSelection; limit?: number; municipioId?: string }
): LegalArticle[] {
  const pref = normalizeLawPreferenceSelection(options?.pref);
  const limit = options?.limit ?? 10;
  const municipioId = options?.municipioId;

  const results = index.search(query);

  const scored: ScoredHit<IndexedArticle>[] = [];
  for (const r of results) {
    const art = allArticles.find(a => a.id === r.id);
    if (!art) continue;
    if (!matchesPreference(art, pref)) continue;
    if (!matchesMunicipio(art.municipioId, municipioId)) continue;
    scored.push({ item: art, score: r.score });
  }

  // "todas" (Todo o banco de dados) precisa tratar CADA lei de biblioteca
  // presente nos resultados como "selecionada" pra pickBalancedHits — sem
  // isso, nenhuma delas tinha uma chave nomeada explicitamente em `pref` e a
  // busca com "todas" passava a não garantir vaga nenhuma pra elas.
  const specificLawKeys = pref.includes('todas')
    ? Array.from(new Set(scored.map((h) => h.item.lawKey).filter((k) => !GENERAL_LAW_KEYS.has(k))))
    : pref.filter((value) => value !== 'todas' && value !== 'municipal' && value !== 'estadual');

  // Corta resultados fracamente relacionados dentro de cada lei: só mantém o
  // que estiver a pelo menos 50% da pontuação do melhor resultado DAQUELA
  // lei, evitando citar artigo errado. Vários incisos do Art. 63/Art. 18
  // repetem o mesmo texto-modelo genérico, por isso o corte precisa ser mais
  // rígido do que num corpus pequeno. Ver pickBalancedHits pra por que o
  // corte é por lei individual, não por um balaio combinado.
  const hits = pickBalancedHits(scored, {
    lawKeyOf: (art) => art.lawKey,
    generalLawKeys: GENERAL_LAW_KEYS,
    generalSlots: GENERAL_SLOTS,
    specificLawKeys,
    minSlotsPerLaw: 2,
    relativeCutoff: 0.5,
    limit,
  });

  return hits.map((art) => ({
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

// ── Opções de base legal para a UI (Fiscal AI) ──────────────────────────
// Centralizado aqui pra que a tela cheia (gerar-rascunho.tsx) e o diálogo
// embutido no formulário de autuação (assistente-ia-form-dialog.tsx) sempre
// ofereçam exatamente as mesmas opções — antes cada um replicava sua própria
// cópia dessas listas e da regra de alternância, com risco real de um ficar
// desatualizado (foi o caso do bug corrigido acima).

export interface LawOption { id: LawPreference; label: string }
export interface IndividualLawOption { id: string; label: string; group: string }

/**
 * Opções do grupo "Geral": o Código Sanitário Estadual é sempre a base
 * (é o valor padrão, `['estadual']`, em normalizeLawPreferenceSelection) e
 * "Todo o banco de dados" sempre aparece. "Código Municipal" só aparece pra
 * quem realmente tem um — hoje só existe legislação municipal cadastrada
 * para Prudentópolis (LEI_MUNICIPAL_2276_2017); mostrar essa opção pra
 * qualquer outro fiscal levava a um resultado sempre vazio (matchesMunicipio
 * já filtra por município), sem nenhuma pista de por quê.
 */
export function getBaseLawOptions(municipioId?: string | null): LawOption[] {
  const options: LawOption[] = [{ id: 'estadual', label: 'Código Sanitário Estadual' }];
  if (municipioId === 'prudentopolis') {
    options.push({ id: 'municipal', label: 'Código Municipal (Prudentópolis)' });
  }
  options.push({ id: 'todas', label: 'Todo o banco de dados' });
  return options;
}

/**
 * Leis "de biblioteca" (RDC/resolução setorial) — sempre opcionais, nunca
 * entram sozinhas com a seleção padrão. Ver `isBiblioteca` acima.
 *
 * Combina duas fontes: as leis cadastradas à mão com artigos avulsos em
 * legislacao.json (sempre existiu) e as leis que só existem como PDF na
 * Biblioteca, listadas em legal-catalog.json — gerado por
 * scripts/generate-legal-embeddings.ts, o mesmo script que indexa o texto
 * delas pra busca semântica (ver legal-vector-search.ts). Antes desse
 * catálogo, uma lei só aparecia aqui se alguém a recadastrasse manualmente
 * artigo por artigo em legislacao.json — a maioria das leis da Biblioteca
 * nunca tinha esse trabalho feito e ficava de fora.
 */
export function getIndividualLawOptions(municipioId?: string | null): IndividualLawOption[] {
  const doJson = Object.entries(
    legislacaoData as Record<string, { titulo: string; municipioId?: string; biblioteca?: unknown }>
  )
    .filter(([, law]) => !!law.biblioteca)
    .map(([lawKey, law]) => ({
      id: lawKey,
      label: law.titulo,
      group: law.municipioId ? 'Código Municipal' : 'Código Sanitário Estadual',
    }));

  const doPdf = (legalCatalog as { id: string; titulo: string; municipioId?: string }[])
    .filter((lei) => !lei.municipioId || lei.municipioId === municipioId)
    .map((lei) => ({
      id: lei.id,
      label: lei.titulo,
      group: lei.municipioId ? 'Código Municipal' : 'Código Sanitário Estadual',
    }));

  return [...doJson, ...doPdf].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Reconstrói o texto de fundamentação ("LEI X (ART. 1º, ART. 2º); LEI Y
 * (ART. 3º)") a partir de uma lista de artigos — mesmo formato usado pelo
 * motor local de geração (generate-intimacao-draft.ts). Usada pra recalcular
 * a fundamentação no cliente sempre que o fiscal adiciona ou remove um
 * artigo da lista sugerida pela IA (ver gerar-rascunho.tsx e
 * assistente-ia-form-dialog.tsx) — sem isso, o texto de fundamentação
 * ficaria desatualizado em relação aos artigos realmente selecionados.
 */
export function buildFundamentacaoFromArticles(articles: { label: string; lawTitle: string }[]): string {
  const groupedByLaw: Record<string, string[]> = {};
  articles.forEach((art) => {
    const lawName = art.lawTitle.split(' - ')[0];
    if (!groupedByLaw[lawName]) groupedByLaw[lawName] = [];
    groupedByLaw[lawName].push(art.label.toUpperCase());
  });
  return Object.entries(groupedByLaw)
    .map(([lawName, labels]) => `${lawName.toUpperCase()} (${Array.from(new Set(labels)).join(', ')})`)
    .join('; ');
}

/**
 * Alterna um valor na seleção de base legal, sem nunca deixar a seleção
 * vazia (cai de volta pro padrão "estadual") nem misturar "todas" com outras
 * opções (é um "substituir tudo", não um item de lista igual aos demais).
 */
export function toggleLawPreference(prev: LawPreference[], value: LawPreference): LawPreference[] {
  if (value === 'todas') {
    return prev.includes('todas') ? ['estadual'] : ['todas'];
  }

  const next = prev.includes(value)
    ? prev.filter((item) => item !== value)
    : [...prev, value];

  if (next.length === 0) return ['estadual'];
  if (next.includes('todas')) return next.filter((item) => item !== 'todas');
  return next;
}

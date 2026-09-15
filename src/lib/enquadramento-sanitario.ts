/**
 * ENQUADRAMENTO SANITÁRIO — separa o que é INFRAÇÃO do que é NORMA TÉCNICA.
 *
 * O erro que este módulo existe pra corrigir: a busca jurídica tratava as 205
 * disposições da base como uma lista só, ranqueada por semelhança de palavras.
 * O artigo mais "parecido" com o relato virava o enquadramento — então um
 * relato sobre medicamento podia ser enquadrado num artigo da norma de salão
 * de beleza, só porque as palavras batiam melhor. Juridicamente isso é nulo.
 *
 * A base já carrega a distinção certa; faltava respeitá-la:
 *
 *   ARTIGOS DE INFRAÇÃO (o enquadramento — o que a conduta "é")
 *     est-63-*   Lei Estadual 13.331/2001, Art. 63 ....... 54 incisos
 *     mun-18-*   Lei Municipal 2.276/2017, Art. 18 ....... 116 incisos
 *
 *   NORMAS TÉCNICAS (a regra material descumprida — o "porquê")
 *     RDC da ANVISA, resoluções SESA, normas setoriais ... 31 artigos
 *
 * A infração é SEMPRE um inciso de um artigo de infração: é ele que descreve a
 * conduta punível e a ele que a penalidade se liga. A norma técnica entra como
 * reforço — a exigência concreta que foi violada —, nunca como enquadramento.
 *
 * Por isso a busca do enquadramento roda contra o texto das CONDUTAS (os
 * incisos), e não contra o acervo inteiro: o universo de resposta tem 170
 * opções bem definidas, não 205 misturadas.
 */

import {
  searchLegislacao,
  normalizeLawPreferenceSelection,
  listarTodosArtigos,
  getDefaultLawPreference,
  matchesMunicipio,
  type LawPreferenceSelection,
  type LegalArticle,
} from '@/lib/legal-search';

/** Prefixo de id de cada artigo de infração conhecido na base. */
const PREFIXOS_INFRACAO = ['est-63-', 'mun-18-'] as const;

/** Rótulo da lei de cada artigo de infração, para a citação formatada. */
export const ARTIGOS_DE_INFRACAO = [
  { prefixo: 'est-63-', lei: 'LEI ESTADUAL Nº 13.331/2001', artigo: 'Art. 63', esfera: 'estadual' as const },
  { prefixo: 'mun-18-', lei: 'LEI MUNICIPAL Nº 2.276/2017', artigo: 'Art. 18', esfera: 'municipal' as const },
];

export function ehArtigoDeInfracao(id: string): boolean {
  return PREFIXOS_INFRACAO.some((p) => id.startsWith(p));
}

/**
 * INCISO CORINGA de cada código — a cláusula de fechamento que alcança
 * qualquer descumprimento de norma sanitária:
 *
 *   est-63-XLIV  "Transgredir qualquer norma legal ou regulamentar destinada
 *                 à promoção, proteção e recuperação da saúde."
 *   mun-18-CXVI  "Transgredir outras normas legais federais, estaduais e
 *                 municipais, destinadas à promoção, prevenção e proteção
 *                 à saúde."
 *
 * Serve de rede de segurança para a conduta que viola uma norma técnica sem
 * ter inciso específico — por exemplo, buffet sem anteparo higiênico em Pato
 * Branco (Lei Municipal 3.430/2010): a exigência existe e foi descumprida,
 * mas nenhum dos 54 incisos do Art. 63 descreve essa conduta em particular.
 *
 * ELE NUNCA DISPUTA O TOPO. Entra sempre no FIM da lista, depois dos incisos
 * que casaram com o relato. Um coringa ranqueado por semelhança venceria os
 * específicos com frequência (o texto dele é genérico e casa com quase tudo),
 * e autuar no genérico existindo o específico enfraquece o auto: a defesa
 * alega que a administração não identificou a conduta. O coringa é a saída
 * quando não há inciso melhor, não um atalho para não procurar.
 */
const CORINGA_POR_PREFIXO: Record<string, string> = {
  'est-63-': 'est-63-XLIV',
  'mun-18-': 'mun-18-CXVI',
};

/** O inciso coringa é aquele que fecha o código, não um inciso comum. */
export function ehIncisoCoringa(id: string): boolean {
  return Object.values(CORINGA_POR_PREFIXO).includes(id);
}

/**
 * Garante o coringa da esfera no fim da lista, sem duplicar e sem furar o
 * limite pedido: se a lista já chegou no limite, o coringa toma a última
 * vaga — é preferível perder a sexta sugestão a deixar o fiscal sem a opção
 * que sempre cabe.
 */
function comCoringa(
  lista: LegalArticle[],
  prefixo: string,
  todosOsArtigos: LegalArticle[],
  limite: number
): LegalArticle[] {
  const coringaId = CORINGA_POR_PREFIXO[prefixo];
  if (!coringaId) return lista.slice(0, limite);
  if (lista.some((a) => a.id === coringaId)) return lista.slice(0, limite);

  const coringa = todosOsArtigos.find((a) => a.id === coringaId);
  if (!coringa) return lista.slice(0, limite);

  const especificos = lista.filter((a) => a.id !== coringaId);
  return [...especificos.slice(0, Math.max(0, limite - 1)), coringa];
}

/**
 * Incisos de infração que correspondem à CONDUTA relatada.
 *
 * O recorte por esfera acompanha o que o fiscal escolheu: sem escolha, ou com
 * "estadual", vale o Art. 63 — que é a base sanitária padrão do Paraná. Com
 * "municipal" ou "todas", o Art. 18 entra junto.
 */
export function buscarEnquadramento(
  relato: string,
  options?: { pref?: LawPreferenceSelection; municipioId?: string; limit?: number }
): LegalArticle[] {
  // Sem escolha explícita do fiscal, a esfera padrão é a do MUNICÍPIO: quem
  // tem código próprio autua por ele. Antes o default caía direto em
  // 'estadual', e Prudentópolis só ganhava prioridade municipal se a tela
  // lembrasse de passar a preferência — qualquer outro chamador perdia a
  // regra em silêncio.
  const pref = normalizeLawPreferenceSelection(
    options?.pref ?? getDefaultLawPreference(options?.municipioId)
  );
  const limite = options?.limit ?? 6;

  // Busca ampla e filtra depois: o índice é um só, e pedir mais candidatos
  // aqui garante que os incisos de infração não sejam espremidos para fora do
  // ranking pelas normas técnicas, que costumam ter texto mais específico e
  // por isso pontuam mais alto na semelhança de palavras.
  // O limite cobre o universo inteiro de incisos de infração (54 estaduais +
  // 116 municipais) de propósito. Com uma janela menor, em município com
  // código próprio os 116 incisos municipais empurravam os estaduais para
  // fora do ranking, e a lista estadual — que é a alternativa quando nenhum
  // inciso municipal serve — chegava aqui vazia.
  const candidatos = searchLegislacao(relato, {
    pref: 'todas',
    municipioId: options?.municipioId,
    limit: 300,
  }).filter((a) => ehArtigoDeInfracao(a.id));

  const municipais = candidatos.filter((a) => a.id.startsWith('mun-18-'));
  const estaduais = candidatos.filter((a) => a.id.startsWith('est-63-'));

  // PRIORIDADE MUNICIPAL. Município que tem código sanitário próprio (o caso
  // de Prudentópolis, Lei 2.276/2017) autua pela lei DELE: é a norma local que
  // rege a atividade e define a penalidade que a própria vigilância aplica. A
  // lei estadual continua valendo como base do sistema, mas o enquadramento
  // do auto sai do município quando ele existe.
  //
  // `searchLegislacao` já restringe lei municipal ao município do fiscal (ver
  // matchesMunicipio), então esta lista só vem preenchida para quem de fato
  // tem código próprio — nos demais municípios o resultado continua estadual,
  // sem nenhuma configuração extra.
  const temCodigoProprio = municipais.length > 0;
  const soEstadual = pref.length > 0 && pref.every((p) => p === 'estadual');

  // O coringa entra a partir do acervo completo, e não dos candidatos: como
  // o texto dele é genérico, muitas vezes ele nem aparece no ranking do
  // relato — e é justamente aí que o fiscal mais precisa dele.
  const acervo = listarArtigosDeInfracao({ municipioId: options?.municipioId });

  if (temCodigoProprio && !soEstadual) {
    // Municipais primeiro; os estaduais entram só para completar o limite,
    // como alternativa para o caso de nenhum inciso municipal servir. O
    // coringa que fecha a lista é o MUNICIPAL, porque é a lei do município
    // que rege o auto (ver 'PRIORIDADE MUNICIPAL' acima).
    return comCoringa([...municipais, ...estaduais], 'mun-18-', acervo, limite);
  }
  return comCoringa(estaduais, 'est-63-', acervo, limite);
}

/**
 * Normas técnicas (RDC, resoluções SESA, normas setoriais) relacionadas ao
 * relato — a regra material que foi descumprida. Só entram as que o fiscal
 * selecionou; sem seleção específica, não há norma técnica a citar, e o
 * documento se sustenta apenas no artigo de infração, que é o correto.
 */
export function buscarNormasTecnicas(
  relato: string,
  options?: { pref?: LawPreferenceSelection; municipioId?: string; limit?: number }
): LegalArticle[] {
  const pref = normalizeLawPreferenceSelection(options?.pref);
  const temSelecaoEspecifica = pref.some(
    (p) => p !== 'estadual' && p !== 'municipal' && p !== 'todas'
  ) || pref.includes('todas');
  if (!temSelecaoEspecifica) return [];

  return searchLegislacao(relato, {
    pref: options?.pref,
    municipioId: options?.municipioId,
    limit: 30,
  })
    .filter((a) => !ehArtigoDeInfracao(a.id))
    .slice(0, options?.limit ?? 4);
}

/**
 * Todos os incisos de infração, para a escolha manual do fiscal.
 *
 * Existe porque nenhuma busca automática acerta sempre: quando a sugestão vier
 * errada, o fiscal precisa poder apontar o inciso certo ele mesmo. A lista sai
 * da mesma base que alimenta a busca, então o que ele escolher é garantidamente
 * um artigo real, com texto integral — diferente de digitar "Art. 63, III" à
 * mão e arriscar citar inciso inexistente no documento.
 */
export function listarArtigosDeInfracao(options?: { municipioId?: string }): LegalArticle[] {
  // Lista direta do acervo, não resultado de busca: aqui o fiscal precisa ver
  // TODOS os incisos para escolher, na ordem da lei.
  return listarTodosArtigos()
    .filter((a) => ehArtigoDeInfracao(a.id))
    .filter((a) => matchesMunicipio(a.municipioId, options?.municipioId));
}

/** Busca os artigos de infração escolhidos manualmente, pelos ids. */
export function artigosPorId(ids: string[], options?: { municipioId?: string }): LegalArticle[] {
  if (ids.length === 0) return [];
  const alvo = new Set(ids);
  return listarArtigosDeInfracao(options).filter((a) => alvo.has(a.id));
}

/** Citação no formato usado nos documentos: "LEI (ART. X, INCISO Y)". */
export function citarArtigos(artigos: { label: string; lawTitle: string }[]): string {
  const porLei: Record<string, string[]> = {};
  artigos.forEach((a) => {
    const lei = a.lawTitle.split(' - ')[0].toUpperCase();
    (porLei[lei] ||= []).push(a.label.toUpperCase());
  });
  return Object.entries(porLei)
    .map(([lei, labels]) => `${lei} (${Array.from(new Set(labels)).join(', ')})`)
    .join('; ');
}

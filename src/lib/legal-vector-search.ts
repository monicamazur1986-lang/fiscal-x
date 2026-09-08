import fs from 'node:fs';
import path from 'node:path';
import type { LegalArticle, LawPreferenceSelection, ScoredHit } from './legal-search';
import { normalizeLawPreferenceSelection, matchesPreference, matchesMunicipio, GENERAL_LAW_KEYS, GENERAL_SLOTS, pickBalancedHits } from './legal-search';

/**
 * Busca semântica (vetorial) de artigos de lei — substitui a busca por
 * palavra-chave (MiniSearch, em legal-search.ts) quando há uma chave da
 * Voyage AI configurada e o índice já foi gerado (ver
 * scripts/generate-legal-embeddings.ts). SÓ é importado do lado do servidor
 * (generate-intimacao-draft.ts, que roda como Server Action) — nunca de um
 * componente cliente, porque o índice tem um vetor por trecho e pode chegar
 * a alguns MB; não deve ir pro bundle do navegador.
 *
 * A busca por palavra-chave batia "esterilização" (odontologia) com
 * "registro de óbito" só por coincidência de termo — a vetorial compara o
 * SIGNIFICADO da frase da fiscal com o de cada trecho de lei, então não erra
 * esse tipo de caso.
 */

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || '';

interface EmbeddedChunk {
  id: string;
  lawKey: string;
  lawTitle: string;
  label: string;
  texto: string;
  municipioId?: string;
  isBiblioteca: boolean;
  vector: number[];
}

interface EmbeddingsFile {
  model: string;
  generatedAt: string;
  chunks: EmbeddedChunk[];
}

let cached: EmbeddingsFile | null | undefined; // undefined = ainda não tentou carregar

function loadEmbeddings(): EmbeddingsFile | null {
  if (cached !== undefined) return cached;
  try {
    const filePath = path.join(process.cwd(), 'src', 'lib', 'legal-embeddings.json');
    if (!fs.existsSync(filePath)) { cached = null; return null; }
    const parsed: EmbeddingsFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    cached = parsed;
    return parsed;
  } catch (err) {
    console.error('Falha ao carregar legal-embeddings.json:', err);
    cached = null;
    return null;
  }
}

/** true só quando há chave configurada E o índice já foi gerado — ver
 * scripts/generate-legal-embeddings.ts. Usado por generate-intimacao-draft.ts
 * pra decidir entre busca semântica e a busca por palavra-chave (fallback). */
export function isSemanticSearchReady(): boolean {
  return Boolean(VOYAGE_API_KEY) && loadEmbeddings() !== null;
}

async function embedQuery(query: string): Promise<number[]> {
  const embeddings = loadEmbeddings();
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [query], model: embeddings?.model || 'voyage-law-2', input_type: 'query' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Voyage API retornou ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Mesma assinatura/resultado de searchLegislacao (legal-search.ts) — o
 * chamador (generate-intimacao-draft.ts) escolhe qual usar sem precisar
 * conhecer a diferença interna.
 */
export async function searchLegislacaoSemantic(
  query: string,
  options?: { pref?: LawPreferenceSelection; limit?: number; municipioId?: string }
): Promise<LegalArticle[]> {
  const embeddings = loadEmbeddings();
  if (!embeddings) return [];

  const pref = normalizeLawPreferenceSelection(options?.pref);
  const limit = options?.limit ?? 10;
  const municipioId = options?.municipioId;

  const queryVector = await embedQuery(query);

  const scored: ScoredHit<EmbeddedChunk>[] = embeddings.chunks
    .filter((c) => matchesPreference(c, pref))
    .filter((c) => matchesMunicipio(c.municipioId, municipioId))
    .map((c) => ({ item: c, score: cosineSimilarity(queryVector, c.vector) }));

  // "todas" (Todo o banco de dados) precisa tratar CADA lei de biblioteca
  // presente nos resultados como "selecionada" pra pickBalancedHits — sem
  // isso, nenhuma delas tinha uma chave nomeada explicitamente em `pref` e a
  // busca com "todas" passava a não garantir vaga nenhuma pra elas.
  const specificLawKeys = pref.includes('todas')
    ? Array.from(new Set(scored.map((h) => h.item.lawKey).filter((k) => !GENERAL_LAW_KEYS.has(k))))
    : pref.filter((value) => value !== 'todas' && value !== 'municipal' && value !== 'estadual');

  // Mesmo corte por similaridade relativa que a busca por palavra-chave usa
  // (ver pickBalancedHits em legal-search.ts pra por que o corte é por lei
  // individual, não por um balaio combinado com as demais leis
  // selecionadas), com um piso absoluto adicional: diferente do score de
  // texto do MiniSearch, similaridade de cosseno é uma métrica limitada
  // (0 a 1) e comparável entre buscas — abaixo de 0.3 o trecho não tem
  // relação nenhuma com a consulta, mesmo sendo o "melhor" de uma lei sem
  // nada bom pra oferecer.
  const hits = pickBalancedHits(scored, {
    lawKeyOf: (chunk) => chunk.lawKey,
    generalLawKeys: GENERAL_LAW_KEYS,
    generalSlots: GENERAL_SLOTS,
    specificLawKeys,
    minSlotsPerLaw: 2,
    relativeCutoff: 0.85,
    absoluteFloor: 0.3,
    limit,
  });

  return hits.map((chunk) => ({
    id: chunk.id,
    label: chunk.label,
    texto: chunk.texto,
    lawKey: chunk.lawKey,
    lawTitle: chunk.lawTitle,
    municipioId: chunk.municipioId,
  }));
}

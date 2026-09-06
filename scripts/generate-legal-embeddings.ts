/**
 * Gera o índice de busca semântica (vetorial) da legislação — combina os
 * artigos já cadastrados manualmente em src/lib/legislacao.json com o texto
 * de TODOS os PDFs publicados na Biblioteca (public/documentos-biblioteca,
 * raiz + por município), que hoje não entram na fundamentação automática do
 * Fiscal AI de jeito nenhum.
 *
 * Roda uma vez (ou toda vez que uma lei for adicionada/alterada na
 * Biblioteca) e grava dois arquivos:
 *   - src/lib/legal-embeddings.json — cada trecho + seu vetor (usado em
 *     runtime por src/lib/legal-vector-search.ts)
 *   - src/lib/legal-catalog.json — só metadados das leis vindas de PDF (sem
 *     vetor), pra alimentar a lista de seleção de leis na UI
 *
 * Precisa de uma chave da Voyage AI (https://www.voyageai.com/), a
 * parceira de embeddings recomendada pela própria Anthropic, em
 * VOYAGE_API_KEY (.env.local). Sem a chave, o script explica isso e não
 * sobrescreve nada.
 *
 * Uso: npm run generate-embeddings
 */
import 'dotenv/config';
import { config as loadEnvLocal } from 'dotenv';
loadEnvLocal({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPageText } from '../src/lib/pdf-text-extract';
import { parseLegalText, type LegalParagraph } from '../src/lib/format-legal-text';
import legislacaoData from '../src/lib/legislacao.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || '';
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-law-2'; // modelo de embeddings especializado em texto jurídico
const BATCH_SIZE = 64;

// Essas duas leis já existem em legislacao.json como artigos avulsos
// cadastrados à mão (LEI_ESTADUAL_13331_2001 / LEI_MUNICIPAL_2276_2017) — o
// PDF na Biblioteca é o texto integral oficial da MESMA lei, não uma lei
// diferente. Entram no índice vetorial (dão mais alcance de busca), mas NÃO
// viram uma segunda opção na lista de seleção — isso duplicaria "Código
// Sanitário Estadual"/"Código Municipal", que já representam essas leis.
const BASE_CODE_MANIFEST_IDS: Record<string, { lawKey: string; municipioId?: string }> = {
  'codigo-sanitario-estadual-pr': { lawKey: 'LEI_ESTADUAL_13331_2001' },
  'codigo-vigilancia-sanitaria-prudentopolis': { lawKey: 'LEI_MUNICIPAL_2276_2017', municipioId: 'prudentopolis' },
};

interface Chunk {
  id: string;
  lawKey: string;
  lawTitle: string;
  label: string;
  texto: string;
  municipioId?: string;
  isBiblioteca: boolean;
}

interface ManifestDoc {
  id: string;
  titulo: string;
  path: string;
  esfera?: string;
  categoria?: string;
}

function readManifest(manifestPath: string): ManifestDoc[] {
  if (!fs.existsSync(manifestPath)) return [];
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return raw.documents || [];
}

function chunksFromLegislacaoJson(): Chunk[] {
  const chunks: Chunk[] = [];
  Object.entries(legislacaoData as Record<string, any>).forEach(([lawKey, law]) => {
    law.artigos.forEach((art: any) => {
      chunks.push({
        id: art.id,
        lawKey,
        lawTitle: law.titulo,
        label: art.label,
        texto: art.pena ? `${art.texto}\nPena: ${art.pena}` : art.texto,
        municipioId: law.municipioId,
        isBiblioteca: !!law.biblioteca,
      });
    });
  });
  return chunks;
}

/** Agrupa os parágrafos tipados (ver format-legal-text.ts) em blocos por
 * artigo — cada "artigo" carrega consigo os parágrafos/incisos/alíneas que
 * vêm depois dele, até o próximo artigo/seção/capítulo. Cabeçalhos de
 * capítulo/seção não viram chunk (não são citáveis sozinhos). */
function groupIntoArticleChunks(paragraphs: LegalParagraph[]): { label: string; texto: string }[] {
  const out: { label: string; texto: string }[] = [];
  let current: { label: string; parts: string[] } | null = null;

  for (const p of paragraphs) {
    if (p.type === 'capitulo' || p.type === 'secao' || p.type === 'subsecao') {
      if (current) { out.push({ label: current.label, texto: current.parts.join(' ') }); current = null; }
      continue;
    }
    if (p.type === 'artigo') {
      if (current) out.push({ label: current.label, texto: current.parts.join(' ') });
      const labelMatch = p.text.match(/^Art\.?\s*\d+[ºo°]?[\-A-Z]?\.?/);
      current = { label: labelMatch ? labelMatch[0] : p.text.slice(0, 20), parts: [p.text] };
      continue;
    }
    if (p.type === 'texto') {
      if (current) current.parts.push(p.text);
      continue; // texto antes do 1º artigo (preâmbulo) é descartado
    }
    // paragrafo/inciso/alinea
    if (current) current.parts.push(p.text);
  }
  if (current) out.push({ label: current.label, texto: current.parts.join(' ') });

  // Corta blocos gigantes (ex.: um "artigo" mal-detectado que engoliu a lei
  // inteira) — acima disso o embedding perde precisão e fica caro à toa.
  return out
    .map((b) => ({ label: b.label, texto: b.texto.length > 6000 ? b.texto.slice(0, 6000) : b.texto }))
    .filter((b) => b.texto.trim().length > 30);
}

async function extractPdfText(absPath: string): Promise<string> {
  const data = new Uint8Array(fs.readFileSync(absPath));
  const doc = await (pdfjsLib as any).getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    fullText += extractPageText(content.items as any[]) + '\n';
  }
  return fullText;
}

async function chunksFromManifestDoc(doc: ManifestDoc, municipioId?: string): Promise<Chunk[]> {
  const relPath = decodeURIComponent(doc.path).replace(/^\//, '');
  const absPath = path.join(PUBLIC_DIR, relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`  [aviso] PDF não encontrado, pulando: ${absPath}`);
    return [];
  }
  const rawText = await extractPdfText(absPath);
  const paragraphs = parseLegalText(rawText);
  const blocks = groupIntoArticleChunks(paragraphs);
  const baseCode = BASE_CODE_MANIFEST_IDS[doc.id];

  return blocks.map((b, i) => ({
    id: `${doc.id}-${i}`,
    lawKey: baseCode ? baseCode.lawKey : doc.id,
    lawTitle: doc.titulo,
    label: b.label,
    texto: b.texto,
    municipioId: baseCode ? baseCode.municipioId : municipioId,
    isBiblioteca: !baseCode,
  }));
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: 'document' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Voyage API retornou ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.data.map((d: any) => d.embedding);
}

async function main() {
  if (!VOYAGE_API_KEY) {
    console.error(
      '\nVOYAGE_API_KEY não configurada — nada foi gerado.\n' +
      'Crie uma conta em https://www.voyageai.com/, gere uma API key e adicione\n' +
      'em .env.local:\n\n  VOYAGE_API_KEY=sua_chave_aqui\n\nDepois rode de novo: npm run generate-embeddings\n'
    );
    process.exit(1);
  }

  console.log('Lendo legislacao.json...');
  const chunks: Chunk[] = chunksFromLegislacaoJson();
  console.log(`  ${chunks.length} artigos cadastrados manualmente.`);

  console.log('Lendo manifestos da Biblioteca...');
  const rootManifest = readManifest(path.join(PUBLIC_DIR, 'documentos-biblioteca', 'manifest.json'));
  const municipiosDir = path.join(PUBLIC_DIR, 'documentos-biblioteca', 'municipios');
  const municipios = fs.existsSync(municipiosDir) ? fs.readdirSync(municipiosDir).filter((f) => fs.statSync(path.join(municipiosDir, f)).isDirectory()) : [];

  const catalogo: { id: string; titulo: string; municipioId?: string; esfera?: string; categoria?: string }[] = [];

  for (const doc of rootManifest) {
    console.log(`  Processando (geral): ${doc.titulo}`);
    const docChunks = await chunksFromManifestDoc(doc);
    chunks.push(...docChunks);
    if (!BASE_CODE_MANIFEST_IDS[doc.id] && docChunks.length > 0) {
      catalogo.push({ id: doc.id, titulo: doc.titulo, esfera: doc.esfera, categoria: doc.categoria });
    }
  }

  for (const municipioId of municipios) {
    const docs = readManifest(path.join(municipiosDir, municipioId, 'manifest.json'));
    for (const doc of docs) {
      console.log(`  Processando (${municipioId}): ${doc.titulo}`);
      const docChunks = await chunksFromManifestDoc(doc, municipioId);
      chunks.push(...docChunks);
      if (!BASE_CODE_MANIFEST_IDS[doc.id] && docChunks.length > 0) {
        catalogo.push({ id: doc.id, titulo: doc.titulo, municipioId, esfera: doc.esfera, categoria: doc.categoria });
      }
    }
  }

  console.log(`\nTotal de trechos a indexar: ${chunks.length}`);
  console.log(`Gerando embeddings via Voyage AI (${VOYAGE_MODEL}), em lotes de ${BATCH_SIZE}...`);

  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE).map((c) => `${c.label}\n${c.texto}`);
    process.stdout.write(`  Lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);
    const batchVectors = await embedBatch(batch);
    vectors.push(...batchVectors);
    console.log(' ok');
  }

  const output = {
    model: VOYAGE_MODEL,
    generatedAt: new Date().toISOString(),
    chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i] })),
  };

  const outPath = path.join(ROOT, 'src', 'lib', 'legal-embeddings.json');
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`\nGravado: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);

  const catalogPath = path.join(ROOT, 'src', 'lib', 'legal-catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalogo, null, 2));
  console.log(`Gravado: ${catalogPath} (${catalogo.length} leis de PDF disponíveis pra seleção)`);
}

main().catch((err) => {
  console.error('\nFalha ao gerar embeddings:', err);
  process.exit(1);
});

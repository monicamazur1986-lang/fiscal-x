/**
 * EXTRAÇÃO DO TEXTO DA BIBLIOTECA — na hora do build, não no navegador.
 *
 * A Biblioteca lê o TEXTO das normas (ver biblioteca/page.tsx, que renderiza
 * `conteudoIntegral`); o PDF só serve pro link "abrir original". Mesmo assim,
 * até aqui cada navegador baixava os ~69 MB de PDF e rodava o pdf.js por conta
 * própria só pra chegar nos 2,8 MB de texto — a cada acesso, enquanto o cache
 * não persistia.
 *
 * Este script faz esse trabalho uma vez, no build, e publica o resultado como
 * `acervo.json` ao lado de cada manifest. O navegador passa a baixar ~2,8 MB
 * (uns 800 KB com gzip) em vez de 69 MB, e o pdf.js sai do cliente.
 *
 * O formato de cada documento é exatamente o que `useBiblioteca` já montava em
 * memória, pra poder ser usado direto, sem conversão.
 *
 * Roda sozinho antes do build (`prebuild` no package.json) e também à mão:
 *   npm run extrair-biblioteca
 *
 * NUNCA derruba o build: se um PDF falhar, ele é pulado com aviso; se tudo
 * falhar, o `acervo.json` não é escrito e o app volta a extrair no navegador,
 * como antes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPageText } from '../src/lib/pdf-text-extract';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BIBLIOTECA_DIR = path.join(PUBLIC_DIR, 'documentos-biblioteca');

type DocumentoManifest = {
  id: string;
  titulo: string;
  path: string;
  esfera?: string;
  categoria?: string;
  tema?: string;
  descricao?: string;
  keywords?: string;
  linkOficial?: string;
};

type Manifest = { version: string; documents: DocumentoManifest[] };

/** Fontes padrão do PDF (Helvetica & cia.). Sem apontar a pasta, o pdf.js
 *  reclama a cada página e substitui a fonte no chute, o que piora a extração
 *  em documentos que dependem dessas métricas. */
const STANDARD_FONTS = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep;

async function extrairTexto(caminhoAbsoluto: string): Promise<{ texto: string; paginas: number }> {
  const data = new Uint8Array(fs.readFileSync(caminhoAbsoluto));
  const doc = await (pdfjsLib as any).getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: STANDARD_FONTS,
  }).promise;
  let texto = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const conteudo = await page.getTextContent();
    texto += extractPageText(conteudo.items as any[]) + '\n';
  }
  return { texto, paginas: doc.numPages };
}

/** Processa um manifest e devolve os documentos no formato do LegislacaoDocumento. */
async function processarManifest(manifest: Manifest, municipioId?: string) {
  const documentos: any[] = [];

  for (const info of manifest.documents) {
    // O manifest guarda o caminho como URL ("rdc%20471.pdf"), que o navegador
    // decodifica sozinho no fetch — o fs do Node não. Sem o decode aqui, todo
    // arquivo com espaço ou acento no nome era dado como inexistente.
    const relativo = decodeURIComponent(info.path).replace(/^\//, '');
    const caminho = path.join(PUBLIC_DIR, relativo);
    if (!fs.existsSync(caminho)) {
      console.warn(`  ! PDF não encontrado, pulando: ${info.path}`);
      continue;
    }
    try {
      let usouTranscricao = false;
      let { texto, paginas } = await extrairTexto(caminho);
      let kb = Buffer.byteLength(texto, 'utf8') / 1024;

      // Digitalização sem camada de texto (o pdf.js não tem o que extrair):
      // o documento entraria na Biblioteca vazio e invisível na busca. Nesses
      // casos aceitamos uma transcrição feita à mão num .txt de mesmo nome, ao
      // lado do PDF — é o que salva norma antiga que só existe escaneada.
      if (kb < 1) {
        const transcricao = caminho.replace(/\.pdf$/i, '.txt');
        if (fs.existsSync(transcricao)) {
          texto = fs.readFileSync(transcricao, 'utf8');
          kb = Buffer.byteLength(texto, 'utf8') / 1024;
          usouTranscricao = true;
        } else {
          console.warn(`  ! SEM TEXTO EXTRAÍVEL (${paginas}p): ${info.titulo} — passe OCR ou crie ${path.basename(transcricao)} ao lado do PDF`);
        }
      }
      documentos.push({
        id: info.id,
        titulo: info.titulo,
        // Mesma regra do cliente: documento municipal herda esfera/município da
        // pasta de onde veio, nunca do conteúdo do manifest.
        esfera: municipioId ? 'municipal' : info.esfera,
        municipioId,
        categoria: info.categoria,
        tema: info.tema,
        descricao: info.descricao || `Documento carregado de ${info.path}`,
        conteudoIntegral: texto,
        keywords: info.keywords || '',
        linkOficial: info.linkOficial || '',
        pdfUrl: info.path,
        updatedAt: new Date().toISOString(),
        chunks: [],
      });
      console.log(`  ${kb.toFixed(0).padStart(5)} KB  ${paginas.toString().padStart(4)}p  ${info.titulo}${usouTranscricao ? "  (transcrição .txt — PDF sem OCR)" : ""}`);
    } catch (e: any) {
      console.warn(`  ! Falha ao extrair ${info.path}: ${e?.message}`);
    }
  }

  return documentos;
}

function lerManifest(caminho: string): Manifest | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    if (!manifest.documents || !manifest.version) return null;
    return manifest;
  } catch {
    return null;
  }
}

/** Gera o acervo.json ao lado de um manifest. */
async function gerarAcervo(dirManifest: string, municipioId?: string) {
  const caminhoManifest = path.join(dirManifest, 'manifest.json');
  const manifest = lerManifest(caminhoManifest);
  if (!manifest) {
    console.warn(`Manifest ausente ou inválido, pulando: ${caminhoManifest}`);
    return;
  }

  console.log(`\n${municipioId ? `Município: ${municipioId}` : 'Acervo geral'} (manifest v${manifest.version})`);
  const documentos = await processarManifest(manifest, municipioId);

  // Manifest legitimamente vazio (município sem legislação própria ainda) gera
  // um acervo.json vazio mesmo assim — é a resposta certa, e evita que o app
  // caia no caminho de extração no navegador à toa. Só pulamos quando havia
  // documentos a extrair e TODOS falharam, aí o navegador tenta de novo.
  if (documentos.length === 0 && manifest.documents.length > 0) {
    console.warn('  ! Nenhum documento extraído — acervo.json não será escrito (o app extrai no navegador).');
    return;
  }

  const destino = path.join(dirManifest, 'acervo.json');
  // `version` é o que o cliente compara com o manifest pra saber se o acervo
  // pré-extraído ainda vale — sem isso, uma norma nova no manifest não
  // invalidaria o JSON antigo.
  fs.writeFileSync(destino, JSON.stringify({ version: manifest.version, documents: documentos }));
  const mb = fs.statSync(destino).size / 1048576;
  console.log(`  -> ${path.relative(ROOT, destino)} (${mb.toFixed(2)} MB, ${documentos.length} documentos)`);
}

async function main() {
  if (!fs.existsSync(BIBLIOTECA_DIR)) {
    console.warn('Pasta public/documentos-biblioteca não encontrada — nada a fazer.');
    return;
  }

  await gerarAcervo(BIBLIOTECA_DIR);

  const dirMunicipios = path.join(BIBLIOTECA_DIR, 'municipios');
  if (fs.existsSync(dirMunicipios)) {
    for (const municipioId of fs.readdirSync(dirMunicipios)) {
      const dir = path.join(dirMunicipios, municipioId);
      if (fs.statSync(dir).isDirectory()) await gerarAcervo(dir, municipioId);
    }
  }
}

main().catch((e) => {
  // Build não pode cair por causa disto: sem acervo.json, o app volta a
  // extrair no navegador — mais lento, porém funcional.
  console.warn('Extração da biblioteca falhou; o app usará a extração no navegador.', e);
});

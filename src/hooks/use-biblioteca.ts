'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LegislacaoDocumento } from '@/lib/types';
import { documentosDaLegislacao } from '@/lib/legislacao-biblioteca';
import { extractPageText } from '@/lib/pdf-text-extract';
import * as pdfjsLib from 'pdfjs-dist';

// pdfjs-dist 4.x só publica o worker como ES module (.mjs) — precisa estar em
// public/pdf.worker.min.mjs (copiado de node_modules/pdfjs-dist/build/).
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

// v4: bump de propósito (só a chave, não precisa mudar o formato) — descarta
// qualquer cache local antigo que possa ter ficado congelado numa versão de
// manifest.json obtida via fetch com cache do navegador (ver cache: 'no-store'
// abaixo), garantindo que todo mundo resincronize do zero pelo menos uma vez.
// v4 especificamente descarta o texto extraído com o bug de "uma letra por
// item" (ver extractPageText) — sem isso, quem já sincronizou continuaria
// vendo o texto espaçado errado até limpar o cache manualmente.
const LOCAL_STORAGE_KEY = 'fiscal_x_biblioteca_local_v4';
const MANIFEST_VERSION_KEY = 'fiscal_x_biblioteca_version_v4';

interface ManifestFile {
  version: string;
  documents: any[];
}

async function fetchManifest(path: string): Promise<ManifestFile | null> {
  // cache: 'no-store' força o navegador a sempre buscar a versão atual do
  // manifest.json na rede — sem isso, um cache HTTP antigo do arquivo (comum
  // em arquivos estáticos servidos de public/) fazia o app nunca perceber
  // que a lista de leis mudou no servidor, mesmo com a lógica de versão do
  // localStorage abaixo estando correta (ela só compara o que já chegou).
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    const manifest = JSON.parse(text);
    if (!manifest.documents || !manifest.version) return null;
    return manifest;
  } catch {
    return null;
  }
}

async function processManifestDocuments(
  manifest: ManifestFile,
  setLoadingMessage: (message: string) => void,
  forceMunicipioId?: string
): Promise<LegislacaoDocumento[]> {
  const processedDocs: LegislacaoDocumento[] = [];

  for (const [index, docInfo] of manifest.documents.entries()) {
    try {
      setLoadingMessage(`Processando ${index + 1}/${manifest.documents.length}: ${docInfo.titulo}`);

      const pdfResponse = await fetch(docInfo.path, { cache: 'no-store' });
      if (!pdfResponse.ok) {
        console.warn(`Arquivo PDF não encontrado em ${docInfo.path}. Pulando.`);
        continue;
      }

      const arrayBuffer = await pdfResponse.arrayBuffer();
      const pdf = await (pdfjsLib.getDocument({ data: arrayBuffer }) as any).promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += extractPageText(textContent.items as any[]) + '\n';
      }

      processedDocs.push({
        id: docInfo.id,
        titulo: docInfo.titulo,
        // Documentos municipais sempre têm a esfera/município herdados da
        // pasta de onde vieram — nunca do conteúdo do manifest — pra um
        // erro de copiar/colar entre municípios nunca vazar a lei errada.
        esfera: forceMunicipioId ? 'municipal' : docInfo.esfera,
        municipioId: forceMunicipioId,
        categoria: docInfo.categoria,
        tema: docInfo.tema,
        descricao: docInfo.descricao || `Documento carregado de ${docInfo.path}`,
        conteudoIntegral: fullText,
        keywords: docInfo.keywords || '',
        linkOficial: docInfo.linkOficial || '',
        pdfUrl: docInfo.path,
        updatedAt: new Date().toISOString(),
        chunks: [],
      });
    } catch (docError) {
      console.error(`Erro ao processar o documento ${docInfo.path}:`, docError);
    }
  }

  return processedDocs;
}

/**
 * Carrega o acervo compartilhado (federal/estadual/RDC/resolução) e, se um
 * municipioId for informado, também o acervo próprio daquele município —
 * cada fiscal só enxerga o manifest do seu próprio município, nunca de
 * outro. A ausência de um manifest municipal é normal (município ainda sem
 * legislação local cadastrada) e não é tratada como erro.
 */
export function useBiblioteca(municipioId?: string) {
  const [documents, setDocuments] = useState<LegislacaoDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Iniciando biblioteca...');

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const cacheSuffix = municipioId || 'geral';
    const localStorageKey = `${LOCAL_STORAGE_KEY}_${cacheSuffix}`;
    const versionKey = `${MANIFEST_VERSION_KEY}_${cacheSuffix}`;

    try {
      setLoadingMessage('Verificando manifesto...');
      const rootManifest = await fetchManifest('/documentos-biblioteca/manifest.json');
      if (!rootManifest) {
        throw new Error("ERRO: 'manifest.json' não encontrado ou inválido em 'public/documentos-biblioteca/'.");
      }

      const municipalManifest = municipioId
        ? await fetchManifest(`/documentos-biblioteca/municipios/${municipioId}/manifest.json`)
        : null;

      const combinedVersion = `${rootManifest.version}::${municipalManifest?.version || ''}`;
      const localVersion = localStorage.getItem(versionKey);

      if (localVersion === combinedVersion) {
        const cachedData = localStorage.getItem(localStorageKey);
        if (cachedData) {
          setLoadingMessage('Carregando do cache local...');
          // As leis do legislacao.json entram DEPOIS do cache, nunca dentro
          // dele: são um import estático (custo zero pra montar) e, guardadas
          // no cache, ficariam congeladas na versão do manifest de PDFs — uma
          // lei nova só apareceria se alguém lembrasse de subir a "version"
          // do manifest, que não tem nada a ver com ela.
          setDocuments([...JSON.parse(cachedData), ...documentosDaLegislacao]);
          setLoading(false);
          return;
        }
      }

      setLoadingMessage('Sincronizando acervo local (isso pode levar um minuto)...');
      const rootDocs = await processManifestDocuments(rootManifest, setLoadingMessage);
      const municipalDocs = municipalManifest
        ? await processManifestDocuments(municipalManifest, setLoadingMessage, municipioId)
        : [];

      const allDocs = [...rootDocs, ...municipalDocs];
      setDocuments([...allDocs, ...documentosDaLegislacao]);
      // Só os documentos extraídos de PDF vão pro cache — o custo que o cache
      // existe pra evitar é o do pdf.js, não o do import estático.
      localStorage.setItem(localStorageKey, JSON.stringify(allDocs));
      localStorage.setItem(versionKey, combinedVersion);
      setLoadingMessage('Biblioteca carregada!');

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [municipioId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return { documents, loading, error, loadingMessage };
}

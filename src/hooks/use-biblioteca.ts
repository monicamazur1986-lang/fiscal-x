'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LegislacaoDocumento } from '@/lib/types';
import { documentosDaLegislacao } from '@/lib/legislacao-biblioteca';
import { extractPageText } from '@/lib/pdf-text-extract';
import * as pdfjsLib from 'pdfjs-dist';
import { lerAcervoCache, gravarAcervoCache } from '@/lib/cache-biblioteca-idb';

// pdfjs-dist 4.x só publica o worker como ES module (.mjs) — precisa estar em
// public/pdf.worker.min.mjs (copiado de node_modules/pdfjs-dist/build/).
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

// Chaves do cache ANTIGO, em localStorage. O acervo agora mora em IndexedDB
// (ver cache-biblioteca-idb.ts) — o texto extraído dos PDFs nunca coube no
// teto de ~5 MB do localStorage, então a gravação falhava e a Biblioteca
// reprocessava os 70 MB de PDF a cada acesso. Estas duas chaves só continuam
// aqui pra serem apagadas na primeira sincronização, devolvendo o espaço que
// ocupavam ao resto do app.
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

/**
 * Acervo já extraído no build (ver scripts/extrair-texto-biblioteca.ts):
 * ~1,7 MB de texto em vez dos ~25 MB de PDF que o navegador teria de baixar e
 * passar pelo pdf.js. Ausente (script não rodou, município novo), devolve null
 * e o chamador cai na extração no navegador, como antes.
 */
async function fetchAcervoPreExtraido(
  dir: string,
  versaoEsperada: string
): Promise<LegislacaoDocumento[] | null> {
  try {
    const res = await fetch(`${dir}/acervo.json`);
    if (!res.ok) return null;
    const acervo = await res.json();
    if (!Array.isArray(acervo?.documents)) return null;
    // Norma nova no manifest invalida o acervo gerado antes dela.
    if (acervo.version !== versaoEsperada) return null;
    return acervo.documents as LegislacaoDocumento[];
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

      // Sem 'no-store' aqui, de propósito: PDF de lei é arquivo estático e
      // imutável, e quando muda vem com caminho/versão nova no manifest. O
      // 'no-store' obrigava a rebaixar os ~70 MB do acervo pela rede a cada
      // reprocessamento, ignorando o cache HTTP do navegador — banda cara
      // (egress do App Hosting) e espera longa pra ler o mesmo arquivo.
      const pdfResponse = await fetch(docInfo.path);
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

      const cache = await lerAcervoCache<LegislacaoDocumento>(cacheSuffix);
      if (cache && cache.versao === combinedVersion) {
        setLoadingMessage('Carregando do cache local...');
        // As leis do legislacao.json entram DEPOIS do cache, nunca dentro
        // dele: são um import estático (custo zero pra montar) e, guardadas
        // no cache, ficariam congeladas na versão do manifest de PDFs — uma
        // lei nova só apareceria se alguém lembrasse de subir a "version"
        // do manifest, que não tem nada a ver com ela.
        setDocuments([...cache.documentos, ...documentosDaLegislacao]);
        setLoading(false);
        return;
      }

      // Caminho normal: o texto já vem pronto do build. A extração no
      // navegador (abaixo) só acontece se o acervo.json faltar ou estiver
      // defasado — por exemplo, num município que acabou de subir uma norma e
      // ainda não passou por um deploy.
      setLoadingMessage('Carregando acervo...');
      const rootPreExtraido = await fetchAcervoPreExtraido('/documentos-biblioteca', rootManifest.version);
      const municipalPreExtraido = municipalManifest
        ? await fetchAcervoPreExtraido(`/documentos-biblioteca/municipios/${municipioId}`, municipalManifest.version)
        : [];

      const precisaExtrairNoNavegador = rootPreExtraido === null || municipalPreExtraido === null;
      if (precisaExtrairNoNavegador) {
        setLoadingMessage('Sincronizando acervo local (isso pode levar um minuto)...');
      }

      const rootDocs = rootPreExtraido ?? await processManifestDocuments(rootManifest, setLoadingMessage);
      const municipalDocs = municipalPreExtraido ?? (municipalManifest
        ? await processManifestDocuments(municipalManifest, setLoadingMessage, municipioId)
        : []);

      const allDocs = [...rootDocs, ...municipalDocs];
      setDocuments([...allDocs, ...documentosDaLegislacao]);
      // Só os documentos extraídos de PDF vão pro cache — o custo que o cache
      // existe pra evitar é o do pdf.js, não o do import estático.
      await gravarAcervoCache(cacheSuffix, { versao: combinedVersion, documentos: allDocs });
      // Limpa o cache antigo em localStorage (versões anteriores gravavam o
      // acervo lá). Libera espaço no teto de ~5 MB que é dividido com todos os
      // outros caches do app.
      try {
        localStorage.removeItem(localStorageKey);
        localStorage.removeItem(versionKey);
      } catch { /* storage indisponível: nada a limpar */ }
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LegislacaoDocumento } from '@/lib/types';
import * as pdfjsLib from 'pdfjs-dist';

// IMPORTANTE: Garanta que o arquivo `pdf.worker.min.js` da pasta `node_modules/pdfjs-dist/build/`
// seja copiado para a pasta `public/` do seu projeto.
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;

const LOCAL_STORAGE_KEY = 'fiscal_x_biblioteca_local_v2';
const MANIFEST_VERSION_KEY = 'fiscal_x_biblioteca_version_v2';

async function processLocalDocuments(
  manifest: any, // Passamos o manifesto já buscado como um argumento
  setLoadingMessage: (message: string) => void
): Promise<{docs: LegislacaoDocumento[], version: string}> {
  const processedDocs: LegislacaoDocumento[] = [];

  if (!manifest.documents || !manifest.version) {
    throw new Error("ERRO: 'manifest.json' inválido. Faltando a chave 'documents' ou 'version'.");
  }

  for (const [index, docInfo] of manifest.documents.entries()) {
    try {
      setLoadingMessage(`Processando ${index + 1}/${manifest.documents.length}: ${docInfo.titulo}`);
      
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
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }

      const newDoc: LegislacaoDocumento = {
        id: docInfo.id,
        titulo: docInfo.titulo,
        esfera: docInfo.esfera,
        categoria: docInfo.categoria,
        descricao: docInfo.descricao || `Documento carregado de ${docInfo.path}`,
        conteudoIntegral: fullText,
        keywords: docInfo.keywords || '',
        linkOficial: docInfo.linkOficial || '',
        pdfUrl: docInfo.path,
        updatedAt: new Date().toISOString(),
        chunks: [], // Chunks não são necessários para esta implementação
      };
      processedDocs.push(newDoc);
    } catch (docError) {
      console.error(`Erro ao processar o documento ${docInfo.path}:`, docError);
    }
  }

  return { docs: processedDocs, version: manifest.version };
}

export function useBiblioteca() {
  const [documents, setDocuments] = useState<LegislacaoDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Iniciando biblioteca...');

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const manifestResponse = await fetch('/documentos-biblioteca/manifest.json');
      if (!manifestResponse.ok) {
        throw new Error("ERRO 404: 'manifest.json' não encontrado em 'public/documentos-biblioteca/'.");
      }

      // Adiciona uma verificação para o caso do arquivo estar vazio
      const manifestText = await manifestResponse.text();
      if (!manifestText) {
        throw new Error("ERRO: O arquivo 'manifest.json' foi encontrado, mas está vazio.");
      }
      const manifest = JSON.parse(manifestText);
      const remoteVersion = manifest.version;
      const localVersion = localStorage.getItem(MANIFEST_VERSION_KEY);

      if (remoteVersion && localVersion === remoteVersion) {
        setLoadingMessage('Carregando do cache local...');
        const cachedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cachedData) {
          setDocuments(JSON.parse(cachedData));
          setLoading(false);
          return;
        }
      }

      setLoadingMessage('Sincronizando acervo local (isso pode levar um minuto)...');
      const { docs, version } = await processLocalDocuments(manifest, setLoadingMessage);
      
      setDocuments(docs);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(docs));
      if (version) {
        localStorage.setItem(MANIFEST_VERSION_KEY, version);
      }
      setLoadingMessage('Biblioteca carregada!');

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return { documents, loading, error, loadingMessage };
}

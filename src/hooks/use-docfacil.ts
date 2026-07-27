
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DocfacilModelo, DocfacilDocumento, DocfacilTipo } from '@/lib/types';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  runTransaction,
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

const MODELOS_KEY = 'fiscal_x_docfacil_modelos_v1';
const DOCUMENTOS_KEY = 'fiscal_x_docfacil_documentos_v1';

/** Modelos e documentos oficiais (ofício/memorando/circular) do DOCFACIL,
 * sempre isolados pelo município do usuário logado. */
export function useDocfacil() {
  const { profile, user, configError } = useAuth();
  const [modelos, setModelos] = useState<DocfacilModelo[]>([]);
  const [documentos, setDocumentos] = useState<DocfacilDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  const municipioId = profile?.municipioId ? normalizeId(profile.municipioId) : null;

  useEffect(() => {
    if (!municipioId || !user) {
      setLoading(false);
      return;
    }

    const savedModelos = localStorage.getItem(`${MODELOS_KEY}_${municipioId}`);
    if (savedModelos) {
      try { setModelos(JSON.parse(savedModelos)); } catch {}
    }
    const savedDocumentos = localStorage.getItem(`${DOCUMENTOS_KEY}_${municipioId}`);
    if (savedDocumentos) {
      try { setDocumentos(JSON.parse(savedDocumentos)); } catch {}
    }

    if (!db || configError) {
      setLoading(false);
      return;
    }

    const qModelos = query(collection(db, 'docfacilModelos'), where('municipioId', '==', municipioId), orderBy('codigo', 'asc'));
    const unsubModelos = onSnapshot(qModelos, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as DocfacilModelo));
      localStorage.setItem(`${MODELOS_KEY}_${municipioId}`, JSON.stringify(items));
      setModelos(items);
      setLoading(false);
    }, () => setLoading(false));

    const qDocumentos = query(collection(db, 'docfacilDocumentos'), where('municipioId', '==', municipioId), orderBy('createdAt', 'desc'));
    const unsubDocumentos = onSnapshot(qDocumentos, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as DocfacilDocumento));
      localStorage.setItem(`${DOCUMENTOS_KEY}_${municipioId}`, JSON.stringify(items));
      setDocumentos(items);
    });

    return () => { unsubModelos(); unsubDocumentos(); };
  }, [municipioId, user?.uid, configError]);

  // Contador atômico por chave (um pros códigos de modelo, um por tipo+ano
  // pros números de documento emitido) — mesmo mecanismo já usado pra
  // numeração de autuações em use-intimacoes.ts.
  const nextCounter = useCallback(async (key: string): Promise<number> => {
    if (!db || !municipioId) throw new Error('Sem conexão com a nuvem.');
    const counterRef = doc(db, 'municipios', municipioId, 'counters', key);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() ? (snap.data().seq || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { seq: next }, { merge: true });
      return next;
    });
  }, [municipioId]);

  const salvarModelo = useCallback(async (
    data: { tipo: DocfacilTipo; descricao: string; tags: string[]; conteudo: string },
    id?: string
  ): Promise<DocfacilModelo> => {
    if (!db || !municipioId || !profile) throw new Error('Sem conexão com a nuvem.');
    const now = new Date().toISOString();

    if (id) {
      const existing = modelos.find((m) => m.id === id);
      const updated: DocfacilModelo = {
        ...(existing as DocfacilModelo),
        ...data,
        id,
        updatedAt: now,
      };
      await setDoc(doc(db, 'docfacilModelos', id), updated, { merge: true });
      return updated;
    }

    const codigo = await nextCounter('docfacil-modelo');
    const targetId = doc(collection(db, 'docfacilModelos')).id;
    const novo: DocfacilModelo = {
      ...data,
      id: targetId,
      codigo,
      municipioId,
      createdBy: profile.uid,
      createdByName: profile.displayName || 'Fiscal',
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'docfacilModelos', targetId), novo);
    return novo;
  }, [db, municipioId, profile, modelos, nextCounter]);

  const excluirModelo = useCallback(async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'docfacilModelos', id));
  }, [db]);

  // Antes, cada clique em "Visualizar Documento" criava um DocfacilDocumento
  // novo (com número novo), sem nenhum conceito de rascunho — fechar a aba no
  // meio da edição perdia tudo, e reabrir/gerar de novo duplicava o número.
  // Agora aceita um `id`: passado, atualiza o mesmo documento (mesmo número)
  // em vez de criar outro; o número só é reservado uma vez, no primeiro save
  // (rascunho ou finalizado), igual ao padrão já usado nas autuações.
  const salvarDocumento = useCallback(async (data: {
    modeloId: string;
    tipo: DocfacilTipo;
    destinatario: string;
    assunto: string;
    conteudo: string;
    folderId?: string;
    status: 'rascunho' | 'finalizado';
  }, id?: string): Promise<DocfacilDocumento> => {
    if (!db || !municipioId || !profile) throw new Error('Sem conexão com a nuvem.');
    const now = new Date().toISOString();
    // O Firestore rejeita gravações com campo `undefined` (lança exceção em
    // vez de simplesmente ignorar) — gerar um documento fora de uma pasta
    // deixa `folderId` undefined, então normaliza pra "" antes de gravar.
    const folderId = data.folderId || "";

    if (id) {
      const existing = documentos.find((d) => d.id === id);
      const updated: DocfacilDocumento = {
        ...(existing as DocfacilDocumento),
        ...data,
        folderId,
        id,
        updatedAt: now,
      };
      await setDoc(doc(db, 'docfacilDocumentos', id), updated, { merge: true });
      return updated;
    }

    const year = new Date().getFullYear();
    const seq = await nextCounter(`docfacil-${data.tipo}-${year}`);
    const numero = `${String(seq).padStart(4, '0')}/${year}`;

    const targetId = doc(collection(db, 'docfacilDocumentos')).id;
    const novo: DocfacilDocumento = {
      ...data,
      folderId,
      id: targetId,
      numero,
      municipioId,
      createdBy: profile.uid,
      createdByName: profile.displayName || 'Fiscal',
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'docfacilDocumentos', targetId), novo);
    return novo;
  }, [db, municipioId, profile, documentos, nextCounter]);

  const excluirDocumento = useCallback(async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'docfacilDocumentos', id));
  }, [db]);

  const moverDocumento = useCallback(async (id: string, folderId: string | null) => {
    if (!db) return;
    await setDoc(doc(db, 'docfacilDocumentos', id), { folderId: folderId || "" }, { merge: true });
  }, [db]);

  // Mesma lógica de lixeira de Intimações: mover pra lixeira só marca
  // `deleted`, sem apagar de verdade — dá pra restaurar depois. A exclusão
  // definitiva continua sendo excluirDocumento, chamada só de dentro da
  // própria lixeira.
  const moverParaLixeira = useCallback(async (id: string, toTrash: boolean) => {
    if (!db) return;
    await setDoc(doc(db, 'docfacilDocumentos', id), {
      deleted: toTrash,
      deletedAt: toTrash ? new Date().toISOString() : null,
    }, { merge: true });
  }, [db]);

  return {
    modelos,
    documentos,
    loading,
    salvarModelo,
    excluirModelo,
    salvarDocumento,
    excluirDocumento,
    moverDocumento,
    moverParaLixeira,
    getModeloById: (id: string) => modelos.find((m) => m.id === id) || null,
  };
}

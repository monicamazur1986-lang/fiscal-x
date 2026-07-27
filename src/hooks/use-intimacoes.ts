
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Intimacao } from '@/lib/types';
import { z } from 'zod'; //
import { intimacaoSchema } from '@/lib/schema'; //
import { db } from '@/lib/firebase'; // Importe a instância 'db' diretamente
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
  where,
  runTransaction
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

const LOCAL_STORAGE_KEY = 'fiscal_x_intimacoes_v4';

export function useIntimacoes(options?: { municipioIdOverride?: string }) {
  const { profile, user, configError } = useAuth(); //
  const [intimacoes, setIntimacoes] = useState<Intimacao[]>([]); //
  const [loading, setLoading] = useState(true); //
  const [isOnline, setIsOnline] = useState(true); //
  const [needsMunicipioSelection, setNeedsMunicipioSelection] = useState(false);

  // Monitorar estado da conexão
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!profile?.municipioId || !user) {
      setLoading(false);
      return;
    }

    // Root navega entre municípios clientes; sem seleção, não há o que carregar.
    if (profile.role === 'root' && !options?.municipioIdOverride) {
      setIntimacoes([]);
      setNeedsMunicipioSelection(true);
      setLoading(false);
      return;
    }
    setNeedsMunicipioSelection(false);

    // Carregamento inicial do Cache Local (Rápido)
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved).map((i: any) => ({
            ...i,
            dataIntimacao: new Date(i.dataIntimacao),
            dataRecebimento: i.dataRecebimento ? new Date(i.dataRecebimento) : undefined,
        }));
        setIntimacoes(parsed);
      } catch (e) {
        console.error("Erro ao ler cache local");
      }
    }

    if (db && !configError) {
      const targetMunicipioId = profile.role === 'root'
        ? normalizeId(options!.municipioIdOverride!)
        : profile.municipioId;

      let q;
      if (profile.role === 'admin' || profile.role === 'root') {
        q = query(
          collection(db, "intimacoes"),
          where("municipioId", "==", targetMunicipioId),
          orderBy("createdAt", "desc")
        );
      } else {
        q = query(
          collection(db, "intimacoes"),
          where("municipioId", "==", targetMunicipioId),
          where("createdBy", "==", user.uid),
          orderBy("createdAt", "desc")
        );
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            dataIntimacao: data.dataIntimacao instanceof Timestamp ? data.dataIntimacao.toDate() : new Date(data.dataIntimacao),
            dataRecebimento: data.dataRecebimento instanceof Timestamp ? data.dataRecebimento.toDate() : data.dataRecebimento ? new Date(data.dataRecebimento) : undefined,
          } as Intimacao;
        });

        // Sincroniza o Cache Local com a Nuvem
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
        setIntimacoes(items);
        setLoading(false);
      }, (err) => {
        console.warn("Firestore offline ou sem permissão, usando local.");
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, [profile?.municipioId, user?.uid, db, configError, profile?.role, options?.municipioIdOverride]);

  // Numeração oficial (0001/2026): um único contador por município e por ano,
  // incrementado atomicamente via transação do Firestore para nunca duplicar
  // números quando dois fiscais criam autuações ao mesmo tempo.
  const generateNewNumeroProcesso = useCallback(async () => {
    const year = new Date().getFullYear();
    const mid = profile?.municipioId ? normalizeId(profile.municipioId) : null;

    if (db && mid && navigator.onLine) {
      try {
        const counterRef = doc(db, "municipios", mid, "counters", String(year));
        const nextSeq = await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef);
          const current = snap.exists() ? (snap.data().seq || 0) : 0;
          const next = current + 1;
          tx.set(counterRef, { seq: next }, { merge: true });
          return next;
        });
        return `${String(nextSeq).padStart(4, '0')}/${year}`;
      } catch (e) {
        console.warn("Falha ao gerar número atômico, usando estimativa local.", e);
      }
    }

    // Sem conexão (ou falha acima): estimativa local a partir do cache,
    // só para não travar o preenchimento — o número real é confirmado ao salvar online.
    const localItems = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const maxSeq = localItems.reduce((max: number, i: any) => {
      const [seqPart, yearPart] = (i.numeroProcesso || '').split('/');
      if (parseInt(yearPart, 10) !== year) return max;
      return Math.max(max, parseInt(seqPart, 10) || 0);
    }, 0);
    return `${String(maxSeq + 1).padStart(4, '0')}/${year}`;
  }, [db, profile?.municipioId]);

  const saveIntimacao = useCallback(async (data: z.input<typeof intimacaoSchema>, id?: string) => {
    const parsedData = intimacaoSchema.parse(data);
    const now = new Date().toISOString();
    const municipioId = profile?.municipioId || 'geral';
    
    const docData = {
      ...parsedData,
      dataIntimacao: parsedData.dataIntimacao.toISOString(),
      dataRecebimento: parsedData.dataRecebimento?.toISOString(),
      updatedAt: now,
      municipioId: municipioId,
      createdBy: profile?.uid,
      createdByName: profile?.displayName,
    };

    // 1. ATUALIZA LOCALSTORAGE IMEDIATAMENTE (GARANTIA TOTAL)
    const targetId = id || Math.random().toString(36).substr(2, 9);
    let updatedList: Intimacao[] = [];
    
    setIntimacoes(prev => {
      const existing = prev.find(i => String(i.id) === String(targetId));
      const newItem = { 
        ...docData, 
        id: targetId, 
        createdAt: existing?.createdAt || now,
        dataIntimacao: new Date(docData.dataIntimacao),
        dataRecebimento: docData.dataRecebimento ? new Date(docData.dataRecebimento) : undefined
      } as Intimacao;

      if (id) {
        updatedList = prev.map(i => String(i.id) === String(id) ? newItem : i);
      } else {
        updatedList = [newItem, ...prev];
      }
      
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));
      return [...updatedList];
    });

    // 2. ENVIA PARA FIREBASE COMO FONTE PRINCIPAL
    // Diferente das outras operações (bulkDelete, etc.), aqui o sucesso/falha da
    // gravação na nuvem é reportado ao chamador (cloudSaved/cloudError) — sem
    // isso, o app mostrava "Rascunho Salvo" mesmo quando só existia no aparelho
    // local, quebrando a garantia de recuperar o documento em outro login.
    let cloudSaved = false;
    let cloudError: string | undefined;

    if (db && !configError) {
      const fbData = {
        ...docData,
        dataIntimacao: Timestamp.fromDate(parsedData.dataIntimacao),
        dataRecebimento: parsedData.dataRecebimento ? Timestamp.fromDate(parsedData.dataRecebimento) : null,
        updatedAt: Timestamp.now()
      };

      try {
        if (id) {
          await setDoc(doc(db, "intimacoes", id), fbData, { merge: true });
        } else {
          await setDoc(doc(db, "intimacoes", targetId), { ...fbData, createdAt: now });
        }
        cloudSaved = true;
      } catch (e: any) {
        console.warn("Falha ao persistir intimacão no Firebase:", e);
        cloudError = e?.message || "Falha ao salvar na nuvem";
      }
    } else {
      cloudError = "Sem conexão com a nuvem";
    }

    return { ...docData, id: targetId, cloudSaved, cloudError } as any;
  }, [db, configError, profile]);

  const bulkDelete = useCallback(async (ids: string[], toTrash: boolean) => {
    const now = new Date().toISOString();
    const stringIds = ids.map(id => String(id));
    
    setIntimacoes(prev => {
      const updated = prev.map(i => 
        stringIds.includes(String(i.id)) 
          ? { ...i, deleted: toTrash, deletedAt: now } 
          : i
      );
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return [...updated];
    });

    // Antes, a gravação real disparava com .catch(() => {}) — se falhasse
    // (sem permissão, sem internet), a tela já tinha mostrado sucesso e
    // ninguém ficava sabendo que nada foi persistido no servidor. Agora
    // aguardamos e propagamos a falha pro chamador (que já trata isso).
    if (db && !configError) {
      const results = await Promise.allSettled(
        stringIds.map(id => setDoc(doc(db, "intimacoes", id), { deleted: toTrash, deletedAt: now }, { merge: true }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram salvos no servidor.`);
    }
  }, [db, configError]);

  const permanentDelete = useCallback(async (ids: string[]) => {
    const stringIds = ids.map(id => String(id));

    setIntimacoes(prev => {
      const updated = prev.filter(i => !stringIds.includes(String(i.id)));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return [...updated];
    });

    if (db && !configError) {
      const results = await Promise.allSettled(stringIds.map(id => deleteDoc(doc(db, "intimacoes", id))));
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram excluídos no servidor.`);
    }
  }, [db, configError]);

  const bulkMoveToFolder = useCallback(async (ids: string[], folderId: string | null) => {
    const folderValue = folderId || "";
    const stringIds = ids.map(id => String(id));

    setIntimacoes(prev => {
      const updated = prev.map(i =>
        stringIds.includes(String(i.id))
          ? { ...i, folderId: folderValue, deleted: false }
          : i
      );
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return [...updated];
    });

    if (db && !configError) {
      const results = await Promise.allSettled(
        stringIds.map(id => setDoc(doc(db, "intimacoes", id), { folderId: folderValue, deleted: false }, { merge: true }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram movidos no servidor.`);
    }
  }, [db, configError]);

  return { 
    intimacoes, 
    saveIntimacao, 
    generateNewNumeroProcesso,
    bulkDelete,
    permanentDelete,
    bulkMoveToFolder,
    getIntimacaoById: (id: string) => intimacoes.find(i => String(i.id) === String(id)) || null,
    loading,
    isOnline,
    needsMunicipioSelection
  };
}

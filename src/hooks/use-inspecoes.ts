
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Inspecao } from '@/lib/types';
import { db } from '@/lib/firebase'; // Importe a instância 'db' diretamente
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  orderBy,
  Timestamp,
  query,
  where
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

const LOCAL_STORAGE_KEY = 'fiscal_x_inspecoes';
const PENDING_SYNC_KEY = 'fiscal_x_inspecoes_pending_sync';

type PendingWrite = { id: string; fbData: any };

function loadPendingWrites(): Record<string, PendingWrite> {
  try {
    return JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function savePendingWrites(pending: Record<string, PendingWrite>) {
  localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
}

export function useInspecoes(options?: { municipioIdOverride?: string }) {
  const { user, profile, configError } = useAuth();
  const [inspecoes, setInspecoes] = useState<Inspecao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [needsMunicipioSelection, setNeedsMunicipioSelection] = useState(false);
  const [pendingSyncIds, setPendingSyncIds] = useState<string[]>(() => Object.keys(loadPendingWrites()));
  const pendingWritesRef = useRef<Record<string, PendingWrite>>(loadPendingWrites());

  const tentarReenviarPendentes = useCallback(async () => {
    if (!db) return;
    const pending = pendingWritesRef.current;
    const ids = Object.keys(pending);
    if (ids.length === 0) return;

    for (const id of ids) {
      try {
        await setDoc(doc(db, "inspecoes", id), pending[id].fbData, { merge: true });
        delete pendingWritesRef.current[id];
      } catch (e) {
        // Continua offline/com erro — mantém na fila pra tentar de novo depois.
      }
    }
    savePendingWrites(pendingWritesRef.current);
    setPendingSyncIds(Object.keys(pendingWritesRef.current));
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) tentarReenviarPendentes();
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    // Tenta reenviar o que ficou pendente de uma sessão anterior assim que o app abre.
    if (navigator.onLine) tentarReenviarPendentes();
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [tentarReenviarPendentes]);

  useEffect(() => {
    if (!user || !profile?.municipioId) {
        setLoading(false);
        return;
    }

    // Root navega entre municípios clientes; sem seleção, não há o que carregar.
    if (profile.role === 'root' && !options?.municipioIdOverride) {
      setInspecoes([]);
      setNeedsMunicipioSelection(true);
      setLoading(false);
      return;
    }
    setNeedsMunicipioSelection(false);

    // Carregamento rápido do Cache
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved).map((i: any) => ({
          ...i,
          data: new Date(i.data)
        }));
        setInspecoes(parsed);
      } catch (e) {
        console.error("Erro no cache local de inspeções");
      }
    }

    if (db && !configError) {
      const mid = profile.role === 'root'
        ? normalizeId(options!.municipioIdOverride!)
        : normalizeId(profile.municipioId);
      const q = query(
        collection(db, "inspecoes"),
        where("municipioId", "==", mid),
        orderBy("data", "asc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            data: data.data instanceof Timestamp ? data.data.toDate() : new Date(data.data),
          } as Inspecao;
        });

        // Itens que ainda não confirmaram gravação na nuvem não aparecem no
        // snapshot do servidor — reaplica eles por cima pra não sumirem da
        // tela enquanto a sincronização não termina.
        const pending = pendingWritesRef.current;
        const pendingIds = Object.keys(pending);
        const merged = pendingIds.length === 0
          ? items
          : [
              ...items,
              ...pendingIds
                .filter(id => !items.some(i => i.id === id))
                .map(id => {
                  const raw = pending[id].fbData;
                  return {
                    ...raw,
                    id,
                    data: raw.data instanceof Timestamp ? raw.data.toDate() : new Date(raw.data),
                  } as Inspecao;
                }),
            ];

        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {
          console.warn("Falha ao salvar cache local de inspeções (cota excedida?):", e);
        }
        setInspecoes(merged);
        setLoading(false);
      }, (err) => {
        setLoading(false)
      });
      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, [db, user, profile, configError, options?.municipioIdOverride]);

  const saveInspecao = useCallback(async (data: Partial<Inspecao>, id?: string) => {
    if (!user || !profile?.municipioId) throw new Error("Não autenticado.");

    const mid = normalizeId(profile.municipioId);
    const inspectionDate = data.data instanceof Date ? data.data : new Date();
    const targetId = id || Math.random().toString(36).substr(2, 9);

    const docData = {
      ...data,
      id: targetId,
      municipioId: mid,
      data: inspectionDate.toISOString(),
      updatedAt: new Date().toISOString(),
      fiscalId: data.fiscalId || user.uid,
      fiscalNome: data.fiscalNome || profile?.displayName || 'Fiscal',
    };

    // 1. ATUALIZA LOCAL IMEDIATAMENTE
    setInspecoes(prev => {
        const existing = prev.find(i => i.id === targetId);
        const newItem = { ...existing, ...docData, data: inspectionDate } as Inspecao;
        const updated = id ? prev.map(i => i.id === id ? newItem : i) : [...prev, newItem];
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          // Cota do localStorage estourada (comum com muitas fotos em
          // base64 acumuladas) — sem este try/catch, isso quebrava a
          // atualização do estado local inteiro, silenciosamente.
          console.warn("Falha ao salvar cache local de inspeções (cota excedida?):", e);
        }
        return updated;
    });

    // 2. ATUALIZA NUVEM (FIREBASE COMO FONTE PRINCIPAL)
    const fbData = {
      ...docData,
      data: Timestamp.fromDate(inspectionDate),
      updatedAt: Timestamp.now()
    };

    let synced = false;
    if (db && !configError && navigator.onLine) {
      try {
        await setDoc(doc(db, "inspecoes", targetId), fbData, { merge: true });
        synced = true;
      } catch (e) {
        console.warn("Falha ao persistir inspeção no Firebase:", e);
      }
    }

    if (!synced) {
      // Guarda pra reenviar assim que a conexão voltar — sem isso, o
      // agendamento ficaria só neste aparelho e sumiria no próximo snapshot.
      pendingWritesRef.current[targetId] = { id: targetId, fbData };
      savePendingWrites(pendingWritesRef.current);
      setPendingSyncIds(Object.keys(pendingWritesRef.current));
    } else if (pendingWritesRef.current[targetId]) {
      delete pendingWritesRef.current[targetId];
      savePendingWrites(pendingWritesRef.current);
      setPendingSyncIds(Object.keys(pendingWritesRef.current));
    }

    return { id: targetId, synced };
  }, [db, user, profile, configError]);

  const deleteInspecao = useCallback(async (id: string) => {
    if (!id) return;

    setInspecoes(prev => {
        const updated = prev.filter(i => i.id !== id);
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn("Falha ao salvar cache local de inspeções (cota excedida?):", e);
        }
        return updated;
    });

    if (pendingWritesRef.current[id]) {
      delete pendingWritesRef.current[id];
      savePendingWrites(pendingWritesRef.current);
      setPendingSyncIds(Object.keys(pendingWritesRef.current));
    }

    // Antes o erro era engolido com .catch(() => {}) — se a exclusão falhasse
    // no servidor (sem permissão, sem internet), a tela já mostrava "excluído
    // com sucesso" e a inspeção continuava existindo no Firestore.
    if (db && !configError) {
        await deleteDoc(doc(db, "inspecoes", id));
    }
  }, [db, configError]);

  return { inspecoes, saveInspecao, deleteInspecao, loading, isOnline, needsMunicipioSelection, pendingSyncCount: pendingSyncIds.length };
}

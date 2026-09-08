
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

// Guarda `docData` (datas em string ISO, seguro pra JSON), nunca o `fbData`
// já convertido em Timestamp do Firestore — um Timestamp vira um objeto comum
// `{seconds, nanoseconds}` ao passar por JSON.stringify/parse (localStorage),
// e reenviar esse objeto puro pro Firestore grava um mapa qualquer no lugar
// de uma data de verdade. Timestamp é reconstruído fresco em
// buildFirestorePayload logo antes de cada envio, nunca guardado congelado.
type PendingWrite = { id: string; docData: any };

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

function buildFirestorePayload(docData: any) {
  return {
    ...docData,
    data: Timestamp.fromDate(new Date(docData.data)),
    updatedAt: Timestamp.fromDate(new Date(docData.updatedAt)),
  };
}

// `data`/`updatedAt` já corrompidos no Firestore (gravados como
// {seconds, nanoseconds} cru, pelo bug acima, antes da correção) não podem
// travar a tela pra sempre — reconstrói a data real a partir desses mesmos
// campos em vez de deixar virar Invalid Date.
function tsOrCorruptedToDate(value: any): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6));
  }
  return new Date(value);
}

function tsOrCorruptedToIso(value: any): any {
  if (!value) return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return tsOrCorruptedToDate(value).toISOString();
  }
  return value;
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
        await setDoc(doc(db, "inspecoes", id), buildFirestorePayload(pending[id].docData), { merge: true });
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

      // Mesmo padrão de use-intimacoes.ts/use-chamados.ts: fiscal comum só
      // pode LER as próprias inspeções (firestore.rules: fiscalId ==
      // request.auth.uid) — sem o where("fiscalId", ...) aqui, a query
      // pedia TODAS as inspeções do município, o que o Firestore recusa
      // inteiro (FAILED_PRECONDITION/permission-denied) assim que outro
      // fiscal ou o gestor também tem inspeção salva. O onSnapshot abaixo
      // engolia esse erro sem avisar — por fora, parecia que os dados
      // "sumiam", quando na verdade nunca chegavam a sincronizar de volta.
      const isGestor = profile.role === 'admin' || profile.role === 'root';
      const q = isGestor
        ? query(
            collection(db, "inspecoes"),
            where("municipioId", "==", mid),
            orderBy("data", "asc")
          )
        : query(
            collection(db, "inspecoes"),
            where("municipioId", "==", mid),
            where("fiscalId", "==", user.uid),
            orderBy("data", "asc")
          );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            data: tsOrCorruptedToDate(data.data),
            // updatedAt é gravado como Timestamp do Firestore (ver saveInspecao
            // abaixo), mas o tipo Inspecao.updatedAt é string (ISO) — sem essa
            // conversão, ficava um Timestamp cru no objeto, e qualquer
            // `new Date(insp.updatedAt)` (ex.: no diálogo "Minhas Inspeções")
            // virava Invalid Date, derrubando o app com "RangeError: Invalid
            // time value" assim que a lista tinha pelo menos um item — por
            // isso nunca acontecia pro root (ele nunca chega a carregar
            // inspeções reais nesta tela sem escolher um município antes).
            // tsOrCorruptedToIso/Date também cobre documentos já gravados com
            // o bug antigo da fila de reenvio (Timestamp virando objeto cru
            // {seconds, nanoseconds} no localStorage) — sem isso, um
            // documento antigo corrompido travava a tela pra sempre.
            updatedAt: tsOrCorruptedToIso(data.updatedAt),
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
                  const raw = pending[id].docData;
                  return {
                    ...raw,
                    id,
                    data: tsOrCorruptedToDate(raw.data),
                    updatedAt: tsOrCorruptedToIso(raw.updatedAt),
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
        // Antes esse erro era engolido em silêncio — foi assim que o bug do
        // índice/query faltando (ver comentário acima) passou despercebido:
        // a tela seguia mostrando só o cache local, sem nenhum aviso de que
        // a sincronização com o servidor tinha parado.
        console.error("Falha ao sincronizar inspeções com o Firestore:", err);
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
    const fbData = buildFirestorePayload(docData);

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
      pendingWritesRef.current[targetId] = { id: targetId, docData };
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

  // Mesmo padrão de use-intimacoes.ts: mover pra pasta/lixeira do menu
  // Documentos só marca campos, sem apagar — usado nos relatórios finalizados
  // (status 'concluido') que passam a aparecer lá ao lado das autuações.
  const bulkMoveToFolder = useCallback(async (ids: string[], folderId: string | null) => {
    const folderValue = folderId || "";
    const stringIds = ids.map(id => String(id));

    setInspecoes(prev => {
      const updated = prev.map(i =>
        stringIds.includes(String(i.id)) ? { ...i, folderId: folderValue, deleted: false } : i
      );
      try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (db && !configError) {
      const results = await Promise.allSettled(
        stringIds.map(id => setDoc(doc(db, "inspecoes", id), { folderId: folderValue, deleted: false }, { merge: true }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram movidos no servidor.`);
    }
  }, [db, configError]);

  const bulkDelete = useCallback(async (ids: string[], toTrash: boolean) => {
    const now = new Date().toISOString();
    const stringIds = ids.map(id => String(id));

    setInspecoes(prev => {
      const updated = prev.map(i =>
        stringIds.includes(String(i.id)) ? { ...i, deleted: toTrash, deletedAt: now } : i
      );
      try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (db && !configError) {
      const results = await Promise.allSettled(
        stringIds.map(id => setDoc(doc(db, "inspecoes", id), { deleted: toTrash, deletedAt: now }, { merge: true }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram salvos no servidor.`);
    }
  }, [db, configError]);

  const permanentDelete = useCallback(async (ids: string[]) => {
    const stringIds = ids.map(id => String(id));

    setInspecoes(prev => {
      const updated = prev.filter(i => !stringIds.includes(String(i.id)));
      try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (db && !configError) {
      const results = await Promise.allSettled(stringIds.map(id => deleteDoc(doc(db, "inspecoes", id))));
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram excluídos no servidor.`);
    }
  }, [db, configError]);

  const toggleFavorito = useCallback(async (id: string, favorito: boolean) => {
    const stringId = String(id);

    setInspecoes(prev => {
      const updated = prev.map(i => String(i.id) === stringId ? { ...i, favorito } : i);
      try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (db && !configError) {
      await setDoc(doc(db, "inspecoes", stringId), { favorito }, { merge: true });
    }
  }, [db, configError]);

  return {
    inspecoes,
    saveInspecao,
    deleteInspecao,
    bulkMoveToFolder,
    bulkDelete,
    permanentDelete,
    toggleFavorito,
    loading,
    isOnline,
    needsMunicipioSelection,
    pendingSyncCount: pendingSyncIds.length,
  };
}


'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Intimacao } from '@/lib/types';
import { z } from 'zod';
import { intimacaoSchema } from '@/lib/schema';
import { useFirestore } from '@/firebase';
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
  getDocs,
  limit
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

const LOCAL_STORAGE_KEY = 'fiscal_x_intimacoes_v4';

export function useIntimacoes() {
  const db = useFirestore();
  const { profile, user, configError } = useAuth();
  const [intimacoes, setIntimacoes] = useState<Intimacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

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
      let q;
      if (profile.role === 'admin' || profile.role === 'root') {
        q = query(
          collection(db, "intimacoes"), 
          where("municipioId", "==", profile.municipioId),
          orderBy("createdAt", "desc")
        );
      } else {
        q = query(
          collection(db, "intimacoes"), 
          where("municipioId", "==", profile.municipioId),
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
  }, [profile?.municipioId, user?.uid, db, configError, profile?.role]);

  const generateNewNumeroProcesso = useCallback(async (fiscalCode: string = "000") => {
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    const fCode = fiscalCode || profile?.fiscalCode || "000";

    // Se estiver offline ou sem DB, usa lógica sequencial baseada no local
    const localItems = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const lastForFiscal = localItems
      .filter((i: any) => i.createdBy === user?.uid)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    let nextSeq = 1;
    if (lastForFiscal && lastForFiscal.numeroProcesso) {
      const parts = lastForFiscal.numeroProcesso.split('.');
      if (parts.length >= 2) nextSeq = (parseInt(parts[1], 10) || 0) + 1;
    }

    if (!db || !navigator.onLine) {
      return `${fCode}.${nextSeq}.${month}.${year}`;
    }

    try {
      const q = query(
        collection(db, "intimacoes"),
        where("municipioId", "==", profile?.municipioId),
        where("createdBy", "==", user?.uid),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      const snap = await getDocs(q);
      let lastSeq = 0;

      if (!snap.empty) {
        const lastNum = snap.docs[0].data().numeroProcesso || "";
        const parts = lastNum.split('.');
        if (parts.length >= 2) {
            lastSeq = parseInt(parts[1], 10) || 0;
        }
      }

      nextSeq = lastSeq + 1;
      return `${fCode}.${nextSeq}.${month}.${year}`;
    } catch (e) {
      return `${fCode}.${nextSeq}.${month}.${year}`;
    }
  }, [db, profile, user]);

  const saveIntimacao = useCallback(async (data: z.infer<typeof intimacaoSchema>, id?: string) => {
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
      } catch (e) {
        console.warn("Falha ao persistir intimacão no Firebase:", e);
      }
    }

    return { ...docData, id: targetId } as any;
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

    if (db && !configError) {
      for (const id of stringIds) {
        setDoc(doc(db, "intimacoes", id), { deleted: toTrash, deletedAt: now }, { merge: true }).catch(() => {});
      }
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
      for (const id of stringIds) {
        deleteDoc(doc(db, "intimacoes", id)).catch(() => {});
      }
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
      for (const id of stringIds) {
        setDoc(doc(db, "intimacoes", id), { folderId: folderValue, deleted: false }, { merge: true }).catch(() => {});
      }
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
    isOnline
  };
}

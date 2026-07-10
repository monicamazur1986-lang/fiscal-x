
'use client';

import { useState, useEffect, useCallback } from 'react';
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

export function useInspecoes() {
  const { user, profile, configError } = useAuth();
  const [inspecoes, setInspecoes] = useState<Inspecao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

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
    if (!user || !profile?.municipioId) {
        setLoading(false);
        return;
    }

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
      const mid = normalizeId(profile.municipioId);
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
        
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
        setInspecoes(items);
        setLoading(false);
      }, (err) => {
        setLoading(false)
      });
      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, [db, user, profile, configError]);

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
      fiscalNome: data.fiscalNome || user.displayName || 'Fiscal',
    };

    // 1. ATUALIZA LOCAL IMEDIATAMENTE
    setInspecoes(prev => {
        const existing = prev.find(i => i.id === targetId);
        const newItem = { ...existing, ...docData, data: inspectionDate } as Inspecao;
        const updated = id ? prev.map(i => i.id === id ? newItem : i) : [...prev, newItem];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        return updated;
    });

    // 2. ATUALIZA NUVEM (FIREBASE COMO FONTE PRINCIPAL)
    if (db && !configError) {
      const fbData = { 
        ...docData, 
        data: Timestamp.fromDate(inspectionDate), 
        updatedAt: Timestamp.now() 
      };
      
      try {
        await setDoc(doc(db, "inspecoes", targetId), fbData, { merge: true });
      } catch (e) {
        console.warn("Falha ao persistir inspeção no Firebase:", e);
      }
    }

    return { id: targetId };
  }, [db, user, profile, configError]);

  const deleteInspecao = useCallback(async (id: string) => {
    if (!id) return;
    
    setInspecoes(prev => {
        const updated = prev.filter(i => i.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        return updated;
    });
    
    if (db && !configError) {
        await deleteDoc(doc(db, "inspecoes", id)).catch(() => {});
    }
  }, [db, configError]);

  return { inspecoes, saveInspecao, deleteInspecao, loading, isOnline };
}

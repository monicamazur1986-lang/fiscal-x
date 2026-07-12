
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Chamado } from '@/lib/types';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

const LOCAL_STORAGE_KEY = 'fiscal_x_chamados_v1';

export function useChamados(options?: { municipioIdOverride?: string }) {
  const { profile, user, configError } = useAuth();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMunicipioSelection, setNeedsMunicipioSelection] = useState(false);

  const isGestor = profile?.role === 'admin' || profile?.role === 'root';

  useEffect(() => {
    if (!profile?.municipioId || !user) {
      setLoading(false);
      return;
    }

    if (profile.role === 'root' && !options?.municipioIdOverride) {
      setChamados([]);
      setNeedsMunicipioSelection(true);
      setLoading(false);
      return;
    }
    setNeedsMunicipioSelection(false);

    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        setChamados(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao ler cache local de chamados");
      }
    }

    if (db && !configError) {
      const targetMunicipioId = profile.role === 'root'
        ? normalizeId(options!.municipioIdOverride!)
        : profile.municipioId;

      // Fiscal comum só vê os próprios chamados; admin/root vê todos do município.
      const q = isGestor
        ? query(collection(db, "chamados"), where("municipioId", "==", targetMunicipioId), orderBy("createdAt", "desc"))
        : query(collection(db, "chamados"), where("municipioId", "==", targetMunicipioId), where("createdBy", "==", user.uid), orderBy("createdAt", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Chamado));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
        setChamados(items);
        setLoading(false);
      }, () => {
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, [profile?.municipioId, user?.uid, configError, profile?.role, isGestor, options?.municipioIdOverride]);

  const abrirChamado = useCallback(async (data: { tipo: Chamado['tipo']; assunto: string; descricao: string; pagina?: string }) => {
    if (!user || !profile?.municipioId) throw new Error("Não autenticado.");

    const now = new Date().toISOString();
    const targetId = Math.random().toString(36).substr(2, 9);

    const docData: Chamado = {
      id: targetId,
      tipo: data.tipo,
      assunto: data.assunto,
      descricao: data.descricao,
      pagina: data.pagina || '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      status: 'aberto',
      createdBy: user.uid,
      createdByName: profile.displayName || '',
      createdByEmail: profile.email || '',
      municipioId: normalizeId(profile.municipioId),
      createdAt: now,
    };

    setChamados(prev => {
      const updated = [docData, ...prev];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    if (db && !configError) {
      await setDoc(doc(db, "chamados", targetId), docData);
    }

    return docData;
  }, [user, profile, configError]);

  const responderChamado = useCallback(async (id: string, resposta: string, novoStatus: Chamado['status'] = 'resolvido') => {
    const now = new Date().toISOString();
    setChamados(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, resposta, status: novoStatus, respondidoPor: profile?.displayName || '', updatedAt: now } : c);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    if (db && !configError) {
      await updateDoc(doc(db, "chamados", id), { resposta, status: novoStatus, respondidoPor: profile?.displayName || '', updatedAt: now });
    }
  }, [db, configError, profile]);

  const atualizarStatus = useCallback(async (id: string, status: Chamado['status']) => {
    const now = new Date().toISOString();
    setChamados(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, status, updatedAt: now } : c);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    if (db && !configError) {
      await updateDoc(doc(db, "chamados", id), { status, updatedAt: now });
    }
  }, [db, configError]);

  return {
    chamados,
    loading,
    needsMunicipioSelection,
    abrirChamado,
    responderChamado,
    atualizarStatus,
  };
}

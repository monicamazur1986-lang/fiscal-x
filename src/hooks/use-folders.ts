'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Folder } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, query, where } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

const LOCAL_STORAGE_KEY = 'fiscal_x_folders';

/** Pastas de organização, isoladas por município e por área (Documentos ou
 * Docfacil não compartilham a mesma árvore) — mesmo padrão de sincronização
 * já usado em use-docfacil.ts, pra que uma pasta criada por um fiscal
 * apareça pros outros usuários do mesmo município, não só no aparelho dele. */
export function useFolders(area: 'intimacoes' | 'docfacil') {
  const { profile, user, configError } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const municipioId = profile?.municipioId ? normalizeId(profile.municipioId) : null;
  const storageKey = `${LOCAL_STORAGE_KEY}_${area}_${municipioId}`;

  useEffect(() => {
    if (!municipioId || !user) {
      setLoading(false);
      return;
    }

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setFolders(JSON.parse(saved)); } catch {}
    }

    if (!db || configError) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'folders'), where('municipioId', '==', municipioId), where('area', '==', area));
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Folder));
      localStorage.setItem(storageKey, JSON.stringify(items));
      setFolders(items);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [municipioId, area, user?.uid, configError, storageKey]);

  const createFolder = useCallback(async (name: string, parentId?: string) => {
    if (!db || !municipioId || !user) throw new Error('Sem conexão com a nuvem.');
    const targetId = doc(collection(db, 'folders')).id;
    const novo: Folder = {
      id: targetId,
      name: name.toUpperCase(),
      parentId: parentId || "",
      municipioId,
      area,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      deleted: false,
    };
    await setDoc(doc(db, 'folders', targetId), novo);
  }, [db, municipioId, area, user]);

  const moveFolder = useCallback(async (id: string, targetParentId: string | null) => {
    if (!db) return;
    await setDoc(doc(db, 'folders', id), { parentId: targetParentId || "" }, { merge: true });
  }, [db]);

  const toggleTrash = useCallback(async (id: string, isDeleted: boolean) => {
    if (!db) return;
    await setDoc(doc(db, 'folders', id), { deleted: isDeleted, deletedAt: isDeleted ? new Date().toISOString() : "" }, { merge: true });
  }, [db]);

  return { folders, createFolder, moveFolder, toggleTrash, loading };
}

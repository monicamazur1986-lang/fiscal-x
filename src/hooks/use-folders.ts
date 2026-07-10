'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Folder } from '@/lib/types';

const LOCAL_STORAGE_KEY = 'fiscal_x_folders';

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) setFolders(JSON.parse(saved));
    setLoading(false);
  }, []);

  const createFolder = useCallback(async (name: string, parentId?: string) => {
    const newFolder = {
      id: Math.random().toString(36).substr(2, 9),
      name: name.toUpperCase(),
      parentId: parentId || "",
      createdBy: 'local', // Usuário é sempre local
      createdAt: new Date().toISOString(),
      deleted: false
    } as Folder;

    setFolders(prev => {
      const updated = [newFolder, ...prev];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const moveFolder = useCallback(async (id: string, targetParentId: string | null) => {
    setFolders(prev => {
      const updated = prev.map(f => f.id === id ? { ...f, parentId: targetParentId || "" } : f);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleTrash = useCallback(async (id: string, isDeleted: boolean) => {
    setFolders(prev => {
      const updated = prev.map(f => f.id === id ? { ...f, deleted: isDeleted } : f);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { folders, createFolder, moveFolder, toggleTrash, loading };
}

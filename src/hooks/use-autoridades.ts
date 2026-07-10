'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Autoridade } from '@/lib/types';
import { z } from 'zod';
import { autoridadeSchema } from '@/lib/schema';

const LOCAL_STORAGE_KEY = 'fiscal_x_autoridades';

export function useAutoridades() {
  const [autoridades, setAutoridades] = useState<Autoridade[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    function loadFromLocal() {
      setLoading(true);
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) setAutoridades(JSON.parse(saved));
      setLoading(false);
    }
    loadFromLocal();
  }, []);
  
  const addAutoridade = useCallback(async (data: z.infer<typeof autoridadeSchema>) => {
    const newDoc = {
      id: Math.random().toString(36).substr(2, 9),
      nome: data.nome, // Removido .toUpperCase()
      cargo: data.cargo, // Removido .toUpperCase()
      rg: data.rg, // Removido .toUpperCase()
      createdAt: new Date().toISOString()
    } as Autoridade;

    setAutoridades(prev => {
      const updated = [...prev, newDoc].sort((a,b) => a.nome.localeCompare(b.nome));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteAutoridade = useCallback(async (id: string) => {
    setAutoridades(prev => {
      const updated = prev.filter(a => a.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);
  
  return { autoridades, addAutoridade, deleteAutoridade, loading };
}

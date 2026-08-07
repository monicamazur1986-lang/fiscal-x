'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { useAuth } from './use-auth';

/**
 * Diz se o município do usuário logado já tem um gestor (role 'admin')
 * cadastrado — só relevante pra quem é 'fiscal' (admin/root sempre podem
 * ajustar a Identidade Municipal, então retornam temGestor: true direto,
 * sem gastar uma chamada de rede).
 *
 * Usado pra liberar o fiscal a ajustar os padrões municipais (Identidade
 * Municipal) só na ausência de um gestor de fato — ver
 * src/app/api/municipio/tem-gestor/route.ts pro motivo de isso não dar pra
 * checar direto do client (regras do Firestore).
 */
export function useMunicipioTemGestor() {
  const { profile } = useAuth();
  const [temGestor, setTemGestor] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    if (profile.role !== 'fiscal') {
      setTemGestor(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("Não autenticado");
        const res = await fetch('/api/municipio/tem-gestor', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (!cancelled) setTemGestor(res.ok ? !!data.temGestor : true);
      } catch {
        // Falha na checagem: assume que há gestor (mais conservador — não
        // libera acesso indevido por causa de um erro de rede).
        if (!cancelled) setTemGestor(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.uid, profile?.role]);

  return { temGestor, loading };
}

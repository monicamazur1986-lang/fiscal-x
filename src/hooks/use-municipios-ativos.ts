
'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

/**
 * Ids normalizados de município que têm pelo menos um usuário autorizado
 * (fiscal ou gestor) cadastrado — só root precisa disso, pra priorizar no
 * seletor de município quem já é cliente ativo em vez de uma lista alfabética
 * com todos os ~400 municípios do Paraná (municipios-pr.json). Os demais
 * papéis já enxergam direto o próprio município, sem seletor.
 *
 * Mesma coleção e mesmo critério (isAuthorized && role !== 'root') já usados
 * em admin/usuarios/page.tsx para agrupar por cidade — aqui só vira um Set de
 * ids em vez de uma lista de usuários.
 */
export function useMunicipiosAtivos(): Set<string> {
  const { profile } = useAuth();
  const isRoot = profile?.role === 'root';
  const [ativos, setAtivos] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isRoot || !db) return;

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const set = new Set<string>();
      snapshot.forEach((doc) => {
        const d = doc.data();
        if (d.isAuthorized && d.role !== 'root' && d.municipioId) {
          set.add(normalizeId(d.municipioId));
        }
      });
      setAtivos(set);
    }, () => {
      // Sem permissão ou offline — mantém o Set vazio (a lista cai pro
      // comportamento anterior: tudo em "demais municípios").
    });

    return () => unsubscribe();
  }, [isRoot]);

  return ativos;
}

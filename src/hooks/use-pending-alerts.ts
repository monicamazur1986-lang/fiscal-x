
'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

/**
 * Contagem de itens aguardando ação de gestor/root: cadastros pendentes
 * (mesmo escopo de admin/usuarios/page.tsx) e chamados de suporte em aberto
 * (mesmo escopo de use-chamados.ts). Usado pro badge no menu e pro alerta do
 * Dashboard — só root e gestor recebem contagem, fiscal sempre fica em zero.
 *
 * Excluir status 'revoked' e 'rejected' é essencial aqui: um fiscal que já
 * foi autorizado e teve o acesso revogado, ou uma solicitação recusada pelo
 * gestor, NÃO são cadastro novo aguardando primeira análise — sem esse
 * filtro eles reaparecem como "nova solicitação" indefinidamente, mesmo já
 * tendo sido resolvidos.
 */
export function usePendingAlerts() {
  const { profile } = useAuth();
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [pendingUserNames, setPendingUserNames] = useState<string[]>([]);
  const [pendingChamadosCount, setPendingChamadosCount] = useState(0);

  const isGestor = profile?.role === 'admin' || profile?.role === 'root';

  useEffect(() => {
    if (!db || !isGestor || !profile) {
      setPendingUsersCount(0);
      setPendingUserNames([]);
      return;
    }

    const q = profile.role === 'admin'
      ? query(collection(db, "users"), where("municipioId", "==", normalizeId(profile.municipioId)))
      : collection(db, "users");

    const unsub = onSnapshot(q, (snap) => {
      const pendentes = snap.docs.filter(d => {
        const data = d.data();
        return !data.isAuthorized && data.role !== 'root' && data.status !== 'revoked' && data.status !== 'rejected';
      });
      setPendingUsersCount(pendentes.length);
      setPendingUserNames(pendentes.map(d => d.data().displayName || d.data().email || "Fiscal"));
    }, () => { setPendingUsersCount(0); setPendingUserNames([]); });

    return () => unsub();
  }, [db, isGestor, profile?.role, profile?.municipioId]);

  useEffect(() => {
    if (!db || !isGestor || !profile) {
      setPendingChamadosCount(0);
      return;
    }

    const q = profile.role === 'admin'
      ? query(collection(db, "chamados"), where("municipioId", "==", normalizeId(profile.municipioId)))
      : collection(db, "chamados");

    const unsub = onSnapshot(q, (snap) => {
      const count = snap.docs.filter(d => d.data().status !== 'resolvido').length;
      setPendingChamadosCount(count);
    }, () => setPendingChamadosCount(0));

    return () => unsub();
  }, [db, isGestor, profile?.role, profile?.municipioId]);

  return { pendingUsersCount, pendingUserNames, pendingChamadosCount };
}

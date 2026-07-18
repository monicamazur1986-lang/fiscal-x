
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FaqItem } from '@/lib/types';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

/**
 * Manual/FAQ do sistema — coleção global (não isolada por município, ao
 * contrário de quase tudo no resto do app), porque a dúvida "como uso o
 * roteiro" é a mesma em qualquer cidade. Leitura liberada pra qualquer
 * usuário autenticado; escrita só admin/root (ver firestore.rules).
 */
export function useFaq() {
  const { profile } = useAuth();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !profile) {
      setLoading(false);
      return;
    }

    const col = collection(db, 'faq');
    const q = query(col, orderBy('order', 'asc'));

    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as FaqItem)));
      setLoading(false);
    }, (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: col.path,
        operation: 'list',
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
      setLoading(false);
    });

    return unsub;
  }, [profile]);

  const addFaqItem = useCallback(async (data: { category: string; question: string; answer: string; order: number }) => {
    if (!db || !profile) throw new Error('Não autenticado.');
    const col = collection(db, 'faq');
    const payload = {
      ...data,
      createdBy: profile.uid,
      createdByName: profile.displayName || 'Admin',
      createdAt: serverTimestamp(),
    };
    try {
      await addDoc(col, payload);
    } catch (e) {
      const permissionError = new FirestorePermissionError({
        path: col.path,
        operation: 'create',
        requestResourceData: payload,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
      throw e;
    }
  }, [profile]);

  const updateFaqItem = useCallback(async (id: string, data: { category: string; question: string; answer: string; order: number }) => {
    if (!db) throw new Error('Sem conexão.');
    const ref = doc(db, 'faq', id);
    const payload = { ...data, updatedAt: serverTimestamp() };
    try {
      await updateDoc(ref, payload);
    } catch (e) {
      const permissionError = new FirestorePermissionError({
        path: ref.path,
        operation: 'update',
        requestResourceData: payload,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
      throw e;
    }
  }, []);

  const deleteFaqItem = useCallback(async (id: string) => {
    if (!db) throw new Error('Sem conexão.');
    const ref = doc(db, 'faq', id);
    try {
      await deleteDoc(ref);
    } catch (e) {
      const permissionError = new FirestorePermissionError({
        path: ref.path,
        operation: 'delete',
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
      throw e;
    }
  }, []);

  return { items, loading, addFaqItem, updateFaqItem, deleteFaqItem };
}

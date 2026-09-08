'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Pas, PasPeca, PasPecaTipo } from '@/lib/types';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  or,
  and,
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';
import { attemptFirestoreWrite } from '@/lib/firestore-offline';

const LOCAL_STORAGE_KEY = 'fiscal_x_pas_v1';

/** Lista de processos do município — mesmo recorte de use-intimacoes.ts:
 * gestor (admin/root) vê todos do município, fiscal comum só os próprios. */
export function usePas() {
  const { user, profile, configError } = useAuth();
  const [processos, setProcessos] = useState<Pas[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile?.municipioId) { setLoading(false); return; }

    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try { setProcessos(JSON.parse(saved)); } catch (e) { /* cache corrompido, ignora */ }
    }

    if (!db || configError) { setLoading(false); return; }

    const mid = normalizeId(profile.municipioId);
    const isGestor = profile.role === 'admin' || profile.role === 'root';
    // Fiscal comum vê os próprios processos E os que foram encaminhados pra
    // ele explicitamente (ver PasEncaminharDialog) — sem o "or", um processo
    // encaminhado por um gestor pra um fiscal que não é o autuante original
    // nunca apareceria na lista dele.
    const q = isGestor
      ? query(collection(db, 'pas'), where('municipioId', '==', mid), orderBy('createdAt', 'desc'))
      : query(
          collection(db, 'pas'),
          and(
            where('municipioId', '==', mid),
            or(where('createdBy', '==', user.uid), where('responsavelAtualUid', '==', user.uid))
          ),
          orderBy('createdAt', 'desc')
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as Pas);
      setProcessos(items);
      try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* cota do localStorage */ }
      setLoading(false);
    }, (err) => {
      console.error('Falha ao sincronizar processos (PAS) com o Firestore:', err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, profile, configError]);

  /** Cria o PAS já na fase de instauração — a peça de despacho inicial é
   * gravada à parte, por quem chamar, via usePasPecas(id).adicionarPeca. */
  const criarPas = useCallback(async (data: Omit<Pas, 'id' | 'municipioId' | 'createdBy' | 'createdByName' | 'createdAt' | 'fase'>) => {
    if (!user || !profile?.municipioId) throw new Error('Não autenticado.');
    if (!db || configError) throw new Error('Sem conexão com o banco de dados.');
    const mid = normalizeId(profile.municipioId);
    const docData: Omit<Pas, 'id'> = {
      ...data,
      municipioId: mid,
      fase: 'instauracao',
      createdBy: user.uid,
      createdByName: profile.displayName || 'Fiscal',
      createdAt: new Date().toISOString(),
    };
    // doc(collection(...)) gera o id na hora, sem precisar de rede — offline,
    // attemptFirestoreWrite evita que o await trave esperando o servidor
    // confirmar (a gravação já fica na fila do próprio Firestore, ver
    // src/lib/firestore-offline.ts), mas o id retornado é o mesmo de sempre.
    const ref = doc(collection(db, 'pas'));
    await attemptFirestoreWrite(setDoc(ref, docData));
    return ref.id;
  }, [user, profile, configError]);

  const atualizarPas = useCallback(async (id: string, data: Partial<Pas>) => {
    if (!db) return;
    await attemptFirestoreWrite(setDoc(doc(db, 'pas', id), { ...data, updatedAt: new Date().toISOString() }, { merge: true }));
  }, []);

  // Exclusão de verdade (não é lixeira) — pensada pra corrigir um PAS aberto
  // por engano/teste. Apaga as peças primeiro (Firestore não apaga
  // subcoleção sozinho ao apagar o doc pai) e só depois o processo em si.
  const excluirPas = useCallback(async (id: string) => {
    if (!db) return;
    const pecasSnap = await getDocs(collection(db, 'pas', id, 'pecas'));
    await Promise.all(pecasSnap.docs.map((d) => attemptFirestoreWrite(deleteDoc(d.ref))));
    await attemptFirestoreWrite(deleteDoc(doc(db, 'pas', id)));
  }, []);

  return { processos, loading, criarPas, atualizarPas, excluirPas };
}

/** Peças (autos) de um processo específico — subcoleção `pas/{pasId}/pecas`,
 * sempre em ordem cronológica/numérica, nunca editadas depois de criadas. */
export function usePasPecas(pasId: string | null) {
  const { profile } = useAuth();
  const [pecas, setPecas] = useState<PasPeca[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pasId || !db) { setPecas([]); setLoading(false); return; }
    const q = query(collection(db, 'pas', pasId, 'pecas'), orderBy('numero', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPecas(snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as PasPeca));
      setLoading(false);
    }, (err) => {
      console.error('Falha ao sincronizar peças do PAS:', err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [pasId]);

  type NovaPeca = { tipo: PasPecaTipo; titulo: string; conteudoHtml: string; anexoUrl?: string; assinaturaUrl?: string; assinadoForaDoSistema?: boolean };

  // Aceita uma ou várias peças de uma vez, numerando sequencialmente a partir
  // de `pecas.length` — necessário pra respeitar a "regra de ouro" do manual
  // (Termo de Juntada sempre ANTES do documento a que se refere) sem correr
  // risco de duas peças nascerem com o mesmo número: se cada peça fosse
  // gravada com uma chamada separada, a segunda leria `pecas.length` ainda
  // desatualizado (o onSnapshot só reflete a primeira depois de um round-trip
  // com o Firestore), duplicando a numeração.
  const adicionarPecas = useCallback(async (itens: NovaPeca[]) => {
    if (!pasId || !db || !profile) throw new Error('Processo não carregado.');
    let numero = pecas.length;
    const ids: string[] = [];
    for (const item of itens) {
      numero += 1;
      // O Firestore rejeita a gravação inteira se qualquer campo vier como
      // `undefined` (addDoc lança "Unsupported field value: undefined") — por
      // isso anexoUrl só entra no objeto quando de fato existe, em vez de
      // sempre presente e às vezes undefined (a maioria das peças, como o
      // despacho inicial, não tem anexo nenhum).
      const peca: Omit<PasPeca, 'id'> = {
        numero,
        tipo: item.tipo,
        titulo: item.titulo,
        conteudoHtml: item.conteudoHtml,
        ...(item.anexoUrl ? { anexoUrl: item.anexoUrl } : {}),
        ...(item.assinaturaUrl ? { assinaturaUrl: item.assinaturaUrl } : {}),
        ...(item.assinadoForaDoSistema ? { assinadoForaDoSistema: true } : {}),
        criadoPorUid: profile.uid,
        criadoPorNome: profile.displayName || 'Fiscal',
        criadoEm: new Date().toISOString(),
      };
      // doc(collection(...)) gera o id sem precisar de rede — mesmo raciocínio
      // de criarPas acima, necessário aqui pra numeração sequencial não travar
      // esperando confirmação do servidor offline.
      const ref = doc(collection(db, 'pas', pasId, 'pecas'));
      // eslint-disable-next-line no-await-in-loop -- numeração sequencial precisa ser em ordem
      await attemptFirestoreWrite(setDoc(ref, peca));
      ids.push(ref.id);
    }
    return ids;
  }, [pasId, profile, pecas.length]);

  const adicionarPeca = useCallback(async (data: NovaPeca) => {
    const [id] = await adicionarPecas([data]);
    return id;
  }, [adicionarPecas]);

  return { pecas, loading, adicionarPeca, adicionarPecas };
}

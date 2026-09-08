'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Autoridade } from '@/lib/types';
import { z } from 'zod';
import { autoridadeSchema } from '@/lib/schema';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';
import { attemptFirestoreWrite } from '@/lib/firestore-offline';

const LOCAL_STORAGE_KEY_PREFIX = 'fiscal_x_autoridades_v2';
// Chave antiga, sem município — usada até esta versão guardar tudo só no
// aparelho de quem cadastrou. Migrada automaticamente pro Firestore na
// primeira vez que o município ainda não tiver nada lá (ver useEffect
// abaixo), pra ninguém perder os fiscais que já tinha cadastrado.
const LEGACY_LOCAL_STORAGE_KEY = 'fiscal_x_autoridades';

/**
 * Cadastro de fiscais/autoridades sanitárias (nome, cargo, RG/CPF) usado pra
 * assinar Autos de Infração, Roteiros etc. — antes só existia no localStorage
 * de cada aparelho (apesar do texto na tela dizer "cadastro central"), então
 * um fiscal que trocasse de aparelho ou limpasse o cache "perdia" os nomes
 * cadastrados, e o gestor nunca via os fiscais que um colega tinha
 * cadastrado no próprio celular. Agora sincroniza pelo Firestore, por
 * município — mesmo padrão de src/hooks/use-folders.ts.
 */
export function useAutoridades() {
  const { profile } = useAuth();
  const [autoridades, setAutoridades] = useState<Autoridade[]>([]);
  const [loading, setLoading] = useState(true);
  const migratedRef = useRef(false);

  const municipioId = profile?.municipioId ? normalizeId(profile.municipioId) : null;
  const storageKey = municipioId ? `${LOCAL_STORAGE_KEY_PREFIX}_${municipioId}` : null;

  useEffect(() => {
    if (!municipioId || !storageKey) {
      setLoading(false);
      return;
    }

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setAutoridades(JSON.parse(saved)); } catch {}
    }

    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'autoridades'), where('municipioId', '==', municipioId));
    const unsub = onSnapshot(q, async (snapshot) => {
      // Migração de uma vez só: só roda se o Firestore deste município ainda
      // não tiver NADA (nunca de novo depois disso, mesmo que outro aparelho
      // do mesmo município também tenha uma lista antiga sobrando) — evita
      // duplicar cadastro se dois fiscais abrirem o app pela primeira vez
      // após a atualização quase ao mesmo tempo.
      if (snapshot.empty && !migratedRef.current) {
        migratedRef.current = true;
        const legacy = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
        if (legacy) {
          try {
            const items: Autoridade[] = JSON.parse(legacy);
            if (Array.isArray(items) && items.length > 0) {
              await Promise.all(items.map((item) => {
                const ref = doc(collection(db, 'autoridades'));
                const migrado: Autoridade = {
                  id: ref.id,
                  nome: item.nome || '',
                  cargo: item.cargo || '',
                  rg: item.rg || '',
                  municipioId,
                  ...(item.signature ? { signature: item.signature } : {}),
                };
                return attemptFirestoreWrite(setDoc(ref, migrado));
              }));
              // Não migra de novo neste aparelho, mesmo que a leitura acima
              // (onSnapshot) ainda não tenha refletido as gravações recém
              // enviadas na primeira notificação.
              localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
            }
          } catch {
            // Lista antiga corrompida — segue sem migrar, não trava o cadastro novo.
          }
        }
        return; // as gravações da migração disparam uma nova notificação do onSnapshot
      }

      const items = snapshot.docs
        .map((d) => ({ ...d.data(), id: d.id } as Autoridade))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setAutoridades(items);
      try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch {}
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [municipioId, storageKey]);

  const addAutoridade = useCallback(async (data: z.infer<typeof autoridadeSchema>) => {
    if (!db || !municipioId) throw new Error('Sem conexão com a nuvem.');
    const ref = doc(collection(db, 'autoridades'));
    const novo: Autoridade = {
      id: ref.id,
      nome: data.nome,
      cargo: data.cargo,
      rg: data.rg,
      municipioId,
      ...(data.signature ? { signature: data.signature } : {}),
    };
    await attemptFirestoreWrite(setDoc(ref, novo));
  }, [municipioId]);

  const deleteAutoridade = useCallback(async (id: string) => {
    if (!db) return;
    await attemptFirestoreWrite(deleteDoc(doc(db, 'autoridades', id)));
  }, []);

  return { autoridades, addAutoridade, deleteAutoridade, loading };
}

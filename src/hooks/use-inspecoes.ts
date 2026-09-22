
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Inspecao } from '@/lib/types';
import { db } from '@/lib/firebase'; // Importe a instância 'db' diretamente
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  orderBy,
  Timestamp,
  query,
  where,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';

import { lerCacheColecao, salvarCacheColecao } from '@/lib/cache-colecao-local';
import { attemptFirestoreWrite } from '@/lib/firestore-offline';
const LOCAL_STORAGE_KEY = 'fiscal_x_inspecoes';
// Chave v2. A v1 espelhava a fila do próprio Firestore: toda gravação sem
// confirmação em 4 segundos entrava aqui, inclusive as que o SDK já tinha
// aceitado e ia reenviar sozinho. O conteúdo daquela fila é, por construção,
// duplicata do que o SDK já tem — e reenviá-la a cada abertura do app era o
// que mantinha a fila de 500 escritas do Firestore permanentemente cheia.
//
// Trocar a chave abandona aquele conteúdo de uma vez. Não há perda: o que
// estava lá ou já foi gravado, ou continua na fila do SDK, que é quem
// sempre foi o dono do reenvio.
const PENDING_SYNC_KEY = 'fiscal_x_inspecoes_pending_sync_v2';
const PENDING_SYNC_KEY_LEGADO = 'fiscal_x_inspecoes_pending_sync';

// Guarda `docData` (datas em string ISO, seguro pra JSON), nunca o `fbData`
// já convertido em Timestamp do Firestore — um Timestamp vira um objeto comum
// `{seconds, nanoseconds}` ao passar por JSON.stringify/parse (localStorage),
// e reenviar esse objeto puro pro Firestore grava um mapa qualquer no lugar
// de uma data de verdade. Timestamp é reconstruído fresco em
// buildFirestorePayload logo antes de cada envio, nunca guardado congelado.
type PendingWrite = { id: string; docData: any };

function loadPendingWrites(): Record<string, PendingWrite> {
  try {
    // Descarta a fila v1 na primeira leitura, para ela parar de ser reenviada.
    localStorage.removeItem(PENDING_SYNC_KEY_LEGADO);
    return JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function savePendingWrites(pending: Record<string, PendingWrite>) {
  // Diferente do cache de partida rápida, esta fila NÃO pode ser podada: cada
  // entrada é uma vistoria ainda não confirmada no servidor, e descartar uma
  // significaria perder o trabalho do fiscal. Mas também não pode derrubar o
  // salvamento se a cota do localStorage estourar — o Firestore já mantém a
  // própria fila offline em IndexedDB (ver firebase.ts), então aqui o pior
  // caso é ficar sem a rede de segurança extra, não perder a gravação.
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
  } catch (e) {
    console.warn("Fila local de sincronização não pôde ser gravada (cota do localStorage?). O reenvio segue pela fila do próprio Firestore.", e);
  }
}

/**
 * O DOCUMENTO CABE NO FIRESTORE?
 *
 * O limite é 1 MiB por documento. Uma vistoria estoura isso com facilidade
 * quando as fotos entram embutidas em base64 — o que acontece sempre que o
 * envio ao Storage falha (ver o fallback blobToDataUrl no roteiro): cada foto
 * comprimida vira algo entre 100 e 300 KB de texto dentro do próprio
 * documento, e quatro ou cinco já passam do teto.
 *
 * Por que isso é grave e não apenas "essa gravação falha": a fila de
 * gravações do SDK é FIFO. Uma gravação que o servidor nunca aceita fica na
 * frente e SEGURA TODAS AS OUTRAS. Nada atrás dela commita, a fila enche até
 * as 500 permitidas, e a partir daí o aparelho inteiro para de salvar:
 * "Write stream exhausted maximum allowed queued writes", com o stream em
 * backoff máximo. Um único rascunho com fotos demais trava o app todo.
 *
 * Melhor recusar aqui, avisando, do que entregar ao SDK uma gravação que vai
 * envenenar a fila para sempre.
 */
const LIMITE_FIRESTORE_BYTES = 1048576;
// Margem para os metadados que o Firestore soma por conta própria (nomes de
// campo, índices, overhead do documento) — o cálculo abaixo é do JSON, não do
// formato interno dele.
const TETO_SEGURO_BYTES = Math.floor(LIMITE_FIRESTORE_BYTES * 0.85);

function tamanhoAproximadoEmBytes(payload: any): number {
  try {
    // Timestamp não serializa em JSON; só precisamos da ordem de grandeza, e
    // o peso está nas fotos em base64, que são texto puro.
    return new Blob([JSON.stringify(payload, (_k, v) => (v instanceof Timestamp ? "" : v))]).size;
  } catch {
    return 0;
  }
}

function buildFirestorePayload(docData: any) {
  return {
    ...docData,
    data: Timestamp.fromDate(new Date(docData.data)),
    updatedAt: Timestamp.fromDate(new Date(docData.updatedAt)),
  };
}

// `data`/`updatedAt` já corrompidos no Firestore (gravados como
// {seconds, nanoseconds} cru, pelo bug acima, antes da correção) não podem
// travar a tela pra sempre — reconstrói a data real a partir desses mesmos
// campos em vez de deixar virar Invalid Date.
function tsOrCorruptedToDate(value: any): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6));
  }
  return new Date(value);
}

function tsOrCorruptedToIso(value: any): any {
  if (!value) return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return tsOrCorruptedToDate(value).toISOString();
  }
  return value;
}

export function useInspecoes(options?: { municipioIdOverride?: string }) {
  const { user, profile, configError } = useAuth();
  const [inspecoes, setInspecoes] = useState<Inspecao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [needsMunicipioSelection, setNeedsMunicipioSelection] = useState(false);
  const [pendingSyncIds, setPendingSyncIds] = useState<string[]>(() => Object.keys(loadPendingWrites()));
  const pendingWritesRef = useRef<Record<string, PendingWrite>>(loadPendingWrites());
  const reenviandoRef = useRef(false);
  // Liga quando o SDK recusa por fila cheia; desliga o reenvio local até o
  // app ser recarregado.
  const sdkSobrecarregadoRef = useRef(false);
  const ultimoReenvioRef = useRef(0);

  const tentarReenviarPendentes = useCallback(async () => {
    if (!db) return;
    // Duas guardas contra reenvio em rajada: uma execução por vez, e nunca
    // mais de uma por minuto. Sem elas, abrir/navegar várias telas disparava
    // o reenvio de toda a fila a cada montagem.
    if (reenviandoRef.current || sdkSobrecarregadoRef.current) return;
    if (Date.now() - ultimoReenvioRef.current < 60000) return;

    const pending = pendingWritesRef.current;
    const ids = Object.keys(pending);
    if (ids.length === 0) return;

    reenviandoRef.current = true;
    ultimoReenvioRef.current = Date.now();
    try {

    // Mesmo motivo de saveInspecao: com `await setDoc` puro, um servidor que
    // não responde travava este laço no primeiro id — os demais nunca eram
    // reenviados e a fila nunca esvaziava.
    for (const id of ids) {
      try {
        const r = await attemptFirestoreWrite(setDoc(doc(db, "inspecoes", id), buildFirestorePayload(pending[id].docData), { merge: true }));
        // Só sai da fila caseira com confirmação do servidor. Enfileirado no
        // SDK não é o mesmo que gravado.
        if (r.synced) delete pendingWritesRef.current[id];
      } catch (e: any) {
        // A fila do SDK está cheia (500 gravações não confirmadas). Insistir
        // só produz o mesmo erro no console a cada tentativa e atrasa ainda
        // mais o que já está na fila — desiste pelo resto da sessão.
        if (e?.code === 'resource-exhausted') {
          sdkSobrecarregadoRef.current = true;
          console.warn(
            'Fila de gravações do Firestore cheia. O reenvio local foi suspenso nesta sessão. ' +
            'Para destravar: DevTools > Application > Storage > Clear site data (as gravações ainda não confirmadas se perdem).'
          );
          break;
        }
        // Offline ou erro passageiro — mantém na fila pra tentar depois.
      }
    }
      savePendingWrites(pendingWritesRef.current);
      setPendingSyncIds(Object.keys(pendingWritesRef.current));
    } finally {
      reenviandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) tentarReenviarPendentes();
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    // Tenta reenviar o que ficou pendente de uma sessão anterior assim que o app abre.
    if (navigator.onLine) tentarReenviarPendentes();
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [tentarReenviarPendentes]);

  useEffect(() => {
    if (!user || !profile?.municipioId) {
        setLoading(false);
        return;
    }

    // Root navega entre municípios clientes; sem seleção, não há o que carregar.
    if (profile.role === 'root' && !options?.municipioIdOverride) {
      setInspecoes([]);
      setNeedsMunicipioSelection(true);
      setLoading(false);
      return;
    }
    setNeedsMunicipioSelection(false);

    // Partida rápida: só os mais recentes, pra pintar algo antes do primeiro
    // snapshot (ver cache-colecao-local.ts). A lista completa vem do Firestore
    // logo depois, inclusive offline, pelo cache persistente em IndexedDB.
    const salvas = lerCacheColecao<any>(LOCAL_STORAGE_KEY);
    if (salvas) {
      setInspecoes(salvas.map((i: any) => ({ ...i, data: new Date(i.data) })));
    }

    if (db && !configError) {
      const mid = profile.role === 'root'
        ? normalizeId(options!.municipioIdOverride!)
        : normalizeId(profile.municipioId);

      // Mesmo padrão de use-intimacoes.ts/use-chamados.ts: fiscal comum só
      // pode LER as próprias inspeções (firestore.rules: fiscalId ==
      // request.auth.uid) — sem o where("fiscalId", ...) aqui, a query
      // pedia TODAS as inspeções do município, o que o Firestore recusa
      // inteiro (FAILED_PRECONDITION/permission-denied) assim que outro
      // fiscal ou o gestor também tem inspeção salva. O onSnapshot abaixo
      // engolia esse erro sem avisar — por fora, parecia que os dados
      // "sumiam", quando na verdade nunca chegavam a sincronizar de volta.
      //
      // Gestor/root já vê o município inteiro numa consulta só. O fiscal
      // comum precisa de DUAS — o que é dele e o que um colega compartilhou
      // com ele (ver CompartilharEdicaoDialog) — unidas aqui no cliente,
      // mesmo raciocínio de use-intimacoes.ts (Firestore não tem OR entre
      // campos diferentes).
      const isGestor = profile.role === 'admin' || profile.role === 'root';
      const base = [collection(db, "inspecoes"), where("municipioId", "==", mid)] as const;
      const consultas: { essencial: boolean; q: Query<DocumentData> }[] = isGestor
        ? [{ essencial: true, q: query(base[0], base[1], orderBy("data", "asc")) }]
        : [
            { essencial: true, q: query(base[0], base[1], where("fiscalId", "==", user.uid), orderBy("data", "asc")) },
            { essencial: false, q: query(base[0], base[1], where("compartilhadoCom", "array-contains", user.uid), orderBy("data", "asc")) },
          ];

      const mapearDoc = (docSnap: any): Inspecao => {
        const data = docSnap.data();
        return {
          ...data,
          id: docSnap.id,
          data: tsOrCorruptedToDate(data.data),
          // updatedAt é gravado como Timestamp do Firestore (ver saveInspecao
          // abaixo), mas o tipo Inspecao.updatedAt é string (ISO) — sem essa
          // conversão, ficava um Timestamp cru no objeto, e qualquer
          // `new Date(insp.updatedAt)` (ex.: no diálogo "Minhas Inspeções")
          // virava Invalid Date, derrubando o app com "RangeError: Invalid
          // time value" assim que a lista tinha pelo menos um item — por
          // isso nunca acontecia pro root (ele nunca chega a carregar
          // inspeções reais nesta tela sem escolher um município antes).
          // tsOrCorruptedToIso/Date também cobre documentos já gravados com
          // o bug antigo da fila de reenvio (Timestamp virando objeto cru
          // {seconds, nanoseconds} no localStorage) — sem isso, um
          // documento antigo corrompido travava a tela pra sempre.
          updatedAt: tsOrCorruptedToIso(data.updatedAt),
        } as Inspecao;
      };

      // Cada listener guarda o próprio resultado; a lista publicada é a
      // união dos dois — sem isso, o segundo snapshot apagaria o primeiro.
      const porConsulta: Inspecao[][] = consultas.map(() => []);
      const publicar = () => {
        const porId = new Map<string, Inspecao>();
        porConsulta.flat().forEach((item) => porId.set(String(item.id), item));
        const items = Array.from(porId.values());

        // Itens que ainda não confirmaram gravação na nuvem não aparecem no
        // snapshot do servidor — reaplica eles por cima pra não sumirem da
        // tela enquanto a sincronização não termina.
        const pending = pendingWritesRef.current;
        const pendingIds = Object.keys(pending);
        const merged = pendingIds.length === 0
          ? items
          : [
              ...items,
              ...pendingIds
                .filter(id => !items.some(i => i.id === id))
                .map(id => {
                  const raw = pending[id].docData;
                  return {
                    ...raw,
                    id,
                    data: tsOrCorruptedToDate(raw.data),
                    updatedAt: tsOrCorruptedToIso(raw.updatedAt),
                  } as Inspecao;
                }),
            ].sort((a, b) => a.data.getTime() - b.data.getTime());

        salvarCacheColecao(LOCAL_STORAGE_KEY, merged, 'ultimos');
        setInspecoes(merged);
        setLoading(false);
      };

      const unsubscribes: (() => void)[] = [];
      consultas.forEach(({ essencial, q }, indice) => {
        unsubscribes[indice] = onSnapshot(q, (snapshot) => {
          porConsulta[indice] = snapshot.docs.map(mapearDoc);
          publicar();
        }, (err) => {
          if (!essencial) {
            // Regras/índice ainda não publicados (firebase deploy --only
            // firestore:rules,firestore:indexes). O fiscal continua vendo
            // normalmente as próprias inspeções; só as compartilhadas por
            // um colega é que não aparecem. Cancela o listener pro erro não
            // se repetir a cada tentativa de reconexão.
            console.warn('Roteiros/relatórios compartilhados indisponíveis (' + (err?.code || 'erro') + ').');
            porConsulta[indice] = [];
            unsubscribes[indice]?.();
            publicar();
            return;
          }
          // Antes esse erro era engolido em silêncio — foi assim que o bug
          // do índice/query faltando (ver comentário acima) passou
          // despercebido: a tela seguia mostrando só o cache local, sem
          // nenhum aviso de que a sincronização com o servidor tinha parado.
          console.error("Falha ao sincronizar inspeções com o Firestore:", err);
          setLoading(false);
        });
      });
      return () => unsubscribes.forEach((u) => u());
    } else {
      setLoading(false);
    }
  }, [db, user, profile, configError, options?.municipioIdOverride]);

  const saveInspecao = useCallback(async (data: Partial<Inspecao>, id?: string) => {
    if (!user || !profile?.municipioId) throw new Error("Não autenticado.");

    const mid = normalizeId(profile.municipioId);
    const inspectionDate = data.data instanceof Date ? data.data : new Date();
    const targetId = id || Math.random().toString(36).substr(2, 9);

    const docData = {
      ...data,
      id: targetId,
      municipioId: mid,
      data: inspectionDate.toISOString(),
      updatedAt: new Date().toISOString(),
      fiscalId: data.fiscalId || user.uid,
      fiscalNome: data.fiscalNome || profile?.displayName || 'Fiscal',
    };

    // 1. ATUALIZA LOCAL IMEDIATAMENTE
    setInspecoes(prev => {
        const existing = prev.find(i => i.id === targetId);
        const newItem = { ...existing, ...docData, data: inspectionDate } as Inspecao;
        const updated = id ? prev.map(i => i.id === id ? newItem : i) : [...prev, newItem];
        salvarCacheColecao(LOCAL_STORAGE_KEY, updated, 'ultimos');
        return updated;
    });

    // 2. ATUALIZA NUVEM (FIREBASE COMO FONTE PRINCIPAL)
    const fbData = buildFirestorePayload(docData);

    let synced = false;
    // Entregue ao SDK do Firestore? Então ele é o dono do reenvio. Isto é
    // diferente de `synced`: entregue mas sem confirmação ainda é dele.
    let entregueAoSdk = false;
    const bytes = tamanhoAproximadoEmBytes(fbData);
    const cabeNoFirestore = bytes <= TETO_SEGURO_BYTES;

    if (!cabeNoFirestore) {
      console.warn(
        `Vistoria ${targetId} tem ~${Math.round(bytes / 1024)} KB e não cabe no limite de 1 MiB do Firestore. ` +
        'Não foi enviada, para não travar a fila de gravações. Causa provável: fotos guardadas dentro do documento (base64) porque o envio ao Storage falhou.'
      );
    }

    if (db && !configError && navigator.onLine && cabeNoFirestore) {
      try {
        // attemptFirestoreWrite, e não `await setDoc` puro.
        //
        // Com a persistência ligada, a Promise do setDoc só resolve quando o
        // SERVIDOR confirma — e `navigator.onLine` não ajuda, porque ele diz
        // que há Wi-Fi, não que o Firestore está alcançável. Quando o servidor
        // não responde, o await ficava pendente para sempre, quem chamou nunca
        // marcava o rascunho como salvo, e o heartbeat de 8 segundos do roteiro
        // disparava OUTRA gravação do mesmo documento. A cada 8 segundos mais
        // uma, até estourar a fila de 500 escritas do SDK:
        // "Write stream exhausted maximum allowed queued writes".
        //
        // Passados 4 segundos sem confirmação, a gravação é dada como
        // enfileirada (synced: false) — ela continua guardada em IndexedDB e o
        // próprio SDK reenvia. Erro de verdade (permissão, validação) chega bem
        // antes disso e continua caindo no catch.
        const promessa = setDoc(doc(db, "inspecoes", targetId), fbData, { merge: true });
        // A partir daqui a gravação já está em IndexedDB, na fila do próprio
        // SDK. Mesmo que a confirmação demore ou nunca venha nesta sessão, ela
        // será reenviada sozinha — não pode ser reenviada por nós também.
        entregueAoSdk = true;
        const r = await attemptFirestoreWrite(promessa);
        synced = r.synced;
      } catch (e) {
        // Rejeição de verdade (permissão, validação): o SDK descartou a
        // gravação, então ela volta a ser nossa.
        entregueAoSdk = false;
        console.warn("Falha ao persistir inspeção no Firebase:", e);
      }
    }

    // A FILA CASEIRA SÓ GUARDA O QUE O SDK NUNCA RECEBEU
    //
    // Antes, toda gravação sem confirmação em 4 segundos entrava aqui —
    // inclusive as que o SDK já tinha aceitado e ia reenviar sozinho. O
    // resultado era uma segunda fila espelhando a primeira, e
    // tentarReenviarPendentes reenfileirava TODAS a cada carregamento da
    // página. Com a fila do SDK cheia nada confirmava, nada saía daqui, e
    // cada abertura do app somava mais N escritas: a fila de 500 nunca
    // esvaziava e o Firestore passava a recusar tudo com
    // "Write stream exhausted maximum allowed queued writes".
    if (!synced && !entregueAoSdk) {
      pendingWritesRef.current[targetId] = { id: targetId, docData };
      savePendingWrites(pendingWritesRef.current);
      setPendingSyncIds(Object.keys(pendingWritesRef.current));
    } else if (pendingWritesRef.current[targetId]) {
      delete pendingWritesRef.current[targetId];
      savePendingWrites(pendingWritesRef.current);
      setPendingSyncIds(Object.keys(pendingWritesRef.current));
    }

    return {
      id: targetId,
      synced,
      // Distingue "ainda não confirmou" de "nunca vai caber" — a segunda pede
      // ação do fiscal (tirar fotos), não paciência.
      excedeuTamanho: !cabeNoFirestore,
      tamanhoKb: Math.round(bytes / 1024),
    };
  }, [db, user, profile, configError]);

  const deleteInspecao = useCallback(async (id: string) => {
    if (!id) return;

    setInspecoes(prev => {
        const updated = prev.filter(i => i.id !== id);
        salvarCacheColecao(LOCAL_STORAGE_KEY, updated, 'ultimos');
        return updated;
    });

    if (pendingWritesRef.current[id]) {
      delete pendingWritesRef.current[id];
      savePendingWrites(pendingWritesRef.current);
      setPendingSyncIds(Object.keys(pendingWritesRef.current));
    }

    // Antes o erro era engolido com .catch(() => {}) — se a exclusão falhasse
    // no servidor (sem permissão, sem internet), a tela já mostrava "excluído
    // com sucesso" e a inspeção continuava existindo no Firestore.
    if (db && !configError) {
        await deleteDoc(doc(db, "inspecoes", id));
    }
  }, [db, configError]);

  // Mesmo padrão de use-intimacoes.ts: mover pra pasta/lixeira do menu
  // Documentos só marca campos, sem apagar — usado nos relatórios finalizados
  // (status 'concluido') que passam a aparecer lá ao lado das autuações.
  const bulkMoveToFolder = useCallback(async (ids: string[], folderId: string | null) => {
    const folderValue = folderId || "";
    const stringIds = ids.map(id => String(id));

    setInspecoes(prev => {
      const updated = prev.map(i =>
        stringIds.includes(String(i.id)) ? { ...i, folderId: folderValue, deleted: false } : i
      );
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated, 'ultimos');
      return updated;
    });

    if (db && !configError) {
      const results = await Promise.allSettled(
        stringIds.map(id =>
          attemptFirestoreWrite(
            setDoc(doc(db, "inspecoes", id), { folderId: folderValue, deleted: false }, { merge: true })
          )
        )
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram movidos no servidor.`);
    }
  }, [db, configError]);

  const bulkDelete = useCallback(async (ids: string[], toTrash: boolean) => {
    const now = new Date().toISOString();
    const stringIds = ids.map(id => String(id));

    setInspecoes(prev => {
      const updated = prev.map(i =>
        stringIds.includes(String(i.id)) ? { ...i, deleted: toTrash, deletedAt: now } : i
      );
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated, 'ultimos');
      return updated;
    });

    if (db && !configError) {
      // attemptFirestoreWrite, igual ao que use-intimacoes já fazia.
      //
      // Um setDoc cru só resolve quando o SERVIDOR confirma: sem sinal, a
      // promessa fica pendente para sempre, o Promise.allSettled nunca
      // assenta e quem chamou trava — sem confirmação, sem erro, sem nada.
      // Era o que acontecia ao mandar rascunhos para a lixeira: sumiam da
      // tela pelo estado local e voltavam no recarregamento, porque a
      // gravação nunca tinha sido confirmada.
      const results = await Promise.allSettled(
        stringIds.map(id =>
          attemptFirestoreWrite(
            setDoc(doc(db, "inspecoes", id), { deleted: toTrash, deletedAt: now }, { merge: true })
          )
        )
      );
      const rejeitados = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejeitados.length > 0) {
        // O motivo real (permissão negada, por exemplo) viaja junto: sem
        // isso, a tela dizia só "Erro ao excluir" e não dava por onde
        // começar a investigar.
        const motivo = (rejeitados[0].reason as any)?.code || (rejeitados[0].reason as any)?.message || 'motivo desconhecido';
        throw new Error(
          `${rejeitados.length} de ${stringIds.length} item(ns) não foram salvos no servidor (${motivo}).`
        );
      }
    }
  }, [db, configError]);

  const permanentDelete = useCallback(async (ids: string[]) => {
    const stringIds = ids.map(id => String(id));

    setInspecoes(prev => {
      const updated = prev.filter(i => !stringIds.includes(String(i.id)));
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated, 'ultimos');
      return updated;
    });

    if (db && !configError) {
      const results = await Promise.allSettled(
        stringIds.map(id => attemptFirestoreWrite(deleteDoc(doc(db, "inspecoes", id))))
      );
      const rejeitados = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejeitados.length > 0) {
        const motivo = (rejeitados[0].reason as any)?.code || (rejeitados[0].reason as any)?.message || 'motivo desconhecido';
        throw new Error(
          `${rejeitados.length} de ${stringIds.length} item(ns) não foram excluídos no servidor (${motivo}).`
        );
      }
    }
  }, [db, configError]);

  const toggleFavorito = useCallback(async (id: string, favorito: boolean) => {
    const stringId = String(id);

    setInspecoes(prev => {
      const updated = prev.map(i => String(i.id) === stringId ? { ...i, favorito } : i);
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated, 'ultimos');
      return updated;
    });

    if (db && !configError) {
      await setDoc(doc(db, "inspecoes", stringId), { favorito }, { merge: true });
    }
  }, [db, configError]);

  /**
   * COMPARTILHAR A EDIÇÃO DE UM ROTEIRO/RELATÓRIO EM ANDAMENTO.
   *
   * Mesmo mecanismo de compartilharIntimacao (use-intimacoes.ts) — quem for
   * marcado passa a ver esta inspeção na lista dele e pode editar e assinar
   * junto, não só o fiscalId original. Os nomes viajam com os uids pra tela
   * mostrar "compartilhado com Fulano" sem consultar `users` de novo,
   * inclusive offline.
   */
  const compartilharInspecao = useCallback(async (
    id: string,
    colegas: { uid: string; nome: string }[],
  ) => {
    const stringId = String(id);
    const uids = colegas.map(c => c.uid);

    setInspecoes(prev => {
      const updated = prev.map(i => String(i.id) === stringId ? { ...i, compartilhadoCom: uids, compartilhadoComNomes: colegas } : i);
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated, 'ultimos');
      return updated;
    });

    if (!db || configError) return { synced: false };
    const r = await attemptFirestoreWrite(
      setDoc(doc(db, "inspecoes", stringId), { compartilhadoCom: uids, compartilhadoComNomes: colegas }, { merge: true })
    );
    return { synced: r.synced };
  }, [db, configError]);

  return {
    inspecoes,
    saveInspecao,
    deleteInspecao,
    bulkMoveToFolder,
    bulkDelete,
    permanentDelete,
    toggleFavorito,
    compartilharInspecao,
    loading,
    isOnline,
    needsMunicipioSelection,
    pendingSyncCount: pendingSyncIds.length,
  };
}

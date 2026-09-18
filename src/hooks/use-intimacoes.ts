
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Intimacao } from '@/lib/types';
import { z } from 'zod'; //
import { intimacaoSchema } from '@/lib/schema'; //
import { db } from '@/lib/firebase'; // Importe a instância 'db' diretamente
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
  where,
  runTransaction,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { normalizeId } from '@/lib/utils';
import { attemptFirestoreWrite } from '@/lib/firestore-offline';
import { lerCacheColecao, salvarCacheColecao } from '@/lib/cache-colecao-local';
import { lerContadorLocal, salvarContadorLocal } from '@/lib/contador-autuacoes';

const LOCAL_STORAGE_KEY = 'fiscal_x_intimacoes_v4';

export function useIntimacoes(options?: { municipioIdOverride?: string }) {
  const { profile, user, configError } = useAuth(); //
  const [intimacoes, setIntimacoes] = useState<Intimacao[]>([]); //
  const [loading, setLoading] = useState(true); //
  const [isOnline, setIsOnline] = useState(true); //
  const [needsMunicipioSelection, setNeedsMunicipioSelection] = useState(false);
  // Espelho da lista para saveIntimacao consultar o documento que já existe
  // sem entrar na lista de dependências do useCallback — depender do estado
  // recriaria a função a cada snapshot, e ela é usada pelo salvamento
  // automático da autuação.
  const intimacoesRef = useRef<Intimacao[]>([]);
  useEffect(() => { intimacoesRef.current = intimacoes; }, [intimacoes]);

  // Monitorar estado da conexão
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!profile?.municipioId || !user) {
      setLoading(false);
      return;
    }

    // Root navega entre municípios clientes; sem seleção, não há o que carregar.
    if (profile.role === 'root' && !options?.municipioIdOverride) {
      setIntimacoes([]);
      setNeedsMunicipioSelection(true);
      setLoading(false);
      return;
    }
    setNeedsMunicipioSelection(false);

    // Partida rápida: pinta os mais recentes antes do primeiro snapshot chegar.
    // Não é o acervo — é só o que cabe com folga no localStorage (ver
    // cache-colecao-local.ts); a lista completa vem do Firestore logo em
    // seguida, inclusive offline, pelo cache persistente em IndexedDB.
    const salvos = lerCacheColecao<any>(LOCAL_STORAGE_KEY);
    if (salvos) {
      setIntimacoes(salvos.map((i: any) => ({
        ...i,
        dataIntimacao: new Date(i.dataIntimacao),
        dataRecebimento: i.dataRecebimento ? new Date(i.dataRecebimento) : undefined,
        dataRecebimentoTecnico: i.dataRecebimentoTecnico ? new Date(i.dataRecebimentoTecnico) : undefined,
      })));
    }

    if (db && !configError) {
      const targetMunicipioId = profile.role === 'root'
        ? normalizeId(options!.municipioIdOverride!)
        : profile.municipioId;

      // Gestor e root veem o municipio inteiro numa consulta so. O fiscal
      // precisa de DUAS: o que ele criou e o que um colega compartilhou com
      // ele. O Firestore nao tem OR entre campos diferentes, e trocar o
      // `createdBy ==` por um unico campo de participantes faria sumir da
      // lista todo o acervo ja gravado, que nao tem esse campo — por isso as
      // duas convivem, com os resultados unidos aqui no cliente.
      const base = [collection(db, "intimacoes"), where("municipioId", "==", targetMunicipioId)] as const;
      // `essencial` separa o que a tela precisa para funcionar do que é
      // complemento. A consulta das compartilhadas depende de regras e índice
      // publicados no projeto do Firebase; enquanto não estiverem, ela falha —
      // e falhar não pode derrubar a lista do próprio fiscal junto.
      const consultas: { essencial: boolean; q: Query<DocumentData> }[] =
        (profile.role === 'admin' || profile.role === 'root')
          ? [{ essencial: true, q: query(base[0], base[1], orderBy("createdAt", "desc")) }]
          : [
              { essencial: true, q: query(base[0], base[1], where("createdBy", "==", user.uid), orderBy("createdAt", "desc")) },
              { essencial: false, q: query(base[0], base[1], where("compartilhadoCom", "array-contains", user.uid), orderBy("createdAt", "desc")) },
            ];

      // Cada listener guarda o proprio resultado; a lista exibida e a uniao
      // dos dois. Sem isso o segundo snapshot apagaria o primeiro.
      const porConsulta: Intimacao[][] = consultas.map(() => []);

      const publicar = () => {
        const porId = new Map<string, Intimacao>();
        porConsulta.flat().forEach((item) => porId.set(String(item.id), item));
        const items = Array.from(porId.values()).sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        );
        salvarCacheColecao(LOCAL_STORAGE_KEY, items);
        setIntimacoes(items);
        setLoading(false);
      };

      const unsubscribes: (() => void)[] = [];
      consultas.forEach(({ essencial, q }, indice) => {
        unsubscribes[indice] = onSnapshot(q, (snapshot) => {
        porConsulta[indice] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            dataIntimacao: data.dataIntimacao instanceof Timestamp ? data.dataIntimacao.toDate() : new Date(data.dataIntimacao),
            dataRecebimento: data.dataRecebimento instanceof Timestamp ? data.dataRecebimento.toDate() : data.dataRecebimento ? new Date(data.dataRecebimento) : undefined,
            // Mesmo bug que dataRecebimento já tinha corrigido: sem esta
            // conversão, um Timestamp cru do Firestore chegava até
            // documento-oficial-body.tsx, e `new Date(timestampCru)` vira
            // Invalid Date — o `format()` do date-fns então derruba a tela
            // inteira com "RangeError: Invalid time value" (só aparecia em
            // autuações com responsável técnico assinado, por isso passou
            // despercebido até agora).
            dataRecebimentoTecnico: data.dataRecebimentoTecnico instanceof Timestamp ? data.dataRecebimentoTecnico.toDate() : data.dataRecebimentoTecnico ? new Date(data.dataRecebimentoTecnico) : undefined,
            // Mesmo cuidado de use-inspecoes.ts: updatedAt é gravado como
            // Timestamp do Firestore (saveIntimacao mais abaixo), mas sem
            // essa conversão qualquer `new Date(item.updatedAt)` vira
            // Invalid Date e pode derrubar a tela com "RangeError: Invalid
            // time value".
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
          } as Intimacao;
        });
        publicar();
      }, (err) => {
        if (!essencial) {
          // Regras/índice ainda não publicados (firebase deploy --only
          // firestore:rules,firestore:indexes). O fiscal continua vendo
          // normalmente o que é dele; só as autuações que um colega
          // compartilhou é que não aparecem. Cancela o listener para o erro
          // não se repetir a cada tentativa de reconexão.
          console.warn(
            'Autuações compartilhadas indisponíveis (' + (err?.code || 'erro') + '). Publique as regras e os índices do Firestore para ativar o compartilhamento.'
          );
          porConsulta[indice] = [];
          unsubscribes[indice]?.();
          publicar();
          return;
        }
          console.warn("Firestore offline ou sem permissão, usando local.");
          setLoading(false);
        });
      });
      return () => unsubscribes.forEach((u) => u?.());
    } else {
      setLoading(false);
    }
  }, [profile?.municipioId, user?.uid, db, configError, profile?.role, options?.municipioIdOverride]);

  // Numeração oficial (0001/2026): um único contador por município e por ano,
  // incrementado atomicamente via transação do Firestore para nunca duplicar
  // números quando dois fiscais criam autuações ao mesmo tempo.
  const generateNewNumeroProcesso = useCallback(async () => {
    const year = new Date().getFullYear();
    const mid = profile?.municipioId ? normalizeId(profile.municipioId) : null;

    if (db && mid && navigator.onLine) {
      try {
        const counterRef = doc(db, "municipios", mid, "counters", String(year));
        const nextSeq = await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef);
          const current = snap.exists() ? (snap.data().seq || 0) : 0;
          const next = current + 1;
          tx.set(counterRef, { seq: next }, { merge: true });
          return next;
        });
        // Guarda o que a nuvem acabou de confirmar: é o que permite à
        // estimativa offline continuar de onde o contador oficial parou,
        // inclusive depois de uma recalibração.
        salvarContadorLocal(mid, year, nextSeq);
        return `${String(nextSeq).padStart(4, '0')}/${year}`;
      } catch (e) {
        console.warn("Falha ao gerar número atômico, usando estimativa local.", e);
      }
    }

    // Sem conexão (ou falha acima): estimativa, só para não travar o
    // preenchimento.
    //
    // Primeiro o último valor que este aparelho viu do contador oficial. Ele
    // é a única fonte que respeita uma RECALIBRAÇÃO: o maior número da lista
    // ignoraria o acerto e devolveria o sequencial dos documentos de teste
    // que ainda estiverem guardados (a lista inclui os da lixeira).
    const doContador = mid ? lerContadorLocal(mid, year) : null;
    if (doContador !== null) return `${String(doContador + 1).padStart(4, '0')}/${year}`;

    // Nunca esteve online neste aparelho: sobra o maior número da lista. Usa o
    // estado em memória, não o cache do localStorage: aquele guarda só os mais
    // recentes (ver MAX_ITENS_CACHE), e um recorte parcial aqui poderia
    // repetir um sequencial já usado. O estado vem do Firestore, que serve a
    // coleção inteira do próprio cache persistente mesmo offline.
    const maxSeq = intimacoes.reduce((max: number, i) => {
      const [seqPart, yearPart] = (i.numeroProcesso || '').split('/');
      if (parseInt(yearPart, 10) !== year) return max;
      return Math.max(max, parseInt(seqPart, 10) || 0);
    }, 0);
    return `${String(maxSeq + 1).padStart(4, '0')}/${year}`;
  }, [db, profile?.municipioId, intimacoes]);

  const saveIntimacao = useCallback(async (data: z.input<typeof intimacaoSchema>, id?: string) => {
    const parsedData = intimacaoSchema.parse(data);
    const now = new Date().toISOString();
    const municipioId = profile?.municipioId || 'geral';
    
    // A autoria é de quem ABRIU a autuação, não de quem está salvando agora.
    // Com a edição compartilhada isso deixou de ser detalhe: sobrescrever
    // createdBy faria a autuação trocar de dono no primeiro salvamento do
    // colega e sumir da lista de quem a criou.
    const anterior = id ? intimacoesRef.current.find(i => String(i.id) === String(id)) : undefined;

    const docData = {
      ...parsedData,
      dataIntimacao: parsedData.dataIntimacao.toISOString(),
      dataRecebimento: parsedData.dataRecebimento?.toISOString(),
      updatedAt: now,
      municipioId: municipioId,
      createdBy: anterior?.createdBy || profile?.uid,
      createdByName: anterior?.createdByName || profile?.displayName,
      updatedBy: profile?.uid,
      updatedByName: profile?.displayName,
    };

    // 1. ATUALIZA LOCALSTORAGE IMEDIATAMENTE (GARANTIA TOTAL)
    const targetId = id || Math.random().toString(36).substr(2, 9);
    let updatedList: Intimacao[] = [];
    
    setIntimacoes(prev => {
      const existing = prev.find(i => String(i.id) === String(targetId));
      const newItem = { 
        // `existing` primeiro: o formulário não carrega compartilhadoCom nem
        // os nomes, e o default [] do schema apagaria o compartilhamento da
        // lista a cada salvamento automático.
        ...existing,
        ...docData, 
        compartilhadoCom: existing?.compartilhadoCom ?? docData.compartilhadoCom,
        compartilhadoComNomes: existing?.compartilhadoComNomes ?? docData.compartilhadoComNomes,
        id: targetId, 
        createdAt: existing?.createdAt || now,
        dataIntimacao: new Date(docData.dataIntimacao),
        dataRecebimento: docData.dataRecebimento ? new Date(docData.dataRecebimento) : undefined
      } as Intimacao;

      if (id) {
        updatedList = prev.map(i => String(i.id) === String(id) ? newItem : i);
      } else {
        updatedList = [newItem, ...prev];
      }
      
      salvarCacheColecao(LOCAL_STORAGE_KEY, updatedList);
      return [...updatedList];
    });

    // 2. ENVIA PARA FIREBASE COMO FONTE PRINCIPAL
    // Diferente das outras operações (bulkDelete, etc.), aqui o sucesso/falha da
    // gravação na nuvem é reportado ao chamador (cloudSaved/cloudError) — sem
    // isso, o app mostrava "Rascunho Salvo" mesmo quando só existia no aparelho
    // local, quebrando a garantia de recuperar o documento em outro login.
    let cloudSaved = false;
    let cloudError: string | undefined;

    if (db && !configError) {
      const fbData: Record<string, any> = {
        ...docData,
        dataIntimacao: Timestamp.fromDate(parsedData.dataIntimacao),
        dataRecebimento: parsedData.dataRecebimento ? Timestamp.fromDate(parsedData.dataRecebimento) : null,
        dataRecebimentoTecnico: parsedData.dataRecebimentoTecnico ? Timestamp.fromDate(parsedData.dataRecebimentoTecnico) : null,
        updatedAt: Timestamp.now()
      };

      // Num documento que já existe, a gravação é merge: o que NÃO é enviado
      // fica como está no banco. É o que preserva o compartilhamento — enviar
      // compartilhadoCom com o default [] do schema (o formulário não o
      // conhece) apagaria o acesso do colega no primeiro salvamento
      // automático. Quem altera essa lista é compartilharIntimacao, e só ela.
      //
      // A AUTORIA SAI PELO MESMO MOTIVO, e este é mais sutil.
      //
      // Acima, createdBy é deduzido do documento que está na lista local
      // (`anterior`). Quando o colega abre uma autuação compartilhada e ela
      // ainda não chegou à lista dele — índice em construção, listener das
      // compartilhadas cancelado, primeiro salvamento antes do snapshot —,
      // `anterior` vem vazio e o campo assume o uid DELE. A regra do Firestore
      // exige que createdBy não mude no update, então a gravação inteira é
      // rejeitada: o colega digita, o autosave falha calado, e o autor nunca
      // vê o que foi preenchido.
      //
      // Não enviando o campo, não há o que divergir: o merge mantém a autoria
      // gravada e a regra compara o valor com ele mesmo.
      if (id) {
        delete fbData.compartilhadoCom;
        delete fbData.compartilhadoComNomes;
        delete fbData.createdBy;
        delete fbData.createdByName;
      }

      try {
        // attemptFirestoreWrite: com a persistência do Firestore ligada (ver
        // src/lib/firebase.ts), a gravação já fica garantida na fila do
        // próprio SDK assim que chamada — offline, `synced` volta `false`
        // (não é erro, só "ainda sem confirmação") em vez de travar esperando
        // o servidor, que só responde quando a conexão voltar.
        const { synced } = await attemptFirestoreWrite(
          id
            ? setDoc(doc(db, "intimacoes", id), fbData, { merge: true })
            : setDoc(doc(db, "intimacoes", targetId), { ...fbData, createdAt: now })
        );
        cloudSaved = synced;
        if (!synced) cloudError = "Sem conexão com a nuvem — será sincronizado automaticamente.";
      } catch (e: any) {
        console.warn("Falha ao persistir intimacão no Firebase:", e);
        // "Sem conexão" e "sem permissão" pedem reações opostas: uma se
        // resolve esperando, a outra não se resolve nunca. Dizer a primeira
        // quando é a segunda faz o fiscal continuar digitando num documento
        // que não está sendo salvo.
        cloudError = e?.code === 'permission-denied'
          ? "Sem permissão para salvar esta autuação. Se ela foi compartilhada com você, feche e abra de novo; se persistir, peça ao autor para compartilhar outra vez."
          : (e?.message || "Falha ao salvar na nuvem");
      }
    } else {
      cloudError = "Sem conexão com a nuvem";
    }

    return { ...docData, id: targetId, cloudSaved, cloudError } as any;
  }, [db, configError, profile]);

  const bulkDelete = useCallback(async (ids: string[], toTrash: boolean) => {
    const now = new Date().toISOString();
    const stringIds = ids.map(id => String(id));
    
    setIntimacoes(prev => {
      const updated = prev.map(i => 
        stringIds.includes(String(i.id)) 
          ? { ...i, deleted: toTrash, deletedAt: now } 
          : i
      );
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated);
      return [...updated];
    });

    // Antes, a gravação real disparava com .catch(() => {}) — se falhasse
    // (sem permissão, sem internet), a tela já tinha mostrado sucesso e
    // ninguém ficava sabendo que nada foi persistido no servidor. Agora
    // aguardamos e propagamos a falha pro chamador (que já trata isso).
    if (db && !configError) {
      // attemptFirestoreWrite faz uma gravação offline resolver como
      // "pendente" (não como rejeitada) — sem isso, mover pra lixeira sem
      // sinal disparava um erro assustador ("X itens não foram salvos") por
      // cada item, mesmo a gravação estando segura na fila do Firestore.
      const results = await Promise.allSettled(
        stringIds.map(id => attemptFirestoreWrite(setDoc(doc(db, "intimacoes", id), { deleted: toTrash, deletedAt: now }, { merge: true })))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram salvos no servidor.`);
    }
  }, [db, configError]);

  const permanentDelete = useCallback(async (ids: string[]) => {
    const stringIds = ids.map(id => String(id));

    setIntimacoes(prev => {
      const updated = prev.filter(i => !stringIds.includes(String(i.id)));
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated);
      return [...updated];
    });

    if (db && !configError) {
      const results = await Promise.allSettled(stringIds.map(id => attemptFirestoreWrite(deleteDoc(doc(db, "intimacoes", id)))));
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram excluídos no servidor.`);
    }
  }, [db, configError]);

  const bulkMoveToFolder = useCallback(async (ids: string[], folderId: string | null) => {
    const folderValue = folderId || "";
    const stringIds = ids.map(id => String(id));

    setIntimacoes(prev => {
      const updated = prev.map(i =>
        stringIds.includes(String(i.id))
          ? { ...i, folderId: folderValue, deleted: false }
          : i
      );
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated);
      return [...updated];
    });

    if (db && !configError) {
      const results = await Promise.allSettled(
        stringIds.map(id => attemptFirestoreWrite(setDoc(doc(db, "intimacoes", id), { folderId: folderValue, deleted: false }, { merge: true })))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} de ${stringIds.length} item(ns) não foram movidos no servidor.`);
    }
  }, [db, configError]);

  const toggleFavorito = useCallback(async (id: string, favorito: boolean) => {
    const stringId = String(id);

    setIntimacoes(prev => {
      const updated = prev.map(i => String(i.id) === stringId ? { ...i, favorito } : i);
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated);
      return [...updated];
    });

    if (db && !configError) {
      await attemptFirestoreWrite(setDoc(doc(db, "intimacoes", stringId), { favorito }, { merge: true }));
    }
  }, [db, configError]);

  // Metadados que não fazem parte do formulário (agendaLembreteId, pasId) —
  // mesmo padrão de toggleFavorito acima: merge direto, sem passar pelo
  // intimacaoSchema (que descartaria esses campos por não serem editáveis).
  const updateIntimacaoMeta = useCallback(async (id: string, partial: Partial<Pick<Intimacao, 'agendaLembreteId' | 'pasId'>>) => {
    const stringId = String(id);

    setIntimacoes(prev => {
      const updated = prev.map(i => String(i.id) === stringId ? { ...i, ...partial } : i);
      salvarCacheColecao(LOCAL_STORAGE_KEY, updated);
      return [...updated];
    });

    if (db && !configError) {
      await attemptFirestoreWrite(setDoc(doc(db, "intimacoes", stringId), partial, { merge: true }));
    }
  }, [db, configError]);

  /**
   * Único lugar que altera a lista de colegas com acesso à edição.
   *
   * Grava só os dois campos, em merge, para nunca esbarrar no que o fiscal
   * estiver digitando: o formulário salva sozinho a cada 8 segundos, e um
   * salvamento inteiro disparado daqui sobrescreveria o rascunho em curso
   * com o estado que estava em memória quando a caixa foi aberta.
   *
   * Os nomes viajam junto com os uids porque a tela precisa mostrar "com
   * quem está compartilhado" sem ter de consultar a coleção de usuários a
   * cada abertura — inclusive offline.
   */
  const compartilharIntimacao = useCallback(async (
    id: string,
    colegas: { uid: string; nome: string }[],
  ) => {
    const uids = colegas.map(c => c.uid);

    // O TERMO VINCULADO VAI JUNTO.
    //
    // Auto de Infração e Termo de Apreensão/Interdição são documentos
    // separados no banco, ligados por autoInfracaoVinculadaId. Compartilhar
    // só o auto dava ao colega acesso a metade do caso: o termo continuava
    // com createdBy do autor e sem compartilhadoCom, então a regra do
    // Firestore barrava até a LEITURA. Na tela isso não aparece como erro —
    // o termo simplesmente não é restaurado, e o colega vê um auto sem a
    // apreensão que o acompanha, como se o autor não tivesse preenchido.
    //
    // Os dois são o mesmo ato de fiscalização; quem recebe um recebe o outro.
    const documento = intimacoesRef.current.find(i => String(i.id) === String(id));
    const idsParaCompartilhar = [id, documento?.autoInfracaoVinculadaId, documento?.documentoOrigemId]
      .filter((x): x is string => !!x && String(x).trim() !== '');
    const alvos = Array.from(new Set(idsParaCompartilhar.map(String)));

    setIntimacoes(prev => {
      const atualizada = prev.map(i => alvos.includes(String(i.id))
        ? { ...i, compartilhadoCom: uids, compartilhadoComNomes: colegas }
        : i);
      salvarCacheColecao(LOCAL_STORAGE_KEY, atualizada);
      return atualizada;
    });

    if (!db || configError) return { synced: false };

    // Em série, e não em paralelo: são poucas gravações (duas, no máximo), e
    // se a do termo falhar é melhor saber disso do que ter metade aplicada
    // sem ninguém perceber.
    let synced = true;
    for (const alvo of alvos) {
      const r = await attemptFirestoreWrite(
        setDoc(doc(db, "intimacoes", alvo), {
          compartilhadoCom: uids,
          compartilhadoComNomes: colegas,
        }, { merge: true })
      );
      if (!r.synced) synced = false;
    }
    return { synced };
  }, [db, configError]);

  return {
    intimacoes,
    saveIntimacao,
    compartilharIntimacao,
    generateNewNumeroProcesso,
    bulkDelete,
    permanentDelete,
    bulkMoveToFolder,
    toggleFavorito,
    updateIntimacaoMeta,
    getIntimacaoById: (id: string) => intimacoes.find(i => String(i.id) === String(id)) || null,
    loading,
    isOnline,
    needsMunicipioSelection
  };
}

'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isConfigReady } from "@/firebase/config";

export const ROOT_ADMIN_EMAIL = 'app.fiscalx@gmail.com';

type User = { uid: string; email: string | null; };

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isAuthorized: boolean;
  role: 'admin' | 'fiscal' | 'root';
  municipioId: string;
  fiscalCode?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'revoked';
  adminFeedback?: string;
  municipioNome?: string;
  fcmTokens?: string[];
  /** ISO. Presente em contas criadas via registerWithEmailPassword; usado
   * pra calcular o vencimento do acesso de teste (ver useAppConfig e
   * AuthGuard) — contas antigas sem esse campo nunca são bloqueadas por
   * prazo (falha aberta, nunca bloqueia por falta de dado). */
  createdAt?: string;
  /**
   * Padrão PESSOAL de "Considerações Gerais" e "Conclusão e Prazo Legal" por
   * id de roteiro, salvo pelo botão "Salvar como meu padrão" na tela de
   * preenchimento. Tem precedência sobre o padrão do município — ver
   * resolverIntroHtml em src/lib/roteiro-textos-padrao.ts.
   */
  roteiroTextos?: Record<string, { introducaoHtml?: string; conclusaoHtml?: string }>;
  /**
   * Organização pessoal do menu inicial (dashboard) — quais atalhos (por
   * href) o usuário fixou como favoritos e a ordem de todos os itens.
   * Sincronizado na nuvem pra valer em qualquer aparelho que o fiscal loga.
   * Itens novos que ainda não estão em `order` (ex.: um menu recém-lançado)
   * são anexados ao final automaticamente — ver dashboard-menu-grid.tsx.
   */
  menuPreferences?: { order: string[]; favoritos: string[] };
  /**
   * Mesma ideia do menuPreferences acima, mas para o catálogo de Roteiros
   * (checklists técnicos) — chaveado pelo `id` de cada roteiro em vez de
   * href. Ver src/app/roteiros/page.tsx.
   */
  roteirosPreferences?: { order: string[]; favoritos: string[] };
  /**
   * Data/hora (ISO) em que o usuário confirmou o aviso de fase de testes
   * (ver src/components/beta-notice-gate.tsx). Enquanto ausente, o AuthGuard
   * bloqueia o acesso ao resto do app até o clique em "Concordo".
   */
  betaTermsAcceptedAt?: string;
}

interface RegisterInput {
  email: string;
  password: string;
  nome: string;
  municipioId: string;
  role: 'admin' | 'fiscal';
  metadata?: {
    nascimento?: string;
    cpf?: string;
    cargo?: string;
    municipioNome?: string;
    fiscalCode?: string;
  };
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthorized: boolean;
  configError: boolean;
  loginWithEmailPassword: (email: string, pass: string, options?: { keepConnected?: boolean }) => Promise<void>;
  registerWithEmailPassword: (data: RegisterInput) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const LAST_EMAIL_KEY = "fiscal-x-last-email";

// Lembra só o e-mail usado por último neste navegador (nunca a senha).
export function getLastUsedEmail(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_EMAIL_KEY) || "";
}

function saveLastUsedEmail(email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_EMAIL_KEY, email);
}

// Todo cache local (agenda, documentos, mural, config, e-mail lembrado etc.)
// usa chaves fixas em localStorage — nenhuma delas leva o uid de quem
// gravou. Em computador/tablet compartilhado entre fiscais, sair de uma
// conta sem limpar isso deixava tanto o e-mail preenchido quanto os dados
// (inspeções, autuações, recados) do usuário anterior visíveis pro próximo
// que fizesse login no mesmo aparelho, até o Firestore sincronizar por
// cima. Varre por prefixo (em vez de uma lista fixa de chaves) porque
// algumas são compostas em tempo de execução (ex.: fiscal_x_folders_...,
// fiscal_x_docfacil_modelos_v1_<municipioId>).
function clearLocalAppCache() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith("fiscal_x_") || key.startsWith("fiscal-x-"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

/**
 * SAIR TEM DE SAIR DE TUDO.
 *
 * O login grava a sessão em lugares diferentes conforme o "manter
 * conectado": marcado usa browserLocalPersistence (IndexedDB, sobrevive a
 * fechar o navegador); desmarcado usa browserSessionPersistence
 * (sessionStorage, morre com a aba).
 *
 * `signOut` limpa só o armazenamento ATIVO no momento. Num aparelho onde
 * duas contas já entraram com opções diferentes, sobra registro no outro —
 * e o SDK o encontra na próxima inicialização e restaura aquela sessão
 * sozinho. Na prática: sai do root e cai no fiscal, sem ter digitado nada.
 * Vale para qualquer par de contas na mesma situação, não só essas duas.
 *
 * Por isso varremos os dois armazenamentos e o banco onde o SDK guarda a
 * sessão, em vez de confiar apenas no signOut.
 */
async function limparSessoesFirebase() {
  if (typeof window === "undefined") return;

  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const remover: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const chave = store.key(i);
        if (chave && chave.startsWith("firebase:")) remover.push(chave);
      }
      remover.forEach((chave) => store.removeItem(chave));
    } catch {
      // Armazenamento bloqueado pelo navegador: nada a limpar aqui.
    }
  }

  // É neste banco que o SDK moderno guarda a sessão "manter conectado".
  // Não deixamos a saída travar por causa dele: se a exclusão ficar
  // pendente (outra aba segurando o banco), seguimos em frente — o signOut
  // já desconectou esta aba.
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        const req = window.indexedDB.deleteDatabase("firebaseLocalStorageDb");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // IndexedDB indisponível (modo privado, por exemplo).
  }
}

function mapAuthError(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "E-mail ou senha incorretos.";
    case 'auth/email-already-in-use':
      return "Este e-mail já possui cadastro.";
    case 'auth/weak-password':
      return "A senha precisa ter pelo menos 6 caracteres.";
    case 'auth/invalid-email':
      return "E-mail inválido.";
    case 'auth/too-many-requests':
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    default:
      return "Ocorreu um erro inesperado. Tente novamente mais tarde.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Precisa entrar em `loading` já nesta mesma atualização — se
        // `setUser` disparasse sozinho, existia um instante entre esse
        // render e o efeito que busca o perfil (mais abaixo) em que `user`
        // já estava preenchido mas `loading` ainda lia o valor antigo
        // (false) e `profile` ainda era o da sessão anterior (ou null).
        // Nessa brecha, o toast de resultado do login em login/page.tsx
        // (que só espera `authLoading` virar false) chegava a rodar com
        // `profile` vazio e mostrava "aguardando aprovação" pra uma conta
        // já aprovada, mesmo o dashboard renderizando certo alguns instantes
        // depois.
        setLoading(true);
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), async (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      } else if (user.email?.toLowerCase() === ROOT_ADMIN_EMAIL) {
        const rootProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: "ROOT",
          photoURL: "",
          isAuthorized: true,
          role: 'root',
          municipioId: 'geral',
          status: 'approved',
        };
        await setDoc(doc(db, "users", user.uid), rootProfile);
        setProfile(rootProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribeProfile();
  }, [user?.uid, user?.email]);

  // SINCRONIZA role/municipioId PRO TOKEN (custom claims) A CADA LOGIN E A
  // CADA MUDANÇA DE PAPEL/MUNICÍPIO.
  //
  // As regras do Storage deste projeto não conseguem ler o Firestore
  // (firestore.get() cross-service sempre nega — ver storage.rules), então
  // "é gestor"/"é deste município" só podem ser checados ali através do
  // token, nunca reabrindo o documento do usuário na hora do upload. Isso
  // faz esses dois campos existirem tanto no doc (fonte da verdade, pro
  // resto do app) quanto no token (pro Storage).
  //
  // Rodar de novo sempre que role/municipioId mudam (não só no login) cobre
  // o gestor aprovando/promovendo alguém: a aba de quem foi promovido já
  // está com o onSnapshot acima aberto, então este efeito dispara sozinho e
  // busca claims novas sem precisar deslogar e logar de novo. getIdToken(true)
  // força buscar um token FRESCO com o claim recém-gravado — sem isso, o
  // token em uso continuaria com o claim antigo até o refresh automático
  // (até ~1h) ou um novo login.
  useEffect(() => {
    if (!profile?.role || !profile?.municipioId || !auth.currentUser) return;
    (async () => {
      try {
        const idToken = await auth.currentUser!.getIdToken();
        const res = await fetch('/api/sync-claims', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) await auth.currentUser!.getIdToken(true);
      } catch (e) {
        console.warn('Falha ao sincronizar claims de autenticação:', e);
      }
    })();
  }, [profile?.role, profile?.municipioId]);

  const loginWithEmailPassword = async (email: string, pass: string, options?: { keepConnected?: boolean }) => {
    const normalizedEmail = email.toLowerCase().trim();
    try {
      await setPersistence(auth, options?.keepConnected === false ? browserSessionPersistence : browserLocalPersistence);
      await signInWithEmailAndPassword(auth, normalizedEmail, pass);
      saveLastUsedEmail(normalizedEmail);
    } catch (e: any) {
      throw new Error(mapAuthError(e.code));
    }
  };

  const registerWithEmailPassword = async (data: RegisterInput) => {
    const normalizedEmail = data.email.toLowerCase().trim();
    const isRoot = normalizedEmail === ROOT_ADMIN_EMAIL;

    try {
      const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, data.password);

      const newProfile: UserProfile & { cpf?: string; cargo?: string; nascimento?: string; createdAt: string } = {
        uid: cred.user.uid,
        email: normalizedEmail,
        displayName: data.nome.toUpperCase(),
        photoURL: "",
        isAuthorized: isRoot,
        role: isRoot ? 'root' : data.role,
        municipioId: data.municipioId,
        municipioNome: data.metadata?.municipioNome || "",
        fiscalCode: data.metadata?.fiscalCode || "",
        cpf: data.metadata?.cpf || "",
        cargo: data.metadata?.cargo || "",
        nascimento: data.metadata?.nascimento || "",
        status: isRoot ? 'approved' : 'pending',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "users", cred.user.uid), newProfile);
    } catch (e: any) {
      throw new Error(mapAuthError(e.code));
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.toLowerCase().trim());
    } catch (e: any) {
      // Não revela se o e-mail existe ou não (evita enumeração de contas) —
      // só propaga erros que não são sobre a existência do usuário.
      if (e.code === 'auth/user-not-found') return;
      throw new Error(mapAuthError(e.code));
    }
  };

  const logout = async () => {
    await signOut(auth);
    clearLocalAppCache();
    // Ver limparSessoesFirebase: sem isto, a sessão de outra conta guardada
    // no armazenamento que o signOut não tocou volta sozinha no próximo
    // carregamento.
    await limparSessoesFirebase();
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), data);
  };

  return (
    <AuthContext.Provider value={{
        user, profile, loading,
        isAuthorized: profile?.role === 'root' || !!profile?.isAuthorized || profile?.status === 'approved',
        configError: !isConfigReady,
        loginWithEmailPassword, registerWithEmailPassword, resetPassword,
        logout, updateProfileData,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth missing Provider");
  return context;
};

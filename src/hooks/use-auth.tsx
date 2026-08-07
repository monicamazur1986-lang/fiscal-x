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

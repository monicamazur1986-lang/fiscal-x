'use client';

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useMemo } from "react";

type User = { uid: string; email: string | null; };
import { normalizeId } from "@/lib/utils";

export const ROOT_ADMIN_EMAIL = 'monicamazur1986@gmail.com';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  isAuthorized: boolean;
  role: 'admin' | 'fiscal' | 'root';
  municipioId: string;
  fiscalCode?: string;
  status?: 'pending' | 'approved' | 'rejected';
  adminFeedback?: string;
  municipioNome?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthorized: boolean;
  loginWithEmailPassword: (email: string, pass: string, options?: { rememberPassword?: boolean }) => Promise<void>;
  registerWithEmailPassword: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  getSavedPassword: (email: string) => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PROFILE_CACHE_KEY = "vigilant-profile-cache";
const ACTIVE_SESSION_KEY = "vigilant-active-session";
const LOCAL_USERS_KEY = "vigilant-local-users";
const DEVICE_CREDENTIALS_KEY = "vigilant-device-credentials";

function readProfileCache(): UserProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function persistProfileCache(profileData: UserProfile | null) {
  if (typeof window === "undefined") return;

  if (!profileData) {
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
    return;
  }

  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileData));
}

function readLocalUsers(): Record<string, UserProfile> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalUsers(users: Record<string, UserProfile>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function readActiveSessionUid(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

function readDeviceCredentials(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(DEVICE_CREDENTIALS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDeviceCredentials(credentials: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEVICE_CREDENTIALS_KEY, JSON.stringify(credentials));
}

function getCredentialKey(email: string, role: UserProfile['role']) {
  return `${email.toLowerCase().trim()}:${role}`;
}

function persistDevicePassword(email: string, password: string, role: UserProfile['role']) {
  const credentials = readDeviceCredentials();
  credentials[getCredentialKey(email, role)] = password;
  saveDeviceCredentials(credentials);
}

function readDevicePassword(email: string, role: UserProfile['role']) {
  const credentials = readDeviceCredentials();
  return credentials[getCredentialKey(email, role)] ?? null;
}

function persistActiveSessionUid(uid: string | null) {
  if (typeof window === "undefined") return;
  if (!uid) {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_SESSION_KEY, uid);
}

function createLocalProfile(email: string, overrides: Partial<UserProfile> = {}): UserProfile {
  const normalizedEmail = email.toLowerCase().trim();
  return {
    uid: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: normalizedEmail,
    displayName: overrides.displayName || "USUÁRIO LOCAL",
    photoURL: overrides.photoURL || "",
    isAuthorized: overrides.isAuthorized ?? true,
    role: overrides.role || "fiscal",
    municipioId: overrides.municipioId || "local",
    municipioNome: overrides.municipioNome || "MODO LOCAL",
    status: overrides.status || "approved",
    ...overrides,
  };
}

function getOrCreateLocalProfile(email: string, overrides: Partial<UserProfile> = {}): UserProfile {
  const users = readLocalUsers();
  const normalizedEmail = email.toLowerCase().trim();
  const existing = users[normalizedEmail];
  if (existing) {
    const merged = { ...existing, ...overrides };
    users[normalizedEmail] = merged;
    saveLocalUsers(users);
    return merged;
  }

  const profile = createLocalProfile(normalizedEmail, overrides);
  users[normalizedEmail] = profile;
  saveLocalUsers(users);
  return profile;
}

function inferRoleFromEmail(email: string, fallbackRole: UserProfile['role'] = 'fiscal'): UserProfile['role'] {
  const normalizedEmail = email.toLowerCase().trim();
  if (normalizedEmail === ROOT_ADMIN_EMAIL) return 'root';
  if (normalizedEmail.endsWith('.pr.gov.br')) return 'admin';
  return fallbackRole;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(() => readProfileCache());
  const [user, setUser] = useState<User | null>(() => {
    const cachedProfile = readProfileCache();
    if (cachedProfile) {
      return { uid: cachedProfile.uid, email: cachedProfile.email } as any;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const suppressProfileReloadRef = useRef(false);

  useEffect(() => {
    // Modo 100% Local
    const storedUid = readActiveSessionUid();
    if (storedUid) {
      const cachedProfile = readProfileCache();
      if (cachedProfile?.uid === storedUid) {
        setUser({ uid: cachedProfile.uid, email: cachedProfile.email } as any);
        setProfile(cachedProfile);
      }
    }
    setLoading(false);
  }, []);

  const memoizedProfile = useMemo(() => {
    if (profile) {
      persistProfileCache(profile);
    }
    return profile;
  }, [profile?.uid, profile?.displayName, profile?.email, profile?.role, profile?.municipioId]);

  const loginWithEmailPassword = async (email: string, pass: string, options?: { rememberPassword?: boolean }) => {
    const normalizedEmail = email.toLowerCase().trim();
    const inferredRole = inferRoleFromEmail(normalizedEmail);
    const savedPassword = readDevicePassword(normalizedEmail, inferredRole);
    const canUseSavedPassword = !!savedPassword && savedPassword === pass;

    if (options?.rememberPassword || canUseSavedPassword) {
      persistDevicePassword(normalizedEmail, pass, inferredRole);
    }

    const localProfile = getOrCreateLocalProfile(normalizedEmail, {
      displayName: normalizedEmail === ROOT_ADMIN_EMAIL ? "ROOT" : normalizedEmail.endsWith('.pr.gov.br') ? "GESTOR MUNICIPAL" : "FISCAL SANITÁRIO",
      role: inferredRole,
      isAuthorized: true,
      status: "approved",
      municipioId: normalizedEmail.endsWith('.pr.gov.br') ? normalizeId(normalizedEmail.split('@')[0]) : "local",
      municipioNome: normalizedEmail.endsWith('.pr.gov.br') ? normalizedEmail.split('@')[0].toUpperCase() : "",
    });

    setUser({ uid: localProfile.uid, email: localProfile.email } as any);
    setProfile(localProfile);
    persistProfileCache(localProfile);
    persistActiveSessionUid(localProfile.uid);
  };

  const registerWithEmailPassword = async (data: any) => {
    const profileData = getOrCreateLocalProfile(data.email, {
      email: data.email.toLowerCase().trim(),
      displayName: data.nome.toUpperCase(),
      photoURL: "",
      isAuthorized: true, // Aprovado automaticamente em modo local
      status: "approved",
      role: data.role === 'admin' ? 'admin' : inferRoleFromEmail(data.email, 'fiscal'),
      municipioId: normalizeId(data.municipioId),
      municipioNome: data.metadata?.municipioNome || data.municipioId,
    });

    setUser({ uid: profileData.uid, email: profileData.email } as any);
    setProfile(profileData);
    persistProfileCache(profileData);
    persistActiveSessionUid(profileData.uid);
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!profile) return;

    const nextProfile = { ...profile, ...data };
    setProfile(nextProfile);
    persistProfileCache(nextProfile);

    const users = readLocalUsers();
    const emailKey = nextProfile.email.toLowerCase().trim();
    if (users[emailKey]) {
      users[emailKey] = nextProfile;
      saveLocalUsers(users);
    }
  };

  const logout = async () => {
    setUser(null);
    setProfile(null);
    persistProfileCache(null);
    persistActiveSessionUid(null);
  };

  const getSavedPassword = (email: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const role = inferRoleFromEmail(normalizedEmail);
    return readDevicePassword(normalizedEmail, role);
  };

  return (
    <AuthContext.Provider value={{ 
        user, profile: memoizedProfile, loading, 
        isAuthorized: !!profile?.isAuthorized || profile?.role === 'root' || profile?.role === 'admin' || profile?.status === 'approved',
        loginWithEmailPassword, registerWithEmailPassword, 
        logout, updateProfileData, getSavedPassword
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

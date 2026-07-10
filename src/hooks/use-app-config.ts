
'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase'; // Importe a instância 'db' diretamente
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useAuth, ROOT_ADMIN_EMAIL } from './use-auth';
import { normalizeId } from '@/lib/utils';

export interface MunicipalityConfig {
  logoUrl?: string; // Brasão Municipal (Documentos A4)
  appLogoUrl?: string; // LOGO GLOBAL DO SISTEMA (LOGIN) - Gerenciado pelo ROOT
  secretaria?: string;
  departamento?: string;
  municipioNome?: string;
  headerRichText?: string;
  defaultPrazoRichText?: string;
  n8nWebhookUrl?: string;
}

const LOCAL_CONFIG_KEY = 'fiscal_x_muni_config_v6';
const SYSTEM_CONFIG_KEY = 'fiscal_x_system_global_v2';

export function useAppConfig() {
  const { profile } = useAuth();
  
  const [config, setConfig] = useState<MunicipalityConfig>({
    secretaria: "SECRETARIA MUNICIPAL DE SAÚDE",
    departamento: "VIGILÂNCIA SANITÁRIA",
    municipioNome: "PRUDENTÓPOLIS",
  });
  
  const [systemLogo, setSystemLogo] = useState("");
  const [loading, setLoading] = useState(true);

  // 1. CARREGAR CONFIGURAÇÃO MUNICIPAL (IDENTIDADE DO GESTOR)
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (saved) {
      try { setConfig(prev => ({ ...prev, ...JSON.parse(saved) })); } catch (e) {}
    }

    if (!profile?.municipioId || !db) {
      if (!profile?.municipioId) setLoading(false);
      return;
    }
    
    const mid = normalizeId(profile.municipioId);
    
    if (mid === 'root') {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "municipios", mid, "config", "brand"), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as MunicipalityConfig;
        setConfig(prev => ({ ...prev, ...data }));
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(data));
      }
      setLoading(false);
    }, (err) => {
      setLoading(false);
    });
    return unsub;
  }, [db, profile?.municipioId]);

  // 2. CARREGAR CONFIGURAÇÃO GLOBAL DO SISTEMA (MARCA VIGILANT - ROOT)
  useEffect(() => {
    const savedSys = localStorage.getItem(SYSTEM_CONFIG_KEY);
    if (savedSys) setSystemLogo(savedSys);

    if (!db) return;

    const unsub = onSnapshot(doc(db, "configuracoes", "global"), (snap) => {
      if (snap.exists()) {
        const url = snap.data().appLogoUrl || "";
        setSystemLogo(url);
        localStorage.setItem(SYSTEM_CONFIG_KEY, url);
      }
    });
    return unsub;
  }, [db]);

  const updateConfig = useCallback(async (data: Partial<MunicipalityConfig>) => {
    const newConfig = { ...config, ...data };
    setConfig(newConfig);
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(newConfig));

    if (db && profile?.municipioId) {
      const mid = normalizeId(profile.municipioId);
      if (mid !== 'root') {
        await setDoc(doc(db, "municipios", mid, "config", "brand"), data, { merge: true });
      }
    }
  }, [db, profile?.municipioId, config]);

  const updateSystemLogo = useCallback(async (url: string) => {
    setSystemLogo(url);
    localStorage.setItem(SYSTEM_CONFIG_KEY, url);
    
    // Root write attempt
    if (db && (profile?.role === 'root' || profile?.email?.toLowerCase() === ROOT_ADMIN_EMAIL)) {
      try {
        await setDoc(doc(db, "configuracoes", "global"), { appLogoUrl: url }, { merge: true });
      } catch (e) {
        console.error("Firestore Error saving global logo:", e);
        throw e;
      }
    } else {
      console.warn("Update System Logo denied: Not Root or No DB");
    }
  }, [db, profile]);

  return { 
    config, 
    systemLogo,
    updateConfig, 
    updateSystemLogo,
    updateLogo: (url: string) => updateConfig({ logoUrl: url }),
    loading 
  };
}


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
  footerRichText?: string;
  defaultPrazoRichText?: string;
  n8nWebhookUrl?: string;
}

const LOCAL_CONFIG_KEY = 'fiscal_x_muni_config_v6';
const SYSTEM_CONFIG_KEY = 'fiscal_x_system_global_v2';

export function useAppConfig(options?: { municipioIdOverride?: string }) {
  const { profile } = useAuth();

  const effectiveMunicipioId = profile?.role === 'root' ? options?.municipioIdOverride : profile?.municipioId;

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

    if (!effectiveMunicipioId || !db) {
      if (!effectiveMunicipioId) setLoading(false);
      return;
    }

    const mid = normalizeId(effectiveMunicipioId);

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
  }, [db, effectiveMunicipioId]);

  // 2. CARREGAR CONFIGURAÇÃO GLOBAL DO SISTEMA (MARCA FISCAL-X - ROOT)
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
    // Sem município identificado (comum pro root antes de selecionar um), a
    // gravação real no Firestore era silenciosamente pulada — só a tela
    // local mudava, então a ação "parecia" ter dado certo (toast de
    // sucesso) mas nada era salvo de verdade. Lançar aqui garante que quem
    // chamou saiba que a ação falhou, em vez de mostrar um falso sucesso.
    if (!effectiveMunicipioId) {
      throw new Error('Nenhum município selecionado — nada foi salvo.');
    }

    const newConfig = { ...config, ...data };
    setConfig(newConfig);
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(newConfig));

    if (db) {
      const mid = normalizeId(effectiveMunicipioId);
      await setDoc(doc(db, "municipios", mid, "config", "brand"), data, { merge: true });
    }
  }, [db, effectiveMunicipioId, config]);

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
    loading,
    needsMunicipioSelection: profile?.role === 'root' && !options?.municipioIdOverride,
  };
}

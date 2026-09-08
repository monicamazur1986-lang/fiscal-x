'use client';

import { useEffect, useState } from 'react';

/**
 * Status de conexão do navegador — consolida o padrão de navigator.onLine +
 * eventos online/offline que antes estava duplicado em use-inspecoes.ts e
 * use-intimacoes.ts. Usado pro indicador global em app-header.tsx, mas serve
 * pra qualquer tela que precise saber se está offline.
 */
export function useOnlineStatus(): boolean {
  // Assume online no primeiro render (inclusive no servidor, onde
  // `navigator` não existe) — o valor real chega logo em seguida, no efeito.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

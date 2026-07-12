'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Registra o service worker em qualquer página (não só quando o fiscal ativa
 * os alertas) — necessário para o Chrome/Android considerar o site instalável
 * como app (critério de "PWA instalável"). Também mostra um botão flutuante
 * "Instalar App" quando o navegador sinaliza que a instalação está disponível
 * (`beforeinstallprompt`), já que a maioria dos usuários não sabe procurar essa
 * opção sozinha no menu do navegador.
 */
export function PwaInstallListener() {
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {
      // Silencioso: registro de SW é um reforço, não uma funcionalidade crítica.
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!installPromptEvent || dismissed) return null;

  const handleInstall = async () => {
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
  };

  return (
    <div className="no-print fixed bottom-3 left-3 z-[100] flex items-center gap-2 bg-white border border-zinc-200 rounded-2xl shadow-lg p-2 pl-4">
      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Instalar como app?</span>
      <Button type="button" size="sm" onClick={handleInstall} className="h-9 px-3 rounded-xl gap-1.5 bg-primary text-white text-[9px] font-black uppercase tracking-widest">
        <Download className="h-3.5 w-3.5" /> Instalar
      </Button>
      <button type="button" onClick={() => setDismissed(true)} className="h-9 w-9 flex items-center justify-center text-zinc-300 hover:text-zinc-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

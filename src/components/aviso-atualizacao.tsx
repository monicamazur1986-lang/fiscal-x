"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw, X } from "lucide-react"

/** De quanto em quanto tempo perguntar ao servidor, com o app aberto. */
const INTERVALO_MS = 15 * 60 * 1000;

/**
 * AVISO DE VERSÃO NOVA
 *
 * Atualizar o sistema nunca exigiu reinstalar o app — o código vem do servidor
 * a cada carregamento. O problema é que aplicativo instalado quase nunca
 * *carrega*: o celular o retoma de onde parou, então uma tela aberta na
 * segunda-feira podia continuar rodando o código de segunda pelo resto da
 * semana. Era daí que vinha a sensação de que "a alteração não chega".
 *
 * Aqui o app compara a versão que ele está rodando (NEXT_PUBLIC_BUILD_ID,
 * embutida no bundle durante o build) com a publicada (/versao.json, lida sem
 * cache). Divergiu, aparece uma faixa discreta com o botão de atualizar, que
 * só recarrega a página.
 *
 * A conferência acontece ao abrir, sempre que o app volta pro primeiro plano
 * (o momento típico do fiscal retomando o celular) e a cada 15 minutos.
 *
 * Nunca interrompe o trabalho: é aviso, não recarregamento automático —
 * recarregar sozinho no meio de uma vistoria perderia o que não foi salvo.
 */
export function AvisoAtualizacao() {
  const [temAtualizacao, setTemAtualizacao] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  const conferir = useCallback(async () => {
    const rodando = process.env.NEXT_PUBLIC_BUILD_ID;
    // 'dev' = build local sem carimbo; não faz sentido avisar nesse caso.
    if (!rodando || rodando === 'dev') return;
    try {
      const res = await fetch('/versao.json', { cache: 'no-store' });
      if (!res.ok) return;
      const { build } = await res.json();
      if (build && build !== rodando) setTemAtualizacao(true);
    } catch {
      // Sem rede: não é erro que valha mostrar — tenta de novo na próxima.
    }
  }, []);

  useEffect(() => {
    conferir();
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    const timer = setInterval(conferir, INTERVALO_MS);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      clearInterval(timer);
    };
  }, [conferir]);

  if (!temAtualizacao || dispensado) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] no-print w-[calc(100%-2rem)] max-w-sm">
      <div className="flex items-center gap-3 rounded-xl border border-[#1F7A5C]/30 bg-white px-4 py-3 shadow-[0_10px_30px_-10px_rgba(38,36,32,0.45)]">
        <div className="h-9 w-9 rounded-lg bg-[#E4EEEC] text-[#0E4A44] flex items-center justify-center shrink-0">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-[#262420] leading-tight">Nova versão disponível</p>
          <p className="text-[12px] text-[#6B6659] leading-snug">Atualize para receber as melhorias.</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 h-9 px-3 rounded-lg bg-[#0E4A44] hover:bg-[#0B3A35] text-white text-[11px] font-black uppercase tracking-widest transition-colors"
        >
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => setDispensado(true)}
          aria-label="Agora não"
          className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-[#A39D8C] hover:text-[#262420] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

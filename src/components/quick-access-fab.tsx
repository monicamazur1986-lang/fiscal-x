'use client';

import { useRef, useState } from "react"
import { LifeBuoy, X, type LucideIcon } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { DASHBOARD_MENU_ITEMS, type DashboardMenuItem } from "@/lib/dashboard-menu-items"

// Reaproveita a mesma lista de itens do Dashboard (em vez de manter um rol
// separado aqui) — era assim que "Nova Autuação", "Documentos", "Roteiros",
// "Risco Sanitário", "Docfacil", "Identidade Municipal" e "Suporte Técnico"
// ficavam de fora do acesso rápido mesmo já existindo no menu principal.
const ATALHOS: DashboardMenuItem[] = DASHBOARD_MENU_ITEMS;

interface Janela {
  href: string;
  icon: LucideIcon;
  label: string;
  offset: number;
}

/**
 * Botão flutuante de acesso rápido — lista os mesmos itens do menu do
 * Dashboard, pra consultar qualquer um deles (Biblioteca, Roteiros,
 * Documentos, Agenda etc.) no meio do preenchimento de um roteiro ou
 * autuação, sem perder o que já foi digitado. Cada atalho abre como uma
 * janela sobreposta na própria tela (via
 * iframe com ?embed=1, que faz o AppHeader daquela rota não se renderizar —
 * ver app-header.tsx), não em nova aba: assim o fiscal consulta outra coisa
 * sem sair da tela de preenchimento. Com uma janela só, ela abre em tamanho
 * confortável; a partir da segunda aberta simultaneamente, todas encolhem e
 * ficam em cascata pra caber lado a lado.
 */
export function QuickAccessFab() {
  const [open, setOpen] = useState(false);
  const [janelas, setJanelas] = useState<Janela[]>([]);
  const offsetCounter = useRef(0);

  const abrirJanela = (atalho: DashboardMenuItem) => {
    setJanelas(prev => {
      const existente = prev.find(j => j.href === atalho.href);
      if (existente) {
        // já aberta — só traz pra frente (vai pro fim, renderiza por último)
        return [...prev.filter(j => j.href !== atalho.href), existente];
      }
      const offset = (offsetCounter.current % 5) * 28;
      offsetCounter.current += 1;
      return [...prev, { href: atalho.href, icon: atalho.icon, label: atalho.label, offset }];
    });
    setOpen(false);
  };

  const trazerParaFrente = (href: string) => {
    setJanelas(prev => {
      const idx = prev.findIndex(j => j.href === href);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const [j] = prev.splice(idx, 1);
      return [...prev, j];
    });
  };

  const fecharJanela = (href: string) => {
    setJanelas(prev => prev.filter(j => j.href !== href));
  };

  const compacto = janelas.length > 1;

  return (
    <>
      {/*
        Posicionado na borda direita, centralizado verticalmente — de
        propósito, não no canto inferior: tanto a tela de roteiro (barra de
        Salvar Rascunho/Finalizar, fixed bottom-0 full-width) quanto a de
        autuação (barra de Baixar PDF, fixed bottom-3 right-3) já ocupam esse
        canto com z-[100]. Ficando no meio da lateral, o atalho nunca some
        atrás delas em nenhuma das duas telas.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Acesso rápido"
        className="no-print fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-[110] h-14 w-14 rounded-full bg-[#0E4A44] text-white shadow-lg shadow-black/25 flex items-center justify-center hover:bg-[#0B3A35] active:scale-95 transition-all"
      >
        <LifeBuoy className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 bg-[#FCFAF5] z-[110]">
          <SheetHeader className="p-6 border-b border-[#E4DFD1] text-left">
            <SheetTitle className="font-serif text-lg text-[#262420]">Acesso Rápido</SheetTitle>
            <SheetDescription className="text-xs text-[#A39D8C]">
              Abre numa janela sobreposta aqui mesmo — o que você já preencheu continua salvo e visível atrás dela.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
            {ATALHOS.map((a) => (
              <button
                key={a.href}
                type="button"
                onClick={() => abrirJanela(a)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#E4DFD1] bg-white hover:bg-[#F5F2EA] hover:border-[#0E4A44]/30 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[#E4EEEC] text-[#0E4A44]">
                  <a.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-serif text-sm text-[#262420]">{a.label}</p>
                  <p className="text-xs text-[#A39D8C] truncate">{a.description}</p>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {janelas.map((j, idx) => (
        <div
          key={j.href}
          onMouseDown={() => trazerParaFrente(j.href)}
          className="no-print fixed bg-white border border-[#E4DFD1] shadow-2xl rounded-lg overflow-hidden flex flex-col"
          style={{
            top: (compacto ? 72 : 64) + j.offset,
            right: 16 + j.offset,
            width: compacto ? 380 : 640,
            height: compacto ? 500 : '78vh',
            maxWidth: '95vw',
            maxHeight: '85vh',
            minWidth: 280,
            minHeight: 320,
            resize: 'both',
            zIndex: 120 + idx,
          }}
        >
          <div className="flex items-center justify-between gap-2 px-3 h-11 shrink-0 bg-[#0E4A44] text-white">
            <div className="flex items-center gap-2 min-w-0">
              <j.icon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-widest truncate">{j.label}</span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fecharJanela(j.href); }}
              aria-label={`Fechar ${j.label}`}
              className="h-7 w-7 rounded-full bg-white/15 hover:bg-rose-500 flex items-center justify-center shrink-0 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* <iframe> como filho flex direto (flex-1) colapsava pra altura
              ~0 em vez de esticar — comportamento clássico de elemento
              substituído dentro de flexbox. Isolando numa div com
              position:relative + flex:1 + minHeight:0 e o iframe absoluto
              preenchendo tudo (inset:0), o tamanho vem do container, não do
              algoritmo de flex-grow aplicado ao próprio iframe. */}
          <div className="relative flex-1 min-h-0">
            <iframe src={`${j.href}?embed=1`} className="absolute inset-0 w-full h-full border-0 bg-white" title={j.label} />
          </div>
        </div>
      ))}
    </>
  );
}

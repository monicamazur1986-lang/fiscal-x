'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { LifeBuoy, X, type LucideIcon } from "lucide-react"

import { DASHBOARD_MENU_ITEMS, darkenHex, type DashboardMenuItem } from "@/lib/dashboard-menu-items"

// Reaproveita a mesma lista de itens do Dashboard (em vez de manter um rol
// separado aqui) — era assim que "Nova Autuação", "Documentos", "Roteiros",
// "Risco Sanitário", "Docfacil", "Identidade Municipal" e "Suporte Técnico"
// ficavam de fora do acesso rápido mesmo já existindo no menu principal.
const ATALHOS: DashboardMenuItem[] = DASHBOARD_MENU_ITEMS;

const BUTTON_SIZE = 44;
const RING_GAP = 5;
const PANEL_W = 248;
const PANEL_MAX_H = 420;
const POS_STORAGE_KEY = 'fiscal_x_quick_access_pos';

interface Janela {
  href: string;
  icon: LucideIcon;
  label: string;
  offset: number;
}

type Pos = { x: number; y: number };

function clampPos(x: number, y: number): Pos {
  const maxX = window.innerWidth - BUTTON_SIZE - 4;
  const maxY = window.innerHeight - BUTTON_SIZE - 4;
  return { x: Math.min(Math.max(4, x), Math.max(4, maxX)), y: Math.min(Math.max(4, y), Math.max(4, maxY)) };
}

/** Painel de atalhos ancorado perto do botão, virando de lado quando não cabe. */
function getPanelStyle(pos: Pos): CSSProperties {
  const abrirPraEsquerda = pos.x + BUTTON_SIZE + 8 + PANEL_W > window.innerWidth - 8;
  const left = abrirPraEsquerda
    ? Math.max(8, pos.x - PANEL_W - 8)
    : Math.min(pos.x + BUTTON_SIZE + 8, window.innerWidth - PANEL_W - 8);
  const abrirPraCima = pos.y + PANEL_MAX_H > window.innerHeight - 8;
  const top = abrirPraCima
    ? Math.max(8, pos.y + BUTTON_SIZE - PANEL_MAX_H)
    : Math.min(pos.y, window.innerHeight - PANEL_MAX_H - 8);
  return { left, top, width: PANEL_W, maxHeight: PANEL_MAX_H };
}

/**
 * Botão flutuante de acesso rápido — lista os mesmos itens do menu do
 * Dashboard, pra consultar qualquer um deles (Biblioteca, Roteiros,
 * Documentos, Agenda etc.) no meio do preenchimento de um roteiro ou
 * autuação, sem perder o que já foi digitado. Cada atalho abre como uma
 * janela sobreposta na própria tela (via iframe com ?embed=1, que faz o
 * AppHeader daquela rota não se renderizar — ver app-header.tsx), não em nova
 * aba. Várias janelas podem ficar abertas ao mesmo tempo (o painel de atalhos
 * não fecha sozinho ao escolher um item) — com uma só, ela abre em tamanho
 * confortável; a partir da segunda, todas encolhem e ficam em cascata.
 *
 * O botão é arrastável (posição lembrada por aparelho, via localStorage) —
 * antes ficava fixo bem na borda direita da tela, e no Android isso conflitava
 * com o gesto do sistema de "arrastar da borda para voltar", derrubando o
 * fiscal pro login no meio do preenchimento de um roteiro. touch-action:none
 * no botão evita esse conflito mesmo antes de ele ser movido pra longe da
 * borda.
 */
export function QuickAccessFab() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [open, setOpen] = useState(false);
  const [janelas, setJanelas] = useState<Janela[]>([]);
  const offsetCounter = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragInfo = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean; lastPos: Pos } | null>(null);

  useEffect(() => {
    let initial: Pos | null = null;
    try {
      const saved = localStorage.getItem(POS_STORAGE_KEY);
      if (saved) initial = JSON.parse(saved);
    } catch {}
    setPos(initial || clampPos(window.innerWidth - 56, window.innerHeight / 2 - BUTTON_SIZE / 2));
  }, []);

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = buttonRef.current!.getBoundingClientRect();
    dragInfo.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false, lastPos: { x: rect.left, y: rect.top } };
    buttonRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const info = dragInfo.current;
    if (!info) return;
    const dx = e.clientX - info.startX;
    const dy = e.clientY - info.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) info.moved = true;
    if (info.moved) {
      const next = clampPos(info.origX + dx, info.origY + dy);
      info.lastPos = next;
      setPos(next);
    }
  };

  const handlePointerUp = () => {
    const info = dragInfo.current;
    dragInfo.current = null;
    if (!info) return;
    if (info.moved) {
      try { localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(info.lastPos)); } catch {}
    } else {
      setOpen((o) => !o);
    }
  };

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

  if (!pos) return null;

  return (
    <>
      {/* Anel pontilhado decorativo, girando devagar em torno do botão —
          pointer-events-none pra não atrapalhar o arraste/clique, que
          continuam calculados só a partir do próprio botão (pos.x/pos.y). */}
      <div
        aria-hidden
        style={{ left: pos.x - RING_GAP, top: pos.y - RING_GAP, width: BUTTON_SIZE + RING_GAP * 2, height: BUTTON_SIZE + RING_GAP * 2 }}
        className="no-print fixed z-[110] pointer-events-none rounded-full border-2 border-dashed border-[#0E4A44]/30 animate-[spin_9s_linear_infinite]"
      />
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Acesso rápido"
        style={{
          left: pos.x,
          top: pos.y,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          backgroundImage: `linear-gradient(135deg, #16645C, #0B3A35)`,
        }}
        className="no-print fixed z-[111] touch-none select-none rounded-full text-white shadow-lg shadow-black/30 flex items-center justify-center active:scale-95 transition-transform cursor-grab active:cursor-grabbing"
      >
        <LifeBuoy className={`h-5 w-5 absolute transition-all duration-300 ${open ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} />
        <X className={`h-5 w-5 absolute transition-all duration-300 ${open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[109] bg-[#262420]/10 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div
            style={getPanelStyle(pos)}
            className="no-print fixed z-[110] flex flex-col bg-[#FCFAF5] border border-[#E4DFD1] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between gap-2 px-3.5 h-10 shrink-0 border-b border-[#E4DFD1] bg-white/60">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#9C7A3C]">Acesso Rápido</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="h-6 w-6 rounded-full flex items-center justify-center text-[#A39D8C] hover:bg-rose-50 hover:text-rose-500 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto p-2 grid grid-cols-2 gap-1.5">
              {ATALHOS.map((a) => (
                <button
                  key={a.href}
                  type="button"
                  onClick={() => abrirJanela(a)}
                  className="group flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center hover:bg-[#F5F2EA] active:scale-95 transition-all"
                >
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                    style={{ backgroundImage: `linear-gradient(135deg, ${a.color}, ${darkenHex(a.color, 30)})`, color: '#fff' }}
                  >
                    <a.icon className="h-4 w-4" />
                  </div>
                  <span className="text-[11px] leading-tight text-[#262420] font-medium">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

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

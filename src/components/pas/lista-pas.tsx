"use client"

import { useMemo } from "react"
import { AlertTriangle, Inbox, Scale, Timer, UserCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { calculateDeadline } from "@/lib/prazo"
import { PAS_FASE_LABEL, PAS_FASE_COR } from "@/lib/pas-textos-padrao"
import { cn } from "@/lib/utils"
import type { Pas } from "@/lib/types"

/**
 * Triagem dos processos: o que exige ação primeiro.
 *
 * A lista antiga era cronológica e plana — num município com trinta processos
 * abertos, saber de qual cuidar exigia abrir um por um. Aqui a ordem é de
 * urgência, e a urgência de um PAS não é a data: é prazo vencido, é estar
 * encaminhado para você, é estar parado esperando julgamento.
 */
export type GrupoPas = {
  chave: string;
  titulo: string;
  explicacao: string;
  processos: Pas[];
  /** Vermelho só no que está fora do prazo — se tudo for urgente, nada é. */
  tom: 'urgente' | 'seu' | 'neutro';
};

export function agruparProcessos(processos: Pas[], meuUid?: string): GrupoPas[] {
  const vencido = (p: Pas) => {
    if (p.fase !== 'instrucao' || p.defesa) return false;
    const d = calculateDeadline({ status: 'finalizado', dataIntimacao: p.dataCienciaAI, prazoDias: 15 });
    return !!d && d.remaining < 0;
  };

  const usados = new Set<string>();
  const pegar = (filtro: (p: Pas) => boolean) => {
    const achados = processos.filter((p) => !usados.has(p.id) && filtro(p));
    achados.forEach((p) => usados.add(p.id));
    return achados;
  };

  // A ordem das chamadas É a regra de precedência: um processo vencido E
  // encaminhado para você aparece em "vencidos", porque o prazo manda.
  const grupos: GrupoPas[] = [
    {
      chave: 'vencidos',
      titulo: 'Prazo vencido',
      explicacao: 'O prazo de defesa passou e o processo não andou.',
      tom: 'urgente',
      processos: pegar(vencido),
    },
    {
      chave: 'comigo',
      titulo: 'Encaminhados para você',
      explicacao: 'Um colega marcou que o próximo passo é seu.',
      tom: 'seu',
      processos: pegar((p) => !!meuUid && p.responsavelAtualUid === meuUid),
    },
    {
      chave: 'julgamento',
      titulo: 'Aguardando julgamento',
      explicacao: 'Instrução encerrada — falta a decisão da autoridade.',
      tom: 'neutro',
      processos: pegar((p) => p.fase === 'aguardando_julgamento' || p.fase === 'julgamento'),
    },
    {
      chave: 'andamento',
      titulo: 'Em andamento',
      explicacao: 'Instauração, instrução e fase recursal.',
      tom: 'neutro',
      processos: pegar((p) => p.fase !== 'arquivamento'),
    },
    {
      chave: 'arquivados',
      titulo: 'Arquivados',
      explicacao: 'Processos encerrados.',
      tom: 'neutro',
      processos: pegar(() => true),
    },
  ];

  return grupos.filter((g) => g.processos.length > 0);
}

export function CartaoPas({ pas, onAbrir }: { pas: Pas; onAbrir: () => void }) {
  const prazo = useMemo(() => {
    if (pas.fase !== 'instrucao' || pas.defesa) return null;
    return calculateDeadline({ status: 'finalizado', dataIntimacao: pas.dataCienciaAI, prazoDias: 15 });
  }, [pas]);

  return (
    <button
      onClick={onAbrir}
      className="w-full flex items-center gap-3 bg-white border border-[#E4DFD1] rounded-xl p-4 text-left transition-all hover:border-[#7A2E3B]/40 hover:shadow-[0_10px_24px_-16px_rgba(38,36,32,0.4)] hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-[#7A2E3B]/10 text-[#7A2E3B]">
        <Scale className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-serif text-[15px] text-[#262420]">AI nº {pas.numeroProcesso}</p>
          <Badge variant="outline" className={cn("text-[10px] font-medium h-5 px-2 border-none", PAS_FASE_COR[pas.fase])}>
            {PAS_FASE_LABEL[pas.fase]}
          </Badge>
        </div>
        <p className="text-xs text-[#8A8474] truncate mt-0.5">{pas.estabelecimento.fantasia}</p>
        {pas.responsavelAtualNome && (
          <p className="text-[11px] text-violet-700 mt-1 flex items-center gap-1">
            <UserCheck className="h-3 w-3 shrink-0" /> {pas.responsavelAtualNome}
          </p>
        )}
      </div>

      {prazo && (
        <div className={cn(
          "flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0 tabular-nums",
          prazo.status === 'vencido' ? "bg-rose-50 text-rose-700"
            : prazo.status === 'alerta' ? "bg-amber-50 text-amber-700"
            : "bg-[#E4EEEC] text-[#0E4A44]"
        )}>
          <Timer className="h-3 w-3" />
          {prazo.remaining < 0 ? `${Math.abs(prazo.remaining)}d vencido` : `${prazo.remaining}d`}
        </div>
      )}
    </button>
  );
}

export function SecaoPas({ grupo, children }: { grupo: GrupoPas; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className={cn(
        "flex items-center gap-2 px-1",
        grupo.tom === 'urgente' && "text-rose-700",
        grupo.tom === 'seu' && "text-violet-700",
        grupo.tom === 'neutro' && "text-[#6B6659]"
      )}>
        {grupo.tom === 'urgente' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
        {grupo.tom === 'seu' && <UserCheck className="h-3.5 w-3.5 shrink-0" />}
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">{grupo.titulo}</h2>
        <span className="text-[10px] font-bold tabular-nums opacity-60">{grupo.processos.length}</span>
      </div>
      <p className="px-1 text-[11px] text-[#A39D8C] -mt-1">{grupo.explicacao}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function VazioPas({ isRoot }: { isRoot: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center border border-dashed border-[#E4DFD1] rounded-2xl bg-white">
      <Inbox className="h-8 w-8 text-[#A39D8C]" />
      <p className="text-sm text-[#6B6659] max-w-sm">
        {isRoot
          ? "Nenhum PAS aberto neste município."
          : 'Nenhum processo aberto. Um PAS nasce sempre de um Auto de Infração já finalizado — use "Abrir PAS".'}
      </p>
    </div>
  );
}

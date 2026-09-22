"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Archive, ArchiveRestore, Folder, FolderInput, Gavel, Inbox, ListChecks, MoreVertical, Scale, Timer, Trash2, UserCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { calculateDeadline } from "@/lib/prazo"
import { PAS_FASE_LABEL, PAS_FASE_COR } from "@/lib/pas-textos-padrao"
import { cn } from "@/lib/utils"
import type { Folder as FolderType, Pas } from "@/lib/types"

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
  /** Cada tom é um jeito diferente de precisar de atenção — vermelho é
   *  urgência de prazo, violeta é "a vez é sua", dourado é aguardar decisão
   *  de outra autoridade, verde é trabalho normal em andamento. Só esses
   *  quatro grupos ganham destaque visual; "neutro" (arquivados e o que
   *  sobra fora do fluxo ativo) fica deliberadamente discreto — se tudo se
   *  destaca, nada se destaca. */
  tom: 'urgente' | 'seu' | 'julgamento' | 'andamento' | 'neutro';
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
      tom: 'julgamento',
      processos: pegar((p) => p.fase === 'aguardando_julgamento' || p.fase === 'julgamento'),
    },
    {
      chave: 'andamento',
      titulo: 'Em andamento',
      explicacao: 'Instauração, instrução e fase recursal.',
      tom: 'andamento',
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

export function CartaoPas({
  pas,
  onAbrir,
  pastas,
  onMoverPasta,
  onArquivar,
  onExcluir,
  mostrarBadgePasta = true,
  ocultarResponsavel = false,
}: {
  pas: Pas;
  onAbrir: () => void;
  /** Presentes só quando o menu de ações deve aparecer — a picker de "Abrir
   * PAS a partir de um AI" reaproveita esse mesmo cartão sem esses callbacks. */
  pastas?: FolderType[];
  onMoverPasta?: (folderId: string | null) => void;
  onArquivar?: (arquivado: boolean) => void;
  onExcluir?: () => void;
  /** Falso só quando a lista já está filtrada por essa mesma pasta — repetir
   * o nome dela em todo cartão da própria pasta não diz nada de novo. */
  mostrarBadgePasta?: boolean;
  /** "Encaminhados para você" já é o nome do grupo — mostrar de novo, em
   * cada cartão, que o responsável é você mesmo só repete a informação. */
  ocultarResponsavel?: boolean;
}) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const mostrarMenu = !!(onMoverPasta || onArquivar || onExcluir);

  const prazo = useMemo(() => {
    if (pas.fase !== 'instrucao' || pas.defesa) return null;
    return calculateDeadline({ status: 'finalizado', dataIntimacao: pas.dataCienciaAI, prazoDias: 15 });
  }, [pas]);

  const pastaAtual = pastas?.find((f) => f.id === pas.folderId);
  const mostrarResponsavel = !ocultarResponsavel && !!pas.responsavelAtualNome;

  return (
    <div className="w-full flex items-center gap-1.5 bg-white border border-[#E4DFD1] rounded-xl p-2 pl-4 transition-all hover:border-[#7A2E3B]/40 hover:shadow-[0_10px_24px_-16px_rgba(38,36,32,0.4)]">
      <button onClick={onAbrir} className="flex-1 min-w-0 flex items-center gap-3 text-left py-2">
        <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-[#7A2E3B]/10 text-[#7A2E3B]">
          <Scale className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* "PAS", não "AI" — pas.numeroProcesso é o número do PROCESSO,
                editável à parte do Auto de Infração que o originou (ver
                "Editar nº" em pas/[id]/page.tsx); os dois podem divergir. */}
            <p className="font-serif text-[15px] text-[#262420] shrink-0">PAS nº {pas.numeroProcesso}</p>
            <Badge variant="outline" className={cn("text-[10px] font-medium h-5 px-2 border-none shrink-0", PAS_FASE_COR[pas.fase])}>
              {PAS_FASE_LABEL[pas.fase]}
            </Badge>
            {mostrarBadgePasta && pastaAtual && (
              <Badge variant="outline" className="text-[10px] font-medium h-5 px-2 border-[#E4DFD1] text-[#9C7A3C] gap-1 shrink-0">
                <Folder className="h-2.5 w-2.5" /> {pastaAtual.name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-[#8A8474] truncate flex-1 min-w-0">{pas.estabelecimento.fantasia}</p>
            {mostrarResponsavel && (
              <span className="text-[11px] text-violet-700 shrink-0 flex items-center gap-1">
                <UserCheck className="h-3 w-3 shrink-0" /> {pas.responsavelAtualNome}
              </span>
            )}
          </div>
        </div>
      </button>

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

      {mostrarMenu && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md text-[#A39D8C] hover:bg-[#F5F2EA] shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-md w-56 p-1 shadow-lg">
              {onMoverPasta && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="rounded text-xs font-medium h-9 px-3 cursor-pointer gap-2">
                    <FolderInput className="h-3.5 w-3.5" /> Mover para pasta
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="rounded-md w-52 p-1 shadow-lg">
                      <DropdownMenuItem onClick={() => onMoverPasta(null)} className="rounded text-xs font-medium h-9 px-3 cursor-pointer">
                        Sem pasta
                      </DropdownMenuItem>
                      {pastas && pastas.length > 0 && <DropdownMenuSeparator />}
                      {pastas?.map((f) => (
                        <DropdownMenuItem key={f.id} onClick={() => onMoverPasta(f.id)} className="rounded text-xs font-medium h-9 px-3 cursor-pointer gap-2">
                          <Folder className="h-3.5 w-3.5" /> {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              {onArquivar && (
                pas.arquivado ? (
                  <DropdownMenuItem onClick={() => onArquivar(false)} className="rounded text-xs font-medium h-9 px-3 cursor-pointer gap-2">
                    <ArchiveRestore className="h-3.5 w-3.5" /> Desarquivar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onArquivar(true)} className="rounded text-xs font-medium h-9 px-3 cursor-pointer gap-2">
                    <Archive className="h-3.5 w-3.5" /> Arquivar
                  </DropdownMenuItem>
                )
              )}
              {onExcluir && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmandoExclusao(true)}
                    className="rounded text-rose-600 text-xs font-medium h-9 px-3 cursor-pointer gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir processo
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {onExcluir && (
            <AlertDialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir este processo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O PAS nº {pas.numeroProcesso} e todas as peças já juntadas aos autos são apagados de vez — não é lixeira, não tem como desfazer. Use "Arquivar" se só quiser tirar da lista.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onExcluir} className="bg-rose-600 hover:bg-rose-700">Excluir de vez</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      )}
    </div>
  );
}

/** Um jeito de precisar de atenção por tom — pílula colorida com ícone pros
 *  quatro grupos que importam no dia a dia; "neutro" fica só texto cinza, de
 *  propósito, pra não competir com eles (arquivados já saiu do fluxo ativo). */
const TOM_PILULA: Record<GrupoPas['tom'], string> = {
  urgente: "bg-rose-50 text-rose-700",
  seu: "bg-violet-50 text-violet-700",
  julgamento: "bg-[#F1E9D6] text-[#9C7A3C]",
  andamento: "bg-[#E4EEEC] text-[#0E4A44]",
  neutro: "text-[#6B6659]",
};

export function SecaoPas({ grupo, children }: { grupo: GrupoPas; children: React.ReactNode }) {
  const destacado = grupo.tom !== 'neutro';
  return (
    <section className="space-y-2">
      {/* A explicação de cada grupo (por que "vencidos" ou "aguardando
          julgamento" significa isso) vira dica ao passar o mouse em vez de
          uma segunda linha sempre visível — o título já é claro pra quem usa
          a tela todo dia, e repetir a explicação em toda seção só empilhava
          texto sem acrescentar nada na leitura rápida. */}
      <div
        title={grupo.explicacao}
        className={cn(
          "inline-flex items-center gap-1.5 px-1",
          destacado && "px-2.5 py-1 rounded-full",
          TOM_PILULA[grupo.tom]
        )}
      >
        {grupo.tom === 'urgente' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
        {grupo.tom === 'seu' && <UserCheck className="h-3.5 w-3.5 shrink-0" />}
        {grupo.tom === 'julgamento' && <Gavel className="h-3.5 w-3.5 shrink-0" />}
        {grupo.tom === 'andamento' && <ListChecks className="h-3.5 w-3.5 shrink-0" />}
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">{grupo.titulo}</h2>
        <span className="text-[10px] font-bold tabular-nums opacity-70">{grupo.processos.length}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function VazioPas({ isRoot, filtro }: { isRoot: boolean; filtro?: 'todos' | 'arquivados' | 'pasta' }) {
  if (filtro === 'arquivados') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center border border-dashed border-[#E4DFD1] rounded-2xl bg-white">
        <Archive className="h-8 w-8 text-[#A39D8C]" />
        <p className="text-sm text-[#6B6659] max-w-sm">Nenhum processo arquivado.</p>
      </div>
    );
  }
  if (filtro === 'pasta') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center border border-dashed border-[#E4DFD1] rounded-2xl bg-white">
        <Folder className="h-8 w-8 text-[#A39D8C]" />
        <p className="text-sm text-[#6B6659] max-w-sm">Nenhum processo nesta pasta ainda — mova um pelo menu de cada processo.</p>
      </div>
    );
  }
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

export function FiltroPastaPas({
  ativa,
  tom = 'normal',
  onClick,
  children,
}: {
  ativa: boolean;
  tom?: 'normal' | 'arquivados';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors",
        ativa
          ? (tom === 'arquivados' ? "bg-[#F1E9D6] text-[#9C7A3C]" : "bg-[#E4EEEC] text-[#0E4A44]")
          : "text-[#6B6659] hover:bg-white"
      )}
    >
      {children}
    </button>
  );
}

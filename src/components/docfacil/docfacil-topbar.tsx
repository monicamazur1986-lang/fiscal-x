"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocfacilTopbarProps {
  /** Navega para uma rota. Use isto OU onBack, nunca os dois. */
  backHref?: string;
  /** Troca de visão sem navegar (ex.: sair do relatório e voltar pra edição). */
  onBack?: () => void;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Título/subtítulo maiores e em cor de destaque, pra telas de detalhe
   * onde saber "em qual processo eu estou" de imediato importa mais do
   * que numa lista — sem isso, o título do PAS (por exemplo) tinha o
   * mesmo peso visual discreto de qualquer outro cabeçalho do sistema.
   * Padrão: false, olhar de sempre. */
  destaque?: boolean;
}

/**
 * Cabeçalho único de todas as telas do DOCFACIL — garante que o botão Voltar
 * fique sempre no mesmo lugar (canto superior esquerdo), com o mesmo rótulo e
 * estilo, em vez de cada tela posicionar o seu de um jeito diferente.
 *
 * O cabeçalho global do app (AppHeader) já mostra "Início" -> /dashboard em
 * toda tela — então aqui só faz sentido informar `backHref`/`onBack` quando
 * o destino for DIFERENTE do dashboard (ex.: voltar pra lista de um módulo
 * a partir de uma tela de detalhe). Sem nenhum dos dois, o botão nem
 * aparece, evitando duplicar a mesma ação de voltar em cada tela.
 */
export function DocfacilTopbar({ backHref, onBack, title, subtitle, actions, destaque = false }: DocfacilTopbarProps) {
  const showBack = Boolean(backHref || onBack);
  const backButton = (
    <span className="flex items-center gap-1.5 text-sm font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors">
      <ArrowLeft className="h-4 w-4" /> Voltar
    </span>
  );

  return (
    <header className={cn(
      "flex items-center gap-4 border-b border-[#E4DFD1] bg-[#F5F2EA] px-4 sm:px-6 no-print",
      destaque ? "h-16 sm:h-[4.5rem]" : "h-14"
    )}>
      {showBack && (
        <>
          {backHref ? (
            <Link href={backHref} className="shrink-0">{backButton}</Link>
          ) : (
            <button type="button" onClick={onBack} className="shrink-0">{backButton}</button>
          )}
          <div className="h-5 w-px bg-[#E4DFD1] shrink-0" />
        </>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn(
          "font-serif truncate",
          destaque ? "text-xl sm:text-2xl font-bold text-[#0E4A44]" : "text-base text-[#262420]"
        )}>{title}</p>
        {subtitle && (
          <p className={cn(
            "truncate",
            destaque ? "text-sm font-semibold text-[#9C7A3C]" : "text-xs text-[#A39D8C]"
          )}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

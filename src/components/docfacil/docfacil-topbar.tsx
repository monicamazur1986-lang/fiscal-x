"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface DocfacilTopbarProps {
  /** Navega para uma rota. Use isto OU onBack, nunca os dois. */
  backHref?: string;
  /** Troca de visão sem navegar (ex.: sair do relatório e voltar pra edição). */
  onBack?: () => void;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho único de todas as telas do DOCFACIL — garante que o botão Voltar
 * fique sempre no mesmo lugar (canto superior esquerdo), com o mesmo rótulo e
 * estilo, em vez de cada tela posicionar o seu de um jeito diferente.
 */
export function DocfacilTopbar({ backHref, onBack, title, subtitle, actions }: DocfacilTopbarProps) {
  const backButton = (
    <span className="flex items-center gap-1.5 text-sm font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors">
      <ArrowLeft className="h-4 w-4" /> Voltar
    </span>
  );

  return (
    <header className="flex items-center gap-4 border-b border-[#E4DFD1] bg-[#F5F2EA] px-4 sm:px-6 h-14 no-print">
      {backHref ? (
        <Link href={backHref} className="shrink-0">{backButton}</Link>
      ) : (
        <button type="button" onClick={onBack} className="shrink-0">{backButton}</button>
      )}
      <div className="h-5 w-px bg-[#E4DFD1] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-serif text-base text-[#262420] truncate">{title}</p>
        {subtitle && <p className="text-xs text-[#A39D8C] truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

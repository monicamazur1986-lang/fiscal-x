"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface AlertCardProps {
  /** Emoji em badge com fundo suave — mesmo padrão adotado em todo o
   *  sistema (Biblioteca, Roteiros, menu principal etc.) em vez do ícone de
   *  linha com uma barra colorida na lateral. */
  emoji: string;
  tone: "urgent" | "warning";
  title: string;
  description?: string;
  href: string;
}

const TONE_BADGE_BG: Record<AlertCardProps["tone"], string> = {
  urgent: "#FCE7E9",
  warning: "#FBF0DD",
};

export function AlertCard({ emoji, tone, title, description, href }: AlertCardProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-[#E4DFD1] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(38,36,32,0.04)] transition-colors hover:bg-[#FAF8F3]"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: TONE_BADGE_BG[tone] }}
      >
        <span className="text-[20px] leading-none" role="img" aria-hidden="true">{emoji}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-sm text-[#262420] truncate">{title}</p>
        {description && <p className="text-xs text-[#A39D8C] truncate mt-0.5">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#C9C2AC] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

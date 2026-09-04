'use client';

import { useState } from "react"
import { Library, Sparkles, CalendarDays, LifeBuoy, Landmark } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

const ATALHOS = [
  {
    href: "/biblioteca",
    icon: Library,
    label: "Biblioteca",
    descricao: "Leis, código sanitário e RDCs da ANVISA",
  },
  {
    href: "/consulta-anvisa",
    icon: Landmark,
    label: "Consulta ANVISA",
    descricao: "Registros e processos sanitários",
  },
  {
    href: "/rascunho",
    icon: Sparkles,
    label: "Fiscal AI",
    descricao: "Gerar rascunho de intimação com base na legislação",
  },
  {
    href: "/agenda",
    icon: CalendarDays,
    label: "Agenda",
    descricao: "Compromissos e vistorias agendadas",
  },
];

/**
 * Botão flutuante de acesso rápido — pra consultar Biblioteca/Fiscal AI/Agenda
 * no meio do preenchimento de um roteiro ou autuação, sem perder o que já foi
 * digitado. Cada atalho abre em nova aba (não navega a aba atual) porque o
 * objetivo é exatamente esse: a tela de preenchimento continua aberta e
 * intacta enquanto o fiscal consulta outra coisa ao lado.
 */
export function QuickAccessFab() {
  const [open, setOpen] = useState(false);

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
              Abre em uma nova aba — o que você já preencheu aqui continua salvo e aberto.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 space-y-2">
            {ATALHOS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg border border-[#E4DFD1] bg-white hover:bg-[#F5F2EA] hover:border-[#0E4A44]/30 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[#E4EEEC] text-[#0E4A44]">
                  <a.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-serif text-sm text-[#262420]">{a.label}</p>
                  <p className="text-xs text-[#A39D8C] truncate">{a.descricao}</p>
                </div>
              </a>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

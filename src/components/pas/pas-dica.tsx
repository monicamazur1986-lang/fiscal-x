"use client"

import { Lightbulb } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { PAS_DICAS, type PasDicaChave } from "@/lib/pas-dicas"

/** Balão de ajuda contextual — conteúdo fixo extraído do Manual da SESA-PR,
 * exibido ao lado da ação correspondente na trilha do PAS. */
export function PasDica({ chave }: { chave: PasDicaChave }) {
  const dica = PAS_DICAS[chave];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Ver dica" className="inline-flex items-center justify-center h-6 w-6 rounded-full text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors shrink-0">
          <Lightbulb className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm">
        <p className="font-serif text-[#262420] mb-1.5">{dica.titulo}</p>
        <p className="text-xs text-[#6B6659] leading-relaxed">{dica.texto}</p>
      </PopoverContent>
    </Popover>
  );
}

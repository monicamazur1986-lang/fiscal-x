"use client"

import { useMemo, useState } from "react"
import { Check, Scale, Search, X } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type IncisoInfracao = { id: string; label: string; lawTitle: string; texto: string };

/** Minúsculas e sem acento — o fiscal digita "responsavel" e precisa achar
 *  "responsável". */
function normalizar(texto: string): string {
  return (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * ESCOLHA MANUAL DO ENQUADRAMENTO
 *
 * Nenhuma busca automática acerta sempre, e enquadramento errado gera auto
 * nulo. Aqui o fiscal aponta o inciso ele mesmo, buscando pela conduta
 * ("responsável técnico", "sem licença", "prazo de validade") em vez de
 * precisar decorar o número do inciso.
 *
 * A lista vem da mesma base que alimenta a sugestão automática, então o que
 * for escolhido é sempre um inciso real, com texto integral — diferente de
 * digitar "Art. 63, III" à mão e arriscar citar dispositivo inexistente no
 * documento oficial.
 */
export function EscolherEnquadramento({
  aberto,
  onOpenChange,
  incisos,
  selecionados,
  onConfirmar,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  incisos: IncisoInfracao[];
  selecionados: string[];
  onConfirmar: (ids: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<string[]>(selecionados);

  const termo = normalizar(busca);
  const filtrados = useMemo(() => {
    if (!termo) return incisos;
    return incisos.filter(
      (i) => normalizar(i.texto).includes(termo) || normalizar(i.label).includes(termo)
    );
  }, [incisos, termo]);

  const alternar = (id: string) =>
    setMarcados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (v) setMarcados(selecionados);
        onOpenChange(v);
      }}
    >
      <DialogContent className="rounded-[2rem] sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-black uppercase tracking-tighter text-xl italic flex items-center gap-2">
            <Scale className="h-5 w-5 text-[#0E4A44]" /> Escolher o enquadramento
          </DialogTitle>
          <DialogDescription>
            Busque pela conduta constatada — por exemplo "responsável técnico", "licença", "validade",
            "receita". A citação sai exatamente como está na lei.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pela conduta..."
            className="pl-9 pr-9 h-11 rounded-xl bg-[#FAF8F3] border-[#E4DFD1] text-sm"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A39D8C] hover:text-[#262420]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="text-[11px] text-[#6B6659] px-1">
          {filtrados.length} {filtrados.length === 1 ? "inciso" : "incisos"}
          {marcados.length > 0 && ` · ${marcados.length} selecionado${marcados.length > 1 ? "s" : ""}`}
        </p>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {filtrados.map((inciso) => {
            const marcado = marcados.includes(inciso.id);
            return (
              <label
                key={inciso.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  marcado ? "border-[#0E4A44]/40 bg-[#E4EEEC]/60" : "border-[#E4DFD1] bg-white hover:bg-[#FAF8F3]"
                )}
              >
                <Checkbox
                  checked={marcado}
                  onCheckedChange={() => alternar(inciso.id)}
                  className="mt-0.5 h-4 w-4 rounded border-[#C9C2AC] data-[state=checked]:bg-[#0E4A44] data-[state=checked]:border-[#0E4A44]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-black uppercase tracking-wide text-[#0E4A44]">{inciso.label}</p>
                  <p className="text-xs text-[#3F3B33] leading-snug mt-0.5">{inciso.texto}</p>
                </div>
              </label>
            );
          })}
          {filtrados.length === 0 && (
            <p className="py-10 text-center text-xs text-[#A39D8C]">
              Nenhum inciso encontrado para "{busca}".
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-[#F1EEE4] pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-black uppercase text-[10px] tracking-widest"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => { onConfirmar(marcados); onOpenChange(false); }}
            disabled={marcados.length === 0}
            className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-[#0E4A44] hover:bg-[#0B3A35]"
          >
            <Check className="h-4 w-4 mr-2" />
            Usar {marcados.length > 0 ? `${marcados.length} ` : ""}
            {marcados.length === 1 ? "inciso" : "incisos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

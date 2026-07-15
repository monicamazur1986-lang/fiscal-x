"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { FileText, Plus, Search, Loader2, Send } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useDocfacil } from "@/hooks/use-docfacil"
import type { DocfacilTipo } from "@/lib/types"
import { format } from "date-fns"

const TIPO_LABEL: Record<DocfacilTipo, string> = {
  oficio: "Ofício",
  memorando: "Memorando",
  circular: "Circular",
};

export default function DocfacilPage() {
  const { modelos, documentos, loading } = useDocfacil();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<DocfacilTipo | "todos">("todos");

  const normalize = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const filteredModelos = useMemo(() => {
    const term = normalize(search);
    return modelos.filter((m) => {
      const matchesSearch = !term ||
        normalize(m.descricao).includes(term) ||
        m.tags.some((t) => normalize(t).includes(term));
      const matchesTipo = tipoFilter === "todos" || m.tipo === tipoFilter;
      return matchesSearch && matchesTipo;
    });
  }, [modelos, search, tipoFilter]);

  const sortedDocumentos = useMemo(() => documentos.slice(0, 20), [documentos]);

  return (
    <div className="min-h-screen bg-white">
      <DocfacilTopbar
        backHref="/dashboard"
        title="DOCFACIL"
        subtitle="Modelos e documentos oficiais"
        actions={
          <Button asChild size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium">
            <Link href="/docfacil/modelo/novo"><Plus className="h-4 w-4" /> Novo Modelo</Link>
          </Button>
        }
      />

      <div className="max-w-3xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Buscar modelo por descrição ou tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-md border-zinc-200 text-sm"
            />
          </div>
          <div className="flex gap-1 p-1 bg-zinc-100 rounded-md w-fit">
            <button onClick={() => setTipoFilter("todos")} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", tipoFilter === "todos" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}>Todos</button>
            {(Object.keys(TIPO_LABEL) as DocfacilTipo[]).map((t) => (
              <button key={t} onClick={() => setTipoFilter(t)} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", tipoFilter === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}>{TIPO_LABEL[t]}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
            <p className="text-sm text-zinc-400">Carregando modelos...</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Modelos</h2>
              <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100 overflow-hidden">
                {filteredModelos.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <span className="text-xs text-zinc-400 tabular-nums shrink-0">Nº {String(m.codigo).padStart(3, "0")}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800 truncate">{m.descricao}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {TIPO_LABEL[m.tipo]}{m.tags.length > 0 ? ` · ${m.tags.map((t) => `#${t}`).join(" ")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium">
                        <Link href={`/docfacil/modelo/${m.id}`}>Editar</Link>
                      </Button>
                      <Button asChild size="sm" className="h-8 text-xs font-medium gap-1.5">
                        <Link href={`/docfacil/gerar/${m.id}`}><Send className="h-3.5 w-3.5" /> Usar</Link>
                      </Button>
                    </div>
                  </div>
                ))}

                {filteredModelos.length === 0 && (
                  <div className="py-16 flex flex-col items-center justify-center gap-2">
                    <FileText className="h-8 w-8 text-zinc-200" />
                    <p className="text-xs text-zinc-400">Nenhum modelo encontrado</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Documentos Emitidos</h2>
              <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100 overflow-hidden">
                {sortedDocumentos.map((d) => (
                  <Link key={d.id} href={`/docfacil/documento/${d.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 transition-colors">
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <span className="text-xs text-zinc-400 tabular-nums shrink-0">{d.numero}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800 truncate">{d.assunto || "(sem assunto)"}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{TIPO_LABEL[d.tipo]} · {d.destinatario || "sem destinatário"} · {format(new Date(d.createdAt), "dd/MM/yyyy")}</p>
                      </div>
                    </div>
                  </Link>
                ))}

                {sortedDocumentos.length === 0 && (
                  <div className="py-16 flex flex-col items-center justify-center gap-2">
                    <p className="text-xs text-zinc-400">Nenhum documento emitido ainda</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

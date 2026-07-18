"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { FileText, Plus, Search, Loader2, Send, Pencil, Folder, FolderPlus, MoreVertical, Inbox } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useDocfacil } from "@/hooks/use-docfacil"
import { useFolders } from "@/hooks/use-folders"
import { useToast } from "@/hooks/use-toast"
import type { DocfacilTipo } from "@/lib/types"
import { format } from "date-fns"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

const TIPO_LABEL: Record<DocfacilTipo, string> = {
  oficio: "Ofício",
  memorando: "Memorando",
  circular: "Circular",
};

export default function DocfacilPage() {
  const { modelos, documentos, loading, moverDocumento } = useDocfacil();
  const { folders, createFolder, loading: loadingFolders } = useFolders('docfacil');
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<DocfacilTipo | "todos">("todos");
  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [movingDocId, setMovingDocId] = useState<string | null>(null);

  const normalize = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

  const filteredDocumentos = useMemo(() => {
    const list = activeFolderId === "all"
      ? documentos
      : documentos.filter((d) => (d.folderId || "") === activeFolderId);
    return list.slice(0, 50);
  }, [documentos, activeFolderId]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName);
      setNewFolderName("");
      setIsFolderDialogOpen(false);
      toast({ title: "Pasta criada" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao criar pasta" });
    }
  };

  const handleMoveDocumento = async (folderId: string | null) => {
    if (!movingDocId) return;
    try {
      await moverDocumento(movingDocId, folderId);
      toast({ title: "Documento movido" });
      setMovingDocId(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao mover" });
    }
  };

  const gerarHref = (modeloId: string) =>
    activeFolderId !== "all" ? `/docfacil/gerar/${modeloId}?folderId=${activeFolderId}` : `/docfacil/gerar/${modeloId}`;

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        backHref="/dashboard"
        title="Docfacil"
        subtitle="Modelos e documentos oficiais"
        actions={
          <Button asChild size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">
            <Link href="/docfacil/modelo/novo"><Plus className="h-4 w-4" /> Novo Modelo</Link>
          </Button>
        }
      />

      <div className="max-w-5xl mx-auto w-full p-4 sm:p-8 space-y-10 pb-40">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
              <Input
                placeholder="Buscar modelo por descrição ou tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 rounded-md border-[#E4DFD1] bg-white text-sm"
              />
            </div>
            <div className="flex gap-1 p-1 bg-[#EDE9DB] rounded-md w-fit">
              <button onClick={() => setTipoFilter("todos")} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", tipoFilter === "todos" ? "bg-white text-[#0E4A44] shadow-sm" : "text-[#6B6659]")}>Todos</button>
              {(Object.keys(TIPO_LABEL) as DocfacilTipo[]).map((t) => (
                <button key={t} onClick={() => setTipoFilter(t)} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", tipoFilter === t ? "bg-white text-[#0E4A44] shadow-sm" : "text-[#6B6659]")}>{TIPO_LABEL[t]}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-[#0E4A44]" />
              <p className="text-sm text-[#A39D8C]">Carregando modelos...</p>
            </div>
          ) : (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Modelos</h2>
              <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
                {filteredModelos.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <span className="text-xs text-[#A39D8C] tabular-nums shrink-0">Nº {String(m.codigo).padStart(3, "0")}</span>
                      <div className="min-w-0">
                        <p className="font-serif text-[15px] text-[#262420] truncate">{m.descricao}</p>
                        <p className="text-xs text-[#A39D8C] mt-0.5">
                          {TIPO_LABEL[m.tipo]}{m.tags.length > 0 ? ` · ${m.tags.map((t) => `#${t}`).join(" ")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button asChild size="sm" className="h-8 text-xs font-medium gap-1.5 bg-[#0E4A44] hover:bg-[#0B3A35]">
                        <Link href={gerarHref(m.id)}><Send className="h-3.5 w-3.5" /> Iniciar Redação</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md text-[#A39D8C] hover:bg-[#F5F2EA]" title="Editar modelo">
                        <Link href={`/docfacil/modelo/${m.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </div>
                  </div>
                ))}

                {filteredModelos.length === 0 && (
                  <div className="py-16 flex flex-col items-center justify-center gap-2">
                    <FileText className="h-8 w-8 text-[#D8D2C0]" />
                    <p className="text-xs text-[#A39D8C]">Nenhum modelo encontrado</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Documentos Emitidos</h2>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <aside className="lg:col-span-3 space-y-1">
              <button
                onClick={() => setActiveFolderId("all")}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  activeFolderId === "all" ? "bg-[#E4EEEC] text-[#0E4A44]" : "text-[#6B6659] hover:bg-white"
                )}
              >
                Todos os Documentos
                <span className="text-xs text-[#A39D8C] tabular-nums">{documentos.length}</span>
              </button>

              <div className="flex items-center justify-between px-3 mb-1 mt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Pastas</span>
                <button onClick={() => setIsFolderDialogOpen(true)} className="text-[#A39D8C] hover:text-[#0E4A44] transition-colors"><FolderPlus className="h-4 w-4" /></button>
              </div>

              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolderId(f.id)}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    activeFolderId === f.id ? "bg-[#E4EEEC] text-[#0E4A44]" : "text-[#6B6659] hover:bg-white"
                  )}
                >
                  <span className="flex items-center gap-2.5 truncate"><Folder className="h-4 w-4 text-[#9C7A3C] shrink-0" /> {f.name}</span>
                  <span className="text-xs text-[#A39D8C] tabular-nums shrink-0">{documentos.filter((d) => d.folderId === f.id).length}</span>
                </button>
              ))}

              {!loadingFolders && folders.length === 0 && (
                <p className="text-xs text-[#C9C2AC] px-3 py-2">Nenhuma pasta criada ainda</p>
              )}
            </aside>

            <main className="lg:col-span-9">
              <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
                {filteredDocumentos.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#FAF8F3] transition-colors">
                    <Link href={`/docfacil/documento/${d.id}`} className="min-w-0 flex-1 flex items-center gap-3">
                      <span className="text-xs text-[#A39D8C] tabular-nums shrink-0">{d.numero}</span>
                      <div className="min-w-0">
                        <p className="font-serif text-[15px] text-[#262420] truncate">{d.assunto || "(sem assunto)"}</p>
                        <p className="text-xs text-[#A39D8C] mt-0.5">{TIPO_LABEL[d.tipo]} · {d.destinatario || "sem destinatário"} · {format(new Date(d.createdAt), "dd/MM/yyyy")}</p>
                      </div>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md text-[#A39D8C] shrink-0 hover:bg-[#F5F2EA]"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-md w-48 p-1 shadow-lg">
                        <DropdownMenuItem onClick={() => setMovingDocId(d.id)} className="rounded text-xs font-medium h-9 px-3 cursor-pointer gap-2">
                          <Folder className="h-3.5 w-3.5" /> Mover para pasta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}

                {filteredDocumentos.length === 0 && (
                  <div className="py-16 flex flex-col items-center justify-center gap-2">
                    <Inbox className="h-8 w-8 text-[#D8D2C0]" />
                    <p className="text-xs text-[#A39D8C]">Nenhum documento emitido ainda</p>
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>

      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogContent className="rounded-lg sm:max-w-md bg-[#FCFAF5]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-[#262420]">Nova Pasta</DialogTitle>
            <DialogDescription className="text-xs text-[#A39D8C]">Organize os documentos emitidos do Docfacil</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#6B6659]">Nome da Pasta</Label>
              <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ex: Ofícios 2026" className="h-10 rounded-md border-[#E4DFD1] bg-white text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateFolder} size="sm" className="w-full h-9 rounded-md text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">Criar Pasta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!movingDocId} onOpenChange={(o) => !o && setMovingDocId(null)}>
        <DialogContent className="rounded-lg sm:max-w-md bg-[#FCFAF5]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-[#262420]">Mover Documento</DialogTitle>
            <DialogDescription className="text-xs text-[#A39D8C]">Selecione o destino</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-1">
            <button onClick={() => handleMoveDocumento(null)} className="w-full text-left px-3 py-2.5 rounded-md hover:bg-[#E4EEEC] text-sm font-medium text-[#6B6659] border border-[#E4DFD1] bg-white transition-colors">Todos os Documentos (raiz)</button>
            {folders.map((f) => (
              <button key={f.id} onClick={() => handleMoveDocumento(f.id)} className="w-full text-left px-3 py-2.5 rounded-md hover:bg-[#F1E9D6] text-sm font-medium text-[#9C7A3C] border border-[#E4DFD1] bg-white transition-colors flex items-center gap-2.5">
                <Folder className="h-4 w-4" /> {f.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

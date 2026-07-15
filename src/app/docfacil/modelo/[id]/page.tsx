"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, X } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DocfacilEditor } from "@/components/docfacil-editor"
import { useDocfacil } from "@/hooks/use-docfacil"
import { useToast } from "@/hooks/use-toast"
import type { DocfacilTipo } from "@/lib/types"

const TIPO_LABEL: Record<DocfacilTipo, string> = {
  oficio: "Ofício",
  memorando: "Memorando",
  circular: "Circular",
};

export default function ModeloDocfacilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNovo = id === "novo";
  const router = useRouter();
  const { toast } = useToast();
  const { modelos, loading, salvarModelo } = useDocfacil();

  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<DocfacilTipo>("oficio");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNovo);

  useEffect(() => {
    if (isNovo || loaded || loading) return;
    const modelo = modelos.find((m) => m.id === id);
    if (modelo) {
      setDescricao(modelo.descricao);
      setTipo(modelo.tipo);
      setTags(modelo.tags);
      setConteudo(modelo.conteudo);
      setLoaded(true);
    }
  }, [isNovo, loaded, loading, modelos, id]);

  const addTag = () => {
    const value = tagInput.trim().toLowerCase();
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagInput("");
  };

  const handleSave = async () => {
    if (!descricao.trim()) {
      toast({ variant: "destructive", title: "Informe a descrição do modelo" });
      return;
    }
    setIsSaving(true);
    try {
      await salvarModelo({ tipo, descricao: descricao.trim(), tags, conteudo }, isNovo ? undefined : id);
      toast({ title: "Modelo salvo" });
      router.push("/docfacil");
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao salvar modelo" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isNovo && !loaded) {
    return (
      <div className="max-w-4xl mx-auto w-full p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
      </div>
    );
  }

  const codigoAtual = modelos.find((m) => m.id === id)?.codigo;

  return (
    <div className="min-h-screen bg-white">
      <DocfacilTopbar
        backHref="/docfacil"
        title={isNovo ? "Novo Modelo" : "Editar Modelo"}
        actions={
          <Button onClick={handleSave} disabled={isSaving} size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        }
      />

      <div className="max-w-4xl mx-auto w-full py-6 space-y-4 pb-40">
        {/* Faixa de propriedades — compacta, tudo numa linha só, pra não competir com a folha do editor abaixo */}
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-0">
          <span className="text-xs text-zinc-400 tabular-nums shrink-0">
            {isNovo ? "Código: atribuído ao salvar" : `Nº ${String(codigoAtual ?? "").padStart(3, "0")}`}
          </span>

          <Select value={tipo} onValueChange={(v) => setTipo(v as DocfacilTipo)}>
            <SelectTrigger className="h-8 w-[130px] rounded-md text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TIPO_LABEL) as DocfacilTipo[]).map((t) => (
                <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição do modelo"
            className="h-8 flex-1 min-w-[180px] rounded-md text-xs"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 bg-zinc-100 rounded px-2 py-1 text-xs text-zinc-600">
                #{tag}
                <button type="button" onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}>
                  <X className="h-3 w-3 text-zinc-400 hover:text-rose-500" />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              placeholder="+ tag"
              className="w-20 bg-transparent outline-none text-xs text-zinc-600 placeholder:text-zinc-400"
            />
          </div>
        </div>

        <DocfacilEditor defaultValue={conteudo} onChange={setConteudo} />
      </div>
    </div>
  )
}

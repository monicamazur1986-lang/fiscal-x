"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, X, Sparkles } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DocfacilEditor } from "@/components/docfacil-editor"
import { useDocfacil } from "@/hooks/use-docfacil"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { polishDocfacilText } from "@/ai/flows/polish-docfacil-text"
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
  const { profile } = useAuth();
  const { modelos, loading, salvarModelo } = useDocfacil();

  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<DocfacilTipo>("oficio");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  // Só permite revisar de novo se o conteúdo mudou desde a última revisão —
  // clique repetido no mesmo texto não deve gastar cota de IA de novo.
  const [lastPolishedContent, setLastPolishedContent] = useState<string | null>(null);
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

  // Aceita o conteúdo como parâmetro porque, no caminho "Revisar e Salvar", o
  // texto revisado só existe nesse momento — setState é assíncrono, então ler
  // `conteudo` aqui ainda pegaria a versão antiga se não fosse passado explicitamente.
  const handleSave = async (conteudoParaSalvar: string = conteudo) => {
    if (!descricao.trim()) {
      toast({ variant: "destructive", title: "Informe a descrição do modelo" });
      return;
    }
    setIsSaving(true);
    try {
      await salvarModelo({ tipo, descricao: descricao.trim(), tags, conteudo: conteudoParaSalvar }, isNovo ? undefined : id);
      toast({ title: "Modelo salvo" });
      router.push("/docfacil");
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao salvar modelo" });
    } finally {
      setIsSaving(false);
    }
  };

  // A IA só é oferecida aqui — no clique final de "Salvar", nunca solta na
  // barra de ferramentas durante a digitação — e no máximo uma vez por
  // versão do texto.
  const [isConfirmSalvarOpen, setIsConfirmSalvarOpen] = useState(false);

  const handleClickSalvar = () => {
    if (!descricao.trim()) {
      toast({ variant: "destructive", title: "Informe a descrição do modelo" });
      return;
    }
    if (conteudo.trim() && conteudo !== lastPolishedContent) {
      setIsConfirmSalvarOpen(true);
    } else {
      handleSave();
    }
  };

  const handleConfirmSalvarSemRevisar = () => {
    setIsConfirmSalvarOpen(false);
    handleSave();
  };

  const handleConfirmSalvarComRevisao = async () => {
    setIsConfirmSalvarOpen(false);
    setIsPolishing(true);
    try {
      const result = await polishDocfacilText({ html: conteudo, uid: profile?.uid || '' });
      if (result.error) {
        toast({ variant: "destructive", title: "IA indisponível", description: result.error });
      } else {
        setConteudo(result.polishedHtml);
        setLastPolishedContent(result.polishedHtml);
      }
      await handleSave(result.polishedHtml);
    } finally {
      setIsPolishing(false);
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
          <div className="flex items-center gap-2">
            <Button onClick={handleClickSalvar} disabled={isSaving || isPolishing} size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          </div>
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

        <DocfacilEditor defaultValue={conteudo} onChange={setConteudo} forceContent={conteudo} />
      </div>

      <Dialog open={isConfirmSalvarOpen} onOpenChange={setIsConfirmSalvarOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl bg-white overflow-hidden p-0">
          <DialogHeader className="p-8 bg-zinc-900 text-white border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-violet-500/20 text-violet-400"><Sparkles className="h-6 w-6" /></div>
              <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Revisar com IA?</DialogTitle>
                <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Última chance antes de salvar o modelo</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8">
            <p className="text-[11px] font-bold text-slate-500 text-center leading-relaxed">Quer que a IA revise a gramática e o tom do texto antes de salvar o modelo?</p>
          </div>
          <DialogFooter className="p-8 bg-zinc-50 border-t border-zinc-100 flex gap-3">
            <Button variant="ghost" onClick={handleConfirmSalvarSemRevisar} className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] text-slate-500 hover:bg-slate-100">Salvar Sem Revisar</Button>
            <Button onClick={handleConfirmSalvarComRevisao} disabled={isPolishing} className="flex-[2] h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-[10px] uppercase tracking-widest shadow-xl gap-2">
              {isPolishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Revisar e Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

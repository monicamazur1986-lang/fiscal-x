"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { LifeBuoy, Plus, Loader2, Bug, HelpCircle, Lightbulb, MessageSquare, Clock, CheckCircle2, Timer } from "lucide-react"
import { BackButton } from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useChamados } from "@/hooks/use-chamados"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { Chamado } from "@/lib/types"
import { format } from "date-fns"

const TIPO_CONFIG: Record<Chamado['tipo'], { label: string; icon: any; color: string }> = {
  erro: { label: "Erro / Falha no Sistema", icon: Bug, color: "text-rose-600 bg-rose-50" },
  duvida: { label: "Dúvida", icon: HelpCircle, color: "text-blue-600 bg-blue-50" },
  sugestao: { label: "Sugestão", icon: Lightbulb, color: "text-amber-600 bg-amber-50" },
  outro: { label: "Outro Assunto", icon: MessageSquare, color: "text-zinc-600 bg-zinc-100" },
};

const STATUS_CONFIG: Record<Chamado['status'], { label: string; color: string }> = {
  aberto: { label: "Aberto", color: "bg-amber-50 text-amber-600 border-amber-100" },
  em_andamento: { label: "Em Andamento", color: "bg-blue-50 text-blue-600 border-blue-100" },
  resolvido: { label: "Resolvido", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
};

export default function SuportePage() {
  const { chamados, loading, abrirChamado } = useChamados();
  const { toast } = useToast();
  const pathname = usePathname();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tipo, setTipo] = useState<Chamado['tipo']>('erro');
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assunto.trim() || !descricao.trim()) return;
    setIsSaving(true);
    try {
      await abrirChamado({ tipo, assunto, descricao, pagina: pathname });
      toast({ title: "Chamado Aberto", description: "Sua solicitação foi enviada. Acompanhe o status por aqui." });
      setAssunto("");
      setDescricao("");
      setTipo('erro');
      setIsDialogOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao abrir chamado" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full p-4 sm:p-8 font-sans space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <BackButton href="/dashboard" />
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary rounded-xl text-white shadow-lg"><LifeBuoy className="h-5 w-5" /></div>
            <h1 className="text-xl sm:text-2xl font-black italic tracking-tighter text-slate-900 uppercase">Suporte Técnico</h1>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button onClick={() => setIsDialogOpen(true)} className="h-11 px-5 rounded-xl gap-2 font-black text-[10px] uppercase tracking-widest bg-primary text-white shadow-lg">
            <Plus className="h-4 w-4" /> Abrir Chamado
          </Button>
          <DialogContent className="rounded-[2.5rem] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Reportar Erro / Suporte</DialogTitle>
              <DialogDescription>Descreva o problema ou a dúvida. Sua solicitação já chega com sua conta e a página onde você estava.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5 py-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as Chamado['tipo'])}>
                  <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none font-bold text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_CONFIG) as Chamado['tipo'][]).map(t => (
                      <SelectItem key={t} value={t}>{TIPO_CONFIG[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Assunto</Label>
                <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Resuma em poucas palavras" className="h-12 rounded-xl bg-slate-50 border-none font-bold text-xs" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Descrição</Label>
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva com detalhes o que aconteceu ou sua dúvida..." className="min-h-[140px] rounded-xl bg-slate-50 border-none font-medium text-xs resize-none" required />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSaving} className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="py-16 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : chamados.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center opacity-40 bg-white rounded-[2rem] border border-dashed border-zinc-200">
            <LifeBuoy className="h-8 w-8 text-zinc-300 mb-3" />
            <p className="text-[9px] font-black uppercase text-zinc-400 tracking-[0.2em]">Nenhum chamado aberto ainda</p>
          </div>
        ) : (
          chamados.map((c) => {
            const tipoCfg = TIPO_CONFIG[c.tipo];
            const statusCfg = STATUS_CONFIG[c.status];
            return (
              <div key={c.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", tipoCfg.color)}>
                      <tipoCfg.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{c.assunto}</h3>
                      <p className="text-[9px] font-bold uppercase text-zinc-400 tracking-widest mt-0.5">{tipoCfg.label} · {format(new Date(c.createdAt), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                  </div>
                  <Badge className={cn("text-[8px] font-black uppercase px-2.5 border", statusCfg.color)}>{statusCfg.label}</Badge>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed pl-12">{c.descricao}</p>
                {c.resposta && (
                  <div className="ml-12 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5">
                    <p className="text-[8px] font-black uppercase text-emerald-600 tracking-widest mb-1">Resposta{c.respondidoPor ? ` de ${c.respondidoPor}` : ''}</p>
                    <p className="text-xs text-emerald-800">{c.resposta}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

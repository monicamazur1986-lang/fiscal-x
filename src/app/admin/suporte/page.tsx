"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { LifeBuoy, Loader2, Bug, HelpCircle, Lightbulb, MessageSquare, Send, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { useChamados } from "@/hooks/use-chamados"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { Chamado } from "@/lib/types"
import { format } from "date-fns"
import municipiosPR from "@/lib/municipios-pr.json"

const TIPO_CONFIG: Record<Chamado['tipo'], { label: string; icon: any; color: string }> = {
  erro: { label: "Erro / Falha", icon: Bug, color: "text-rose-600 bg-rose-50" },
  duvida: { label: "Dúvida", icon: HelpCircle, color: "text-blue-600 bg-blue-50" },
  sugestao: { label: "Sugestão", icon: Lightbulb, color: "text-amber-600 bg-amber-50" },
  outro: { label: "Outro", icon: MessageSquare, color: "text-[#6B6659] bg-[#F1EEE4]" },
};

const STATUS_CONFIG: Record<Chamado['status'], { label: string; color: string }> = {
  aberto: { label: "Aberto", color: "bg-amber-50 text-amber-600 border-amber-100" },
  em_andamento: { label: "Em Andamento", color: "bg-blue-50 text-blue-600 border-blue-100" },
  resolvido: { label: "Resolvido", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
};

export default function GestaoSuportePage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const isRoot = profile?.role === 'root';

  const [selectedMunicipio, setSelectedMunicipio] = useState("");
  const { chamados, loading, needsMunicipioSelection, responderChamado, atualizarStatus } = useChamados(
    isRoot ? { municipioIdOverride: selectedMunicipio || undefined } : undefined
  );

  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!profile) router.replace("/login");
      else if (profile.role !== 'admin' && profile.role !== 'root') router.replace("/dashboard");
    }
  }, [profile, authLoading, router]);

  const handleResponder = async (id: string) => {
    const resposta = respostas[id]?.trim();
    if (!resposta) return;
    setEnviandoId(id);
    try {
      await responderChamado(id, resposta, 'resolvido');
      toast({ title: "Resposta enviada" });
      setRespostas(prev => ({ ...prev, [id]: '' }));
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao responder" });
    } finally {
      setEnviandoId(null);
    }
  };

  if (authLoading || !profile) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-8 font-sans space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#0E4A44] rounded-xl text-white shadow-sm"><LifeBuoy className="h-5 w-5" /></div>
            <h1 className="font-serif text-xl sm:text-2xl text-[#262420]">Gestão de Suporte</h1>
          </div>
        </div>

        {isRoot && (
          <div className="flex items-center gap-2 bg-white border border-[#E4DFD1] rounded-xl px-3 h-11">
            <Building2 className="h-4 w-4 text-[#A39D8C]" />
            <select value={selectedMunicipio} onChange={(e) => setSelectedMunicipio(e.target.value)} className="text-xs font-bold uppercase outline-none bg-transparent">
              <option value="">Selecionar Município</option>
              {municipiosPR.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
      </div>

      {isRoot && needsMunicipioSelection ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 bg-white border-2 border-dashed border-[#E4DFD1] rounded-lg text-center">
          <Building2 className="h-10 w-10 text-[#D8D2C0]" />
          <p className="text-sm font-black uppercase text-[#A39D8C]">Selecione um município para ver os chamados</p>
        </div>
      ) : loading ? (
        <div className="py-16 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : chamados.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center opacity-70 bg-white rounded-lg border border-dashed border-[#E4DFD1]">
          <LifeBuoy className="h-8 w-8 text-[#D8D2C0] mb-3" />
          <p className="text-[9px] font-black uppercase text-[#A39D8C] tracking-[0.2em]">Nenhum chamado registrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chamados.map((c) => {
            const tipoCfg = TIPO_CONFIG[c.tipo];
            return (
              <div key={c.id} className="bg-white p-5 rounded-lg border border-[#E4DFD1] shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", tipoCfg.color)}>
                      <tipoCfg.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-serif text-sm text-[#262420]">{c.assunto}</h3>
                      <p className="text-[9px] font-bold uppercase text-[#A39D8C] tracking-widest mt-0.5">
                        {c.createdByName || c.createdByEmail} · {format(new Date(c.createdAt), "dd/MM/yyyy HH:mm")}{c.pagina ? ` · ${c.pagina}` : ''}
                      </p>
                    </div>
                  </div>
                  <Select value={c.status} onValueChange={(v) => atualizarStatus(c.id, v as Chamado['status'])}>
                    <SelectTrigger className={cn("h-8 w-auto gap-2 rounded-full text-[9px] font-black uppercase px-3 border", STATUS_CONFIG[c.status].color)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_CONFIG) as Chamado['status'][]).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-[#6B6659] leading-relaxed pl-12">{c.descricao}</p>

                {c.resposta && (
                  <div className="ml-12 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5">
                    <p className="text-[8px] font-black uppercase text-emerald-600 tracking-widest mb-1">Resposta{c.respondidoPor ? ` de ${c.respondidoPor}` : ''}</p>
                    <p className="text-xs text-emerald-800">{c.resposta}</p>
                  </div>
                )}

                {c.status !== 'resolvido' && (
                  <div className="ml-12 flex items-center gap-2">
                    <Textarea
                      value={respostas[c.id] || ''}
                      onChange={(e) => setRespostas(prev => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Escrever resposta..."
                      className="min-h-[44px] rounded-xl bg-[#FAF8F3] border-none text-xs resize-none"
                    />
                    <Button size="icon" onClick={() => handleResponder(c.id)} disabled={enviandoId === c.id || !respostas[c.id]?.trim()} className="h-11 w-11 rounded-xl bg-primary text-white shrink-0">
                      {enviandoId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

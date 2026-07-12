
"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useAuth } from "@/hooks/use-auth"
import { useAutoridades } from "@/hooks/use-autoridades"
import { 
  Trash2, 
  CheckCircle2, 
  CalendarDays,
  Loader2,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Timer,
  Archive,
  Plus,
  Clock,
  ListTodo,
  Activity,
  LayoutGrid,
  Calendar as CalendarIcon,
  Filter,
  Check,
  BellRing
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { format, isSameDay, addHours } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { SlotInfo } from "react-big-calendar"
import type { EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop"
import { AgendaCalendar, type AgendaEvent } from "@/components/agenda-calendar"
import { ativarAlertasNesteDispositivo } from "@/lib/firebase-messaging"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Inspecao } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"

type CategoryFilter = 'all' | 'pendente' | 'prazo' | 'concluido' | 'arquivado';

export default function AgendaPage() {
  const { profile } = useAuth()
  const { inspecoes, saveInspecao, deleteInspecao, loading } = useInspecoes()
  const { autoridades } = useAutoridades()
  
  const [mounted, setMounted] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [viewMonth, setViewMonth] = useState<Date>(new Date())
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingInspecao, setEditingInspecao] = useState<Inspecao | null>(null)
  const { toast } = useToast()

  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [hora, setHora] = useState("08:00")
  const [dataAgendamento, setDataAgendamento] = useState("")
  const [selectedFiscalId, setSelectedFiscalId] = useState("")
  const [status, setStatus] = useState<Inspecao['status']>("pendente")
  const [alertaMinutosAntes, setAlertaMinutosAntes] = useState(0)
  const [isAtivandoAlertas, setIsAtivandoAlertas] = useState(false)
  const [alertasAtivos, setAlertasAtivos] = useState(true)

  useEffect(() => {
    setMounted(true)
    setDataAgendamento(format(new Date(), "yyyy-MM-dd"))
    setSelectedFiscalId(profile?.uid || "")
    setAlertasAtivos(window.localStorage.getItem('vigilant_alertas_ativados') === '1')
  }, [profile])

  const handleAtivarAlertas = useCallback(async () => {
    if (!profile?.uid) return
    setIsAtivandoAlertas(true)
    try {
      const resultado = await ativarAlertasNesteDispositivo(profile.uid)
      if (resultado.ok) {
        window.localStorage.setItem('vigilant_alertas_ativados', '1')
        setAlertasAtivos(true)
        toast({ title: "Alertas Ativados", description: "Você vai receber notificação mesmo com o app fechado." })
      } else {
        toast({ variant: "destructive", title: "Não foi possível ativar", description: resultado.error })
      }
    } finally {
      setIsAtivandoAlertas(false)
    }
  }, [profile, toast])

  useEffect(() => {
    if (isDialogOpen && mounted) {
      if (editingInspecao) {
        setTitulo(editingInspecao.titulo)
        setDescricao(editingInspecao.descricao || "")
        setHora(format(editingInspecao.data, "HH:mm"))
        setDataAgendamento(format(editingInspecao.data, "yyyy-MM-dd"))
        setSelectedFiscalId(editingInspecao.fiscalId)
        setStatus(editingInspecao.status)
        setAlertaMinutosAntes(editingInspecao.alertaMinutosAntes ?? 0)
      } else {
        setTitulo("")
        setDescricao("")
        // Se a data selecionada veio de um clique com horário real (visão Semana/Dia
        // do calendário), usa esse horário; senão (clique num dia da visão Mês), 08:00.
        const temHorarioReal = selectedDate.getHours() !== 0 || selectedDate.getMinutes() !== 0;
        setHora(temHorarioReal ? format(selectedDate, "HH:mm") : "08:00")
        setDataAgendamento(format(selectedDate, "yyyy-MM-dd"))
        setSelectedFiscalId(profile?.uid || "")
        setStatus("pendente")
        setAlertaMinutosAntes(0)
      }
    }
  }, [isDialogOpen, editingInspecao, selectedDate, profile, mounted])

  const filteredInspecoes = useMemo(() => {
    return inspecoes.filter(i => {
      const matchCategory = activeCategory === 'all' || i.status === activeCategory;
      return matchCategory;
    });
  }, [inspecoes, activeCategory]);

  const calendarEvents: AgendaEvent[] = useMemo(() => filteredInspecoes.map(i => ({
    id: i.id,
    title: i.titulo,
    start: i.data,
    end: addHours(i.data, 1),
    resource: i,
  })), [filteredInspecoes]);

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setSelectedDate(slotInfo.start);
    setEditingInspecao(null);
    setIsDialogOpen(true);
  }, []);

  const handleSelectEvent = useCallback((event: AgendaEvent) => {
    setSelectedDate(event.start);
    setEditingInspecao(event.resource);
    setIsDialogOpen(true);
  }, []);

  const handleEventDrop = useCallback(async ({ event, start }: EventInteractionArgs<AgendaEvent>) => {
    try {
      await saveInspecao({ ...event.resource, data: new Date(start), alertaEnviadoEm: '' }, event.resource.id);
      toast({ title: "Reagendado" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao reagendar" });
    }
  }, [saveInspecao, toast]);

  const dailyInspecoes = useMemo(() => {
    return filteredInspecoes
      .filter(insp => isSameDay(insp.data, selectedDate))
      .sort((a, b) => a.data.getTime() - b.data.getTime());
  }, [filteredInspecoes, selectedDate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const [h, m] = hora.split(":").map(Number)
      const [year, month, day] = dataAgendamento.split("-").map(Number)
      const dataCompleta = new Date(year, month - 1, day, h, m, 0, 0)
      const fiscal = autoridades.find(a => a.id === selectedFiscalId) || { nome: profile?.displayName || "Fiscal", id: profile?.uid || "" };
      
      await saveInspecao({
        titulo,
        descricao,
        data: dataCompleta,
        fiscalId: (fiscal as any).id,
        fiscalNome: (fiscal as any).nome,
        status: status,
        alertaMinutosAntes,
        // Qualquer edição rearma o alarme (relevante ao reagendar um compromisso
        // cujo alerta já tinha sido enviado).
        alertaEnviadoEm: '',
      }, editingInspecao?.id)
      
      toast({ title: editingInspecao ? "Registro Atualizado" : "Agendamento Salvo" })
      setIsDialogOpen(false)
      setEditingInspecao(null)
    } catch (error) {
      toast({ variant: "destructive", title: "Erro ao salvar" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = useCallback(async () => {
    if (!editingInspecao?.id) return;
    if (!window.confirm("CONFIRMAR EXCLUSÃO PERMANENTE?")) return;
    setIsSaving(true);
    try {
      await deleteInspecao(editingInspecao.id);
      setIsDialogOpen(false);
      setEditingInspecao(null);
      toast({ title: "Agendamento Excluído" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao Excluir" });
    } finally {
      setIsSaving(false);
    }
  }, [editingInspecao, deleteInspecao, toast]);

  const getStatusConfig = (status: Inspecao['status']) => {
    switch (status) {
      case 'pendente': return { label: 'Pendente', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-500' };
      case 'prazo': return { label: 'Em Prazo', color: 'bg-amber-50 text-amber-600 border-amber-100', dot: 'bg-amber-500' };
      case 'concluido': return { label: 'Concluido', color: 'bg-cyan-50 text-cyan-600 border-cyan-100', dot: 'bg-cyan-500' };
      case 'arquivado': return { label: 'Arquivado', color: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' };
      default: return { label: 'Pendente', color: 'bg-slate-50 text-slate-600', dot: 'bg-slate-400' };
    }
  }

  if (!mounted || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const menuCategories = [
    { id: 'all', label: 'Todos', icon: LayoutGrid, color: 'text-slate-600' },
    { id: 'pendente', label: 'Pendentes', icon: AlertCircle, color: 'text-emerald-600' },
    { id: 'prazo', label: 'Em Prazo', icon: Timer, color: 'text-amber-600' },
    { id: 'concluido', label: 'Concluídos', icon: CheckCircle2, color: 'text-cyan-600' },
    { id: 'arquivado', label: 'Arquivados', icon: Archive, color: 'text-slate-400' },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-200 z-30 shrink-0">
        <div className="flex flex-col lg:flex-row items-center justify-between p-4 lg:px-10 gap-6">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-primary rounded-xl text-white shadow-lg">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <h1 className="text-xl lg:text-2xl font-black italic tracking-tighter text-slate-900 uppercase">Gestão de Agenda</h1>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto">
            {!alertasAtivos && (
              <Button
                type="button"
                onClick={handleAtivarAlertas}
                disabled={isAtivandoAlertas}
                variant="outline"
                className="h-11 px-5 text-[10px] font-black uppercase tracking-widest rounded-xl border-primary/30 text-primary gap-2"
              >
                {isAtivandoAlertas ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Ativar Alertas
              </Button>
            )}

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) setEditingInspecao(null); }}>
            <DialogTrigger asChild>
              <Button className="w-full lg:w-auto h-11 px-6 text-[10px] font-black uppercase tracking-widest bg-primary text-white rounded-xl shadow-lg hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" /> Novo Registro
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-0 overflow-hidden bg-white">
              <DialogHeader className="p-6 bg-zinc-900 text-white">
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
                  {editingInspecao ? "Configurar Agendamento" : "Novo Agendamento"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Estabelecimento</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value.toUpperCase())} className="rounded-xl h-12 text-xs font-bold bg-slate-50 border-none uppercase" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Data</Label>
                    <Input type="date" value={dataAgendamento} onChange={(e) => setDataAgendamento(e.target.value)} className="rounded-xl h-12 text-xs font-bold bg-slate-50 border-none" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Hora</Label>
                    <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="rounded-xl h-12 text-xs font-bold bg-slate-50 border-none" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Estágio Operacional</Label>
                  <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                    <SelectTrigger className="h-12 rounded-xl text-xs font-bold bg-slate-50 border-none uppercase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="prazo">Prazo Adequação</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="arquivado">Arquivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Alertar</Label>
                  <Select value={String(alertaMinutosAntes)} onValueChange={(v) => setAlertaMinutosAntes(Number(v))}>
                    <SelectTrigger className="h-12 rounded-xl text-xs font-bold bg-slate-50 border-none uppercase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Na hora marcada</SelectItem>
                      <SelectItem value="10">10 minutos antes</SelectItem>
                      <SelectItem value="15">15 minutos antes</SelectItem>
                      <SelectItem value="30">30 minutos antes</SelectItem>
                      <SelectItem value="60">1 hora antes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className="rounded-xl min-h-[100px] text-xs font-medium bg-slate-50 border-none resize-none" placeholder="Observações de campo..." />
                <div className="flex gap-3 pt-4">
                   {editingInspecao && <Button type="button" variant="ghost" onClick={handleDelete} className="h-12 w-12 rounded-xl text-rose-500 bg-rose-50"><Trash2 className="h-5 w-5" /></Button>}
                   <Button type="submit" disabled={isSaving} className="flex-1 h-12 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg">{isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : "Confirmar"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="bg-slate-50/50 px-4 lg:px-10 py-1.5 border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {menuCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as CategoryFilter)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all whitespace-nowrap border-2",
                activeCategory === cat.id 
                  ? "bg-white border-primary shadow-sm" 
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <cat.icon className={cn("h-3.5 w-3.5", activeCategory === cat.id ? cat.color : "text-current")} />
              <span className={cn("text-[9px] font-black uppercase tracking-widest", activeCategory === cat.id && "text-slate-900")}>
                {cat.label}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        <main className="lg:col-span-8 bg-white flex flex-col border-r border-slate-100 overflow-hidden">
          <div className="flex-1 min-h-0 p-4 lg:p-6">
            <AgendaCalendar
              events={calendarEvents}
              date={viewMonth}
              onNavigateDate={setViewMonth}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              onEventDrop={handleEventDrop}
            />
          </div>
        </main>

        <aside className="lg:col-span-4 bg-slate-50 flex flex-col overflow-hidden">
          <header className="p-6 border-b border-slate-200 bg-white shrink-0">
             <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">Agenda do Dia</p>
                <Badge className="bg-primary/10 text-primary border-none text-[9px] font-black px-3">
                   {format(selectedDate, "dd/MM/yyyy")}
                </Badge>
             </div>
             <h3 className="text-lg font-black uppercase italic tracking-tighter text-slate-900">
               {format(selectedDate, "EEEE", { locale: ptBR })}
             </h3>
          </header>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3">
             {dailyInspecoes.length > 0 ? (
                dailyInspecoes.map((insp) => {
                  const cfg = getStatusConfig(insp.status);
                  return (
                    <button 
                      key={insp.id}
                      onClick={() => { setEditingInspecao(insp); setIsDialogOpen(true); }}
                      className="w-full bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-primary/20 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                           <Clock className="h-3 w-3 text-slate-300" />
                           <span className="text-[11px] font-black text-slate-900 italic">{format(insp.data, "HH:mm")}</span>
                        </div>
                        <Badge className={cn("text-[7px] font-black uppercase px-2 h-4 border-none", cfg.color)}>
                          {cfg.label}
                        </Badge>
                      </div>
                      <h4 className="text-[11px] font-black uppercase tracking-tight text-slate-900 leading-tight group-hover:text-primary transition-colors">
                        {insp.titulo}
                      </h4>
                      <div className="pt-2.5 mt-2 border-t border-slate-50 flex items-center justify-between">
                         <div className="flex items-center gap-1.5">
                            <Activity className="h-2.5 w-2.5 text-slate-300" />
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">
                               {insp.fiscalNome}
                            </span>
                         </div>
                         <ChevronRight className="h-3 w-3 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  )
                })
             ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center opacity-40">
                   <ListTodo className="h-8 w-8 text-slate-300 mb-3" />
                   <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Sem vistorias no dia</p>
                </div>
             )}
          </div>

          <div className="p-5 bg-white border-t border-slate-100 shrink-0">
             <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-primary/20 rounded-lg"><Activity className="h-4 w-4 text-primary" /></div>
                   <div>
                      <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Registros Totais</p>
                      <p className="text-[10px] font-bold uppercase">{filteredInspecoes.length} Na Visão Atual</p>
                   </div>
                </div>
                <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center">
                   <span className="text-xs font-black italic">{inspecoes.length}</span>
                </div>
             </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

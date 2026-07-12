
"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  Search,
  Loader2,
  ArrowUpRight,
  Archive,
  Folder,
  CheckSquare,
  Square,
  MoveHorizontal,
  X,
  Timer,
  MoreVertical,
  CalendarDays,
  User,
  ChevronRight,
  RotateCcw,
  Users,
  BarChart3,
  AlertTriangle,
  History,
  Calendar as CalendarIcon,
  MessageSquare,
  Scale,
  Zap,
  FolderPlus,
  Cloud,
  Save
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useFolders } from "@/hooks/use-folders"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { useAppConfig } from "@/hooks/use-app-config"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format, addDays, isWeekend, startOfDay, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ChevronsUpDown, Building2 } from "lucide-react"
import municipiosPR from "@/lib/municipios-pr.json"
import { normalizeId } from "@/lib/utils"
import { gerarPdfBlobDeIntimacao } from "@/lib/generate-intimacao-pdf"
import { auth } from "@/lib/firebase"
import Papa from "papaparse"

interface RelatorioMunicipal {
  ano: number;
  municipioId: string;
  totalNoAno: number;
  porStatus: Record<string, number>;
  porTipo: Record<string, number>;
  porFiscal: { nome: string; total: number }[];
  numeracao: {
    duplicados: string[];
    gapsInternos: number[];
    valorContador: number;
    maiorSequencialUsado: number;
    acimaDoContador: boolean;
  };
}

/**
 * Função para calcular a data final pulando finais de semana (Dias Úteis)
 */
function addBusinessDays(startDate: Date, days: number): Date {
  let date = new Date(startDate);
  let addedDays = 0;
  while (addedDays < days) {
    date = addDays(date, 1);
    if (!isWeekend(date)) {
      addedDays++;
    }
  }
  return date;
}

export default function DocumentosPage() {
  const { profile } = useAuth();
  const { config } = useAppConfig();
  const isRoot = profile?.role === 'root';

  const [selectedMunicipioForRoot, setSelectedMunicipioForRoot] = useState("");
  const [municipioPickerOpen, setMunicipioPickerOpen] = useState(false);
  const [municipioSearchTerm, setMunicipioSearchTerm] = useState("");

  const { intimacoes, bulkMoveToFolder, bulkDelete, permanentDelete, saveIntimacao, loading: loadingInt, isOnline, needsMunicipioSelection } = useIntimacoes(
    isRoot ? { municipioIdOverride: selectedMunicipioForRoot || undefined } : undefined
  );
  const { folders, createFolder, loading: loadingFold } = useFolders();

  const filteredMunicipiosPicker = useMemo(() => {
    const term = normalizeId(municipioSearchTerm);
    if (!term) return municipiosPR;
    return municipiosPR.filter(m => normalizeId(m).includes(term));
  }, [municipioSearchTerm]);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | "all" | "trash">("all");
  const [filterByFiscal, setFilterByFiscal] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isTriggeringAutomation, setIsTriggeringAutomation] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0 });
  const [dismissedZipBanner, setDismissedZipBanner] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState<RelatorioMunicipal | null>(null);

  // ESTADOS PARA AJUSTE DE PRAZO
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [adjustingDocId, setAdjustingDocId] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState("15");
  const [adjustmentReason, setAdjustmentJustification] = useState("");
  
  const { toast } = useToast();

  const isGestor = profile?.role === 'admin' || profile?.role === 'root';

  const equipeFiscais = useMemo(() => {
    const fiscais = new Map();
    intimacoes.forEach(i => {
      if (i.createdBy && i.createdByName && !i.deleted) {
        fiscais.set(i.createdBy, i.createdByName);
      }
    });
    return Array.from(fiscais.entries()).map(([id, nome]) => ({ id, nome }));
  }, [intimacoes]);

  const calculateDeadline = (doc: any) => {
    if (doc.status !== 'finalizado') return null;
    const baseDate = doc.dataIntimacao ? new Date(doc.dataIntimacao) : new Date();
    const daysAllowed = doc.prazoDias || 15;
    
    const deadlineDate = addBusinessDays(baseDate, daysAllowed);
    const today = startOfDay(new Date());
    const remaining = differenceInDays(deadlineDate, today);
    
    return {
      remaining,
      date: format(deadlineDate, "dd/MM/yyyy"),
      status: remaining < 0 ? 'vencido' : remaining <= 3 ? 'alerta' : 'normal'
    };
  };

  const stats = useMemo(() => {
    const total = intimacoes.filter(i => !i.deleted).length;
    const finalizados = intimacoes.filter(i => !i.deleted && i.status === 'finalizado');
    const alertas = finalizados.filter(i => {
      const d = calculateDeadline(i);
      return d?.status === 'alerta';
    }).length;
    const vencidos = finalizados.filter(i => {
      const d = calculateDeadline(i);
      return d?.status === 'vencido';
    }).length;

    return { total, alertas, vencidos };
  }, [intimacoes]);

  const filteredIntimacoes = useMemo(() => {
    return intimacoes.filter(i => {
      const isDeleted = i.deleted === true;
      if (activeFolderId === "trash") {
        if (!isDeleted) return false;
      } else {
        if (isDeleted) return false;
      }

      const search = searchQuery.toLowerCase();
      const matchesSearch = (i.autor || "").toLowerCase().includes(search) || 
                          (i.numeroProcesso || "").toLowerCase().includes(search) ||
                          (i.createdByName || "").toLowerCase().includes(search);
      
      if (!matchesSearch) return false;
      if (filterByFiscal && i.createdBy !== filterByFiscal) return false;
      if (activeFolderId !== "all" && activeFolderId !== "trash" && i.folderId !== activeFolderId) return false;

      return true;
    });
  }, [intimacoes, searchQuery, activeFolderId, filterByFiscal]);

  // Documentos salvos deste fiscal (não excluídos), para o aviso de limite de 100.
  const minhasIntimacoes = useMemo(() => {
    return intimacoes.filter(i => i.createdBy === profile?.uid && !i.deleted);
  }, [intimacoes, profile?.uid]);
  const LIMITE_DOCUMENTOS = 100;
  const AVISO_A_PARTIR_DE = 90;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredIntimacoes.length && filteredIntimacoes.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredIntimacoes.map(i => i.id));
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName);
      setNewFolderName("");
      setIsFolderDialogOpen(false);
      toast({ title: "Pasta Criada" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao criar pasta" });
    }
  };

  const handleMoveToFolder = async (folderId: string | null) => {
    try {
      await bulkMoveToFolder(selectedIds, folderId);
      toast({ title: "Itens movidos" });
      setSelectedIds([]);
      setIsMoveDialogOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao mover" });
    }
  };

  const handleTriggerAutomation = async () => {
    if (!config.n8nWebhookUrl) {
      return toast({ variant: "destructive", title: "n8n não configurado", description: "O gestor precisa definir a URL do webhook nas configurações." });
    }

    setIsTriggeringAutomation(true);
    const selectedData = intimacoes.filter(i => selectedIds.includes(i.id));

    try {
      const response = await fetch(config.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_automation_trigger',
          triggeredBy: profile?.email,
          timestamp: new Date().toISOString(),
          documents: selectedData
        })
      });

      if (response.ok) {
        toast({ title: "Integração Iniciada", description: "Os dados foram enviados para o motor de automação n8n." });
        setSelectedIds([]);
      } else {
        throw new Error("Webhook respondeu com erro");
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Erro na Automação", description: "Verifique se a URL do n8n está ativa e acessível." });
    } finally {
      setIsTriggeringAutomation(false);
    }
  };

  const handleOpenAdjustment = (id: string) => {
    const doc = intimacoes.find(i => i.id === id);
    if (!doc) return;
    setAdjustingDocId(id);
    setCustomDays(String(doc.prazoDias || 15));
    setAdjustmentJustification(doc.prazoJustificativa || "");
    setIsAdjustmentDialogOpen(true);
  };

  const handleApplyAdjustment = async () => {
    if (!adjustingDocId) return;
    const doc = intimacoes.find(i => i.id === adjustingDocId);
    if (!doc) return;

    try {
      await saveIntimacao({
        ...doc,
        prazoDias: parseInt(customDays, 10),
        prazoJustificativa: adjustmentReason.toUpperCase()
      }, adjustingDocId);
      
      toast({ title: "Prazo Atualizado", description: "O cálculo de vencimento foi recalculado considerando apenas dias úteis." });
      setIsAdjustmentDialogOpen(false);
      setAdjustingDocId(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao ajustar" });
    }
  };

  const handleBulkDelete = async () => {
    if (activeFolderId === "trash") {
        if (!window.confirm(`Excluir permanentemente estes ${selectedIds.length} itens?`)) return;
        await permanentDelete(selectedIds);
        toast({ title: "Itens removidos permanentemente" });
        setSelectedIds([]);
        return;
    }
    if (!window.confirm(`Mover ${selectedIds.length} itens para a lixeira?`)) return;
    try {
      await bulkDelete(selectedIds, true);
      toast({ title: "Itens movidos para lixeira" });
      setSelectedIds([]);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    }
  };

  const handleBulkRestore = async () => {
    try {
      await bulkDelete(selectedIds, false);
      toast({ title: "Itens restaurados" });
      setSelectedIds([]);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao restaurar" });
    }
  }

  // Gera o PDF de cada intimação selecionada (sequencialmente, para não travar
  // o navegador) e empacota tudo num único .zip.
  const handleBulkDownloadZip = async () => {
    if (selectedIds.length === 0) return;
    const docs = intimacoes.filter(i => selectedIds.includes(i.id));

    setIsZipping(true);
    setZipProgress({ current: 0, total: docs.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        try {
          const blob = await gerarPdfBlobDeIntimacao(doc, config);
          const filename = `${doc.tipoTermo || 'DOCUMENTO'} - ${doc.numeroProcesso || doc.id}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
          zip.file(filename, blob);
        } catch (e) {
          console.error('Erro ao gerar PDF de', doc.id, e);
        }
        setZipProgress({ current: i + 1, total: docs.length });
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documentos-${format(new Date(), 'yyyy-MM-dd')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ZIP Gerado", description: `${docs.length} documento(s) baixado(s) em um único arquivo.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao gerar ZIP" });
    } finally {
      setIsZipping(false);
    }
  };

  const fetchRelatorio = async (ano: number) => {
    setIsLoadingReport(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Não autenticado");
      const res = await fetch(`/api/relatorio-municipal?ano=${ano}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Falha ao carregar relatório");
      const data: RelatorioMunicipal = await res.json();
      setReportData(data);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao carregar relatório" });
      setReportData(null);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleOpenReport = () => {
    setIsReportOpen(true);
    fetchRelatorio(reportYear);
  };

  const handleChangeReportYear = (ano: number) => {
    setReportYear(ano);
    fetchRelatorio(ano);
  };

  const handleExportReportCsv = () => {
    if (!reportData) return;
    const linhas = reportData.porFiscal.map(f => ({ FISCAL: f.nome, TOTAL_AUTUACOES: f.total }));
    const csv = Papa.unparse(linhas);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-municipal-${reportData.ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingInt || loadingFold) {
    return (
      <div className="flex h-[80vh] w-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sincronizando Arquivo Municipal...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8 font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <aside className="lg:col-span-3 space-y-6">
          <div className="space-y-1 px-4">
            <h2 className="text-2xl font-black uppercase tracking-tighter text-zinc-900 italic">Arquivos</h2>
            {isRoot ? (
              <Popover open={municipioPickerOpen} onOpenChange={setMunicipioPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 text-[8px] font-black text-primary uppercase tracking-widest hover:opacity-70 transition-opacity">
                    <Building2 className="h-3 w-3" />
                    {selectedMunicipioForRoot ? selectedMunicipioForRoot.toUpperCase() : "SELECIONAR MUNICÍPIO"}
                    <ChevronsUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0 bg-white border-slate-200 rounded-2xl shadow-2xl">
                  <Command className="bg-transparent" shouldFilter={false}>
                    <CommandInput
                      placeholder="Pesquisar município..."
                      value={municipioSearchTerm}
                      onValueChange={setMunicipioSearchTerm}
                      className="h-11 border-none focus:ring-0"
                    />
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      {filteredMunicipiosPicker.length === 0 && (
                        <CommandEmpty className="p-4 text-center text-[10px] text-slate-400 uppercase font-bold">Não encontrado.</CommandEmpty>
                      )}
                      <CommandGroup>
                        {filteredMunicipiosPicker.map((m) => (
                          <div
                            key={m}
                            onClick={() => { setSelectedMunicipioForRoot(m); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                            className="hover:bg-blue-50 cursor-pointer py-3 px-4 transition-colors font-bold uppercase text-[11px] border-b border-slate-50 last:border-0"
                          >
                            {m}
                          </div>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">{profile?.municipioNome || "SISTEMA"}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <button 
              onClick={() => { setActiveFolderId("all"); setFilterByFiscal(null); setSelectedIds([]); }}
              className={cn(
                "flex items-center justify-between px-5 py-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest group",
                (activeFolderId === "all" && !filterByFiscal) ? "bg-primary text-white shadow-xl shadow-primary/20" : "text-zinc-500 hover:bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <Archive className={cn("h-4 w-4", (activeFolderId === "all" && !filterByFiscal) ? "text-white" : "text-zinc-400")} /> 
                Visão Geral
              </div>
              <Badge className={cn("text-[9px] border-none", (activeFolderId === "all" && !filterByFiscal) ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-500")}>
                {intimacoes.filter(i => !i.deleted).length}
              </Badge>
            </button>

            {isGestor && equipeFiscais.length > 0 && (
              <div className="mt-4 space-y-1">
                <div className="flex items-center gap-2 px-5 mb-2">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Equipe de Fiscalização</span>
                </div>
                {equipeFiscais.map(fiscal => (
                  <button 
                    key={fiscal.id}
                    onClick={() => { setFilterByFiscal(fiscal.id); setActiveFolderId("all"); setSelectedIds([]); }}
                    className={cn(
                      "flex items-center justify-between px-5 py-3 rounded-xl transition-all font-bold text-[9px] uppercase tracking-widest w-full text-left",
                      filterByFiscal === fiscal.id ? "bg-slate-900 text-white shadow-lg" : "text-zinc-500 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <User className={cn("h-3.5 w-3.5 shrink-0", filterByFiscal === fiscal.id ? "text-primary" : "text-zinc-300")} />
                      <span className="truncate">{fiscal.nome}</span>
                    </div>
                    <Badge className={cn("text-[8px] h-4 border-none", filterByFiscal === fiscal.id ? "bg-white/10 text-white" : "bg-zinc-50 text-zinc-400")}>
                      {intimacoes.filter(i => !i.deleted && i.createdBy === fiscal.id).length}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            <div className="h-px bg-zinc-100 my-4 mx-4" />

            <div className="flex items-center justify-between px-5 mb-2">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Pastas de Trabalho</span>
              <button onClick={() => setIsFolderDialogOpen(true)} className="text-primary hover:scale-110 transition-transform"><FolderPlus className="h-4 w-4" /></button>
            </div>

            {folders.map(folder => (
              <button 
                key={folder.id}
                onClick={() => { setActiveFolderId(folder.id); setFilterByFiscal(null); setSelectedIds([]); }}
                className={cn(
                  "flex items-center justify-between px-5 py-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest",
                  activeFolderId === folder.id ? "bg-amber-500 text-white shadow-xl shadow-amber-500/20" : "text-zinc-500 hover:bg-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <Folder className={cn("h-4 w-4", activeFolderId === folder.id ? "text-white" : "text-amber-500")} /> {folder.name}
                </div>
              </button>
            ))}

            <button 
              onClick={() => { setActiveFolderId("trash"); setFilterByFiscal(null); setSelectedIds([]); }}
              className={cn(
                "flex items-center justify-between px-5 py-4 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest mt-4",
                activeFolderId === "trash" ? "bg-rose-600 text-white shadow-xl shadow-rose-600/20" : "text-zinc-500 hover:bg-rose-50 hover:text-rose-600"
              )}
            >
              <div className="flex items-center gap-3">
                <Trash2 className={cn("h-4 w-4", activeFolderId === "trash" ? "text-white" : "text-rose-400")} /> 
                Lixeira
              </div>
            </button>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-6">
          {isRoot && needsMunicipioSelection ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] text-center">
              <Building2 className="h-12 w-12 text-slate-300" />
              <p className="text-sm font-black uppercase tracking-widest text-slate-400">Selecione um município para visualizar os documentos</p>
              <p className="text-[10px] font-bold text-slate-300 uppercase max-w-sm">Use o seletor no topo do menu lateral para escolher qual cidade cliente você quer inspecionar.</p>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 p-6 rounded-[2.5rem] shadow-sm flex items-center gap-5">
              <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary"><BarChart3 className="h-6 w-6" /></div>
              <div><p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest">Total Visão</p><h4 className="text-xl font-black italic">{filteredIntimacoes.length} <span className="text-[10px] font-bold text-zinc-400 uppercase">DOCS</span></h4></div>
            </div>
            <div className="bg-white border border-slate-200 p-6 rounded-[2.5rem] shadow-sm flex items-center gap-5">
              <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", stats.alertas > 0 ? "bg-amber-100 text-amber-600 animate-pulse" : "bg-slate-50 text-slate-300")}><Timer className="h-6 w-6" /></div>
              <div><p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest">Prazos em Alerta</p><h4 className="text-xl font-black italic">{stats.alertas} <span className="text-[10px] font-bold text-zinc-400">72H ÚTEIS</span></h4></div>
            </div>
            <div className="bg-white border border-slate-200 p-6 rounded-[2.5rem] shadow-sm flex items-center gap-5">
              <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", stats.vencidos > 0 ? "bg-rose-100 text-rose-600" : "bg-slate-50 text-slate-300")}><AlertTriangle className="h-6 w-6" /></div>
              <div><p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest">Vencidos</p><h4 className="text-xl font-black italic text-rose-600">{stats.vencidos} <span className="text-[10px] font-bold text-zinc-400 uppercase">EXPIRADAS</span></h4></div>
            </div>
          </div>

          {minhasIntimacoes.length >= AVISO_A_PARTIR_DE && !dismissedZipBanner && (
            <div className="bg-amber-50 border border-amber-200 p-5 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 shrink-0 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600"><Archive className="h-5 w-5" /></div>
                <p className="text-xs font-bold text-amber-800">
                  Você está com <strong>{minhasIntimacoes.length} de {LIMITE_DOCUMENTOS}</strong> documentos salvos. Baixe tudo em um único ZIP para liberar espaço.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => setSelectedIds(minhasIntimacoes.map(i => i.id))}
                  className="h-10 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-black uppercase tracking-widest gap-2"
                >
                  <CheckSquare className="h-3.5 w-3.5" /> Selecionar Meus Documentos
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissedZipBanner(true)} className="h-10 rounded-xl text-amber-700 text-[9px] font-black uppercase tracking-widest">
                  Dispensar
                </Button>
              </div>
            </div>
          )}

          <div className="bg-white p-4 rounded-[2rem] border border-zinc-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input 
                placeholder="Pesquisar registros..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-12 rounded-2xl bg-zinc-50 border-none shadow-inner text-sm font-bold"
              />
            </div>
            <div className="flex gap-2">
                <Button onClick={handleOpenReport} variant="ghost" className="h-12 rounded-2xl gap-2 font-black text-[9px] uppercase tracking-widest text-primary">
                    <BarChart3 className="h-4 w-4" /> Relatório Municipal
                </Button>
                <Button onClick={toggleSelectAll} variant="ghost" className="h-12 rounded-2xl gap-2 font-black text-[9px] uppercase tracking-widest text-zinc-500">
                    {selectedIds.length > 0 && selectedIds.length === filteredIntimacoes.length ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    {selectedIds.length > 0 ? `${selectedIds.length} Selecionados` : "Selecionar Tudo"}
                </Button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="bg-slate-900 text-white p-4 rounded-[1.5rem] flex items-center justify-between animate-in slide-in-from-top-2 shadow-2xl">
              <div className="flex items-center gap-4 ml-2">
                <button onClick={() => setSelectedIds([])} className="text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
                <span className="text-[10px] font-black uppercase tracking-widest">{selectedIds.length} Itens Selecionados</span>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleTriggerAutomation} disabled={isTriggeringAutomation} size="sm" variant="ghost" className="text-[9px] font-black uppercase tracking-widest gap-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                  {isTriggeringAutomation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {isTriggeringAutomation ? "Automação n8n..." : "n8n Automatizar"}
                </Button>
                {activeFolderId === 'trash' ? (
                    <Button size="sm" variant="ghost" onClick={handleBulkRestore} className="text-[9px] font-black uppercase tracking-widest gap-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                        <RotateCcw className="h-4 w-4" /> Restaurar
                    </Button>
                ) : (
                    <>
                        <Button size="sm" variant="ghost" onClick={() => setIsMoveDialogOpen(true)} className="text-[9px] font-black uppercase tracking-widest gap-2 hover:bg-white/10">
                            <MoveHorizontal className="h-4 w-4" /> Mover Pasta
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleBulkDownloadZip} disabled={isZipping} className="text-[9px] font-black uppercase tracking-widest gap-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10">
                            {isZipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                            {isZipping ? `Gerando ${zipProgress.current}/${zipProgress.total}...` : "Baixar ZIP"}
                        </Button>
                    </>
                )}
                <Button size="sm" variant="ghost" onClick={handleBulkDelete} className="text-[9px] font-black uppercase tracking-widest gap-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
                  <Trash2 className="h-4 w-4" /> {activeFolderId === 'trash' ? 'Excluir Definitivo' : 'Lixeira'}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5 pb-20">
            {filteredIntimacoes.length > 0 ? (
              filteredIntimacoes.map(item => {
                const deadline = calculateDeadline(item);
                const isFinal = item.status === 'finalizado';
                const itemId = String(item.id);
                
                return (
                  <div key={itemId} className={cn(
                    "flex flex-col sm:flex-row items-center gap-4 p-5 rounded-2xl transition-all border group",
                    selectedIds.includes(itemId) 
                      ? "bg-primary/[0.03] border-primary/20 shadow-md" 
                      : "bg-white border-zinc-100 hover:border-zinc-300 hover:shadow-lg"
                  )}>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <Checkbox 
                        checked={selectedIds.includes(itemId)} 
                        onCheckedChange={() => toggleSelect(itemId)}
                        className="rounded-lg h-5 w-5 border-zinc-300 data-[state=checked]:bg-primary"
                        />
                        <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                        isFinal ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-zinc-50 text-zinc-400 border border-zinc-100"
                        )}>
                        {isFinal ? <CheckCircle2 className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center w-full">
                        <div className="lg:col-span-4 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-black text-sm uppercase tracking-tight text-slate-900">{item.numeroProcesso || "---"}</span>
                                <Badge variant="outline" className={cn("text-[7px] font-black uppercase h-4 px-1.5 border-none", isFinal ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                                    {isFinal ? 'FINAL' : 'RASCUNHO'}
                                </Badge>
                            </div>
                            <p className="text-[10px] font-black text-zinc-600 uppercase truncate">
                                {item.autor || "ESTABELECIMENTO NÃO INFORMADO"}
                            </p>
                        </div>

                        <div className="lg:col-span-3 flex flex-col justify-center">
                            <div className="flex items-center gap-2">
                                <User className="h-3 w-3 text-primary" />
                                <span className="text-[9px] font-black uppercase text-slate-900 truncate max-w-[120px]">{item.createdByName || "---"}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <CalendarDays className="h-3 w-3 text-zinc-400" />
                                <span className="text-[9px] font-bold text-zinc-400">{item.dataIntimacao ? format(new Date(item.dataIntimacao), "dd MMM yyyy", { locale: ptBR }) : "---"}</span>
                            </div>
                        </div>

                        <div className="lg:col-span-3 flex flex-col justify-center">
                            {isFinal && deadline ? (
                                <div className={cn(
                                    "flex flex-col px-4 py-2 rounded-xl border border-dashed",
                                    deadline.status === 'vencido' ? "bg-rose-50 border-rose-200 text-rose-700" :
                                    deadline.status === 'alerta' ? "bg-amber-50 border-amber-200 text-amber-700 animate-pulse" :
                                    "bg-blue-50 border-blue-200 text-blue-700"
                                )}>
                                    <div className="flex items-center gap-2">
                                        <Timer className="h-3 w-3" />
                                        <span className="text-[8px] font-black uppercase tracking-widest">
                                            {deadline.status === 'vencido' ? 'VENCIDO' : 'PRAZO ÚTIL'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] font-black mt-0.5 uppercase italic">
                                        {deadline.remaining < 0 
                                            ? `EXPIRADO HÁ ${Math.abs(deadline.remaining)} DIAS` 
                                            : `RESTA(M) ${deadline.remaining} DIAS`
                                        }
                                    </p>
                                </div>
                            ) : (
                                <div className="text-[8px] font-black text-zinc-300 uppercase italic">Aguardando Finalização</div>
                            )}
                        </div>

                        <div className="lg:col-span-2 flex justify-end items-center gap-1">
                            <Button asChild variant="ghost" size="sm" className="h-10 w-10 rounded-xl text-primary hover:bg-primary/10 transition-all">
                                <Link href={`/intimacoes/${itemId}`}><ArrowUpRight className="h-5 w-5" /></Link>
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-10 w-10 rounded-xl text-zinc-400"><MoreVertical className="h-5 w-5" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-[1.5rem] w-64 p-2 shadow-2xl">
                                    <DropdownMenuItem onClick={() => handleOpenAdjustment(itemId)} className="rounded-xl text-[10px] font-black uppercase h-11 px-4 cursor-pointer gap-2"><Scale className="h-3.5 w-3.5" /> Ajustar Prazo</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { bulkDelete([itemId], true); toast({ title: "Movido para lixeira" }); }} className="rounded-xl text-rose-600 text-[10px] font-black uppercase h-11 px-4 cursor-pointer"><Trash2 className="mr-2 h-4 w-4" /> Mover Lixeira</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-40 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[3rem]">
                <Archive className="h-16 w-16 text-zinc-200 mb-4" />
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.3em]">Nenhum registro encontrado</p>
              </div>
            )}
          </div>
          </>
          )}
        </main>
      </div>

      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md">
            <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Nova Pasta</DialogTitle>
                <DialogDescription className="text-[10px] font-bold uppercase tracking-widest">Organize seus documentos municipais</DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
                <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-zinc-400 ml-1">Nome da Pasta</Label>
                    <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="EX: VISTORIAS 2024" className="h-12 rounded-xl bg-slate-50 border-none font-bold uppercase text-xs" />
                </div>
            </div>
            <DialogFooter>
                <Button onClick={handleCreateFolder} className="w-full h-12 rounded-xl font-black uppercase text-[10px]">Criar Pasta</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md">
            <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Mover Selecionados</DialogTitle>
                <DialogDescription className="text-[10px] font-bold uppercase tracking-widest">Selecione o destino para {selectedIds.length} itens</DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-2">
                <button onClick={() => handleMoveToFolder(null)} className="w-full text-left p-4 rounded-xl hover:bg-slate-50 font-black text-[10px] uppercase text-zinc-400 border border-zinc-100 transition-all">VISÃO GERAL (RAIZ)</button>
                {folders.map(f => (
                    <button key={f.id} onClick={() => handleMoveToFolder(f.id)} className="w-full text-left p-4 rounded-xl hover:bg-amber-50 hover:border-amber-200 font-black text-[10px] uppercase text-amber-600 border border-zinc-100 transition-all flex items-center gap-3">
                        <Folder className="h-4 w-4" /> {f.name}
                    </button>
                ))}
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md">
            <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Ajuste de Prazo Legal</DialogTitle>
                <DialogDescription className="text-[10px] font-bold uppercase tracking-widest">Personalização de vencimento útil</DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-6">
                <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-zinc-400 ml-1">Dias Úteis para Defesa</Label>
                    <Input type="number" value={customDays} onChange={e => setCustomDays(e.target.value)} className="h-12 rounded-xl bg-slate-50 border-none font-bold text-xs" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-zinc-400 ml-1">Justificativa do Ajuste</Label>
                    <Textarea value={adjustmentReason} onChange={e => setAdjustmentJustification(e.target.value)} placeholder="Opcional: Motivo da alteração do prazo padrão..." className="min-h-[100px] rounded-xl bg-slate-50 border-none font-medium text-xs uppercase" />
                </div>
            </div>
            <DialogFooter>
                <Button onClick={handleApplyAdjustment} className="w-full h-12 rounded-xl font-black uppercase text-[10px]">Recalcular Prazo</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Relatório Municipal</DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest">Autuações aplicadas no ano — visível a todos os usuários do município</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 py-2">
            <Select value={String(reportYear)} onValueChange={(v) => handleChangeReportYear(Number(v))}>
              <SelectTrigger className="w-32 h-11 rounded-xl bg-slate-50 border-none font-bold text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleExportReportCsv} disabled={!reportData} variant="outline" size="sm" className="h-11 rounded-xl gap-2 font-black text-[9px] uppercase tracking-widest">
              <ArrowUpRight className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
          </div>

          {isLoadingReport ? (
            <div className="py-16 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : reportData ? (
            <div className="space-y-6 pb-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-4 rounded-2xl text-center">
                  <p className="text-2xl font-black italic">{reportData.totalNoAno}</p>
                  <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mt-1">Total no Ano</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl text-center">
                  <p className="text-2xl font-black italic text-emerald-600">{reportData.porStatus['finalizado'] || 0}</p>
                  <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mt-1">Finalizados</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-2xl text-center">
                  <p className="text-2xl font-black italic text-amber-600">{reportData.porStatus['rascunho'] || 0}</p>
                  <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mt-1">Rascunhos</p>
                </div>
                <div className={cn("p-4 rounded-2xl text-center", (reportData.numeracao.duplicados.length > 0 || reportData.numeracao.acimaDoContador) ? "bg-rose-50" : "bg-cyan-50")}>
                  <p className={cn("text-2xl font-black italic", (reportData.numeracao.duplicados.length > 0 || reportData.numeracao.acimaDoContador) ? "text-rose-600" : "text-cyan-600")}>{reportData.numeracao.duplicados.length}</p>
                  <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mt-1">Números Duplicados</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mb-2">Por Tipo de Documento</p>
                <div className="space-y-1.5">
                  {Object.entries(reportData.porTipo).map(([tipo, total]) => (
                    <div key={tipo} className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl text-xs font-bold">
                      <span className="uppercase text-zinc-600">{tipo}</span>
                      <span className="text-primary">{total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mb-2">Por Fiscal</p>
                <div className="space-y-1.5">
                  {reportData.porFiscal.map(f => (
                    <div key={f.nome} className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl text-xs font-bold">
                      <span className="uppercase text-zinc-600">{f.nome}</span>
                      <span className="text-primary">{f.total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mb-2">Conferência de Numeração</p>
                {reportData.numeracao.duplicados.length === 0 && reportData.numeracao.gapsInternos.length === 0 && !reportData.numeracao.acimaDoContador ? (
                  <div className="flex items-center gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-xl text-xs font-bold">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Nenhuma inconsistência encontrada na numeração deste ano.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reportData.numeracao.duplicados.length > 0 && (
                      <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-xs font-bold">
                        Números duplicados: {reportData.numeracao.duplicados.join(', ')}
                      </div>
                    )}
                    {reportData.numeracao.gapsInternos.length > 0 && (
                      <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-xs font-bold">
                        Números pulados na sequência: {reportData.numeracao.gapsInternos.join(', ')}
                      </div>
                    )}
                    {reportData.numeracao.acimaDoContador && (
                      <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-xs font-bold">
                        Existe documento com número ({reportData.numeracao.maiorSequencialUsado}) maior que o contador oficial ({reportData.numeracao.valorContador}) — possível edição manual indevida do campo Nº.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-xs font-bold text-zinc-400 uppercase">Nenhum dado encontrado para este ano.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

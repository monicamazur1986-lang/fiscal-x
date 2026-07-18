
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

import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
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
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { calculateDeadline } from "@/lib/prazo"
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
  const { folders, createFolder, loading: loadingFold } = useFolders('intimacoes');

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
      <div className="flex h-[80vh] w-full flex-col items-center justify-center gap-4 bg-[#F5F2EA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0E4A44]" />
        <p className="text-xs font-medium text-[#A39D8C] uppercase tracking-widest">Sincronizando Arquivo Municipal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        backHref="/dashboard"
        title="Documentos"
        subtitle={isRoot ? (selectedMunicipioForRoot || "Selecione um município") : (profile?.municipioNome || "Arquivo municipal de autuações")}
        actions={isRoot ? (
          <Popover open={municipioPickerOpen} onOpenChange={setMunicipioPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                <Building2 className="h-3.5 w-3.5" />
                {selectedMunicipioForRoot ? selectedMunicipioForRoot : "Selecionar município"}
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 bg-white border-[#E4DFD1] rounded-lg shadow-lg">
              <Command className="bg-transparent" shouldFilter={false}>
                <CommandInput
                  placeholder="Pesquisar município..."
                  value={municipioSearchTerm}
                  onValueChange={setMunicipioSearchTerm}
                  className="h-10 border-none focus:ring-0 text-sm"
                />
                <CommandList className="max-h-[300px] overflow-y-auto">
                  {filteredMunicipiosPicker.length === 0 && (
                    <CommandEmpty className="p-4 text-center text-xs text-[#A39D8C] font-medium">Não encontrado.</CommandEmpty>
                  )}
                  <CommandGroup>
                    {filteredMunicipiosPicker.map((m) => (
                      <div
                        key={m}
                        onClick={() => { setSelectedMunicipioForRoot(m); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                        className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm border-b border-[#F1EEE4] last:border-0"
                      >
                        {m}
                      </div>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : undefined}
      />

      <div className="max-w-7xl mx-auto w-full p-4 sm:p-8 pb-40">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        <aside className="lg:col-span-3 space-y-6">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => { setActiveFolderId("all"); setFilterByFiscal(null); setSelectedIds([]); }}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium",
                (activeFolderId === "all" && !filterByFiscal) ? "bg-[#E4EEEC] text-[#0E4A44]" : "text-[#6B6659] hover:bg-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Archive className="h-4 w-4 text-[#A39D8C]" />
                Visão Geral
              </div>
              <span className="text-xs text-[#A39D8C] tabular-nums">
                {intimacoes.filter(i => !i.deleted).length}
              </span>
            </button>

            {isGestor && equipeFiscais.length > 0 && (
              <div className="mt-4 space-y-1">
                <div className="flex items-center gap-2 px-3 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Equipe de Fiscalização</span>
                </div>
                {equipeFiscais.map(fiscal => (
                  <button
                    key={fiscal.id}
                    onClick={() => { setFilterByFiscal(fiscal.id); setActiveFolderId("all"); setSelectedIds([]); }}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium w-full text-left",
                      filterByFiscal === fiscal.id ? "bg-[#E4EEEC] text-[#0E4A44]" : "text-[#6B6659] hover:bg-white"
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <User className="h-3.5 w-3.5 shrink-0 text-[#A39D8C]" />
                      <span className="truncate">{fiscal.nome}</span>
                    </div>
                    <span className="text-xs text-[#A39D8C] tabular-nums shrink-0">
                      {intimacoes.filter(i => !i.deleted && i.createdBy === fiscal.id).length}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="h-px bg-[#E4DFD1] my-3" />

            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Pastas de Trabalho</span>
              <button onClick={() => setIsFolderDialogOpen(true)} className="text-[#A39D8C] hover:text-[#0E4A44] transition-colors"><FolderPlus className="h-4 w-4" /></button>
            </div>

            {folders.map(folder => (
              <button
                key={folder.id}
                onClick={() => { setActiveFolderId(folder.id); setFilterByFiscal(null); setSelectedIds([]); }}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  activeFolderId === folder.id ? "bg-[#E4EEEC] text-[#0E4A44]" : "text-[#6B6659] hover:bg-white"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Folder className="h-4 w-4 text-[#9C7A3C]" /> {folder.name}
                </div>
              </button>
            ))}

            <button
              onClick={() => { setActiveFolderId("trash"); setFilterByFiscal(null); setSelectedIds([]); }}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium mt-2",
                activeFolderId === "trash" ? "bg-rose-50 text-rose-700" : "text-[#6B6659] hover:bg-white"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Trash2 className={cn("h-4 w-4", activeFolderId === "trash" ? "text-rose-500" : "text-[#A39D8C]")} />
                Lixeira
              </div>
            </button>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-6">
          {isRoot && needsMunicipioSelection ? (
            <div className="py-32 flex flex-col items-center justify-center gap-3 bg-white border border-dashed border-[#E4DFD1] rounded-lg text-center">
              <Building2 className="h-8 w-8 text-[#C9C2AC]" />
              <p className="text-sm font-medium text-[#6B6659]">Selecione um município para visualizar os documentos</p>
              <p className="text-xs text-[#A39D8C] max-w-sm">Use o seletor no topo da página para escolher qual cidade cliente você quer inspecionar.</p>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-[#E4DFD1] rounded-lg p-4 flex items-center gap-3">
              <BarChart3 className="h-4 w-4 text-[#9C7A3C] shrink-0" />
              <div><p className="text-xs text-[#A39D8C]">Total na visão</p><p className="font-serif text-xl text-[#262420]">{filteredIntimacoes.length}</p></div>
            </div>
            <div className="bg-white border border-[#E4DFD1] rounded-lg p-4 flex items-center gap-3">
              <Timer className={cn("h-4 w-4 shrink-0", stats.alertas > 0 ? "text-amber-500" : "text-[#C9C2AC]")} />
              <div><p className="text-xs text-[#A39D8C]">Prazos em alerta (72h úteis)</p><p className="font-serif text-xl text-[#262420]">{stats.alertas}</p></div>
            </div>
            <div className="bg-white border border-[#E4DFD1] rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle className={cn("h-4 w-4 shrink-0", stats.vencidos > 0 ? "text-rose-500" : "text-[#C9C2AC]")} />
              <div><p className="text-xs text-[#A39D8C]">Vencidos</p><p className={cn("font-serif text-xl", stats.vencidos > 0 ? "text-rose-600" : "text-[#262420]")}>{stats.vencidos}</p></div>
            </div>
          </div>

          {minhasIntimacoes.length >= AVISO_A_PARTIR_DE && !dismissedZipBanner && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-md flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Archive className="h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  Você está com <strong>{minhasIntimacoes.length} de {LIMITE_DOCUMENTOS}</strong> documentos salvos. Baixe tudo em um único ZIP para liberar espaço.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => setSelectedIds(minhasIntimacoes.map(i => i.id))}
                  className="h-8 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium gap-1.5"
                >
                  <CheckSquare className="h-3.5 w-3.5" /> Selecionar meus documentos
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissedZipBanner(true)} className="h-8 rounded-md text-amber-700 text-xs font-medium">
                  Dispensar
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
              <Input
                placeholder="Pesquisar registros..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 rounded-md border-[#E4DFD1] bg-white text-sm"
              />
            </div>
            <div className="flex gap-2">
                <Button onClick={handleOpenReport} variant="outline" size="sm" className="h-10 rounded-md gap-1.5 text-xs font-medium border-[#E4DFD1] bg-white text-[#0E4A44] hover:bg-[#E4EEEC]">
                    <BarChart3 className="h-4 w-4" /> Relatório Municipal
                </Button>
                <Button onClick={toggleSelectAll} variant="outline" size="sm" className="h-10 rounded-md gap-1.5 text-xs font-medium border-[#E4DFD1] bg-white text-[#6B6659] hover:bg-[#F5F2EA]">
                    {selectedIds.length > 0 && selectedIds.length === filteredIntimacoes.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    {selectedIds.length > 0 ? `${selectedIds.length} selecionados` : "Selecionar tudo"}
                </Button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="bg-[#0E4A44] text-white p-3 rounded-md flex items-center justify-between animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3 ml-1">
                <button onClick={() => setSelectedIds([])} className="text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
                <span className="text-xs font-medium">{selectedIds.length} itens selecionados</span>
              </div>
              <div className="flex items-center gap-1">
                <Button onClick={handleTriggerAutomation} disabled={isTriggeringAutomation} size="sm" variant="ghost" className="h-8 rounded-md text-xs font-medium gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-white/10">
                  {isTriggeringAutomation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {isTriggeringAutomation ? "Automação n8n..." : "n8n Automatizar"}
                </Button>
                {activeFolderId === 'trash' ? (
                    <Button size="sm" variant="ghost" onClick={handleBulkRestore} className="h-8 rounded-md text-xs font-medium gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-white/10">
                        <RotateCcw className="h-4 w-4" /> Restaurar
                    </Button>
                ) : (
                    <>
                        <Button size="sm" variant="ghost" onClick={() => setIsMoveDialogOpen(true)} className="h-8 rounded-md text-xs font-medium gap-1.5 hover:bg-white/10">
                            <MoveHorizontal className="h-4 w-4" /> Mover pasta
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleBulkDownloadZip} disabled={isZipping} className="h-8 rounded-md text-xs font-medium gap-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-white/10">
                            {isZipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                            {isZipping ? `Gerando ${zipProgress.current}/${zipProgress.total}...` : "Baixar ZIP"}
                        </Button>
                    </>
                )}
                <Button size="sm" variant="ghost" onClick={handleBulkDelete} className="h-8 rounded-md text-xs font-medium gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-white/10">
                  <Trash2 className="h-4 w-4" /> {activeFolderId === 'trash' ? 'Excluir definitivo' : 'Lixeira'}
                </Button>
              </div>
            </div>
          )}

          <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
            {filteredIntimacoes.length > 0 ? (
              filteredIntimacoes.map(item => {
                const deadline = calculateDeadline(item);
                const isFinal = item.status === 'finalizado';
                const itemId = String(item.id);

                return (
                  <div key={itemId} className={cn(
                    "relative flex flex-col sm:flex-row sm:items-center gap-3 pl-5 pr-4 py-3 transition-colors",
                    selectedIds.includes(itemId) ? "bg-[#F5F2EA]" : "hover:bg-[#FAF8F3]"
                  )}>
                    <span className={cn("absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-sm", isFinal ? "bg-[#1F7A5C]" : "bg-amber-500")} />
                    <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                        <Checkbox
                        checked={selectedIds.includes(itemId)}
                        onCheckedChange={() => toggleSelect(itemId)}
                        className="h-4 w-4 rounded border-[#C9C2AC] data-[state=checked]:bg-[#0E4A44] data-[state=checked]:border-[#0E4A44]"
                        />
                        <span className={cn(
                          "h-7 w-7 rounded-full border flex items-center justify-center font-serif text-[13px] shrink-0",
                          isFinal ? "border-[#1F7A5C] text-[#1F7A5C]" : "border-[#E4DFD1] text-[#A39D8C]"
                        )}>
                          {isFinal ? "✓" : "✎"}
                        </span>
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 items-center w-full">
                        <div className="lg:col-span-4 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-serif text-[15px] text-[#262420] truncate">{item.numeroProcesso || "---"}</span>
                                <Badge variant="outline" className={cn("text-[10px] font-medium h-4 px-1.5 border-none", isFinal ? "bg-[#E3F1EA] text-[#1F7A5C]" : "bg-amber-50 text-amber-700")}>
                                    {isFinal ? 'Final' : 'Rascunho'}
                                </Badge>
                            </div>
                            <p className="text-xs text-[#A39D8C] truncate">
                                {item.autor || "Estabelecimento não informado"}
                            </p>
                        </div>

                        <div className="lg:col-span-3 flex flex-col justify-center gap-0.5">
                            <div className="flex items-center gap-1.5 text-xs text-[#6B6659]">
                                <User className="h-3 w-3 text-[#C9C2AC]" />
                                <span className="truncate max-w-[140px]">{item.createdByName || "---"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-[#A39D8C]">
                                <CalendarDays className="h-3 w-3 text-[#C9C2AC]" />
                                <span>{item.dataIntimacao ? format(new Date(item.dataIntimacao), "dd MMM yyyy", { locale: ptBR }) : "---"}</span>
                            </div>
                        </div>

                        <div className="lg:col-span-3 flex flex-col justify-center">
                            {isFinal && deadline ? (
                                <div className={cn(
                                    "flex items-center gap-1.5 text-xs font-medium w-fit px-2 py-1 rounded",
                                    deadline.status === 'vencido' ? "bg-rose-50 text-rose-700" :
                                    deadline.status === 'alerta' ? "bg-amber-50 text-amber-700" :
                                    "bg-[#E4EEEC] text-[#0E4A44]"
                                )}>
                                    <Timer className="h-3 w-3" />
                                    {deadline.remaining < 0
                                        ? `Expirado há ${Math.abs(deadline.remaining)} dias`
                                        : `Resta(m) ${deadline.remaining} dias`
                                    }
                                </div>
                            ) : (
                                <span className="text-xs text-[#C9C2AC]">Aguardando finalização</span>
                            )}
                        </div>

                        <div className="lg:col-span-2 flex justify-end items-center gap-1">
                            <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md text-[#6B6659] hover:text-[#0E4A44] hover:bg-[#E4EEEC]">
                                <Link href={`/intimacoes/${itemId}`}><ArrowUpRight className="h-4 w-4" /></Link>
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md text-[#A39D8C] hover:bg-[#F5F2EA]"><MoreVertical className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-md w-56 p-1 shadow-lg">
                                    <DropdownMenuItem onClick={() => handleOpenAdjustment(itemId)} className="rounded text-xs font-medium h-9 px-3 cursor-pointer gap-2"><Scale className="h-3.5 w-3.5" /> Ajustar prazo</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { bulkDelete([itemId], true); toast({ title: "Movido para lixeira" }); }} className="rounded text-rose-600 text-xs font-medium h-9 px-3 cursor-pointer"><Trash2 className="mr-2 h-3.5 w-3.5" /> Mover pra lixeira</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-24 gap-2">
                <Archive className="h-8 w-8 text-[#D8D2C0]" />
                <p className="text-xs text-[#A39D8C]">Nenhum registro encontrado</p>
              </div>
            )}
          </div>
          </>
          )}
        </main>
      </div>
      </div>

      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogContent className="rounded-lg sm:max-w-md bg-[#FCFAF5]">
            <DialogHeader>
                <DialogTitle className="font-serif text-lg text-[#262420]">Nova Pasta</DialogTitle>
                <DialogDescription className="text-xs text-[#A39D8C]">Organize seus documentos municipais</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-[#6B6659]">Nome da Pasta</Label>
                    <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Ex: Vistorias 2024" className="h-10 rounded-md border-[#E4DFD1] bg-white text-sm" />
                </div>
            </div>
            <DialogFooter>
                <Button onClick={handleCreateFolder} size="sm" className="w-full h-9 rounded-md text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">Criar Pasta</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="rounded-lg sm:max-w-md bg-[#FCFAF5]">
            <DialogHeader>
                <DialogTitle className="font-serif text-lg text-[#262420]">Mover Selecionados</DialogTitle>
                <DialogDescription className="text-xs text-[#A39D8C]">Selecione o destino para {selectedIds.length} itens</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-1">
                <button onClick={() => handleMoveToFolder(null)} className="w-full text-left px-3 py-2.5 rounded-md hover:bg-[#E4EEEC] text-sm font-medium text-[#6B6659] border border-[#E4DFD1] bg-white transition-colors">Visão geral (raiz)</button>
                {folders.map(f => (
                    <button key={f.id} onClick={() => handleMoveToFolder(f.id)} className="w-full text-left px-3 py-2.5 rounded-md hover:bg-[#F1E9D6] hover:border-[#9C7A3C] text-sm font-medium text-[#9C7A3C] border border-[#E4DFD1] bg-white transition-colors flex items-center gap-2.5">
                        <Folder className="h-4 w-4" /> {f.name}
                    </button>
                ))}
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen}>
        <DialogContent className="rounded-lg sm:max-w-md bg-[#FCFAF5]">
            <DialogHeader>
                <DialogTitle className="font-serif text-lg text-[#262420]">Ajuste de Prazo Legal</DialogTitle>
                <DialogDescription className="text-xs text-[#A39D8C]">Personalização de vencimento útil</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-[#6B6659]">Dias Úteis para Defesa</Label>
                    <Input type="number" value={customDays} onChange={e => setCustomDays(e.target.value)} className="h-10 rounded-md border-[#E4DFD1] bg-white text-sm" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-[#6B6659]">Justificativa do Ajuste</Label>
                    <Textarea value={adjustmentReason} onChange={e => setAdjustmentJustification(e.target.value)} placeholder="Opcional: motivo da alteração do prazo padrão..." className="min-h-[100px] rounded-md border-[#E4DFD1] bg-white text-sm" />
                </div>
            </div>
            <DialogFooter>
                <Button onClick={handleApplyAdjustment} size="sm" className="w-full h-9 rounded-md text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">Recalcular Prazo</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="rounded-lg sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-[#FCFAF5]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-[#262420]">Relatório Municipal</DialogTitle>
            <DialogDescription className="text-xs text-[#A39D8C]">Autuações aplicadas no ano — visível a todos os usuários do município</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 py-2">
            <Select value={String(reportYear)} onValueChange={(v) => handleChangeReportYear(Number(v))}>
              <SelectTrigger className="w-32 h-9 rounded-md border-[#E4DFD1] bg-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleExportReportCsv} disabled={!reportData} variant="outline" size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium border-[#E4DFD1] bg-white text-[#0E4A44] hover:bg-[#E4EEEC]">
              <ArrowUpRight className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
          </div>

          {isLoadingReport ? (
            <div className="py-16 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#C9C2AC]" /></div>
          ) : reportData ? (
            <div className="space-y-6 pb-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-[#E4DFD1] p-3 rounded-lg text-center">
                  <p className="font-serif text-xl text-[#262420]">{reportData.totalNoAno}</p>
                  <p className="text-xs text-[#A39D8C] mt-0.5">Total no ano</p>
                </div>
                <div className="bg-white border border-[#E4DFD1] p-3 rounded-lg text-center">
                  <p className="font-serif text-xl text-[#1F7A5C]">{reportData.porStatus['finalizado'] || 0}</p>
                  <p className="text-xs text-[#A39D8C] mt-0.5">Finalizados</p>
                </div>
                <div className="bg-white border border-[#E4DFD1] p-3 rounded-lg text-center">
                  <p className="font-serif text-xl text-amber-600">{reportData.porStatus['rascunho'] || 0}</p>
                  <p className="text-xs text-[#A39D8C] mt-0.5">Rascunhos</p>
                </div>
                <div className="bg-white border border-[#E4DFD1] p-3 rounded-lg text-center">
                  <p className={cn("font-serif text-xl", (reportData.numeracao.duplicados.length > 0 || reportData.numeracao.acimaDoContador) ? "text-rose-600" : "text-[#262420]")}>{reportData.numeracao.duplicados.length}</p>
                  <p className="text-xs text-[#A39D8C] mt-0.5">Números duplicados</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C] mb-2">Por Tipo de Documento</p>
                <div className="space-y-1">
                  {Object.entries(reportData.porTipo).map(([tipo, total]) => (
                    <div key={tipo} className="flex items-center justify-between border border-[#F1EEE4] bg-white px-3 py-2 rounded-md text-sm">
                      <span className="text-[#6B6659]">{tipo}</span>
                      <span className="font-medium text-[#262420]">{total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C] mb-2">Por Fiscal</p>
                <div className="space-y-1">
                  {reportData.porFiscal.map(f => (
                    <div key={f.nome} className="flex items-center justify-between border border-[#F1EEE4] bg-white px-3 py-2 rounded-md text-sm">
                      <span className="text-[#6B6659]">{f.nome}</span>
                      <span className="font-medium text-[#262420]">{f.total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C] mb-2">Conferência de Numeração</p>
                {reportData.numeracao.duplicados.length === 0 && reportData.numeracao.gapsInternos.length === 0 && !reportData.numeracao.acimaDoContador ? (
                  <div className="flex items-center gap-2.5 bg-emerald-50 text-emerald-700 p-3 rounded-md text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Nenhuma inconsistência encontrada na numeração deste ano.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reportData.numeracao.duplicados.length > 0 && (
                      <div className="bg-rose-50 text-rose-700 p-3 rounded-md text-sm">
                        Números duplicados: {reportData.numeracao.duplicados.join(', ')}
                      </div>
                    )}
                    {reportData.numeracao.gapsInternos.length > 0 && (
                      <div className="bg-amber-50 text-amber-700 p-3 rounded-md text-sm">
                        Números pulados na sequência: {reportData.numeracao.gapsInternos.join(', ')}
                      </div>
                    )}
                    {reportData.numeracao.acimaDoContador && (
                      <div className="bg-rose-50 text-rose-700 p-3 rounded-md text-sm">
                        Existe documento com número ({reportData.numeracao.maiorSequencialUsado}) maior que o contador oficial ({reportData.numeracao.valorContador}) — possível edição manual indevida do campo Nº.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-zinc-400">Nenhum dado encontrado para este ano.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

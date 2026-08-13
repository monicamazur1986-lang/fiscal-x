
"use client"

import {
  ClipboardList,
  Search,
  ChevronRight,
  ShieldCheck,
  Building2,
  ChevronsUpDown,
  UtensilsCrossed,
  Pill,
  Syringe,
  MapPin,
  Landmark,
  Clock,
  Trash2,
  Loader2,
  Radiation,
  ScanLine,
  Stethoscope,
  Building,
  Ambulance,
  Activity,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useMemo, useState } from "react"
import { format } from "date-fns"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useToast } from "@/hooks/use-toast"
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
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { normalizeId } from "@/lib/utils"
import municipiosPR from "@/lib/municipios-pr.json"
import { roteirosCatalog } from "@/lib/roteiros/catalog"

// ÍCONE CUSTOMIZADO: DENTE (ODONTOLOGIA)
const ToothIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 8c.5-4.5 2.5-5 7-5s6.5.5 7 5c.3 3.5-1 5-2 6 .5 3 0 5.5-1.5 7-1.5-1.5-2-4-1.5-7-.5-.5-1.5-.5-2 0 .5 3 0 5.5-1.5 7-1.5-1.5-2-4-1.5-7-1-1-2.3-2.5-2-6Z" />
  </svg>
)

const roteiros = roteirosCatalog.map((roteiro) => ({
  ...roteiro,
  icone: {
    tooth: ToothIcon,
    utensils: UtensilsCrossed,
    pill: Pill,
    syringe: Syringe,
    radiation: Radiation,
    scan: ScanLine,
    stethoscope: Stethoscope,
    building: Building,
    ambulance: Ambulance,
    activity: Activity,
  }[roteiro.iconName],
}));

type Roteiro = (typeof roteiros)[number];

function getPalette(roteiro: Roteiro) {
  const isMunicipal = 'municipioId' in roteiro;

  if (roteiro.tipo === 'roi') {
    const roiPaletteById: Record<string, { icon: string; badge: string; chip: string; glow: string }> = {
      'roi-radiografia-medica': {
        icon: 'bg-gradient-to-br from-sky-400 via-sky-500 to-sky-600 text-white shadow-sm',
        badge: 'bg-sky-100 text-sky-700 border border-sky-200',
        chip: 'bg-sky-50 text-sky-700 border border-sky-200',
        glow: 'from-sky-50 to-slate-50',
      },
      'roi-mamografia': {
        icon: 'bg-gradient-to-br from-pink-300 via-rose-400 to-rose-500 text-white shadow-sm',
        badge: 'bg-rose-100 text-rose-700 border border-rose-200',
        chip: 'bg-rose-50 text-rose-700 border border-rose-200',
        glow: 'from-rose-50 to-stone-50',
      },
      'roi-radiologia-intervencionista': {
        icon: 'bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 text-white shadow-sm',
        badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        glow: 'from-emerald-50 to-teal-50',
      },
      'roi-endoscopia': {
        icon: 'bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500 text-white shadow-sm',
        badge: 'bg-orange-100 text-orange-700 border border-orange-200',
        chip: 'bg-orange-50 text-orange-700 border border-orange-200',
        glow: 'from-orange-50 to-amber-50',
      },
      'roi-urgencia-e-emergencia': {
        icon: 'bg-gradient-to-br from-red-400 via-rose-400 to-rose-500 text-white shadow-sm',
        badge: 'bg-red-100 text-red-700 border border-red-200',
        chip: 'bg-red-50 text-red-700 border border-red-200',
        glow: 'from-red-50 to-rose-50',
      },
    };

    return roiPaletteById[roteiro.id] || {
      icon: 'bg-gradient-to-br from-amber-300 via-orange-300 to-amber-500 text-white shadow-sm',
      badge: 'bg-amber-100 text-amber-700 border border-amber-200',
      chip: 'bg-amber-50 text-amber-700 border border-amber-200',
      glow: 'from-amber-50 to-orange-50',
    };
  }

  const paletteByIcon: Record<string, { icon: string; badge: string; chip: string; glow: string }> = {
    tooth: {
      icon: 'bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 text-white shadow-sm',
      badge: 'bg-rose-100 text-rose-700 border border-rose-200',
      chip: 'bg-pink-50 text-pink-700 border border-pink-200',
      glow: 'from-rose-50 to-pink-50',
    },
    utensils: {
      icon: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white shadow-sm',
      badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      glow: 'from-emerald-50 to-teal-50',
    },
    pill: {
      icon: 'bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-600 text-white shadow-sm',
      badge: 'bg-sky-100 text-sky-700 border border-sky-200',
      chip: 'bg-sky-50 text-sky-700 border border-sky-200',
      glow: 'from-sky-50 to-cyan-50',
    },
    syringe: {
      icon: 'bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 text-white shadow-sm',
      badge: 'bg-violet-100 text-violet-700 border border-violet-200',
      chip: 'bg-violet-50 text-violet-700 border border-violet-200',
      glow: 'from-violet-50 to-purple-50',
    },
    radiation: {
      icon: 'bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-500 text-white shadow-sm',
      badge: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
      chip: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
      glow: 'from-yellow-50 to-orange-50',
    },
  };

  const palette = paletteByIcon[roteiro.iconName] || {
    icon: 'bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-sm',
    badge: 'bg-slate-100 text-slate-700 border border-slate-200',
    chip: 'bg-slate-50 text-slate-700 border border-slate-200',
    glow: 'from-slate-50 to-slate-100',
  };

  if (isMunicipal) {
    return {
      ...palette,
      icon: 'bg-gradient-to-br from-[#d9b56d] via-[#c99438] to-[#9c6d1d] text-white shadow-sm',
      badge: 'bg-[#f7edd9] text-[#7a5a1e] border border-[#e7cf93]',
      chip: 'bg-[#fff6e8] text-[#7a5a1e] border border-[#ecd8a7]',
      glow: 'from-[#fffaf2] to-[#f7f0df]',
    };
  }

  return palette;
}

function RoteiroCard({ roteiro }: { roteiro: Roteiro }) {
  const isMunicipal = 'municipioId' in roteiro;
  const href = `/roteiros/${roteiro.id}`;
  const palette = getPalette(roteiro);

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-4 px-4 py-3.5 transition-all duration-200 hover:bg-[#FAF8F3] hover:shadow-[0_2px_8px_rgba(38,36,32,0.04)]",
        `bg-gradient-to-r ${palette.glow}`
      )}
    >
      <div className="min-w-0 flex-1 flex items-center gap-4">
        <div className={cn(
          "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-[1.02]",
          palette.icon
        )}>
          <roteiro.icone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-serif text-[16px] text-[#262420] leading-snug line-clamp-2">{roteiro.titulo}</p>
            {isMunicipal && (
              <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]", palette.badge)}>
                município
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            <span className={cn("text-[11px] font-semibold rounded-md px-2 py-0.5", palette.badge)}>
              {roteiro.itens} itens
            </span>
            <span className={cn("text-[11px] rounded-md px-2 py-0.5 font-medium", palette.chip)}>
              {roteiro.base}
            </span>
          </div>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-[#C9C2AC] shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function RoteirosPage() {
  const { profile } = useAuth()
  const isRoot = profile?.role === 'root'
  const [search, setSearch] = useState("")
  const [municipioPickerOpen, setMunicipioPickerOpen] = useState(false)
  const [municipioSearchTerm, setMunicipioSearchTerm] = useState("")
  const [selectedMunicipioForRoot, setSelectedMunicipioForRoot] = useState("")

  // Pro root, o município efetivo vem do seletor (só municipais globais até
  // escolher um); pros demais papéis, vem sempre do próprio perfil — mesmo
  // padrão já usado em Documentos/Configurações/Gestão de Suporte.
  const effectiveMunicipioId = isRoot
    ? (selectedMunicipioForRoot ? normalizeId(selectedMunicipioForRoot) : undefined)
    : profile?.municipioId ? normalizeId(profile.municipioId) : undefined

  // Nome "bonito" do município (pro título do grupo) — pro root já vem certo
  // do seletor; pro fiscal/admin, prioriza o nome salvo no perfil e só cai
  // pro id normalizado se não houver nada melhor.
  const municipioLabel = isRoot
    ? selectedMunicipioForRoot
    : (profile?.municipioNome || profile?.municipioId || "");

  const filteredMunicipiosPicker = useMemo(() => {
    const term = normalizeId(municipioSearchTerm);
    if (!term) return municipiosPR;
    return municipiosPR.filter(m => normalizeId(m).includes(term));
  }, [municipioSearchTerm]);

  const filteredRoteiros = roteiros
    .filter(r => !('municipioId' in r) || r.municipioId === effectiveMunicipioId)
    .filter(r =>
      r.titulo.toLowerCase().includes(search.toLowerCase()) ||
      r.categoria.toLowerCase().includes(search.toLowerCase()) ||
      r.base.toLowerCase().includes(search.toLowerCase())
    )

  // Dois grupos, sempre nessa ordem: primeiro o que é exclusivo do município
  // (mais relevante pro fiscal que está vendo a tela), depois o que vale pra
  // qualquer lugar — em vez de uma lista só, misturando os dois sem aviso.
  const roteirosMunicipais = filteredRoteiros.filter(r => 'municipioId' in r);
  const roteirosRoi = filteredRoteiros.filter(r => 'tipo' in r && r.tipo === 'roi');
  const roteirosGerais = filteredRoteiros.filter(r => !('municipioId' in r) && !('tipo' in r));

  // Atalho pra retomar rascunhos movido pra cá (janela inicial) — antes só
  // existia um ícone discreto dentro de cada roteiro. useInspecoes já traz
  // as inspeções do município certo (do próprio perfil, ou do selecionado
  // pelo root); aqui só filtramos pelas do próprio fiscal, ainda em rascunho.
  const { inspecoes, deleteInspecao } = useInspecoes(isRoot ? { municipioIdOverride: effectiveMunicipioId } : undefined);
  const { toast } = useToast()
  const roteirosPorId = useMemo(() => new Map(roteiros.map(r => [r.id, r])), []);
  const emAndamento = useMemo(() => {
    if (!profile) return [];
    return inspecoes
      .filter(i => i.status === 'rascunho' && i.fiscalId === profile.uid && i.checklistData?.roteiroId)
      .sort((a, b) => new Date(b.updatedAt || b.data).getTime() - new Date(a.updatedAt || a.data).getTime());
  }, [inspecoes, profile]);

  // Exclusão direto da lista — pra rascunhos abandonados que ninguém vai mais
  // retomar, sem precisar abrir o roteiro primeiro. Sempre com confirmação
  // (AlertDialog), nunca automática.
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const handleExcluirEmAndamento = async (id: string, titulo: string) => {
    setExcluindoId(id);
    try {
      await deleteInspecao(id);
      toast({ title: "Excluído Permanentemente" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e?.message || "Verifique sua conexão e tente novamente." });
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        title="Roteiros"
        subtitle={isRoot ? (selectedMunicipioForRoot || "Todos os municípios") : "Instrumentos oficiais para fiscalização sanitária"}
        actions={isRoot ? (
          <Popover open={municipioPickerOpen} onOpenChange={setMunicipioPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors">
                <Building2 className="h-3.5 w-3.5" />
                {selectedMunicipioForRoot || "Selecionar município"}
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
                    <div
                      onClick={() => { setSelectedMunicipioForRoot(""); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                      className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm text-[#0E4A44] border-b border-[#F1EEE4]"
                    >
                      Nenhum (só roteiros globais)
                    </div>
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

      <div className="max-w-3xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
        {emAndamento.length > 0 && (
          <div className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              Em Andamento
            </h2>
            <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
              {emAndamento.map((insp) => {
                const roteiro = roteirosPorId.get(insp.checklistData!.roteiroId);
                const Icone = roteiro?.icone || ClipboardList;
                return (
                  <div key={insp.id} className="flex items-center gap-1 pr-3 hover:bg-[#FAF8F3] transition-colors">
                    <Link
                      href={`/roteiros/${insp.checklistData!.roteiroId}?inspecaoId=${insp.id}`}
                      className="min-w-0 flex-1 flex items-center gap-4 px-5 py-4"
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600">
                          <Icone className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-serif text-[16px] text-[#262420] leading-snug truncate">{insp.titulo || "Vistoria sem nome"}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-md px-2 py-0.5 truncate max-w-[220px]">
                              {roteiro?.titulo || "Roteiro"}
                            </span>
                            <span className="text-xs text-[#6B6659]">Salvo às {insp.updatedAt ? format(new Date(insp.updatedAt), "HH:mm 'de' dd/MM") : "..."}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#C9C2AC] shrink-0" />
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" className="h-9 w-9 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 transition-colors">
                          {excluindoId === insp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2rem]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-black uppercase tracking-tighter text-xl italic">Excluir permanentemente?</AlertDialogTitle>
                          <AlertDialogDescription>Apaga "{insp.titulo || "vistoria sem nome"}" ({roteiro?.titulo || "roteiro"}) — respostas, fotos e observações. Não é possível desfazer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleExcluirEmAndamento(insp.id, insp.titulo)} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
          <Input
            placeholder="Buscar roteiro por atividade, categoria ou lei..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-md border-[#E4DFD1] bg-white text-sm"
          />
        </div>

        {roteirosMunicipais.length > 0 && (
          <div className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">
              <MapPin className="h-3.5 w-3.5" />
              {municipioLabel ? `Exclusivos de ${municipioLabel}` : "Roteiros do Município"}
            </h2>
            <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
              {roteirosMunicipais.map((r) => <RoteiroCard key={r.id} roteiro={r} />)}
            </div>
          </div>
        )}

        {roteirosGerais.length > 0 && (
          <div className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">
              <Landmark className="h-3.5 w-3.5" />
              Roteiros Estaduais e Federais
            </h2>
            <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
              {roteirosGerais.map((r) => <RoteiroCard key={r.id} roteiro={r} />)}
            </div>
          </div>
        )}

        {roteirosRoi.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E4D7B7] bg-[#F8F1E2] px-4 py-3 shadow-[0_1px_2px_rgba(38,36,32,0.04)]">
              <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#7A5A1E]">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F5E3B4] text-[#7A5A1E]">
                  <Radiation className="h-3.5 w-3.5" />
                </span>
                ROIs — ANVISA
              </h2>
              <span className="rounded-full border border-[#E7CF93] bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A5A1E]">
                nota 0–5
              </span>
            </div>
            <p className="px-1 text-[11px] text-[#6B6659] leading-relaxed">
              Avaliação por nota de 0 a 5 em cada indicador, conforme o modelo da ANVISA — diferente do SIM/NÃO usado nos demais roteiros.
            </p>
            <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
              {roteirosRoi.map((r) => <RoteiroCard key={r.id} roteiro={r} />)}
            </div>
          </div>
        )}

        {filteredRoteiros.length === 0 && (
          <div className="bg-white border border-[#E4DFD1] rounded-lg py-16 flex flex-col items-center justify-center gap-2">
            <ClipboardList className="h-8 w-8 text-[#D8D2C0]" />
            <p className="text-xs text-[#6B6659]">Nenhum roteiro técnico encontrado</p>
          </div>
        )}

        <div className="flex items-start gap-3 bg-white border border-[#E4DFD1] rounded-lg p-4">
          <ShieldCheck className="h-4 w-4 text-[#1F7A5C] shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B6659] leading-relaxed">
            <strong className="text-[#262420]">Validade técnica:</strong> estes roteiros são ferramentas de apoio e não substituem o livre convencimento da autoridade sanitária. Sempre verifique as atualizações de resoluções da SESA e ANVISA.
          </p>
        </div>
      </div>
    </div>
  )
}

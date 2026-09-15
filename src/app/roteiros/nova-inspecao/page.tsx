
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
  Radiation,
  ScanLine,
  Stethoscope,
  Building,
  Ambulance,
  Activity,
  Star,
  Pencil,
  Check,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useCallback, useMemo, useState, type CSSProperties } from "react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { useToast } from "@/hooks/use-toast"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { useMunicipiosAtivos } from "@/hooks/use-municipios-ativos"
import { normalizeId } from "@/lib/utils"
import municipiosPR from "@/lib/municipios-pr.json"
import { roteirosCatalog } from "@/lib/roteiros/catalog"
import { darkenHex } from "@/lib/dashboard-menu-items"

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

function RoteiroCardInner({ roteiro, palette, isMunicipal, trailing }: {
  roteiro: Roteiro;
  palette: ReturnType<typeof getPalette>;
  isMunicipal: boolean;
  trailing: React.ReactNode;
}) {
  return (
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
      {trailing}
    </div>
  );
}

function RoteiroCard({ roteiro, editing, isFavorito, onToggleFavorito }: {
  roteiro: Roteiro;
  editing: boolean;
  isFavorito: boolean;
  onToggleFavorito: (id: string) => void;
}) {
  const isMunicipal = 'municipioId' in roteiro;
  const href = `/roteiros/${roteiro.id}`;
  const palette = getPalette(roteiro);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: roteiro.id,
    disabled: !editing,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const starButton = (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFavorito(roteiro.id);
      }}
      aria-label={isFavorito ? "Remover dos favoritos" : "Marcar como favorito"}
      className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 hover:bg-white/60"
    >
      <Star className={cn("h-4 w-4", isFavorito ? "fill-amber-400 text-amber-400" : "text-[#C9C2AC]")} />
    </button>
  );

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          "group flex items-center justify-between gap-4 px-4 py-3.5 cursor-grab active:cursor-grabbing select-none touch-none",
          `bg-gradient-to-r ${palette.glow}`
        )}
      >
        <RoteiroCardInner roteiro={roteiro} palette={palette} isMunicipal={isMunicipal} trailing={starButton} />
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between gap-4 px-4 py-3.5 transition-all duration-200 hover:bg-[#FAF8F3] hover:shadow-[0_2px_8px_rgba(38,36,32,0.04)]",
        `bg-gradient-to-r ${palette.glow}`
      )}
    >
      <RoteiroCardInner
        roteiro={roteiro}
        palette={palette}
        isMunicipal={isMunicipal}
        trailing={<ChevronRight className="h-4 w-4 text-[#C9C2AC] shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />}
      />
    </Link>
  );
}

/** Lista de uma seção (municipais/gerais/roi), arrastável quando `editing`. */
function RoteiroSection({ items, editing, favoritosSet, onToggleFavorito, onDragEnd }: {
  items: Roteiro[];
  editing: boolean;
  favoritosSet: Set<string>;
  onToggleFavorito: (id: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const list = (
    <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
      {items.map((r) => (
        <RoteiroCard key={r.id} roteiro={r} editing={editing} isFavorito={favoritosSet.has(r.id)} onToggleFavorito={onToggleFavorito} />
      ))}
    </div>
  );

  if (!editing) return list;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {list}
      </SortableContext>
    </DndContext>
  );
}

export default function RoteirosPage() {
  const { profile, updateProfileData } = useAuth()
  const isRoot = profile?.role === 'root'
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState(false)
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

  // Prioriza, no seletor do root, os municípios que já têm cadastro ativo —
  // sem isso, root tinha que procurar o cliente numa lista alfabética com
  // quase 400 municípios do Paraná toda vez que trocava de contexto.
  const municipiosAtivos = useMunicipiosAtivos();
  const { ativos: municipiosAtivosLista, inativos: municipiosInativosLista } = useMemo(() => {
    const ativos: string[] = [];
    const inativos: string[] = [];
    municipiosPR.forEach(m => (municipiosAtivos.has(normalizeId(m)) ? ativos : inativos).push(m));
    return { ativos, inativos };
  }, [municipiosAtivos]);

  const filteredMunicipiosPicker = useMemo(() => {
    const term = normalizeId(municipioSearchTerm);
    const aplicarFiltro = (lista: string[]) => term ? lista.filter(m => normalizeId(m).includes(term)) : lista;
    return { ativos: aplicarFiltro(municipiosAtivosLista), inativos: aplicarFiltro(municipiosInativosLista) };
  }, [municipioSearchTerm, municipiosAtivosLista, municipiosInativosLista]);

  const filteredRoteiros = roteiros
    .filter(r => !('municipioId' in r) || r.municipioId === effectiveMunicipioId)
    .filter(r =>
      r.titulo.toLowerCase().includes(search.toLowerCase()) ||
      r.categoria.toLowerCase().includes(search.toLowerCase()) ||
      r.base.toLowerCase().includes(search.toLowerCase())
    )

  // Favoritos/ordem por fiscal (ver roteirosPreferences em use-auth.tsx) —
  // mesma lógica do menu do Dashboard: favoritos sempre primeiro (na ordem
  // salva entre eles), resto depois; itens novos entram no fim do seu grupo.
  const savedOrder = profile?.roteirosPreferences?.order || [];
  const favoritosSet = useMemo(
    () => new Set(profile?.roteirosPreferences?.favoritos || []),
    [profile?.roteirosPreferences?.favoritos]
  );
  const orderedRoteiros = useMemo(() => {
    const byId = new Map(filteredRoteiros.map((r) => [r.id, r] as const));
    const known = new Set(savedOrder);
    const savedValid = savedOrder.filter((id) => byId.has(id));
    const novos = filteredRoteiros.map((r) => r.id).filter((id) => !known.has(id));
    const sequenciaCompleta = [...savedValid, ...novos];
    const favs = sequenciaCompleta.filter((id) => favoritosSet.has(id));
    const resto = sequenciaCompleta.filter((id) => !favoritosSet.has(id));
    return [...favs, ...resto].map((id) => byId.get(id)!);
  }, [filteredRoteiros, savedOrder, favoritosSet]);

  // Os 17 roteiros saíam todos de enfiada, em três blocos longos. Agora a tela
  // abre com um menu de grupos e o fiscal entra só no que interessa — mesma
  // ideia dos temas da Biblioteca.
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);

  const grupoDe = useCallback((r: Roteiro) => {
    if ('municipioId' in r) return 'municipal';
    if ('tipo' in r && r.tipo === 'roi') return 'roi';
    return ('grupo' in r && r.grupo) || 'outros';
  }, []);

  const gruposMenu = useMemo(() => {
    // Cores da mesma paleta dos cartões do Dashboard (ver dashboard-menu-items),
    // aplicadas aqui em tonalidade clara: o fundo é a cor com ~7% de opacidade,
    // o ícone com ~16%, e o texto na própria cor, escurecido. Assim cada gaveta
    // tem identidade visual sem a tela virar um mosaico saturado.
    const definicoes: { id: string; label: string; descricao: string; icone: any; cor: string }[] = [
      { id: 'favoritos', label: 'Favoritos', descricao: 'Os que você fixou com a estrela', icone: Star, cor: '#9C7A3C' },
      { id: 'municipal', label: municipioLabel ? `Exclusivos de ${municipioLabel}` : 'Do meu município', descricao: 'Roteiros próprios da vigilância municipal', icone: MapPin, cor: '#A15437' },
      { id: 'alimentos', label: 'Alimentos', descricao: 'Restaurantes, lanchonetes, mercados e congêneres', icone: UtensilsCrossed, cor: '#1F7A5C' },
      { id: 'servicos-saude', label: 'Serviços de Saúde', descricao: 'Clínicas, consultórios e odontologia', icone: Stethoscope, cor: '#2F6668' },
      { id: 'medicamentos', label: 'Medicamentos', descricao: 'Farmácias e drogarias', icone: Pill, cor: '#3D5A73' },
      { id: 'estetica', label: 'Estética e Beleza', descricao: 'Salão, barbearia, tatuagem e clínica de estética', icone: Syringe, cor: '#8A4B5C' },
      { id: 'agua', label: 'Água e Saneamento', descricao: 'Sistemas de abastecimento', icone: Building, cor: '#454680' },
      { id: 'roi', label: 'ROIs — ANVISA', descricao: 'Avaliados por nota de 0 a 5, não por SIM/NÃO', icone: Radiation, cor: '#6B4C80' },
      { id: 'outros', label: 'Outros', descricao: 'Roteiros ainda sem grupo definido', icone: ClipboardList, cor: '#524E45' },
    ];

    return definicoes
      .map((def) => ({
        ...def,
        itens: def.id === 'favoritos'
          ? orderedRoteiros.filter((r) => favoritosSet.has(r.id))
          : orderedRoteiros.filter((r) => grupoDe(r) === def.id),
      }))
      .filter((g) => g.itens.length > 0);
  }, [orderedRoteiros, favoritosSet, grupoDe, municipioLabel]);

  const grupoSelecionado = gruposMenu.find((g) => g.id === grupoAberto) || null;

  // Atalho pra retomar rascunhos movido pra cá (janela inicial) — antes só
  // existia um ícone discreto dentro de cada roteiro. useInspecoes já traz
  // as inspeções do município certo (do próprio perfil, ou do selecionado
  // pelo root); aqui só filtramos pelas do próprio fiscal, ainda em rascunho.
  const { toast } = useToast()

  const persistRoteirosPreferences = useCallback(
    (order: string[], favoritos: string[]) => {
      updateProfileData({ roteirosPreferences: { order, favoritos } }).catch(() => {
        toast({ variant: "destructive", title: "Não foi possível salvar a organização dos roteiros" });
      });
    },
    [updateProfileData, toast]
  );

  const toggleFavoritoRoteiro = useCallback(
    (id: string) => {
      const next = new Set(favoritosSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistRoteirosPreferences(orderedRoteiros.map((r) => r.id), Array.from(next));
    },
    [favoritosSet, orderedRoteiros, persistRoteirosPreferences]
  );

  // Reordena só dentro do grupo arrastado (municipais/gerais/roi), mantendo
  // os demais ids exatamente na posição em que já estavam na ordem completa
  // — funciona mesmo com os 3 grupos "intercalados" na ordem salva.
  const reordenarGrupo = useCallback(
    (groupIds: string[], activeId: string, overId: string) => {
      if (activeId === overId) return;
      const oldIdx = groupIds.indexOf(activeId);
      const newIdx = groupIds.indexOf(overId);
      if (oldIdx === -1 || newIdx === -1) return;
      const reorderedGroup = arrayMove(groupIds, oldIdx, newIdx);
      const groupSet = new Set(groupIds);
      let gi = 0;
      const novaOrdem = orderedRoteiros.map((r) => r.id).map((id) => (groupSet.has(id) ? reorderedGroup[gi++] : id));
      persistRoteirosPreferences(novaOrdem, Array.from(favoritosSet));
    },
    [orderedRoteiros, favoritosSet, persistRoteirosPreferences]
  );

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        backHref="/roteiros"
        title="Roteiros de Inspeção"
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
                  {filteredMunicipiosPicker.ativos.length === 0 && filteredMunicipiosPicker.inativos.length === 0 && (
                    <CommandEmpty className="p-4 text-center text-xs text-[#A39D8C] font-medium">Não encontrado.</CommandEmpty>
                  )}
                  <CommandGroup>
                    <div
                      onClick={() => { setSelectedMunicipioForRoot(""); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                      className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm text-[#0E4A44] border-b border-[#F1EEE4]"
                    >
                      Nenhum (só roteiros globais)
                    </div>
                    {filteredMunicipiosPicker.ativos.length > 0 && (
                      <>
                        <p className="px-4 pt-2.5 pb-1 text-[10px] font-black uppercase tracking-widest text-primary/70">Com cadastro ativo</p>
                        {filteredMunicipiosPicker.ativos.map((m) => (
                          <div
                            key={m}
                            onClick={() => { setSelectedMunicipioForRoot(m); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                            className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm border-b border-[#F1EEE4] last:border-0"
                          >
                            {m}
                          </div>
                        ))}
                      </>
                    )}
                    {filteredMunicipiosPicker.inativos.length > 0 && (
                      <>
                        <p className="px-4 pt-2.5 pb-1 text-[10px] font-black uppercase tracking-widest text-[#A39D8C]">Demais municípios</p>
                        {filteredMunicipiosPicker.inativos.map((m) => (
                          <div
                            key={m}
                            onClick={() => { setSelectedMunicipioForRoot(m); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                            className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm border-b border-[#F1EEE4] last:border-0"
                          >
                            {m}
                          </div>
                        ))}
                      </>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : undefined}
      />

      <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
            <Input
              placeholder="Buscar roteiro por atividade, categoria ou lei..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setEditing(false); }}
              className="pl-9 h-10 rounded-md border-[#E4DFD1] bg-white text-sm"
            />
          </div>
          {!search && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="shrink-0 h-10 flex items-center gap-1.5 px-3 text-xs font-medium text-[#0E4A44] hover:text-[#0B3A35] transition-colors whitespace-nowrap"
            >
              {editing ? (<><Check className="h-3.5 w-3.5" /> Concluir</>) : (<><Pencil className="h-3.5 w-3.5" /> Organizar</>)}
            </button>
          )}
        </div>
        {editing && (
          <p className="px-1 text-[11px] text-[#A39D8C]">
            Arraste para reordenar dentro de cada grupo. Toque na estrela para fixar um favorito no topo.
          </p>
        )}

        {/* Busca ignora os grupos: quem digita quer o roteiro, não a gaveta. */}
        {search ? (
          <RoteiroSection
            items={orderedRoteiros}
            editing={false}
            favoritosSet={favoritosSet}
            onToggleFavorito={toggleFavoritoRoteiro}
            onDragEnd={() => {}}
          />
        ) : grupoSelecionado ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => { setGrupoAberto(null); setEditing(false); }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Todos os grupos
            </button>

            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">
              <grupoSelecionado.icone className="h-3.5 w-3.5" />
              {grupoSelecionado.label}
            </h2>

            {grupoSelecionado.id === 'roi' && (
              <p className="px-1 text-[11px] text-[#6B6659] leading-relaxed">
                Avaliação por nota de 0 a 5 em cada indicador, conforme o modelo da ANVISA — diferente do SIM/NÃO usado nos demais roteiros.
              </p>
            )}

            <RoteiroSection
              items={grupoSelecionado.itens}
              editing={editing}
              favoritosSet={favoritosSet}
              onToggleFavorito={toggleFavoritoRoteiro}
              onDragEnd={(event) => {
                const { active, over } = event;
                if (!over) return;
                reordenarGrupo(grupoSelecionado.itens.map((r) => r.id), String(active.id), String(over.id));
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {gruposMenu.map((grupo) => (
              <button
                key={grupo.id}
                type="button"
                onClick={() => setGrupoAberto(grupo.id)}
                style={{
                  // Variáveis CSS em vez de classes fixas: a cor vem do dado, e
                  // o Tailwind só precisa saber que existe um hover.
                  ['--tom' as any]: `${grupo.cor}12`,
                  ['--tom-hover' as any]: `${grupo.cor}22`,
                  ['--tom-icone' as any]: `${grupo.cor}29`,
                  ['--tom-borda' as any]: `${grupo.cor}33`,
                  ['--tom-texto' as any]: darkenHex(grupo.cor, 34),
                }}
                className="group w-full flex items-center gap-4 rounded-xl border border-[var(--tom-borda)] bg-[var(--tom)] px-4 py-4 text-left transition-all duration-200 hover:bg-[var(--tom-hover)] hover:shadow-[0_6px_18px_-10px_rgba(38,36,32,0.35)] active:scale-[0.99]"
              >
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-[var(--tom-icone)] text-[var(--tom-texto)]">
                  <grupo.icone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-serif font-bold text-[17px] leading-snug text-[var(--tom-texto)]">{grupo.label}</p>
                    <span className="rounded-full bg-[var(--tom-icone)] px-2 py-[2px] text-[11px] font-bold tabular-nums leading-none text-[var(--tom-texto)]">
                      {grupo.itens.length}
                    </span>
                  </div>
                  {/* Mesma regra dos outros menus: a explicação só aparece ao
                      passar o mouse ou encostar na tela. */}
                  <p className="text-xs text-[#6B6659] leading-snug mt-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100">
                    {grupo.descricao}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[var(--tom-texto)] opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            ))}
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

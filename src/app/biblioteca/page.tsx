"use client"

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Search,
  BookOpen,
  Loader2,
  ArrowLeft,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Highlighter,
  Building2,
  ChevronsUpDown,
  Landmark,
  ShieldCheck,
  Stethoscope,
  FileText,
  Scale,
  UtensilsCrossed,
  Pill,
  FlaskConical,
  Sparkles,
  Wrench,
  Scissors,
  Baby,
  Hotel,
  Flower2,
  Recycle,
  Wheat,
  Bug,
  Radiation,
  Folder,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn, normalizeId } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { LegislacaoDocumento } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { useBiblioteca } from "@/hooks/use-biblioteca"
import { parseLegalText, splitMarkerLead, buildTableOfContents, type LegalParagraph } from "@/lib/format-legal-text"
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
import municipiosPR from "@/lib/municipios-pr.json"

function BibliotecaJuridicaConteudo() {
  const { profile } = useAuth();
  const isRoot = profile?.role === 'root';
  const [municipioPickerOpen, setMunicipioPickerOpen] = useState(false);
  const [municipioSearchTerm, setMunicipioSearchTerm] = useState("");
  const [selectedMunicipioForRoot, setSelectedMunicipioForRoot] = useState("");

  // Pro root, o município efetivo vem do seletor (só acervo geral até
  // escolher um); pros demais papéis, vem sempre do próprio perfil — mesmo
  // padrão já usado em Documentos/Configurações/Suporte/Roteiros.
  const effectiveMunicipioId = isRoot
    ? (selectedMunicipioForRoot ? normalizeId(selectedMunicipioForRoot) : undefined)
    : profile?.municipioId ? normalizeId(profile.municipioId) : undefined;

  const filteredMunicipiosPicker = useMemo(() => {
    const term = normalizeId(municipioSearchTerm);
    if (!term) return municipiosPR;
    return municipiosPR.filter(m => normalizeId(m).includes(term));
  }, [municipioSearchTerm]);

  // Este hook agora gerencia o carregamento de documentos locais (public/docs)
  // + o acervo próprio do município selecionado (se existir).
  const { documents, loading, error, loadingMessage } = useBiblioteca(effectiveMunicipioId);
  const { toast } = useToast();

  const [search, setSearch] = useState("")

  const [viewingDoc, setViewingDoc] = useState<LegislacaoDocumento | null>(null)

  const normalizeText = (text: string) => 
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  const filteredResults = useMemo(() => {
    const term = normalizeText(search)
    return documents.filter(doc => {
      return !term ||
        normalizeText(doc.titulo).includes(term) ||
        normalizeText(doc.descricao || "").includes(term) ||
        normalizeText(doc.keywords || "").includes(term) ||
        normalizeText(doc.categoria).includes(term)
    })
  }, [documents, search])

  // Pastas por TEMA (assunto/ramo de atividade) — eixo de organização
  // diferente do antigo agrupamento por tipo de norma (Federal/Estadual/RDC/
  // Resolução). "Normas Gerais e Institucionais" recebe os códigos-base
  // (Estadual/Municipal) e normas cuja descrição não aponta um ramo
  // específico — nunca fica sem pasta, mesmo um documento sem `tema`
  // cadastrado (ver LegislacaoDocumento em src/lib/types.ts).
  const TEMA_ORDER = [
    'Normas Gerais e Institucionais',
    'Alimentos e Bebidas',
    'Farmácias e Medicamentos',
    'Laboratórios e Serviços de Diagnóstico',
    'Serviços de Saúde (Assistência)',
    'Cosméticos, Perfumaria, Higiene e Saneantes',
    'Produtos e Equipamentos para Saúde',
    'Estética, Beleza e Bem-estar',
    'Educação Infantil',
    'Hospedagem e Turismo',
    'Serviços Funerários',
    'Saneamento, Resíduos e Meio Ambiente',
    'Produtos Agropecuários e Veterinária',
    'Controle de Pragas e Desinfestação',
    'Radiação Ionizante e Produtos Químicos de Uso em Saúde',
  ] as const;
  type Tema = typeof TEMA_ORDER[number];

  const temaOf = (doc: LegislacaoDocumento): Tema =>
    (TEMA_ORDER as readonly string[]).includes(doc.tema || '') ? (doc.tema as Tema) : 'Normas Gerais e Institucionais';

  // Pasta selecionada na navegação (2º nível) — null = mostrando a grade de
  // pastas (1º nível). Uma busca ativa ignora as pastas e mostra tudo junto,
  // então volta pra grade sozinha quando o campo de busca é limpo de novo.
  // A PASTA ABERTA MORA NA URL (/biblioteca?pasta=Alimentos...), não num
  // useState. Antes era estado interno: entrar numa pasta não criava passo
  // nenhum no histórico, então o "voltar" — do cabeçalho, do navegador ou do
  // botão físico do Android — pulava a Biblioteca inteira e caía na
  // dashboard. Com a pasta no endereço, voltar devolve ao rol de pastas, e
  // de quebra a pasta pode ser recarregada e compartilhada por link.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedTema = (searchParams.get("pasta") as Tema | null) || null;

  const setSelectedTema = useCallback((tema: Tema | null) => {
    // `push` (e não `replace`) é o que cria o passo de histórico — é dele
    // que o voltar depende.
    router.push(tema ? `${pathname}?pasta=${encodeURIComponent(tema)}` : pathname);
  }, [router, pathname]);
  const isSearching = search.trim().length > 0;

  // Contagem por pasta sempre a partir do acervo completo (não filtrado pela
  // busca) — os cartões de pasta não devem "sumir/mudar de número" enquanto
  // o fiscal digita, já que a busca substitui a navegação por pasta, não a
  // complementa.
  const docsByTema = useMemo(() => {
    const groups = {} as Record<Tema, LegislacaoDocumento[]>;
    TEMA_ORDER.forEach((t) => { groups[t] = []; });
    for (const doc of documents) groups[temaOf(doc)].push(doc);
    for (const docs of Object.values(groups)) docs.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    return groups;
  }, [documents]);

  const groupedResults = useMemo(() => {
    const groups = {} as Record<Tema, LegislacaoDocumento[]>;
    TEMA_ORDER.forEach((t) => { groups[t] = []; });
    for (const doc of filteredResults) groups[temaOf(doc)].push(doc);
    for (const docs of Object.values(groups)) docs.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    return TEMA_ORDER
      .filter((t) => groups[t].length > 0)
      .filter((t) => isSearching || selectedTema === null || t === selectedTema)
      .map((t) => ({ nome: t, docs: groups[t] }));
  }, [filteredResults, isSearching, selectedTema])

  const temaIcon = (tema: Tema) => ({
    'Normas Gerais e Institucionais': Landmark,
    'Alimentos e Bebidas': UtensilsCrossed,
    'Farmácias e Medicamentos': Pill,
    'Laboratórios e Serviços de Diagnóstico': FlaskConical,
    'Serviços de Saúde (Assistência)': Stethoscope,
    'Cosméticos, Perfumaria, Higiene e Saneantes': Sparkles,
    'Produtos e Equipamentos para Saúde': Wrench,
    'Estética, Beleza e Bem-estar': Scissors,
    'Educação Infantil': Baby,
    'Hospedagem e Turismo': Hotel,
    'Serviços Funerários': Flower2,
    'Saneamento, Resíduos e Meio Ambiente': Recycle,
    'Produtos Agropecuários e Veterinária': Wheat,
    'Controle de Pragas e Desinfestação': Bug,
    'Radiação Ionizante e Produtos Químicos de Uso em Saúde': Radiation,
  } as Record<Tema, typeof BookOpen>)[tema];

  const paletteByGroup: Record<string, { icon: string; badge: string; chip: string; glow: string }> = {
    'Normas Gerais e Institucionais': {
      icon: 'bg-gradient-to-br from-stone-100 via-stone-200 to-stone-300 text-stone-800 border border-stone-200 shadow-sm',
      badge: 'bg-stone-100 text-stone-700 border border-stone-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-stone-50/80 to-white',
    },
    'Alimentos e Bebidas': {
      icon: 'bg-gradient-to-br from-emerald-100 via-emerald-200 to-emerald-300 text-emerald-800 border border-emerald-200 shadow-sm',
      badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-emerald-50/80 to-white',
    },
    'Farmácias e Medicamentos': {
      icon: 'bg-gradient-to-br from-sky-100 via-sky-200 to-sky-300 text-sky-800 border border-sky-200 shadow-sm',
      badge: 'bg-sky-50 text-sky-700 border border-sky-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-sky-50/80 to-white',
    },
    'Laboratórios e Serviços de Diagnóstico': {
      icon: 'bg-gradient-to-br from-cyan-100 via-cyan-200 to-cyan-300 text-cyan-800 border border-cyan-200 shadow-sm',
      badge: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-cyan-50/80 to-white',
    },
    'Serviços de Saúde (Assistência)': {
      icon: 'bg-gradient-to-br from-violet-100 via-violet-200 to-violet-300 text-violet-800 border border-violet-200 shadow-sm',
      badge: 'bg-violet-50 text-violet-700 border border-violet-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-violet-50/80 to-white',
    },
    'Cosméticos, Perfumaria, Higiene e Saneantes': {
      icon: 'bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 text-pink-800 border border-pink-200 shadow-sm',
      badge: 'bg-pink-50 text-pink-700 border border-pink-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-pink-50/80 to-white',
    },
    'Produtos e Equipamentos para Saúde': {
      icon: 'bg-gradient-to-br from-indigo-100 via-indigo-200 to-indigo-300 text-indigo-800 border border-indigo-200 shadow-sm',
      badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-indigo-50/80 to-white',
    },
    'Estética, Beleza e Bem-estar': {
      icon: 'bg-gradient-to-br from-fuchsia-100 via-fuchsia-200 to-fuchsia-300 text-fuchsia-800 border border-fuchsia-200 shadow-sm',
      badge: 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-fuchsia-50/80 to-white',
    },
    'Educação Infantil': {
      icon: 'bg-gradient-to-br from-yellow-100 via-yellow-200 to-yellow-300 text-yellow-800 border border-yellow-200 shadow-sm',
      badge: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-yellow-50/80 to-white',
    },
    'Hospedagem e Turismo': {
      icon: 'bg-gradient-to-br from-orange-100 via-orange-200 to-orange-300 text-orange-800 border border-orange-200 shadow-sm',
      badge: 'bg-orange-50 text-orange-700 border border-orange-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-orange-50/80 to-white',
    },
    'Serviços Funerários': {
      icon: 'bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 text-slate-800 border border-slate-200 shadow-sm',
      badge: 'bg-slate-100 text-slate-700 border border-slate-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-slate-50/80 to-white',
    },
    'Saneamento, Resíduos e Meio Ambiente': {
      icon: 'bg-gradient-to-br from-teal-100 via-teal-200 to-teal-300 text-teal-800 border border-teal-200 shadow-sm',
      badge: 'bg-teal-50 text-teal-700 border border-teal-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-teal-50/80 to-white',
    },
    'Produtos Agropecuários e Veterinária': {
      icon: 'bg-gradient-to-br from-lime-100 via-lime-200 to-lime-300 text-lime-800 border border-lime-200 shadow-sm',
      badge: 'bg-lime-50 text-lime-700 border border-lime-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-lime-50/80 to-white',
    },
    'Controle de Pragas e Desinfestação': {
      icon: 'bg-gradient-to-br from-rose-100 via-rose-200 to-rose-300 text-rose-800 border border-rose-200 shadow-sm',
      badge: 'bg-rose-50 text-rose-700 border border-rose-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-rose-50/80 to-white',
    },
    'Radiação Ionizante e Produtos Químicos de Uso em Saúde': {
      icon: 'bg-gradient-to-br from-amber-100 via-amber-200 to-amber-300 text-amber-800 border border-amber-200 shadow-sm',
      badge: 'bg-amber-50 text-amber-700 border border-amber-200',
      chip: 'bg-white text-slate-600 border border-slate-200',
      glow: 'from-amber-50/80 to-white',
    },
  };

  const getSubjectIcon = (doc: LegislacaoDocumento) => {
    const haystack = `${doc.titulo} ${doc.descricao} ${doc.categoria} ${doc.keywords || ""}`.toLowerCase();

    if (/(saude|sanidade|higiene|cl ednica|clinica|hospital|farmacia|medica|m e9dica|laborat|veterin|veterinaria)/i.test(haystack)) {
      return Stethoscope;
    }
    if (/(alimenta|restaurante|supermerc|mercado|padaria|laticinio|bebida|cozinha|comercio)/i.test(haystack)) {
      return UtensilsCrossed;
    }
    if (/(resolu|portaria|norma|decreto|ato|instru|manual|orienta)/i.test(haystack)) {
      return FileText;
    }
    if (/(municipal|prefeit|lei municipal|c e2mara|edital|municipio)/i.test(haystack)) {
      return Building2;
    }
    if (/(estadual|estado|lei estadual|secretaria estadual|governo)/i.test(haystack)) {
      return Scale;
    }
    if (/(federal|uni e3o|federa|lei federal|ministerio|ag eancia|anvisa)/i.test(haystack)) {
      return Landmark;
    }
    if (/(seguran|controle|sanitaria|licen|inspec|vigilancia|patologia)/i.test(haystack)) {
      return ShieldCheck;
    }
    return BookOpen;
  };

  // --- INÍCIO: Lógica para segmentar (capítulo/seção/artigo/parágrafo/inciso)
  // e destacar buscas no documento, em vez de exibir um bloco único de texto ---
  const [docSearch, setDocSearch] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const legalParagraphs = useMemo(
    () => parseLegalText(viewingDoc?.conteudoIntegral || ""),
    [viewingDoc?.conteudoIntegral]
  );

  const tableOfContents = useMemo(() => buildTableOfContents(legalParagraphs), [legalParagraphs]);

  // Ao abrir um documento novo, decide se o sumário já vem expandido
  // (documentos curtos) ou recolhido (leis grandes, tipo o Código Sanitário).
  useEffect(() => {
    setIsTocOpen(tableOfContents.length > 0 && tableOfContents.length <= 10);
    setCurrentMatchIndex(0);
    setCurrentPage(1);
    if (contentRef.current) contentRef.current.scrollLeft = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingDoc?.id]);

  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const escapedSearch = docSearch.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const matchCount = useMemo(() => {
    if (!escapedSearch) return 0;
    const regex = new RegExp(escapedSearch, "gi");
    return legalParagraphs.reduce((total, p) => total + (p.text.match(regex) || []).length, 0);
  }, [legalParagraphs, escapedSearch]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [docSearch]);

  // --- Leitura paginada (folha por folha) via colunas CSS: o texto flui em
  // colunas com a largura exata do contêiner (column-width: 100%), então
  // "página N" é só rolar horizontalmente N vezes a largura do contêiner —
  // mesma técnica usada por leitores web de EPUB, preserva seleção/cópia
  // nativa de texto sem precisar de paginação manual em JS. ---
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const recomputePages = useCallback(() => {
    const el = contentRef.current;
    if (!el || el.clientWidth === 0) return;
    const pages = Math.max(1, Math.round(el.scrollWidth / el.clientWidth));
    setTotalPages(pages);
    setCurrentPage((p) => Math.min(p, pages));
  }, []);

  useEffect(() => {
    const t = setTimeout(recomputePages, 50);
    return () => clearTimeout(t);
  }, [legalParagraphs, recomputePages]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => recomputePages());
    observer.observe(el);
    return () => observer.disconnect();
  }, [recomputePages]);

  const goToPage = useCallback((page: number) => {
    const el = contentRef.current;
    if (!el) return;
    const clamped = Math.max(1, Math.min(page, totalPages));
    el.scrollTo({ left: (clamped - 1) * el.clientWidth, behavior: "smooth" });
    setCurrentPage(clamped);
  }, [totalPages]);

  // Acha em qual "página" (coluna) um elemento caiu e rola até ela — usado
  // tanto pelo sumário quanto pela navegação de busca. Antes calculava a
  // posição na mão (getBoundingClientRect do elemento menos a do
  // container, mais scrollLeft) pra achar o índice da página e chamar
  // goToPage — mas isso fica fora de sincronia sempre que o layout em
  // colunas ainda não estabilizou (fonte carregando, troca de município
  // trocando o texto, etc.), fazendo os botões ▲/▼ parecerem não fazer
  // nada. scrollIntoView deixa o próprio navegador calcular a posição real
  // após o layout, e o listener de scroll abaixo mantém currentPage
  // sincronizado com onde a rolagem realmente parou, não importa a causa.
  const scrollToElement = useCallback((el: HTMLElement | null) => {
    if (!el || !contentRef.current) return;
    el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, []);

  // Mantém currentPage correto após QUALQUER rolagem horizontal do
  // conteúdo (botões de página, sumário ou navegação de busca), em vez de
  // cada chamador ter que acertar o número da página na mão.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let raf = 0;
    const handleScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (el.clientWidth === 0) return;
        const page = Math.round(el.scrollLeft / el.clientWidth) + 1;
        setCurrentPage((p) => (p === page ? p : page));
      });
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(raf);
    };
  }, [legalParagraphs]);

  useEffect(() => {
    if (!escapedSearch || matchCount === 0) return;
    scrollToElement(document.getElementById(`match-${currentMatchIndex}`));
  }, [currentMatchIndex, escapedSearch, matchCount, scrollToElement]);

  const goToMatch = (delta: number) => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((i) => (i + delta + matchCount) % matchCount);
  };

  // Contador de ocorrências atravessando todos os parágrafos, pra que cada
  // <mark> receba um id sequencial (match-0, match-1...) e dê pra navegar
  // entre eles com os botões ▲/▼, sem precisar guardar isso em estado.
  let matchCounter = 0;
  const highlightHtml = (text: string): string => {
    const escaped = escapeHtml(text);
    if (!escapedSearch) return escaped;
    const regex = new RegExp(`(${escapedSearch})`, "gi");
    return escaped.replace(regex, (match) => {
      const idx = matchCounter++;
      const isCurrent = idx === currentMatchIndex;
      return `<mark id="match-${idx}" class="${isCurrent ? "text-[#1F1B16] underline decoration-[1.5px] decoration-neutral-500 underline-offset-2" : "text-[#1F1B16] underline decoration-[1px] decoration-neutral-300 underline-offset-2"}">${match}</mark>`;
    });
  };

  const handleSublinhar = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      toast({ variant: "destructive", title: "Selecione um trecho de texto primeiro" });
      return;
    }
    const range = selection.getRangeAt(0);
    if (!contentRef.current || !contentRef.current.contains(range.commonAncestorContainer)) {
      toast({ variant: "destructive", title: "Selecione um trecho dentro do documento" });
      return;
    }
    const mark = document.createElement("mark");
    mark.className = "bg-amber-200 rounded px-0.5";
    try {
      range.surroundContents(mark);
      selection.removeAllRanges();
    } catch {
      toast({ variant: "destructive", title: "Selecione um trecho dentro do mesmo parágrafo" });
    }
  };
  // --- FIM ---

  const paragraphClassName: Record<LegalParagraph["type"], string> = {
    capitulo: "mt-10 mb-2 text-center text-[13pt] font-bold uppercase tracking-wide text-[#262420] first:mt-0",
    secao: "mt-8 mb-2 text-center text-[11pt] font-bold uppercase tracking-wide text-[#3D3A34]",
    subsecao: "mt-6 mb-2 text-center text-[10pt] font-semibold uppercase tracking-wide text-[#6B6659]",
    artigo: "mt-4 text-justify leading-relaxed",
    paragrafo: "mt-3 pl-6 text-justify leading-relaxed",
    inciso: "mt-2 pl-6 text-justify leading-relaxed",
    alinea: "mt-1 pl-12 text-justify leading-relaxed",
    texto: "mt-3 text-justify leading-relaxed",
  };

  if (viewingDoc) {
    return (
      <div className="min-h-screen bg-[#F5F2EA] font-sans">
        <div className="max-w-6xl mx-auto w-full p-4 sm:p-8">
          <div className="bg-white rounded-lg border border-[#E4DFD1] shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between gap-4 px-6 sm:px-10 py-5 border-b border-[#F1EEE4]">
                  <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-[#E4EEEC] text-[#0E4A44] border-none font-medium text-[10px] px-2 uppercase">{viewingDoc.esfera}</Badge>
                          <span className="text-[10px] uppercase text-[#A39D8C] tracking-widest">{viewingDoc.categoria}</span>
                      </div>
                      <h1 className="font-serif text-xl sm:text-2xl text-[#262420] leading-tight truncate">{viewingDoc.titulo}</h1>
                  </div>
                  <Button onClick={() => setViewingDoc(null)} variant="ghost" size="sm" className="h-9 rounded-md px-3 text-xs font-medium text-[#6B6659] hover:bg-[#F5F2EA] gap-1.5 shrink-0 no-print">
                      <ArrowLeft className="h-4 w-4" /> Voltar
                  </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 px-6 sm:px-10 py-3 border-b border-[#F1EEE4] bg-[#FAF8F3] no-print">
                  <div className="relative flex-1 min-w-[220px] max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
                      <Input
                          placeholder="Localizar no texto..."
                          value={docSearch}
                          onChange={(e) => { setDocSearch(e.target.value); }}
                          className="pl-9 pr-20 h-9 rounded-md border-[#E4DFD1] bg-white text-sm"
                      />
                      {docSearch && matchCount > 0 && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                              <span className="text-xs text-[#A39D8C] mr-1 tabular-nums">{currentMatchIndex + 1}/{matchCount}</span>
                              <button type="button" onClick={() => goToMatch(-1)} className="h-6 w-6 rounded hover:bg-[#E4EEEC] flex items-center justify-center text-[#6B6659]">
                                  <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => goToMatch(1)} className="h-6 w-6 rounded hover:bg-[#E4EEEC] flex items-center justify-center text-[#6B6659]">
                                  <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                          </div>
                      )}
                      {docSearch && matchCount === 0 && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#C9C2AC]">0 resultados</span>
                      )}
                  </div>
                  <Button onClick={handleSublinhar} variant="outline" size="sm" className="h-9 rounded-md text-xs font-medium gap-1.5 border-[#E4DFD1] bg-white text-[#9C7A3C] hover:bg-[#F1E9D6] shrink-0">
                      <Highlighter className="h-4 w-4" /> Sublinhar
                  </Button>
                  {tableOfContents.length > 0 && (
                      <button
                          type="button"
                          onClick={() => setIsTocOpen((v) => !v)}
                          className="flex items-center gap-1.5 h-9 rounded-md px-3 text-xs font-medium border border-[#E4DFD1] bg-white text-[#6B6659] hover:bg-[#F5F2EA] shrink-0"
                      >
                          <ListTree className="h-4 w-4" /> Sumário ({tableOfContents.length})
                          {isTocOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                  )}
              </div>

              {isTocOpen && tableOfContents.length > 0 && (
                  <nav className="px-6 sm:px-10 py-4 border-b border-[#F1EEE4] max-h-[240px] overflow-y-auto custom-scrollbar space-y-1 no-print">
                      {tableOfContents.map((entry) => (
                          <button
                              type="button"
                              key={entry.id}
                              onClick={() => scrollToElement(document.getElementById(entry.id))}
                              className={cn(
                                  "block w-full text-left rounded-md px-3 py-1.5 text-xs font-medium hover:bg-[#F1E9D6] hover:text-[#9C7A3C] transition-colors",
                                  entry.level === "capitulo" ? "text-[#262420] uppercase tracking-wide" : "text-[#6B6659] pl-6"
                              )}
                          >
                              {entry.label}
                          </button>
                      ))}
                  </nav>
              )}

              {legalParagraphs.length > 0 ? (
                  <div
                      ref={contentRef}
                      className="px-6 sm:px-14 py-10 bg-white overflow-x-hidden"
                      style={{ height: "62vh", minHeight: 420, columnWidth: "100%", columnGap: 0 }}
                  >
                      <div className="text-[#262420] font-serif text-[11pt] sm:text-[12pt] selection:bg-[#E4EEEC]">
                          {legalParagraphs.map((paragraph, i) => {
                              const { lead, rest } = splitMarkerLead(paragraph);
                              const isHeading = paragraph.type === 'capitulo' || paragraph.type === 'secao';
                              return (
                                  <p key={i} id={isHeading ? `legal-heading-${i}` : undefined} className={paragraphClassName[paragraph.type]}>
                                      {lead && (
                                          <strong dangerouslySetInnerHTML={{ __html: highlightHtml(lead) }} />
                                      )}
                                      {lead && rest ? " " : ""}
                                      <span dangerouslySetInnerHTML={{ __html: highlightHtml(rest) }} />
                                  </p>
                              );
                          })}
                      </div>
                  </div>
              ) : (
                  <div className="py-40 flex flex-col items-center justify-center text-center gap-6">
                      <div className="p-8 rounded-full bg-[#F5F2EA]">
                          <BookOpen className="h-16 w-16 text-[#D8D2C0]" />
                      </div>
                      <p className="text-xs font-medium text-[#A39D8C] uppercase tracking-widest">Conteúdo não cadastrado</p>
                  </div>
              )}

              <footer className="flex items-center justify-between gap-4 px-6 sm:px-10 py-3 border-t border-[#F1EEE4] bg-[#FAF8F3] no-print">
                  <button
                      type="button"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] disabled:opacity-30 disabled:pointer-events-none"
                  >
                      <ChevronLeft className="h-4 w-4" /> Página anterior
                  </button>
                  <span className="text-xs text-[#A39D8C] tabular-nums">Página {currentPage} de {totalPages}</span>
                  <button
                      type="button"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] disabled:opacity-30 disabled:pointer-events-none"
                  >
                      Próxima página <ChevronRight className="h-4 w-4" />
                  </button>
              </footer>

              {viewingDoc.pdfUrl && (
                  <div className="px-6 sm:px-10 py-3 border-t border-[#F1EEE4] flex justify-end no-print">
                      <Button asChild variant="ghost" size="sm" className="h-8 rounded-md text-xs font-medium text-[#0E4A44] hover:bg-[#E4EEEC] gap-1.5">
                          <a href={viewingDoc.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3.5 w-3.5" /> Baixar PDF original
                          </a>
                      </Button>
                  </div>
              )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        title="Biblioteca Jurídica"
        subtitle={isRoot ? (selectedMunicipioForRoot || "Todos os municípios") : "Legislação e normas aplicáveis"}
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
                      Nenhum (só acervo geral)
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

      <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
          <Input
              placeholder="Pesquise por tema ou palavra-chave..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-md border-[#E4DFD1] bg-white text-sm"
          />
        </div>

        {!isSearching && selectedTema && (
          <button
            type="button"
            onClick={() => setSelectedTema(null)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Todas as pastas
          </button>
        )}
      </div>

      {error && (
        <div className="col-span-full py-16 flex flex-col items-center justify-center text-center gap-4 bg-rose-50 border border-rose-200 rounded-lg">
            <h3 className="text-sm font-semibold text-rose-800">⚠️ Erro 404: Arquivo Não Encontrado</h3>
            <p className="font-mono text-xs text-rose-700 bg-rose-100 p-3 rounded-md max-w-3xl">{error}</p>
            <div className="text-left mt-2 p-5 bg-zinc-900 text-white rounded-lg max-w-3xl w-full">
              <p className="font-mono text-xs text-zinc-300"><span className="text-yellow-400">COMO RESOLVER:</span><br/>O servidor não encontrou um arquivo essencial. Garanta que sua estrutura de pastas seja esta:</p>
              <pre className="mt-3 text-xs text-zinc-400 bg-zinc-950 p-3 rounded-md overflow-x-auto">
                {`SeuProjeto/
└── public/
    ├── documentos-biblioteca/
    │   ├── manifest.json  <-- O erro provavelmente está aqui
    │   └── seu-arquivo.pdf
    └── pdf.worker.min.js`}
              </pre>
            </div>
        </div>
      )}

      {loading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-[#0E4A44]" />
              <p className="text-sm text-[#6B6659]">{loadingMessage}</p>
          </div>
      ) : !isSearching && selectedTema === null ? (
          <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
            {TEMA_ORDER.map((tema) => {
                const count = docsByTema[tema]?.length || 0;
                const palette = paletteByGroup[tema];
                const TemaIcon = temaIcon(tema) || Folder;
                const vazio = count === 0;
                return (
                  <button
                    key={tema}
                    type="button"
                    disabled={vazio}
                    onClick={() => setSelectedTema(tema)}
                    className={cn(
                      "group w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left transition-all duration-200",
                      vazio ? "opacity-50 cursor-not-allowed" : cn("hover:bg-[#FAF8F3]", `bg-gradient-to-r ${palette.glow}`)
                    )}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-4">
                      <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200", !vazio && "group-hover:scale-[1.02]", vazio ? "bg-[#EDE9DB] text-[#A39D8C]" : palette.icon)}>
                        <TemaIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-serif text-[15px] text-[#262420] leading-snug">{tema}</p>
                        <span className={cn("inline-block mt-1 text-[11px] font-semibold rounded-md px-2 py-0.5", vazio ? "bg-[#EDE9DB] text-[#A39D8C]" : palette.badge)}>
                          {count} {count === 1 ? 'documento' : 'documentos'}
                        </span>
                      </div>
                    </div>
                    {!vazio && <ChevronRight className="h-4 w-4 text-[#C9C2AC] shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />}
                  </button>
                );
            })}
          </div>
      ) : (
          <div className="space-y-8">
            {groupedResults.map((group) => {
                const palette = paletteByGroup[group.nome] ?? paletteByGroup['Normas Gerais e Institucionais'];
                return (
                  <div key={group.nome} className="space-y-2">
                    <h2 className={cn("flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide", palette.badge)}>{group.nome}</h2>
                    <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
                        {group.docs.map((doc) => {
                            const SubjectIcon = getSubjectIcon(doc);
                            return (
                              <button
                                  key={doc.id}
                                  type="button"
                                  onClick={() => setViewingDoc(doc)}
                                  className={cn(
                                      "group flex items-center justify-between gap-4 px-4 py-3 text-left transition-all duration-200 hover:bg-[#F5F5F4] hover:shadow-[0_2px_8px_rgba(38,36,32,0.02)]",
                                      `bg-gradient-to-r ${palette.glow}`
                                  )}
                              >
                                  <div className="min-w-0 flex-1 flex items-center gap-4">
                                      <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-[1.02]", palette.icon)}>
                                          <SubjectIcon className="h-5 w-5" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                          <p className="font-serif text-[15px] text-[#262420] leading-snug line-clamp-2">{doc.titulo}</p>
                                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                              <span className={cn("text-[11px] font-semibold rounded-md px-2 py-0.5", palette.badge)}>{doc.esfera}</span>
                                              <span className={cn("text-[11px] rounded-md px-2 py-0.5 font-medium", palette.chip)}>{doc.categoria}</span>
                                          </div>
                                      </div>
                                  </div>
                                  <Search className="h-4 w-4 shrink-0 text-[#A1A1AA] transition-transform duration-200 group-hover:translate-x-0.5" />
                              </button>
                            );
                        })}
                    </div>
                  </div>
                );
            })}

            {groupedResults.length === 0 && !loading && !error && (
                <div className="py-32 flex flex-col items-center justify-center">
                    <Button
                      onClick={() => { setSearch(""); setSelectedTema(null); }}
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-md px-4 text-xs font-medium border-[#E4DFD1] bg-white text-[#0E4A44] hover:bg-[#E4EEEC]"
                    >
                        Limpar Filtros
                    </Button>
                </div>
            )}
          </div>
      )}
      </div>
    </div>
  )
}

/**
 * useSearchParams() precisa de um limite de Suspense no App Router — sem ele
 * o build acusa e a rota inteira perde a pré-renderização.
 */
export default function BibliotecaJuridicaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#6B6659]">Abrindo a biblioteca...</div>}>
      <BibliotecaJuridicaConteudo />
    </Suspense>
  )
}

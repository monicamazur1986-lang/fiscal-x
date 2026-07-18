"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
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

export default function BibliotecaJuridicaPage() {
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

  // Agrupa por tipo de norma/esfera (município e RDC/Resolução têm prioridade
  // sobre a esfera genérica, já que são o que mais importa pra localizar o
  // documento certo) e ordena cada grupo em ordem alfabética.
  const GROUP_ORDER = ['Federal', 'Estadual', 'RDC', 'Resolução', 'Município', 'Outros'] as const;
  const groupOf = (doc: LegislacaoDocumento): typeof GROUP_ORDER[number] => {
    if (doc.esfera === "municipal") return "Município";
    const cat = normalizeText(doc.categoria || "");
    if (cat.includes("rdc")) return "RDC";
    if (cat.includes("resolu")) return "Resolução";
    if (doc.esfera === "federal") return "Federal";
    if (doc.esfera === "estadual") return "Estadual";
    return "Outros";
  };

  const [groupFilter, setGroupFilter] = useState<typeof GROUP_ORDER[number] | 'Todas'>('Todas');

  const groupedResults = useMemo(() => {
    const groups: Partial<Record<typeof GROUP_ORDER[number], LegislacaoDocumento[]>> = {};
    for (const doc of filteredResults) {
      const g = groupOf(doc);
      (groups[g] ||= []).push(doc);
    }
    for (const docs of Object.values(groups)) {
      docs?.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    }
    return GROUP_ORDER
      .filter((g) => groups[g]?.length)
      .filter((g) => groupFilter === 'Todas' || g === groupFilter)
      .map((g) => ({ nome: g, docs: groups[g]! }));
  }, [filteredResults, groupFilter])

  // Só oferece como chip de filtro os grupos que de fato têm documento —
  // "Município" some sozinho se o município do usuário ainda não tem
  // legislação local cadastrada.
  const availableGroups = useMemo(() => {
    const present = new Set<typeof GROUP_ORDER[number]>();
    for (const doc of filteredResults) present.add(groupOf(doc));
    return GROUP_ORDER.filter((g) => present.has(g));
  }, [filteredResults])

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
  // tanto pelo sumário quanto pela navegação de busca, no lugar de
  // scrollIntoView (que não entende colunas CSS, só rolagem vertical normal).
  const scrollToElement = useCallback((el: HTMLElement | null) => {
    const container = contentRef.current;
    if (!el || !container || container.clientWidth === 0) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const absoluteX = elRect.left - containerRect.left + container.scrollLeft;
    const pageIndex = Math.floor(absoluteX / container.clientWidth) + 1;
    goToPage(pageIndex);
  }, [goToPage]);

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
      return `<mark id="match-${idx}" class="${isCurrent ? "bg-orange-400" : "bg-yellow-300"} px-1 rounded">${match}</mark>`;
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
        <div className="max-w-4xl mx-auto w-full p-4 sm:p-8">
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
        backHref="/dashboard"
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

      <div className="max-w-4xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
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

        <div className="flex flex-wrap gap-1 p-1 bg-[#EDE9DB] rounded-md w-fit">
            <button onClick={() => setGroupFilter('Todas')} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", groupFilter === 'Todas' ? "bg-white text-[#0E4A44] shadow-sm" : "text-[#6B6659]")}>Todas</button>
            {availableGroups.map((g) => (
                <button key={g} onClick={() => setGroupFilter(g)} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", groupFilter === g ? "bg-white text-[#0E4A44] shadow-sm" : "text-[#6B6659]")}>{g}</button>
            ))}
        </div>
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
      ) : (
          <div className="space-y-8">
            {groupedResults.map((group) => (
                <div key={group.nome} className="space-y-2">
                    <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">{group.nome}</h2>
                    <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
                        {group.docs.map((doc) => (
                            <button
                                key={doc.id}
                                type="button"
                                onClick={() => setViewingDoc(doc)}
                                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[#FAF8F3] transition-colors"
                            >
                                <span className="font-serif text-[15px] text-[#262420] truncate">{doc.titulo}</span>
                                <Search className="h-4 w-4 shrink-0 text-[#C9C2AC]" />
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {groupedResults.length === 0 && !loading && !error && (
                <div className="py-32 flex flex-col items-center justify-center">
                    <Button
                      onClick={() => { setSearch(""); setGroupFilter('Todas'); }}
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
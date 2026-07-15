"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import {
  Library,
  Search,
  BookOpen,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  ArrowLeft,
  Download,
  ChevronUp,
  ChevronDown,
  ListTree,
  Highlighter
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { LegislacaoDocumento } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"
import { BackButton } from "@/components/back-button"
import { useBiblioteca } from "@/hooks/use-biblioteca"
import { parseLegalText, splitMarkerLead, buildTableOfContents, type LegalParagraph } from "@/lib/format-legal-text"

export default function BibliotecaJuridicaPage() {
  const { profile } = useAuth();
  // Este hook agora gerencia o carregamento de documentos locais (public/docs)
  // + o acervo próprio do município do usuário logado (se existir).
  const { documents, loading, error, loadingMessage } = useBiblioteca(profile?.municipioId);
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

  useEffect(() => {
    if (!escapedSearch || matchCount === 0) return;
    document.getElementById(`match-${currentMatchIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentMatchIndex, escapedSearch, matchCount]);

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
    capitulo: "mt-10 mb-2 text-center text-[13pt] font-black uppercase tracking-wide text-slate-900 first:mt-0",
    secao: "mt-8 mb-2 text-center text-[11pt] font-black uppercase tracking-wide text-slate-700",
    subsecao: "mt-6 mb-2 text-center text-[10pt] font-bold uppercase tracking-wide text-slate-600",
    artigo: "mt-4 text-justify leading-relaxed",
    paragrafo: "mt-3 pl-6 text-justify leading-relaxed",
    inciso: "mt-2 pl-6 text-justify leading-relaxed",
    alinea: "mt-1 pl-12 text-justify leading-relaxed",
    texto: "mt-3 text-justify leading-relaxed",
  };

  if (viewingDoc) {
    return (
      <div className="max-w-4xl mx-auto w-full p-4 sm:p-8 space-y-8 font-sans pb-40">
        <div className="fixed bottom-0 left-0 right-0 z-[100] no-print px-4 pb-4 pt-3 bg-white/90 backdrop-blur-xl border-t border-zinc-200 shadow-[0_-25px_50px_rgba(0,0,0,0.15)]">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3">
            <Button onClick={() => setViewingDoc(null)} variant="ghost" className="rounded-xl h-11 px-4 font-black uppercase text-[10px] text-zinc-400 gap-2 shrink-0">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Localizar no texto..."
                value={docSearch}
                onChange={(e) => { setDocSearch(e.target.value); }}
                className="pl-10 pr-24 h-11 rounded-xl border-zinc-200 bg-slate-50 focus-visible:ring-primary/20"
              />
              {docSearch && matchCount > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <span className="text-[10px] font-bold text-slate-500 mr-1">{currentMatchIndex + 1}/{matchCount}</span>
                  <button type="button" onClick={() => goToMatch(-1)} className="h-6 w-6 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-500">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => goToMatch(1)} className="h-6 w-6 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-500">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {docSearch && matchCount === 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">0 resultados</span>
              )}
            </div>
            <Button onClick={handleSublinhar} variant="outline" className="h-11 rounded-xl font-black uppercase text-[10px] gap-2 border-zinc-200 bg-white shrink-0">
              <Highlighter className="h-4 w-4" /> Sublinhar
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden min-h-[70vh] flex flex-col">
            <div className="p-8 sm:p-12 bg-slate-900 text-white space-y-4">
                <div className="flex items-center gap-3">
                    <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 uppercase">{viewingDoc.esfera}</Badge>
                    <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">{viewingDoc.categoria}</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black uppercase italic tracking-tighter leading-[0.9]">{viewingDoc.titulo}</h1>
                <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-2xl">{viewingDoc.descricao}</p>
            </div>

            {tableOfContents.length > 0 && (
                <div className="border-b border-slate-100 no-print">
                    <button
                        type="button"
                        onClick={() => setIsTocOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-8 sm:px-14 py-4 text-left hover:bg-slate-50 transition-colors"
                    >
                        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <ListTree className="h-4 w-4" /> Sumário ({tableOfContents.length})
                        </span>
                        {isTocOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    {isTocOpen && (
                        <nav className="px-8 sm:px-14 pb-6 max-h-[320px] overflow-y-auto custom-scrollbar space-y-1">
                            {tableOfContents.map((entry) => (
                                <button
                                    type="button"
                                    key={entry.id}
                                    onClick={() => document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                                    className={cn(
                                        "block w-full text-left rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wide hover:bg-primary/10 hover:text-primary transition-colors",
                                        entry.level === "capitulo" ? "text-slate-800" : "text-slate-500 pl-6"
                                    )}
                                >
                                    {entry.label}
                                </button>
                            ))}
                        </nav>
                    )}
                </div>
            )}

            <div ref={contentRef} className="flex-1 p-8 sm:p-14 bg-white prose prose-slate max-w-none">
                {legalParagraphs.length > 0 ? (
                    <div className="text-slate-800 font-serif text-[11pt] sm:text-[12pt] selection:bg-primary/20">
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
                ) : (
                    <div className="py-40 flex flex-col items-center justify-center text-center gap-6">
                        <div className="p-8 rounded-full bg-slate-50">
                            <BookOpen className="h-16 w-16 text-slate-200" />
                        </div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Conteúdo não cadastrado</p>
                    </div>
                )}
            </div>

            <footer className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                 <div className="flex items-center justify-between gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Atualizado em {new Date(viewingDoc.updatedAt).toLocaleDateString()}</span>
                 </div>
                 {viewingDoc.pdfUrl && ( // Agora o pdfUrl vem do manifest
                     <Button asChild variant="ghost" className="h-12 px-6 rounded-xl font-black uppercase text-[9px] tracking-widest text-primary gap-2">
                         <a href={viewingDoc.pdfUrl} target="_blank" rel="noopener noreferrer">
                         <Download className="h-4 w-4" /> Baixar PDF
                         </a>
                     </Button>
                 )}
            </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-10 font-sans pb-40">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl menu-satin-rose text-white shadow-xl">
                <Library className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Biblioteca Jurídica</h1>
        </div>

        <BackButton href="/dashboard" />
      </header>

      <div className="space-y-6">
        <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] p-4 flex items-center shadow-xl shadow-slate-200/40">
            <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input 
                placeholder="Pesquise por tema ou palavra-chave..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 h-14 rounded-2xl border-none bg-slate-50 text-slate-900 placeholder:text-slate-400 font-bold text-sm focus-visible:ring-primary/10 shadow-inner" 
            />
            </div>
        </div>

        <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit">
            <button onClick={() => setGroupFilter('Todas')} className={cn("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", groupFilter === 'Todas' ? "bg-white text-primary shadow-sm" : "text-slate-500")}>Todas</button>
            {availableGroups.map((g) => (
                <button key={g} onClick={() => setGroupFilter(g)} className={cn("px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", groupFilter === g ? "bg-white text-primary shadow-sm" : "text-slate-500")}>{g}</button>
            ))}
        </div>
      </div>

      {error && (
        <div className="col-span-full py-20 flex flex-col items-center justify-center text-center gap-4 bg-rose-50 border-2 border-rose-200 rounded-3xl">
            <h3 className="text-lg font-black text-rose-800">⚠️ Erro 404: Arquivo Não Encontrado</h3>
            <p className="font-mono text-sm text-rose-700 bg-rose-100 p-4 rounded-lg max-w-3xl">{error}</p>
            <div className="text-left mt-4 p-6 bg-slate-800 text-white rounded-2xl max-w-3xl w-full">
              <p className="font-mono text-xs text-slate-300"><span className="text-yellow-400">COMO RESOLVER:</span><br/>O servidor não encontrou um arquivo essencial. Garanta que sua estrutura de pastas seja esta:</p>
              <pre className="mt-4 text-xs text-slate-400 bg-slate-900 p-4 rounded-lg overflow-x-auto">
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
          <div className="py-40 flex flex-col items-center justify-center gap-6">
              <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
              <p className="text-sm font-bold text-slate-500">{loadingMessage}</p>
          </div>
      ) : (
          <div className="space-y-10">
            {groupedResults.map((group) => (
                <div key={group.nome} className="space-y-2">
                    <h2 className="px-2 text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">{group.nome}</h2>
                    <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                        {group.docs.map((doc) => (
                            <button
                                key={doc.id}
                                type="button"
                                onClick={() => setViewingDoc(doc)}
                                className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50 transition-colors"
                            >
                                <span className="text-sm font-semibold text-slate-800 truncate">{doc.titulo}</span>
                                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {groupedResults.length === 0 && !loading && !error && (
                <div className="py-40 flex flex-col items-center justify-center">
                    <Button
                      onClick={() => { setSearch(""); setGroupFilter('Todas'); }}
                      variant="outline"
                      className="rounded-full h-12 px-8 font-black uppercase text-[10px] tracking-widest border-primary text-primary hover:bg-primary/5 shadow-sm"
                    >
                        Limpar Filtros
                    </Button>
                </div>
            )}
          </div>
      )}
    </div>
  )
}
"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Library,
  Search,
  ShieldCheck,
  Home,
  BookOpen,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Eye,
  ArrowLeft,
  Download,  
  MessageSquarePlus,
  HelpCircle
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { LegislacaoDocumento } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useBiblioteca } from "@/hooks/use-biblioteca"

export default function BibliotecaJuridicaPage() {
  // Este hook agora gerencia o carregamento de documentos locais (public/docs)
  const { documents, loading, error, loadingMessage } = useBiblioteca();

  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<'all' | 'local' | 'state' | 'federal'>('all')

  const [viewingDoc, setViewingDoc] = useState<LegislacaoDocumento | null>(null)
  const [isSupportOpen, setIsSupportOpen] = useState(false)

  const normalizeText = (text: string) => 
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  const filteredResults = useMemo(() => {
    const term = normalizeText(search)
    return documents.filter(doc => {
      const matchesSearch = !term || 
        normalizeText(doc.titulo).includes(term) || 
        normalizeText(doc.descricao || "").includes(term) ||
        normalizeText(doc.keywords || "").includes(term) ||
        normalizeText(doc.categoria).includes(term)
      
      const matchesTab = activeTab === 'all' || 
        (activeTab === 'local' && doc.esfera === 'municipal') ||
        (activeTab === 'state' && doc.esfera === 'estadual') ||
        (activeTab === 'federal' && doc.esfera === 'federal')
      
      return matchesSearch && matchesTab
    })
  }, [documents, search, activeTab])

  // --- INÍCIO: Lógica para busca e destaque no documento ---
  const [docSearch, setDocSearch] = useState("");

  const highlightedContent = useMemo(() => {
    if (!viewingDoc?.conteudoIntegral) return { __html: "" };
    const sanitizedContent = viewingDoc.conteudoIntegral.replace(/\n/g, '<br />');

    if (!docSearch) {
      return { __html: sanitizedContent };
    }

    // Usando regex para encontrar e destacar o texto, ignorando maiúsculas/minúsculas
    const regex = new RegExp(`(${docSearch})`, 'gi');
    const highlighted = sanitizedContent.replace(regex, `<mark class="bg-yellow-300 px-1 rounded">$1</mark>`);
    
    return { __html: highlighted };
  }, [viewingDoc?.conteudoIntegral, docSearch]);

  const matchCount = useMemo(() => {
    if (!viewingDoc?.conteudoIntegral || !docSearch) return 0;
    const regex = new RegExp(docSearch, 'gi');
    return (viewingDoc.conteudoIntegral.match(regex) || []).length;
  }, [viewingDoc?.conteudoIntegral, docSearch]);
  // --- FIM: Lógica para busca e destaque no documento ---

  if (viewingDoc) {
    return (
      <div className="max-w-4xl mx-auto w-full p-4 sm:p-8 space-y-8 font-sans pb-40">
        <header className="flex items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-[2.5rem] border border-slate-200 shadow-xl no-print">
          <Button onClick={() => setViewingDoc(null)} variant="ghost" className="rounded-xl h-11 px-4 font-black uppercase text-[10px] text-zinc-400 gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="relative flex-grow max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Localizar no texto..."
              value={docSearch}
              onChange={(e) => { setDocSearch(e.target.value); }}
              className="pl-10 h-11 rounded-xl border-zinc-200 bg-slate-50 focus-visible:ring-primary/20"
            />
            {docSearch && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                {matchCount} {matchCount === 1 ? 'resultado' : 'resultados'}
              </span>
            )}
          </div>
        </header>
        
        <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden min-h-[70vh] flex flex-col">
            <div className="p-8 sm:p-12 bg-slate-900 text-white space-y-4">
                <div className="flex items-center gap-3">
                    <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 uppercase">{viewingDoc.esfera}</Badge>
                    <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">{viewingDoc.categoria}</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black uppercase italic tracking-tighter leading-[0.9]">{viewingDoc.titulo}</h1>
                <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-2xl">{viewingDoc.descricao}</p>
            </div>
            
            <div className="flex-1 p-8 sm:p-14 bg-white prose prose-slate max-w-none">
                {viewingDoc.conteudoIntegral && viewingDoc.conteudoIntegral.trim() ? (
                    <div 
                        className="text-slate-800 leading-relaxed font-serif text-[12pt] sm:text-[13pt] text-justify whitespace-pre-wrap selection:bg-primary/20"
                        dangerouslySetInnerHTML={highlightedContent}
                    />
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
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl menu-satin-rose text-white shadow-xl">
                <Library className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Biblioteca Jurídica</h1>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] ml-1">Repositório Técnico Digital</p>
        </div>

        <div className="flex items-center gap-3">
            <Button onClick={() => setIsSupportOpen(true)} variant="outline" className="h-12 rounded-2xl bg-white text-zinc-600 border-zinc-200 font-black uppercase text-[10px] tracking-widest gap-2 shadow-sm hover:bg-zinc-50 active:scale-95 transition-all">
                <MessageSquarePlus className="h-4 w-4 text-primary" /> Solicitar Inclusão
            </Button>

            <Button asChild variant="outline" className="h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest gap-2 border-zinc-200 text-zinc-500 hover:bg-zinc-50 shadow-sm">
                <Link href="/dashboard"><Home className="h-4 w-4" /> Início</Link>
            </Button>
        </div>
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
            <button onClick={() => setActiveTab('all')} className={cn("px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'all' ? "bg-white text-primary shadow-sm" : "text-slate-500")}>Tudo</button>
            <button onClick={() => setActiveTab('state')} className={cn("px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'state' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500")}>Estadual</button>
            <button onClick={() => setActiveTab('federal')} className={cn("px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'federal' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}>Federal</button>
            <button onClick={() => setActiveTab('local')} className={cn("px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'local' ? "bg-white text-amber-600 shadow-sm" : "text-slate-500")}>Municipal</button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredResults.map((doc) => (
                <Card key={doc.id} className="rounded-[3rem] border-slate-100 shadow-sm hover:shadow-2xl transition-all overflow-hidden group border-2 flex flex-col">
                    <div className={cn(
                        "p-8 border-b space-y-4",
                        doc.esfera === 'municipal' ? "bg-amber-50" : doc.esfera === 'estadual' ? "bg-emerald-50" : "bg-blue-50"
                    )}>
                        <div className="flex items-center justify-between">
                            <div className={cn(
                                "h-14 w-14 rounded-3xl bg-white shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform",
                                doc.esfera === 'municipal' ? "text-amber-600" : doc.esfera === 'estadual' ? "text-emerald-600" : "text-blue-600"
                            )}>
                                <ShieldCheck className="h-7 w-7" />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{doc.titulo}</h3>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge className="bg-slate-900 text-white border-none text-[7px] font-black px-2 uppercase">{doc.esfera}</Badge>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{doc.categoria}</span>
                            </div>
                        </div>
                    </div>
                    
                    <CardContent className="p-8 space-y-6 flex-1 flex flex-col justify-between">
                        <p className="text-[11px] font-medium text-slate-500 leading-relaxed line-clamp-3">
                            {doc.descricao}
                        </p>
                        
                        <div className="space-y-3 pt-6 border-t border-slate-50">
                            <Button onClick={() => setViewingDoc(doc)} className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-widest gap-2 shadow-lg active:scale-95 transition-all">
                                <Eye className="h-4 w-4" /> Abrir Texto Integral
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}

            {filteredResults.length === 0 && !loading && !error && (
                <div className="col-span-full py-40 flex flex-col items-center justify-center">
                    <Button 
                      onClick={() => { setSearch(""); setActiveTab('all'); }} 
                      variant="outline" 
                      className="rounded-full h-12 px-8 font-black uppercase text-[10px] tracking-widest border-primary text-primary hover:bg-primary/5 shadow-sm"
                    >
                        Limpar Filtros
                    </Button>
                </div>
            )}
          </div>
      )}

      {/* DIALOG DE SUPORTE (NON-ROOT) */}
      <Dialog open={isSupportOpen} onOpenChange={setIsSupportOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-0 overflow-hidden bg-white">
            <DialogHeader className="p-8 bg-slate-900 text-white">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-primary/20 text-primary">
                        <HelpCircle className="h-6 w-6" />
                    </div>
                    <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Solicitar Inclusão</DialogTitle>
                </div>
            </DialogHeader>
            <div className="p-8 space-y-6">
                <p className="text-[12px] font-bold text-slate-500 leading-relaxed text-center">
                    Faltou alguma RDC ou Lei essencial? Informe ao Auditor Master através do Mural de Recados.
                </p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="h-8 w-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary font-black text-xs">1</div>
                        <p className="text-[10px] font-black uppercase text-slate-600 mt-1">Acesse o <span className="text-primary">Mural de Recados</span>.</p>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="h-8 w-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary font-black text-xs">2</div>
                        <p className="text-[10px] font-black uppercase text-slate-600 mt-1">Publique com o título "SUGESTÃO DE ACERVO".</p>
                    </div>
                </div>
            </div>
            <DialogFooter className="p-8 bg-zinc-50 border-t border-zinc-100">
                <Button asChild className="w-full h-14 rounded-2xl bg-primary font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">
                    <Link href="/recados">Ir para Mural de Recados</Link>
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
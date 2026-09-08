"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Sparkles, Loader2, Check, Trash2, FileText, Ban, PackageSearch, AlertOctagon, Scale, BookOpen, Mic, MicOff, AlertCircle, X, Gavel, ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { generateIntimacaoDraft, type MatchedArticle } from "@/ai/flows/generate-intimacao-draft"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { useAuth } from "@/hooks/use-auth"
import { getBaseLawOptions, getIndividualLawOptions, toggleLawPreference as toggleLawPreferenceValue, searchLegislacao, buildFundamentacaoFromArticles, type LawPreference } from "@/lib/legal-search"

interface Props {
  onApply: (text: string, fundamentacao?: string) => void;
}

type ReportType = 'intimação' | 'infração' | 'apreensão' | 'interdição';

// Ícone de cada opção "Geral" — as opções em si vêm de getBaseLawOptions
// (mesma fonte usada em gerar-rascunho.tsx), que já sabe que só
// Prudentópolis tem código municipal cadastrado.
const lawOptionIcons: Record<string, typeof BookOpen> = {
  estadual: BookOpen,
  municipal: Gavel,
  todas: Scale,
};

export function AssistenteIAFormDialog({ onApply }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [caseDescription, setCaseDescription] = useState("")
  const [reportType, setReportType] = useState<ReportType>('intimação')
  const [lawPreferences, setLawPreferences] = useState<LawPreference[]>(['estadual'])
  const [draft, setDraft] = useState("")
  const [fundamentacao, setFundamentacao] = useState("")
  const [matchedArticles, setMatchedArticles] = useState<MatchedArticle[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUppercase, setIsUppercase] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isLegalMenuOpen, setIsLegalMenuOpen] = useState(false)
  const [addArticleQuery, setAddArticleQuery] = useState("")

  const recognitionRef = useRef<any>(null)
  const { profile } = useAuth()

  const lawOptions = getBaseLawOptions(profile?.municipioId)
  const individualLawOptions = getIndividualLawOptions(profile?.municipioId)

  // Fiscal pode corrigir a fundamentação que a IA sugeriu — remover um artigo
  // que não se aplica, ou adicionar um que ela deixou passar (mesmo padrão de
  // gerar-rascunho.tsx).
  const addArticleResults = useMemo(() => {
    if (addArticleQuery.trim().length < 3) return [];
    return searchLegislacao(addArticleQuery, { pref: lawPreferences, municipioId: profile?.municipioId || undefined, limit: 6 })
      .filter((a) => !matchedArticles.some((m) => m.id === a.id));
  }, [addArticleQuery, lawPreferences, profile?.municipioId, matchedArticles]);

  const removerArtigoFundamentacao = (id: string) => {
    setMatchedArticles((prev) => {
      const next = prev.filter((a) => a.id !== id);
      setFundamentacao(buildFundamentacaoFromArticles(next));
      return next;
    });
  };

  const adicionarArtigoFundamentacao = (artigo: ReturnType<typeof searchLegislacao>[number]) => {
    setMatchedArticles((prev) => {
      const next = [...prev, { id: artigo.id, label: artigo.label, lawTitle: artigo.lawTitle, texto: artigo.texto }];
      setFundamentacao(buildFundamentacaoFromArticles(next));
      return next;
    });
    setAddArticleQuery("");
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'pt-BR'

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          }
        }
        if (finalTranscript) {
          setCaseDescription(prev => (prev ? prev + ' ' : '') + finalTranscript)
        }
      }

      recognitionRef.current.onerror = () => setIsRecording(false)
      recognitionRef.current.onend = () => setIsRecording(false)
    }
  }, [])

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
    } else {
      if (!recognitionRef.current) return
      recognitionRef.current.start()
      setIsRecording(true)
    }
  }

  const toggleLawPreference = (value: LawPreference) => {
    setLawPreferences(prev => toggleLawPreferenceValue(prev, value));
  };

  const handleGenerate = async () => {
    if (!caseDescription.trim()) return;
    setIsLoading(true)
    setError(null)
    setDraft("")
    setFundamentacao("")
    setMatchedArticles([])
    try {
      // uid do fiscal logado: sem ele, resolverMunicipioId() (em
      // generate-intimacao-draft.ts) não descobre o município de quem está
      // gerando o texto, e "Código Municipal" nunca encontrava nenhum artigo
      // — a busca sempre restringe legislação municipal ao município do uid.
      const result = await generateIntimacaoDraft({ caseDescription, reportType, lawPreference: lawPreferences, useCloudAI: false, uid: profile?.uid || '' })
      if (result.error) {
        setError(result.error)
      } else {
        setDraft(result.draftIntimacao)
        setFundamentacao(result.fundamentacaoSugerida || "")
        setMatchedArticles(result.matchedArticles || [])
      }
    } catch (err) {
      setError("FALHA DE CONEXÃO: Verifique sua chave de API ou conexão com a internet.")
    } finally {
      setIsLoading(false)
    }
  }

  const legalSelectionSummary = (() => {
    if (lawPreferences.length === 0) return 'Selecionar base legal...';
    if (lawPreferences.includes('todas')) return 'Todo o banco de dados';
    if (lawPreferences.length === 1) {
      const match = lawOptions.find((opt) => opt.id === lawPreferences[0]);
      if (match) return match.label;
      const lawMatch = individualLawOptions.find((opt) => opt.id === lawPreferences[0]);
      if (lawMatch) return lawMatch.label;
      return 'Base legal selecionada';
    }
    return `${lawPreferences.length} bases selecionadas`;
  })();

  const handleApply = () => {
    const finalContent = isUppercase ? (draft || "").toUpperCase() : draft;
    onApply(finalContent, fundamentacao);
    setIsOpen(false);
    setDraft("");
    setFundamentacao("");
    setMatchedArticles([]);
    setCaseDescription("");
    setError(null);
  }

  const types = [
    { id: 'intimação', label: 'Intimação', icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-100/40', borderColor: 'border-blue-600' },
    { id: 'infração', label: 'Infração', icon: AlertOctagon, color: 'text-red-600', bgColor: 'bg-red-100/40', borderColor: 'border-red-600' },
    { id: 'apreensão', label: 'Apreensão', icon: PackageSearch, color: 'text-amber-600', bgColor: 'bg-amber-100/40', borderColor: 'border-amber-600' },
    { id: 'interdição', label: 'Interdição', icon: Ban, color: 'text-rose-600', bgColor: 'bg-rose-100/40', borderColor: 'border-rose-600' },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="no-print h-9 gap-1.5 px-4 rounded-xl font-black text-[9px] uppercase tracking-widest menu-metallic-violet text-white shadow-lg shadow-violet-500/20 active:scale-95 transition-all">
          <Sparkles className="h-4 w-4" />
          Fiscal AI
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl rounded-[2rem] p-0 overflow-visible border-none shadow-2xl bg-white">
        <DialogHeader className="bg-zinc-900 text-white p-6 sm:p-8 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-primary/20 text-primary"><Sparkles className="h-6 w-6" /></div>
              <div>
                <DialogTitle className="font-serif text-xl">Fiscal AI</DialogTitle>
                <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Texto técnico e enquadramento legal</DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label htmlFor="ia-case-mode" className="text-[10px] font-medium text-zinc-400">Caixa alta</Label>
              <Switch id="ia-case-mode" checked={isUppercase} onCheckedChange={setIsUppercase} className="data-[state=checked]:bg-primary" />
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5 bg-zinc-50 max-h-[65vh] overflow-y-auto custom-scrollbar">
          {error && (
            <Alert variant="destructive" className="bg-rose-50 border-rose-100 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 relative">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold text-rose-700">Não foi possível gerar o texto</AlertTitle>
              <AlertDescription className="text-xs text-rose-600/90 leading-relaxed">
                {error}
              </AlertDescription>
              <button onClick={() => setError(null)} className="absolute top-3 right-3 p-1 hover:bg-rose-100 rounded-full transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </Alert>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-700">Natureza do documento</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {types.map((t) => (
                <button key={t.id} type="button" onClick={() => setReportType(t.id as ReportType)} className={cn("flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-all", reportType === t.id ? `${t.bgColor} ${t.borderColor}` : "bg-white border-zinc-200 text-zinc-400 hover:border-zinc-300")}>
                  <t.icon className={cn("h-5 w-5", reportType === t.id ? t.color : "text-zinc-300")} />
                  <span className={cn("text-[10px] font-medium", reportType === t.id ? "text-zinc-900" : "text-zinc-400")}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><Gavel className="h-3.5 w-3.5 text-zinc-400" /> Base legal</Label>
            {/* Popover em vez de uma div "absolute" solta: o corpo do diálogo
                logo abaixo tem overflow-y-auto (pra rolar o formulário
                inteiro), o que cortava/rolava o menu antes de mostrar as
                últimas opções — o Popover do Radix renderiza o conteúdo num
                portal, fora dessa área rolável, então nada mais corta o menu. */}
            <Popover open={isLegalMenuOpen} onOpenChange={setIsLegalMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:border-primary/50"
                >
                  <span className="truncate">{legalSelectionSummary}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', isLegalMenuOpen && 'rotate-180')} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] p-2 rounded-xl border-zinc-200 shadow-[0_20px_50px_rgba(0,0,0,0.18)] max-h-[45vh] overflow-y-auto custom-scrollbar overscroll-contain"
              >
                <div className="space-y-2">
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Base padrão</div>
                  {lawOptions.map((opt) => {
                    const selected = lawPreferences.includes(opt.id as LawPreference);
                    const OptIcon = lawOptionIcons[opt.id] || Scale;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleLawPreference(opt.id as LawPreference)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors',
                          selected ? 'border-primary bg-primary/5 text-primary' : 'border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50'
                        )}
                      >
                        <span className="flex items-center gap-2"><OptIcon className="h-3.5 w-3.5" />{opt.label}</span>
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    );
                  })}

                  <div className="my-1 h-px bg-zinc-200" />

                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Legislação opcional (biblioteca)</div>
                  <div className="space-y-1 pr-1">
                    {individualLawOptions.map((opt) => {
                      const selected = lawPreferences.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleLawPreference(opt.id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors',
                            selected ? 'border-primary bg-primary/5 text-primary' : 'border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50'
                          )}
                        >
                          <div className="flex flex-col">
                            <span>{opt.label}</span>
                            <span className="text-[10px] text-zinc-400">{opt.group}</span>
                          </div>
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-zinc-200 sticky bottom-0 bg-white">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsLegalMenuOpen(false)}
                    className="w-full h-9 rounded-lg text-xs font-semibold"
                  >
                    Selecionar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-700">Relato de campo</Label>
              <Button type="button" onClick={toggleRecording} variant="ghost" size="sm" className={cn("h-7 gap-1.5 px-3 rounded-lg text-xs font-medium transition-all", isRecording ? "bg-red-500 text-white animate-pulse" : "bg-zinc-100 text-zinc-500")}>
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {isRecording ? "Parar" : "Ditar por voz"}
              </Button>
            </div>
            <Textarea
                placeholder="Descreva os fatos encontrados ou use o ditado por voz..."
                value={caseDescription}
                onChange={(e) => {
                    setCaseDescription(e.target.value);
                    if (error) setError(null);
                }}
                className="bg-white border-zinc-200 focus:border-primary/40 rounded-xl min-h-[110px] text-sm resize-none focus-visible:ring-0"
                disabled={isLoading}
            />
          </div>

          {isLoading && <div className="space-y-3 animate-pulse"><div className="h-11 bg-zinc-200 rounded-xl" /><div className="h-24 bg-zinc-200 rounded-xl" /></div>}

          {draft && !isLoading && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
              {fundamentacao && (
                <div className="bg-slate-900 p-4 rounded-xl text-white border-l-4 border-l-primary">
                   <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-1">Enquadramento detectado</p>
                   <p className="text-sm font-medium leading-snug">{fundamentacao}</p>
                   <Popover>
                       <PopoverTrigger asChild>
                           <button type="button" className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
                               <BookOpen className="h-3.5 w-3.5" /> Conferir e ajustar base legal ({matchedArticles.length})
                           </button>
                       </PopoverTrigger>
                       <PopoverContent align="start" className="w-[min(26rem,90vw)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0 bg-white border-zinc-200 rounded-xl shadow-xl">
                           <div className="p-4 space-y-3">
                               <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Base usada na fundamentação</p>
                               {matchedArticles.length === 0 && (
                                   <p className="text-xs text-zinc-400 italic">Nenhum artigo selecionado — busque abaixo pra adicionar.</p>
                               )}
                               {matchedArticles.map((art) => (
                                   <div key={art.id} className="border border-zinc-100 rounded-lg p-3 space-y-1 bg-zinc-50/60 relative">
                                       <button
                                           type="button"
                                           onClick={() => removerArtigoFundamentacao(art.id)}
                                           aria-label={`Remover ${art.label} da fundamentação`}
                                           className="absolute right-2 top-2 h-5 w-5 flex items-center justify-center text-zinc-300 hover:text-rose-500 transition-colors"
                                       >
                                           <X className="h-3.5 w-3.5" />
                                       </button>
                                       <p className="text-[10px] font-semibold uppercase text-primary tracking-wide pr-6">{art.lawTitle}</p>
                                       <p className="text-xs font-semibold text-zinc-700">{art.label}</p>
                                       <p className="text-xs text-zinc-600 leading-relaxed">{art.texto}</p>
                                   </div>
                               ))}

                               <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                                   <Input
                                       value={addArticleQuery}
                                       onChange={(e) => setAddArticleQuery(e.target.value)}
                                       placeholder="Buscar outro artigo pra adicionar..."
                                       className="h-8 text-xs"
                                   />
                                   {addArticleQuery.trim().length >= 3 && (
                                       addArticleResults.length === 0 ? (
                                           <p className="text-[11px] text-zinc-400 px-1">Nenhum artigo encontrado.</p>
                                       ) : (
                                           <div className="max-h-40 overflow-y-auto space-y-1">
                                               {addArticleResults.map((a) => (
                                                   <button
                                                       key={a.id}
                                                       type="button"
                                                       onClick={() => adicionarArtigoFundamentacao(a)}
                                                       className="w-full text-left flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
                                                   >
                                                       <span className="truncate"><strong>{a.label}</strong> — {a.lawTitle}</span>
                                                       <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                                                   </button>
                                               ))}
                                           </div>
                                       )
                                   )}
                               </div>
                           </div>
                       </PopoverContent>
                   </Popover>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Redação técnica sugerida</Label>
                <div className="bg-white p-4 rounded-xl text-zinc-800 text-sm leading-relaxed border border-zinc-200">
                  <p className="whitespace-pre-wrap">{isUppercase ? draft.toUpperCase() : draft}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-5 bg-white border-t border-zinc-100 gap-3">
          <Button variant="ghost" onClick={() => { setDraft(""); setFundamentacao(""); setCaseDescription(""); setError(null); }} className="flex-1 h-11 rounded-xl font-medium text-zinc-500 hover:text-rose-500 hover:bg-rose-50">
            <Trash2 className="h-4 w-4 mr-2" /> Limpar
          </Button>
          {!draft || isLoading ? (
            <Button onClick={handleGenerate} disabled={isLoading || !caseDescription.trim()} className="flex-[2] h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold gap-2">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</> : <><Sparkles className="h-4 w-4" /> Gerar texto</>}
            </Button>
          ) : (
            <Button onClick={handleApply} className="flex-[2] h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2"><Check className="h-4 w-4" /> Aplicar no documento</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
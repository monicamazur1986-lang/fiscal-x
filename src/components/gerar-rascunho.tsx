"use client"

import { useState, useRef, useEffect } from "react"
import { 
  Loader2, 
  Sparkles, 
  Check, 
  ArrowLeft, 
  FileText, 
  Ban, 
  PackageSearch, 
  AlertOctagon, 
  Scale, 
  BookOpen, 
  Mic, 
  MicOff, 
  AlertCircle, 
  X,
  FileCheck,
  Type,
  AlertTriangle,
  Wand2,
  Gavel,
  Timer,
  Copy,
  Trash2,
  ChevronRight,
  Info,
  Cpu,
  Cloud,
  RotateCcw,
  Eraser,
  MessageSquareWarning
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { generateIntimacaoDraft } from "@/ai/flows/generate-intimacao-draft"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useBiblioteca } from "@/hooks/use-biblioteca"
import { Badge } from "@/components/ui/badge"

type ReportType = 'intimação' | 'infração' | 'apreensão' | 'interdição';
type LawPreference = 'todas' | 'municipal' | 'estadual';

interface GerarRascunhoProps {
  caseDescription: string;
  setCaseDescription: (value: string) => void;
}

export function GerarRascunho({ caseDescription, setCaseDescription }: GerarRascunhoProps) {
  const [reportType, setReportType] = useState<ReportType>('intimação')
  const [lawPreference, setLawPreference] = useState<LawPreference>('todas')
  const [useCloudAI, setUseCloudAI] = useState(false)
  
  const [draft, setDraft] = useState("")
  const [fundamentacao, setFundamentacao] = useState("")
  const [engine, setEngine] = useState<'local' | 'cloud' | null>(null)
  
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isUppercase, setIsUppercase] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [coolDown, setCoolDown] = useState(0)
  
  const router = useRouter()
  const { toast } = useToast()
  const { documentos, loading: loadingBiblioteca } = useBiblioteca(lawPreference)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setError(null);
    setCoolDown(0);
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'pt-BR'
      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript
        }
        if (finalTranscript) {
           setCaseDescription(prev => (prev ? prev + ' ' : '') + finalTranscript.toUpperCase());
           setError(null); 
        }
      }
      recognitionRef.current.onerror = () => setIsRecording(false)
      recognitionRef.current.onend = () => setIsRecording(false)
    }
  }, [])

  useEffect(() => {
    if (coolDown > 0) {
      const timer = setInterval(() => setCoolDown(c => Math.max(0, c - 1)), 1000)
      return () => clearInterval(timer)
    }
  }, [coolDown])

  const toggleRecording = () => {
    if (isRecording) recognitionRef.current?.stop()
    else {
      if (!recognitionRef.current) return
      recognitionRef.current.start()
      setIsRecording(true)
      setError(null);
    }
  }

  const handleGenerate = async () => {
    if (!caseDescription.trim() || coolDown > 0 || isLoading || loadingBiblioteca) {
      if (loadingBiblioteca) {
        toast({ title: "Aguarde", description: "A base de conhecimento jurídico ainda está carregando." });
      }
      return;
    }

    setIsLoading(true); 
    setError(null); 
    setDraft(""); 
    setFundamentacao("");
    
    try {
      const legislacaoContext = documentos
        .map(doc => doc.conteudoIntegral || '')
        .join('\n\n---\n\n');

      const result = await generateIntimacaoDraft({ 
        caseDescription, 
        reportType, 
        useCloudAI,
        legislacaoContext: legislacaoContext,
        lawPreference: lawPreference
      });

      if (result.error) {
        setError(result.error)
        if (result.error.includes('COTA')) setCoolDown(60)
      } else {
        setDraft(result.draftIntimacao); 
        setFundamentacao(result.fundamentacaoSugerida || "");
        setEngine(result.engine || 'local');
        if (result.engine === 'cloud') setCoolDown(5); 
      }
    } catch (err: any) { 
      setError("ERRO DE PROCESSAMENTO. Verifique sua conexão."); 
    } finally { 
      setIsLoading(false); 
    }
  }

  const handleResetAll = () => {
    if (!confirm("Deseja reiniciar toda a edição? Todos os campos serão limpos.")) return;
    setCaseDescription("");
    setDraft("");
    setFundamentacao("");
    setError(null);
    setReportType('intimação');
    setLawPreference('todas');
    toast({ title: "Edição Reiniciada" });
  }

  const handleClearRelato = () => {
    setCaseDescription("");
    setError(null);
    toast({ title: "Relato Apagado" });
  }

  const handleClearDraft = () => {
    setDraft("");
    setFundamentacao("");
    toast({ title: "Rascunho Limpo" });
  }

  const handleCopyToClipboard = () => {
    if (!draft) return;
    const final = isUppercase ? draft.toUpperCase() : draft;
    const textToCopy = fundamentacao ? `FUNDAMENTAÇÃO: ${fundamentacao}\n\nRELATO: ${final}` : final;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true); 
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copiado!" });
  }

  const handleExport = () => {
    const typeMapping: Record<ReportType, string> = {
      'intimação': 'TERMO DE INTIMAÇÃO',
      'infração': 'AUTO DE INFRAÇÃO',
      'apreensão': 'TERMO DE APREENSÃO',
      'interdição': 'TERMO DE INTERDIÇÃO',
    };

    const params = new URLSearchParams();
    params.set('draftText', isUppercase ? draft.toUpperCase() : draft);
    params.set('legalBase', (fundamentacao || "").toUpperCase());
    params.set('type', typeMapping[reportType]);
    router.push(`/intimacoes/nova?${params.toString()}`);
  }

  const docTypes = [
    { id: 'intimação', label: 'Intimação', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'infração', label: 'Infração', icon: AlertOctagon, color: 'text-rose-600', bg: 'bg-rose-50' },
    { id: 'apreensão', label: 'Apreensão', icon: PackageSearch, color: 'text-amber-600', bg: 'bg-amber-50' },
    { id: 'interdição', label: 'Interdição', icon: Ban, color: 'text-zinc-900', bg: 'bg-zinc-100' },
  ]

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 pt-4 font-sans pb-40 px-4">
      <div className="flex items-center justify-between no-print px-2">
          <Button asChild variant="ghost" size="sm" className="h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-zinc-400 bg-white border border-zinc-100 shadow-sm hover:text-primary">
            <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
          </Button>
          
          <div className="flex items-center gap-3">
              <Button onClick={handleResetAll} variant="ghost" size="sm" className="h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all">
                <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar Tudo
              </Button>

              <div className="flex items-center gap-3 bg-white p-1.5 px-4 rounded-full border border-zinc-100 shadow-sm">
                 <div className={cn("p-1.5 rounded-lg transition-colors", !useCloudAI ? "bg-emerald-100 text-emerald-600" : "text-zinc-300")}><Cpu className="h-3.5 w-3.5" /></div>
                 <Switch checked={useCloudAI} onCheckedChange={setUseCloudAI} className="data-[state=checked]:bg-blue-600 scale-90" />
                 <div className={cn("p-1.5 rounded-lg transition-colors", useCloudAI ? "bg-blue-100 text-blue-600" : "text-zinc-300")}><Cloud className="h-3.5 w-3.5" /></div>
                 <span className="text-[9px] font-black uppercase text-zinc-400 ml-2 tracking-widest">{useCloudAI ? "MODO NUVEM" : "LOCAL"}</span>
              </div>

              <div className="flex items-center gap-2 text-zinc-400 text-[9px] font-bold uppercase tracking-widest">
                {loadingBiblioteca ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
                <span>{loadingBiblioteca ? "Carregando Base Jurídica..." : "Base Jurídica Pronta"}</span>
              </div>
          </div>
      </div>

      <Card className="border-none bg-white shadow-[0_25px_60px_rgba(0,0,0,0.08)] rounded-[3rem] overflow-hidden">
        <CardHeader className="pt-10 pb-8 px-10 text-center">
             <div className="flex flex-col items-center gap-4">
                <div className={cn("p-4 rounded-[2rem] shadow-inner transition-all", useCloudAI ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600")}>
                    {useCloudAI ? <Sparkles className="h-8 w-8" /> : <Cpu className="h-8 w-8" />}
                </div>
                <div className="space-y-1">
                    <CardTitle className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Fiscal AI</CardTitle>
                    <CardDescription className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-400">
                        Assistente Inteligente para Redação de Autos e Termos
                    </CardDescription>
                </div>
             </div>
        </CardHeader>

        <CardContent className="px-6 sm:px-12 space-y-12">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 ml-2 block">1. Natureza do Documento</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {docTypes.map((t) => (
                  <button key={t.id} type="button" onClick={() => setReportType(t.id as ReportType)} 
                    className={cn(
                        "flex flex-col items-center justify-center gap-3 p-6 rounded-[2rem] border-2 transition-all duration-300", 
                        reportType === t.id ? `${t.bg} border-primary shadow-xl scale-105 z-10` : "bg-zinc-50 border-transparent text-zinc-300 hover:bg-zinc-100"
                    )}
                  >
                    <t.icon className={cn("h-6 w-6", reportType === t.id ? t.color : "text-zinc-200")} />
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", reportType === t.id ? "text-slate-900" : "text-zinc-400")}>{t.label}</span>
                  </button>
                ))}
              </div>
              {(reportType === 'apreensão' || reportType === 'interdição') && (
                <div className="flex items-center gap-3 text-amber-600 bg-amber-50 border border-amber-100 p-4 rounded-2xl mt-4 animate-in fade-in">
                    <Info className="h-5 w-5 shrink-0" />
                    <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                      Lembre-se: Termos de Apreensão ou Interdição são acompanhados de um Auto de Infração. 
                      O texto gerado irá refletir a lavratura de ambos os documentos, com os prazos legais para defesa.
                    </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 ml-2 block">2. Qual a esfera da lei?</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'todas', label: 'Base Integral', icon: Scale },
                    { id: 'municipal', label: 'Código Municipal', icon: Gavel },
                    { id: 'estadual', label: 'Código Estadual', icon: BookOpen }
                  ].map((opt) => (
                      <button key={opt.id} type="button" onClick={() => setLawPreference(opt.id as LawPreference)} 
                        className={cn( 
                            "flex items-center gap-4 p-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest border-2", 
                            lawPreference === opt.id ? "bg-white border-primary text-primary shadow-lg" : "bg-zinc-50 border-transparent text-zinc-300 hover:bg-zinc-100"
                        )}
                      >
                          <opt.icon className={cn("h-4 w-4", lawPreference === opt.id ? "text-primary" : "text-zinc-200")} />
                          <span className={cn(lawPreference === opt.id ? "text-slate-900" : "text-zinc-400")}>{opt.label}</span>
                      </button>
                  ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 block">3. Relato das irregularidades</label>
                <div className="flex items-center gap-2">
                    <Button type="button" onClick={handleClearRelato} variant="ghost" size="sm" className="h-8 w-8 rounded-lg text-zinc-300 hover:text-rose-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button type="button" onClick={toggleRecording} variant="ghost" className={cn("h-9 gap-2 px-4 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all", isRecording ? "bg-red-500 text-white animate-pulse" : "bg-zinc-50 text-zinc-400")}>
                      {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {isRecording ? "PARAR" : "DITAR POR VOZ"}
                    </Button>
                </div>
              </div>
              <Textarea 
                  placeholder="DESCREVA O QUE FOI ENCONTRADO NO LOCAL..." 
                  value={caseDescription} 
                  onChange={(e) => {
                    setCaseDescription(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }} 
                  className="bg-zinc-50 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-[2rem] min-h-[160px] p-6 text-lg font-medium transition-all shadow-inner resize-none focus-visible:ring-0" 
                  disabled={isLoading} 
              />
            </div>

            {error && (
               <Alert variant="destructive" className="bg-rose-50 border-rose-100 rounded-[2rem] p-6 animate-in slide-in-from-top-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-rose-600 rounded-2xl text-white shadow-lg">
                    <MessageSquareWarning className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <AlertTitle className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-700">Relato Insuficiente</AlertTitle>
                    <AlertDescription className="text-[11px] font-bold text-rose-600/90 leading-relaxed uppercase">
                        {error}
                    </AlertDescription>
                  </div>
                </div>
                <button onClick={() => setError(null)} className="absolute top-4 right-4 p-1 hover:bg-rose-100 rounded-full transition-colors"><X className="h-4 w-4" /></button>
              </Alert>
            )}

            {(draft || isLoading) && (
                <div className="pt-8 space-y-8 animate-in fade-in slide-in-from-bottom-6">
                    <div className="h-px bg-slate-100 w-full" />
                    
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-zinc-50/50 rounded-[2.5rem] border border-dashed border-zinc-200">
                            <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
                            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.3em] animate-pulse">Redigindo Texto Técnico...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {fundamentacao && (
                                <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl text-white border-l-[8px] border-l-primary">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-primary">Enquadramento Detectado</p>
                                        <Badge className={cn("text-[6px] font-black uppercase border-none", engine === 'local' ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400")}>{engine === 'local' ? "Inteligência Local" : "Nuvem"}</Badge>
                                    </div>
                                    <p className="text-sm font-black uppercase italic leading-tight tracking-tight">{fundamentacao}</p>
                                </div>
                            )}
                            
                            <div className="bg-white p-8 sm:p-12 rounded-[2.5rem] border border-zinc-200 shadow-2xl relative overflow-hidden">
                                <div className="flex items-center justify-between mb-8 border-b border-zinc-50 pb-4">
                                    <span className="text-[9px] font-black text-slate-900 uppercase tracking-[0.4em]">Rascunho Jurídico Gerado</span>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm" onClick={handleClearDraft} className="h-9 w-9 rounded-xl text-zinc-300 hover:text-rose-500 hover:bg-rose-50">
                                            <Eraser className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={handleCopyToClipboard} className="h-9 px-4 rounded-xl font-black text-[9px] uppercase tracking-widest bg-zinc-50 text-zinc-500 hover:bg-zinc-100">
                                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />} 
                                            {copied ? "COPIADO" : "COPIAR"}
                                        </Button>
                                    </div>
                                </div>

                                <div className="text-[16px] leading-relaxed font-serif text-justify whitespace-pre-wrap text-slate-800 px-2 min-h-[150px]">
                                    {isUppercase ? draft.toUpperCase() : draft}
                                </div>

                                <div className="mt-12 pt-6 border-t border-zinc-50">
                                    <Button onClick={handleExport} className="w-full h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.2em] text-[11px] gap-4 shadow-xl active:scale-95 transition-all">
                                        <FileCheck className="h-6 w-6" />
                                        Vincular ao Documento Oficial
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </CardContent>

        <CardFooter className="bg-slate-50/50 p-8 flex flex-col sm:flex-row items-center gap-6 border-t border-zinc-100">
           <div className="flex-1 w-full">
                <Button onClick={handleResetAll} variant="ghost" className="w-full sm:w-auto h-16 rounded-2xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-black uppercase tracking-[0.2em] text-[12px] gap-3 transition-all">
                    <Trash2 className="h-5 w-5" /> Limpar Formulário
                </Button>
            </div>

            <div className="flex-shrink-0 w-full sm:w-auto">
             <Button 
                onClick={handleGenerate} 
                disabled={isLoading || !caseDescription.trim() || coolDown > 0 || loadingBiblioteca} 
                className={cn(
                    "w-full sm:w-[340px] h-16 rounded-2xl font-black uppercase tracking-[0.2em] text-[12px] gap-3 shadow-xl transition-all active:scale-95", 
                    coolDown > 0 ? "bg-zinc-200 text-zinc-400 cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-white"
                )}
             >
                {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Processando...</> : <><Wand2 className="h-5 w-5" /> Gerar Texto Técnico</>}
                {coolDown > 0 && <span className="ml-2 bg-black/10 px-2 py-0.5 rounded-lg">{coolDown}s</span>}
             </Button>
           </div>
        </CardFooter>
      </Card>
    </div>
  )
}

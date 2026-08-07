"use client"

import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from "react"
import {
  Loader2,
  Sparkles,
  Check,
  FileText,
  Ban,
  PackageSearch,
  AlertOctagon,
  Scale,
  BookOpen,
  Mic,
  MicOff,
  X,
  FileCheck,
  Wand2,
  Gavel,
  Copy,
  Trash2,
  Info,
  RotateCcw,
  Eraser,
  MessageSquareWarning
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { generateIntimacaoDraft } from "@/ai/flows/generate-intimacao-draft"
import { salvarExemploFiscalAi } from "@/lib/fiscal-ai-exemplos"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { Badge } from "@/components/ui/badge"

type ReportType = 'intimação' | 'infração' | 'apreensão' | 'interdição';
type LawPreference = 'todas' | 'municipal' | 'estadual';

interface GerarRascunhoProps {
  caseDescription: string;
  setCaseDescription: Dispatch<SetStateAction<string>>;
}

const docTypes = [
  { id: 'intimação', label: 'Intimação', icon: FileText },
  { id: 'infração', label: 'Auto de Infração', icon: AlertOctagon },
  { id: 'apreensão', label: 'Termo de Apreensão', icon: PackageSearch },
  { id: 'interdição', label: 'Termo de Interdição', icon: Ban },
] as const;

const lawOptions = [
  { id: 'todas', label: 'Base Integral', icon: Scale },
  { id: 'municipal', label: 'Código Municipal', icon: Gavel },
  { id: 'estadual', label: 'Código Estadual', icon: BookOpen },
] as const;

export function GerarRascunho({ caseDescription, setCaseDescription }: GerarRascunhoProps) {
  const [reportType, setReportType] = useState<ReportType | undefined>(undefined)
  const [lawPreference, setLawPreference] = useState<LawPreference | undefined>(undefined)

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
  const { profile } = useAuth()
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
    if (!caseDescription.trim() || !reportType || !lawPreference || coolDown > 0 || isLoading) {
      if (!reportType || !lawPreference) {
        toast({ variant: "destructive", title: "Selecione a finalidade do documento e a base legal antes de gerar." });
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setDraft("");
    setFundamentacao("");

    try {
      const result = await generateIntimacaoDraft({
        caseDescription,
        reportType,
        useCloudAI: true,
        lawPreference: lawPreference,
        uid: profile?.uid || '',
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
    setReportType(undefined);
    setLawPreference(undefined);
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
    if (!reportType) return;
    const typeMapping: Record<ReportType, string> = {
      'intimação': 'TERMO DE INTIMAÇÃO',
      'infração': 'AUTO DE INFRAÇÃO',
      'apreensão': 'TERMO DE APREENSÃO',
      'interdição': 'TERMO DE INTERDIÇÃO',
    };

    // O fiscal escolher exportar (em vez de limpar e gerar de novo) é o sinal
    // de que o rascunho ficou bom — guarda como referência de estilo pra
    // casos futuros parecidos. Falha aqui não deve travar a exportação.
    if (profile?.municipioId) {
      salvarExemploFiscalAi({
        caseDescription,
        reportType,
        draftGerado: draft,
        fundamentacao,
        engine: engine || 'local',
        municipioId: profile.municipioId,
        createdBy: profile.uid,
        createdByName: profile.displayName,
      }).catch(() => {});
    }

    const params = new URLSearchParams();
    params.set('draftText', isUppercase ? draft.toUpperCase() : draft);
    params.set('legalBase', (fundamentacao || "").toUpperCase());
    params.set('type', typeMapping[reportType]);
    router.push(`/intimacoes/nova?${params.toString()}`);
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-5 pt-4 font-sans pb-40 px-4">
      {/* Cabeçalho discreto — uma linha só, sem repetir informação dentro do card */}
      <div className="flex items-center gap-3 no-print">
        <div className="flex items-center gap-2 text-slate-500">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Fiscal AI – Assistente Inteligente</span>
        </div>
      </div>

      <Card className="border border-zinc-100 bg-white shadow-sm rounded-[2rem] overflow-hidden">
        <CardContent className="p-5 sm:p-8 space-y-6">

          {/* Documento em destaque: o campo principal da tela */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-700">Relato da ocorrência</Label>
              <div className="flex items-center gap-1.5">
                <Button type="button" onClick={handleClearRelato} variant="ghost" size="sm" className="h-8 w-8 rounded-lg text-zinc-300 hover:text-rose-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button type="button" onClick={toggleRecording} variant="ghost" size="sm" className={cn("h-8 gap-1.5 px-3 rounded-lg text-xs font-medium transition-all", isRecording ? "bg-red-500 text-white animate-pulse" : "bg-zinc-50 text-zinc-500")}>
                  {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {isRecording ? "Parar" : "Ditar por voz"}
                </Button>
              </div>
            </div>
            <Textarea
              placeholder="Descreva o que foi encontrado no local..."
              value={caseDescription}
              onChange={(e) => {
                setCaseDescription(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              className="bg-zinc-50 border border-zinc-200 focus:border-primary/40 focus:bg-white rounded-2xl min-h-[200px] p-5 text-base font-normal leading-relaxed transition-all resize-none focus-visible:ring-0"
              disabled={isLoading}
            />
          </div>

          {/* Tipo de documento + base legal: mesmo formato, lado a lado, exigidos antes de gerar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-500">Finalidade do documento</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger className="h-11 rounded-xl bg-primary/5 border-primary/30 text-sm font-medium">
                  <SelectValue placeholder="Selecionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {docTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2"><t.icon className="h-3.5 w-3.5 text-zinc-500" /> {t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-500">Base legal</Label>
              <Select value={lawPreference} onValueChange={(v) => setLawPreference(v as LawPreference)}>
                <SelectTrigger className="h-11 rounded-xl bg-primary/5 border-primary/30 text-sm font-medium">
                  <SelectValue placeholder="Selecionar base..." />
                </SelectTrigger>
                <SelectContent>
                  {lawOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <span className="flex items-center gap-2"><opt.icon className="h-3.5 w-3.5 text-zinc-500" /> {opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(reportType === 'apreensão' || reportType === 'interdição') && (
            <div className="flex items-start gap-3 text-amber-800 bg-amber-50 border border-amber-100 p-4 rounded-xl text-xs leading-relaxed animate-in fade-in">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Termos de Apreensão ou Interdição são acompanhados de um Auto de Infração — o texto gerado vai refletir os dois documentos, com os prazos legais para defesa.</p>
            </div>
          )}

          {error && (
             <Alert variant="destructive" className="bg-rose-50 border-rose-100 rounded-2xl p-5 animate-in slide-in-from-top-4 relative">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-600 rounded-xl text-white shrink-0">
                  <MessageSquareWarning className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <AlertTitle className="text-sm font-semibold text-rose-700">Relato insuficiente</AlertTitle>
                  <AlertDescription className="text-xs text-rose-600/90 leading-relaxed">
                      {error}
                  </AlertDescription>
                </div>
              </div>
              <button onClick={() => setError(null)} className="absolute top-4 right-4 p-1 hover:bg-rose-100 rounded-full transition-colors"><X className="h-4 w-4" /></button>
            </Alert>
          )}

          {(draft || isLoading) && (
              <div className="pt-6 space-y-6 animate-in fade-in slide-in-from-bottom-6">
                  <div className="h-px bg-slate-100 w-full" />

                  {isLoading ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
                          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                          <p className="text-xs font-medium text-zinc-400 animate-pulse">Redigindo texto técnico...</p>
                      </div>
                  ) : (
                      <div className="space-y-5">
                          {fundamentacao && (
                              <div className="bg-slate-900 p-5 rounded-2xl text-white border-l-4 border-l-primary">
                                  <div className="flex items-center justify-between mb-1.5">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Enquadramento detectado</p>
                                      <Badge className={cn("text-[9px] font-medium border-none", engine === 'local' ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400")}>{engine === 'local' ? "Local" : "Nuvem"}</Badge>
                                  </div>
                                  <p className="text-sm font-medium leading-snug">{fundamentacao}</p>
                              </div>
                          )}

                          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 relative overflow-hidden">
                              <div className="flex items-center justify-between mb-6 border-b border-zinc-50 pb-3">
                                  <span className="text-xs font-semibold text-slate-700">Rascunho gerado</span>
                                  <div className="flex items-center gap-2">
                                      <Button variant="ghost" size="sm" onClick={handleClearDraft} className="h-8 w-8 rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50">
                                          <Eraser className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={handleCopyToClipboard} className="h-8 px-3 rounded-lg text-xs font-medium bg-zinc-50 text-zinc-500 hover:bg-zinc-100">
                                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                                          {copied ? "Copiado" : "Copiar"}
                                      </Button>
                                  </div>
                              </div>

                              <div className="text-base leading-relaxed font-serif text-justify whitespace-pre-wrap text-slate-800 min-h-[120px]">
                                  {isUppercase ? draft.toUpperCase() : draft}
                              </div>

                              <div className="mt-8 pt-5 border-t border-zinc-50">
                                  <Button onClick={handleExport} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-3 transition-all">
                                      <FileCheck className="h-5 w-5" />
                                      Exportar para o formulário de autuação
                                  </Button>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          )}
        </CardContent>

        <CardFooter className="bg-zinc-50/50 p-5 flex flex-col sm:flex-row items-center gap-3 border-t border-zinc-100">
          <Button onClick={handleResetAll} variant="ghost" className="w-full sm:w-auto text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-medium gap-2 transition-all">
              <RotateCcw className="h-4 w-4" /> Reiniciar
          </Button>

          <Button
              onClick={handleGenerate}
              disabled={isLoading || !caseDescription.trim() || !reportType || !lawPreference || coolDown > 0}
              className={cn(
                  "flex-1 w-full sm:w-auto h-12 rounded-xl font-semibold gap-2.5 transition-all",
                  coolDown > 0 ? "bg-zinc-200 text-zinc-400 cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-white"
              )}
           >
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</> : <><Wand2 className="h-4 w-4" /> Gerar rascunho</>}
              {coolDown > 0 && <span className="ml-1 bg-black/10 px-2 py-0.5 rounded-md text-xs">{coolDown}s</span>}
           </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

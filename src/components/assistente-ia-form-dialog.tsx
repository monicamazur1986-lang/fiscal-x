"use client"

import { useState, useRef, useEffect } from "react"
import { Sparkles, Loader2, Check, AlertTriangle, Trash2, FileText, Ban, PackageSearch, AlertOctagon, Scale, BookOpen, Mic, MicOff, AlertCircle, X, Gavel } from "lucide-react"
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
import { generateIntimacaoDraft } from "@/ai/flows/generate-intimacao-draft"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

interface Props {
  onApply: (text: string, fundamentacao?: string) => void;
}

type ReportType = 'intimação' | 'infração' | 'apreensão' | 'interdição';
type LawPreference = 'todas' | 'municipal' | 'estadual';

export function AssistenteIAFormDialog({ onApply }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [caseDescription, setCaseDescription] = useState("")
  const [reportType, setReportType] = useState<ReportType>('intimação')
  const [lawPreference, setLawPreference] = useState<LawPreference>('todas')
  const [draft, setDraft] = useState("")
  const [fundamentacao, setFundamentacao] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUppercase, setIsUppercase] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  
  const recognitionRef = useRef<any>(null)

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

  const handleGenerate = async () => {
    if (!caseDescription.trim()) return;
    setIsLoading(true)
    setError(null)
    setDraft("")
    setFundamentacao("")
    try {
      const result = await generateIntimacaoDraft({ caseDescription, reportType, lawPreference, useCloudAI: false, uid: '' })
      if (result.error) {
        setError(result.error)
      } else {
        setDraft(result.draftIntimacao)
        setFundamentacao(result.fundamentacaoSugerida || "")
      }
    } catch (err) {
      setError("FALHA DE CONEXÃO: Verifique sua chave de API ou conexão com a internet.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleApply = () => {
    const finalContent = isUppercase ? (draft || "").toUpperCase() : draft;
    onApply(finalContent, fundamentacao);
    setIsOpen(false);
    setDraft("");
    setFundamentacao("");
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
          ASSISTENTE IA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white">
        <DialogHeader className="bg-violet-600 text-white p-6 sm:p-8 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-white/20 text-white"><Sparkles className="h-6 w-6" /></div>
              <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">FISCAL AI</DialogTitle>
                <DialogDescription className="text-violet-100 text-[10px] font-bold uppercase tracking-widest mt-1">Geração de texto técnico e enquadramento</DialogDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2 bg-violet-700/50 p-2 rounded-2xl border border-white/10">
              <Label htmlFor="ia-case-mode" className="text-[8px] font-black uppercase text-white">Caixa Alta</Label>
              <Switch id="ia-case-mode" checked={isUppercase} onCheckedChange={setIsUppercase} className="scale-75 data-[state=checked]:bg-white" />
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 bg-zinc-50 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {error && (
            <Alert variant="destructive" className="bg-red-50 border-red-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-[10px] font-black uppercase tracking-widest">Aviso do Sistema</AlertTitle>
              <AlertDescription className="text-xs font-bold uppercase opacity-80 leading-relaxed">
                {error}
              </AlertDescription>
              <button onClick={() => setError(null)} className="absolute top-2 right-2 p-1 hover:bg-red-100 rounded-full transition-colors">
                <X className="h-3 w-3" />
              </button>
            </Alert>
          )}

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Natureza do Documento</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {types.map((t) => (
                <button key={t.id} type="button" onClick={() => setReportType(t.id as ReportType)} className={cn("flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all", reportType === t.id ? `${t.bgColor} ${t.borderColor} shadow-md` : "bg-white border-zinc-200 text-zinc-400 hover:border-zinc-300")}>
                  <t.icon className={cn("h-6 w-6", reportType === t.id ? t.color : "text-zinc-300")} />
                  <span className={cn("text-[9px] font-black uppercase", reportType === t.id ? "text-zinc-900" : "text-zinc-400")}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 p-5 bg-white rounded-2xl border border-zinc-200 shadow-inner">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1 flex items-center gap-2 mb-2"><Gavel className="h-3.5 w-3.5" /> Esfera Legal (Base RAG)</label>
            <Select value={lawPreference} onValueChange={(v: any) => setLawPreference(v)}>
                <SelectTrigger className="h-12 rounded-xl border-none bg-zinc-50 font-bold text-xs uppercase tracking-widest text-slate-800 focus:ring-primary/10">
                    <SelectValue placeholder="Selecione a base jurídica..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-2xl p-1">
                    <SelectItem value="todas" className="rounded-lg font-bold uppercase text-[9px] py-2.5">Todas as Leis</SelectItem>
                    <SelectItem value="municipal" className="rounded-lg font-bold uppercase text-[9px] py-2.5 text-blue-600">Municipal (Prudentópolis)</SelectItem>
                    <SelectItem value="estadual" className="rounded-lg font-bold uppercase text-[9px] py-2.5 text-emerald-600">Estadual (Paraná)</SelectItem>
                </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Relato de Campo</label>
              <Button type="button" onClick={toggleRecording} variant="ghost" size="sm" className={cn("h-7 gap-1.5 px-3 rounded-lg font-black text-[9px] uppercase transition-all", isRecording ? "bg-red-100 text-red-600 animate-pulse" : "bg-zinc-100 text-zinc-600")}>
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {isRecording ? "Parar" : "Ditar"}
              </Button>
            </div>
            <Textarea 
                placeholder="Descreva os fatos encontrados ou use o ditado por voz..." 
                value={caseDescription} 
                onChange={(e) => {
                    setCaseDescription(e.target.value);
                    if (error) setError(null);
                }} 
                className="bg-white border-zinc-200 rounded-2xl min-h-[100px] text-sm" 
                disabled={isLoading} 
            />
          </div>

          {isLoading && <div className="space-y-3 animate-pulse"><div className="h-12 bg-zinc-200 rounded-xl" /><div className="h-24 bg-zinc-200 rounded-xl" /></div>}

          {draft && !isLoading && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              {fundamentacao && (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                   <div className="flex items-center gap-2 mb-2"><Scale className="h-3 w-3 text-blue-600" /><span className="text-[9px] font-black uppercase text-blue-600 tracking-widest">Enquadramento Detectado</span></div>
                   <p className="text-[11px] font-bold text-blue-800 uppercase leading-tight">{fundamentacao}</p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600 ml-1">Redação Técnica Sugerida</label>
                <div className="bg-white p-5 rounded-2xl text-zinc-800 text-sm leading-relaxed border border-violet-100 shadow-inner">
                  <p className="whitespace-pre-wrap">{isUppercase ? draft.toUpperCase() : draft}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 bg-white border-t border-zinc-100 gap-3">
          <Button variant="outline" onClick={() => { setDraft(""); setFundamentacao(""); setCaseDescription(""); setError(null); }} className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-[10px] text-zinc-400">Limpar</Button>
          {!draft || isLoading ? (
            <Button onClick={handleGenerate} disabled={isLoading || !caseDescription.trim()} className="flex-[2] h-12 rounded-xl menu-metallic-violet hover:opacity-90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processando...</> : <><Sparkles className="mr-2 h-4 w-4" />Gerar Texto</>}
            </Button>
          ) : (
            <Button onClick={handleApply} className="flex-[2] h-12 rounded-xl menu-metallic-emerald hover:opacity-90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg"><Check className="mr-2 h-4 w-4" /> Aplicar no Documento</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
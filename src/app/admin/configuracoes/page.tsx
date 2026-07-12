
"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useAppConfig } from "@/hooks/use-app-config"
import { useStorage } from "@/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import {
  Building2,
  Upload,
  Loader2,
  ImageIcon,
  Trash2,
  Save,
  Type,
  ShieldCheck,
  RotateCcw,
  Scale,
  Landmark,
  FileText
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { BackButton } from "@/components/back-button"
import { RichTextEditor } from "@/components/rich-text-editor"
import { DEFAULT_PRAZO_TEXT } from "@/lib/schema"

const DEFAULT_SYMBOL = "https://firebasestorage.googleapis.com/v0/b/firebasestudio-1937074168.appspot.com/o/user-uploads%2F67b6653d9e6e872d80ef618e%2Flogo_horizontal_preto_transparente.jpg?alt=media";

export default function IdentidadeMunicipalPage() {
  const { profile, loading: authLoading } = useAuth()
  const { config, updateConfig, updateLogo, loading: configLoading } = useAppConfig()
  const storage = useStorage()
  const { toast } = useToast()
  const router = useRouter()
  
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [headerHtml, setHeaderHtml] = useState("")
  const [prazoHtml, setPrazoHtml] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (config) {
      if (config.headerRichText) setHeaderHtml(config.headerRichText);
      else resetToDefaultHeader();
      
      if (config.defaultPrazoRichText) setPrazoHtml(config.defaultPrazoRichText);
      else setPrazoHtml(DEFAULT_PRAZO_TEXT);
    }
  }, [config])

  const resetToDefaultHeader = () => {
    const cityName = config.municipioNome || profile?.municipioNome || "PRUDENTÓPOLIS";
    const initial = `
      <div style="text-align: center;">
        <p style="margin: 0; font-size: 10.5pt;"><strong>PREFEITURA MUNICIPAL DE ${cityName.toUpperCase()}</strong></p>
        <p style="margin: 1px 0; font-size: 11.5pt;"><strong>SECRETARIA MUNICIPAL DE SAÚDE</strong></p>
        <p style="margin: 0; font-size: 9.5pt;">VIGILÂNCIA SANITÁRIA</p>
      </div>
    `.trim();
    setHeaderHtml(initial);
  };

  // Proteção de Rota
  useEffect(() => {
    if (mounted && !authLoading && profile) {
      if (profile.role !== 'admin' && profile.role !== 'root') {
        router.replace("/dashboard");
      }
    }
  }, [profile, authLoading, router, mounted]);

  if (!mounted || authLoading || configLoading || !profile) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (profile.role !== 'admin' && profile.role !== 'root') return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile?.municipioId) return
    setUploadingLogo(true);
    try {
      const storageRef = ref(storage!, `municipios/${profile.municipioId}/shield_${Date.now()}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      await updateLogo(url);
      toast({ title: "Brasão Atualizado", description: "O cabeçalho dos documentos foi atualizado." })
    } catch (error) {
      toast({ variant: "destructive", title: "Erro no Upload" })
    } finally { setUploadingLogo(false); }
  }

  const handleSaveConfigs = async () => {
    setSaving(true)
    try {
      await updateConfig({ 
        headerRichText: headerHtml,
        defaultPrazoRichText: prazoHtml,
      })
      toast({ title: "Padrões Salvos", description: "Configurações municipais aplicadas com sucesso." })
      router.push("/dashboard")
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao salvar" })
    } finally { setSaving(false) }
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-10 font-sans pb-32">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl menu-satin-dark text-white shadow-xl">
                <Landmark className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Identidade Municipal</h1>
          </div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] ml-1">
            Município: {profile?.municipioNome?.toUpperCase() || "SISTEMA"}
          </p>
        </div>
        <BackButton href="/dashboard" label="Cancelar e Voltar" className="bg-transparent border-none shadow-none text-zinc-400" />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-8">
            <Card className="bg-white border-2 border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                    <CardTitle className="text-lg font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-[#00a99d]" /> Brasão Oficial
                    </CardTitle>
                    <CardDescription className="text-zinc-500 font-bold uppercase text-[8px] tracking-widest">Utilizado apenas em cabeçalhos A4</CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50 gap-6">
                        <div className="relative w-full max-w-[160px] aspect-square group shadow-inner bg-white rounded-[2rem] p-4 flex items-center justify-center">
                            <img src={config.logoUrl || DEFAULT_SYMBOL} alt="Brasão" className="max-w-full max-h-full object-contain" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[2rem]">
                                <Button onClick={() => updateLogo("")} variant="destructive" size="icon" className="h-10 w-10 rounded-full"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        </div>
                        <Label htmlFor="logo-upload" className="cursor-pointer w-full">
                            <div className="flex items-center justify-center gap-3 bg-white text-primary h-12 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all border border-slate-200 shadow-sm">
                                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                Carregar Brasão
                            </div>
                            <input id="logo-upload" type="file" className="sr-only" accept="image/*" onChange={handleFileUpload} disabled={uploadingLogo} />
                        </Label>
                    </div>
                </CardContent>
            </Card>

            <div className="p-8 rounded-[2.5rem] bg-slate-900 text-white space-y-4 shadow-2xl">
                <div className="p-3 bg-white/10 rounded-2xl w-fit"><ShieldCheck className="h-6 w-6 text-emerald-400" /></div>
                <h3 className="text-lg font-black uppercase italic tracking-tighter">Segurança Visual</h3>
                <p className="text-[10px] font-medium text-slate-400 leading-relaxed text-justify">
                    As imagens aqui configuradas pertencem exclusivamente ao órgão fiscalizador do seu município. A marca do software (Sentinela) é gerenciada pelo Auditor Master do sistema.
                </p>
            </div>
        </div>

        <div className="lg:col-span-8 space-y-8">
            <Card className="bg-white border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div>
                        <CardTitle className="text-lg font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                            <Type className="h-4 w-4 text-primary" /> Cabeçalho de Documentos
                        </CardTitle>
                        <CardDescription className="text-zinc-500 font-bold uppercase text-[9px] tracking-widest">Identificação da Prefeitura e Secretaria</CardDescription>
                    </div>
                    <Button onClick={resetToDefaultHeader} variant="ghost" className="h-9 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-primary">
                        <RotateCcw className="h-3 w-3 mr-2" /> Restaurar Padrão
                    </Button>
                </CardHeader>
                <CardContent className="p-6 border-t">
                    <div className="p-6 border-2 border-slate-100 rounded-[2rem] bg-slate-50/50 min-h-[180px]">
                        <RichTextEditor value={headerHtml} onChange={setHeaderHtml} fontSize="11pt" minHeight="120px" />
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                        <Scale className="h-4 w-4 text-emerald-600" /> Texto de Notificação Padrão
                    </CardTitle>
                    <CardDescription className="text-zinc-500 font-bold uppercase text-[9px] tracking-widest">Prazos e orientações legais de defesa</CardDescription>
                </CardHeader>
                <CardContent className="p-6 border-t">
                    <div className="p-6 border-2 border-slate-100 rounded-[2rem] bg-slate-50/50 min-h-[180px]">
                        <RichTextEditor value={prazoHtml} onChange={setPrazoHtml} fontSize="10pt" minHeight="120px" />
                    </div>
                </CardContent>
                <CardContent className="px-6 pb-6 pt-0">
                    <Button 
                        onClick={handleSaveConfigs} 
                        disabled={saving} 
                        className="w-full h-16 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest gap-4 shadow-xl"
                    >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Salvar Padrões Municipais
                    </Button>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}

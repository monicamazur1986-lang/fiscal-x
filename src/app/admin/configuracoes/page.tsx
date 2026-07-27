
"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useAppConfig } from "@/hooks/use-app-config"
import { storage } from "@/lib/firebase"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
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
import { RichTextEditor } from "@/components/rich-text-editor"
import { DEFAULT_PRAZO_TEXT } from "@/lib/schema"
import { normalizeId } from "@/lib/utils"
import municipiosPR from "@/lib/municipios-pr.json"


export default function IdentidadeMunicipalPage() {
  const { profile, loading: authLoading } = useAuth()
  const isRoot = profile?.role === 'root'
  const [selectedMunicipio, setSelectedMunicipio] = useState("")
  const { config, updateConfig, updateLogo, loading: configLoading, needsMunicipioSelection } = useAppConfig(
    isRoot ? { municipioIdOverride: selectedMunicipio || undefined } : undefined
  )
  const { toast } = useToast()
  const router = useRouter()

  const effectiveMunicipioId = isRoot ? selectedMunicipio : profile?.municipioId
  const effectiveMunicipioNome = isRoot ? selectedMunicipio : profile?.municipioNome

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [headerHtml, setHeaderHtml] = useState("")
  const [footerHtml, setFooterHtml] = useState("")
  const [prazoHtml, setPrazoHtml] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (config) {
      if (config.headerRichText) setHeaderHtml(config.headerRichText);
      else resetToDefaultHeader();

      setFooterHtml(config.footerRichText || "");

      if (config.defaultPrazoRichText) setPrazoHtml(config.defaultPrazoRichText);
      else setPrazoHtml(DEFAULT_PRAZO_TEXT);
    }
  }, [config])

  const resetToDefaultHeader = () => {
    const cityName = config.municipioNome || effectiveMunicipioNome || "PRUDENTÓPOLIS";
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

  // Extrai o caminho (ex.: "municipios/prudentopolis/shield_123") de uma URL
  // de download do Storage — em vez de confiar que ref() aceita a URL https
  // completa, o que nem sempre é garantido e falhava silenciosamente.
  const getStoragePathFromUrl = (url: string): string | null => {
    try {
      const match = new URL(url).pathname.match(/\/o\/(.+)$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  };

  // Apaga o arquivo antigo do Storage — sem isso, cada troca de brasão deixava
  // um arquivo órfão pra sempre (cada upload usa um nome novo com timestamp),
  // sem nunca liberar o espaço do anterior.
  const deleteOldLogoFile = async (previousUrl?: string) => {
    if (!previousUrl || previousUrl.startsWith('data:')) return;
    const path = getStoragePathFromUrl(previousUrl);
    if (!path) return;
    try {
      await deleteObject(ref(storage!, path));
    } catch {
      // Não bloqueia a troca se a exclusão do antigo falhar (ex.: já não existe mais).
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '';
    if (!file) return;
    if (!effectiveMunicipioId) {
      toast({ variant: "destructive", title: "Selecione um município primeiro" });
      return;
    }
    setUploadingLogo(true);
    try {
      const previousUrl = config.logoUrl;
      const storageRef = ref(storage!, `municipios/${normalizeId(effectiveMunicipioId)}/shield_${Date.now()}`)
      // O SDK do Storage tem retry interno que pode levar bem mais de um
      // minuto pra desistir sozinho quando o bucket não responde — sem um
      // prazo nosso, isso parece um travamento eterno em vez de um erro.
      const uploadWithTimeout = (async () => {
        await uploadBytes(storageRef, file);
        return getDownloadURL(storageRef);
      })();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo esgotado ao enviar para o Storage.')), 20000)
      );
      const url = await Promise.race([uploadWithTimeout, timeout]);
      await updateLogo(url);
      await deleteOldLogoFile(previousUrl);
      toast({ title: "Brasão Atualizado", description: "O cabeçalho dos documentos foi atualizado." })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro no Upload", description: error?.message })
    } finally { setUploadingLogo(false); }
  }

  const handleDeleteLogo = async () => {
    try {
      const previousUrl = config.logoUrl;
      await updateLogo("");
      await deleteOldLogoFile(previousUrl);
      toast({ title: "Brasão Removido" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao remover", description: error?.message });
    }
  }

  const handleSaveConfigs = async () => {
    setSaving(true)
    try {
      await updateConfig({
        headerRichText: headerHtml,
        footerRichText: footerHtml,
        defaultPrazoRichText: prazoHtml,
      })
      toast({ title: "Padrões Salvos", description: "Configurações municipais aplicadas com sucesso." })
      router.push("/dashboard")
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: e?.message })
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
          {isRoot ? (
            <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 h-11 mt-2">
              <Building2 className="h-4 w-4 text-zinc-400" />
              <select value={selectedMunicipio} onChange={(e) => setSelectedMunicipio(e.target.value)} className="text-xs font-bold uppercase outline-none bg-transparent">
                <option value="">Selecionar Município</option>
                {municipiosPR.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] ml-1">
              Município: {profile?.municipioNome?.toUpperCase() || "SISTEMA"}
            </p>
          )}
        </div>
      </header>

      {isRoot && needsMunicipioSelection ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 bg-white border-2 border-dashed border-zinc-200 rounded-[2rem] text-center">
          <Building2 className="h-10 w-10 text-zinc-300" />
          <p className="text-sm font-black uppercase text-zinc-400">Selecione um município para editar a identidade</p>
        </div>
      ) : (
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
                            {config.logoUrl ? (
                              <img src={config.logoUrl} alt="Brasão" className="max-w-full max-h-full object-contain" />
                            ) : (
                              <Landmark className="w-2/3 h-2/3 text-zinc-300" strokeWidth={1} />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center rounded-[2rem]">
                                <Button onClick={handleDeleteLogo} variant="destructive" size="icon" className="h-10 w-10 rounded-full"><Trash2 className="h-4 w-4" /></Button>
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

            <Card className="bg-white border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div>
                        <CardTitle className="text-lg font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                            <Type className="h-4 w-4 text-primary" /> Rodapé de Documentos
                        </CardTitle>
                        <CardDescription className="text-zinc-500 font-bold uppercase text-[9px] tracking-widest">Repetido no rodapé de cada página (opcional)</CardDescription>
                    </div>
                    {footerHtml && (
                        <Button onClick={() => setFooterHtml("")} variant="ghost" className="h-9 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-rose-500">
                            <RotateCcw className="h-3 w-3 mr-2" /> Limpar
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="p-6 border-t">
                    <div className="p-6 border-2 border-slate-100 rounded-[2rem] bg-slate-50/50 min-h-[100px]">
                        <RichTextEditor value={footerHtml} onChange={setFooterHtml} fontSize="9pt" minHeight="60px" placeholder="Ex.: endereço, telefone e horário de atendimento do órgão (opcional)" />
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
      )}
    </div>
  )
}

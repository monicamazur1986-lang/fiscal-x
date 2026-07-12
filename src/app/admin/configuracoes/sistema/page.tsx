
"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useAppConfig } from "@/hooks/use-app-config"
import { useStorage } from "@/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import {
  Sparkles,
  Upload,
  Loader2,
  Trash2,
  Layout,
  CheckCircle2,
  Image as ImageIcon,
  AlertCircle,
  CloudOff
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { BackButton } from "@/components/back-button"

export default function ConfigSistemaGlobalPage() {
  const { profile, loading: authLoading } = useAuth()
  const { systemLogo, updateSystemLogo } = useAppConfig()
  const storage = useStorage()
  const { toast } = useToast()
  const router = useRouter()
  
  const [uploading, setUploading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !authLoading) {
      if (!profile || profile.role !== 'root') {
        router.replace("/dashboard");
      }
    }
  }, [profile, authLoading, router, mounted]);

  if (!mounted || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
      </div>
    )
  }

  if (!profile || profile.role !== 'root') return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return;

    setUploading(true);
    try {
      if (storage) {
        // Upload oficial para o Storage
        const storageRef = ref(storage, `system/brand/logo_global_${Date.now()}`);
        const uploadResult = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(uploadResult.ref);
        await updateSystemLogo(url);
        toast({ title: "Marca Global Atualizada", description: "Logo persistido no Google Cloud." });
      } else {
        // Fallback para Data URL (Modo Emergência ou Storage offline)
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          await updateSystemLogo(base64);
          toast({ 
            title: "Marca Salva Localmente", 
            description: "Cloud Storage não configurado. A imagem será mantida via Base64." 
          });
        };
        reader.readAsDataURL(file);
      }
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Erro no Salvamento", 
        description: error.message 
      });
    } finally { setUploading(false); }
  }

  const handleRemoveLogo = async () => {
    try {
      await updateSystemLogo("");
      toast({ title: "Marca Redefinida" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao redefinir" });
    }
  }

  return (
    <div className="max-w-4xl mx-auto w-full p-4 sm:p-8 space-y-10 font-sans pb-32">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-900 text-white shadow-xl">
                <Sparkles className="h-6 w-6 text-emerald-400" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Marca do Sistema</h1>
          </div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] ml-1">Configurações Master (ROOT)</p>
        </div>
        <BackButton href="/dashboard" className="bg-transparent border-none shadow-none text-zinc-400" />
      </header>

      <div className="grid grid-cols-1 gap-8">
            <Card className="bg-white border-2 border-slate-200 rounded-[3rem] overflow-hidden shadow-2xl">
                <CardHeader className="p-10 text-center space-y-2">
                    <CardTitle className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic flex items-center justify-center gap-3">
                        <Layout className="h-6 w-6 text-primary" /> Logotipo do Sistema
                    </CardTitle>
                    <CardDescription className="text-zinc-500 font-bold uppercase text-[9px] tracking-widest">Este logo substitui o mascote padrão em todas as telas</CardDescription>
                </CardHeader>
                <CardContent className="p-10 space-y-10">
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-[3rem] bg-slate-50 gap-10">
                        <div className="relative w-full max-w-[280px] aspect-square group shadow-2xl bg-white rounded-[3rem] p-8 flex items-center justify-center overflow-hidden">
                            {systemLogo ? (
                                <img src={systemLogo} alt="Marca Global" className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105" />
                            ) : (
                                <div className="text-center opacity-20"><Sparkles className="h-20 w-20 mx-auto mb-4" /><p className="text-[10px] font-black uppercase tracking-widest">Mascote Padrão</p></div>
                            )}
                            
                            {systemLogo && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[3rem]">
                                    <Button onClick={handleRemoveLogo} variant="destructive" size="icon" className="h-12 w-12 rounded-full shadow-2xl"><Trash2 className="h-5 w-5" /></Button>
                                </div>
                            )}
                        </div>

                        <div className="w-full max-w-sm">
                            <Label htmlFor="system-logo-upload" className="cursor-pointer w-full group">
                                <div className="flex items-center justify-center gap-4 bg-slate-900 text-white h-16 rounded-2xl font-black uppercase text-[12px] tracking-widest group-hover:bg-slate-800 transition-all shadow-xl active:scale-95">
                                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5 text-emerald-400" />}
                                    {systemLogo ? "Substituir Imagem" : "Carregar Logotipo Oficial"}
                                </div>
                                <input 
                                    id="system-logo-upload" 
                                    type="file" 
                                    className="sr-only" 
                                    accept="image/*" 
                                    onChange={handleFileUpload} 
                                    disabled={uploading}
                                />
                            </Label>
                        </div>
                    </div>
                </CardContent>
            </Card>
      </div>

      <footer className="p-8 rounded-[3rem] bg-slate-100 border border-slate-200 flex items-center gap-6">
          <div className="p-4 bg-white rounded-2xl shadow-sm">
            {storage ? <CheckCircle2 className="h-8 w-8 text-emerald-500" /> : <CloudOff className="h-8 w-8 text-amber-500" />}
          </div>
          <div>
              <h4 className="text-[11px] font-black uppercase italic text-slate-900 leading-none">Status de Armazenamento</h4>
              <p className="text-[9px] font-bold uppercase text-slate-500 mt-1 tracking-widest leading-relaxed">
                  {storage 
                    ? "As imagens são persistidas no Google Cloud Storage e replicadas globalmente." 
                    : "O logo está sendo salvo localmente para o ambiente atual do sistema."}
              </p>
          </div>
      </footer>
    </div>
  )
}

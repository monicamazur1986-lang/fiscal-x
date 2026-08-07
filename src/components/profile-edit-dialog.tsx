"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { auth } from "@/lib/firebase"
import { 
  User, 
  Camera, 
  Loader2, 
  Save, 
  Pencil,
  Sparkles,
  CheckCircle2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
interface ProfileEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditDialog({ isOpen, onOpenChange }: ProfileEditDialogProps) {
  const { profile, updateProfileData } = useAuth()
  const { toast } = useToast()

  const [name, setName] = useState("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen && profile) {
        setName(profile.displayName || "");
        setPhotoUrl(profile.photoURL || "");
    }
  }, [isOpen, profile]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      toast({ variant: "destructive", title: "Erro no Upload", description: "Nenhum arquivo selecionado." });
      return;
    }

    setIsUploading(true)
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sessão expirada. Faça login novamente.");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.url) { // Verifica se a resposta foi bem-sucedida e se 'url' existe
        throw new Error(data.message || "Erro desconhecido no upload.");
      }

      console.log("Arquivo salvo em:", data.url);

      setPhotoUrl(data.url); // Use a URL pública retornada pela API
      toast({ title: "Upload concluído", description: "Foto de perfil atualizada." });
    } catch (error) {
      console.error("Erro no upload:", error);
      toast({ variant: "destructive", title: "Erro no Upload", description: (error as Error).message || "Ocorreu um erro ao enviar a imagem." });
    } finally {
      setIsUploading(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true)
    try {
      await updateProfileData({
        displayName: name.toUpperCase(),
        photoURL: photoUrl
      })
      toast({
        title: "Perfil Sincronizado",
        description: "Suas alterações agora estão disponíveis em todos os seus aparelhos."
      })
      onOpenChange(false)
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao Salvar" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white">
        <DialogHeader className="p-8 bg-zinc-900 text-white border-b border-white/5">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-2xl bg-primary/20 text-primary"><User className="h-6 w-6" /></div>
             <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Meu Perfil</DialogTitle>
                <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Dados sincronizados globalmente</DialogDescription>
             </div>
          </div>
        </DialogHeader>

        <div className="p-8 space-y-8 bg-zinc-50/50">
          <div className="flex flex-col items-center justify-center gap-6">
            <div className="relative group">
                <Avatar className="h-32 w-32 border-4 border-white shadow-2xl ring-4 ring-slate-100">
                    <AvatarImage src={photoUrl} />
                    <AvatarFallback className="bg-slate-200 text-slate-400 font-black text-3xl uppercase">
                        {(name || "F")[0]}
                    </AvatarFallback>
                </Avatar>
                <label className="absolute bottom-0 right-0 h-10 w-10 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 active:scale-95 transition-all border-4 border-white">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    <input type="file" className="sr-only" accept="image/*" onChange={handleFileUpload} disabled={isUploading} />
                </label>
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
               <CheckCircle2 className="h-3 w-3 text-emerald-500" />
               <span className="text-[8px] font-black uppercase text-emerald-600 tracking-widest">Armazenamento Local Ativo</span>
            </div>
          </div>

          <div className="space-y-4">
             <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Nome de Exibição</Label>
                <div className="relative">
                   <Pencil className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300" />
                   <Input
                     value={name}
                     onChange={e => setName(e.target.value.toUpperCase())}
                     className="h-14 pl-11 rounded-2xl bg-white border-none shadow-inner font-black text-slate-800 uppercase text-sm"
                     placeholder="SEU NOME"
                   />
                </div>
             </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
             <Sparkles className="h-5 w-5 text-blue-500 shrink-0" />
             <p className="text-[10px] font-bold text-blue-700 uppercase leading-relaxed">
               As alterações feitas aqui serão refletidas em todos os seus documentos e dispositivos imediatamente.
             </p>
          </div>
        </div>

        <DialogFooter className="p-6 bg-white border-t border-zinc-100 gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px] text-zinc-400">Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || isUploading} className="flex-[2] h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar e Sincronizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

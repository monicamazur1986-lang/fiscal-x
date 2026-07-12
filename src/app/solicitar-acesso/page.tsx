"use client"

import { useState, useMemo, Suspense } from "react"
import { useAuth } from "@/hooks/use-auth"
import {
  Loader2,
  User,
  ShieldCheck,
  Check,
  ChevronsUpDown,
  Upload,
  FileCheck2,
  Mail,
  Calendar,
  Briefcase,
  IdCard,
  Hash,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { BackButton } from "@/components/back-button"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import municipiosPR from "@/lib/municipios-pr.json"
import { cn, normalizeId } from "@/lib/utils"
import { useStorage } from "@/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { Alert, AlertDescription } from "@/components/ui/alert"

function SolicitarAcessoForm() {
  const { registerWithEmailPassword } = useAuth()
  const storage = useStorage()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [role, setRole] = useState<'fiscal' | 'admin'>(searchParams.get('tipo') === 'gestor' ? 'admin' : 'fiscal')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    nome: "",
    nascimento: "",
    cpf: "",
    cargo: "",
    email: "",
    municipio: "",
    password: "",
    confirmPassword: ""
  })

  const [documentFile, setDocumentFile] = useState<File | null>(null)

  const filteredMunicipios = useMemo(() => {
    const term = normalizeId(searchTerm);
    if (!term) return municipiosPR;
    return municipiosPR.filter(m => normalizeId(m).includes(term));
  }, [searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    
    if (formData.password !== formData.confirmPassword) {
      return setErrorMsg("As senhas digitadas não coincidem.")
    }

    if (!formData.municipio) {
      return setErrorMsg("Por favor, selecione seu município de atuação.")
    }

    if (role === 'admin') {
      const isInstitutional = formData.email.toLowerCase().trim().endsWith('.pr.gov.br');
      if (!isInstitutional) {
        return setErrorMsg("Gestores devem utilizar obrigatoriamente um e-mail institucional .pr.gov.br.")
      }
      if (!documentFile) {
        return setErrorMsg("O decreto de nomeação é obrigatório para cadastros de gestor.")
      }
    }

    setLoading(true)
    try {
      const normalizedMunicipioId = normalizeId(formData.municipio);

      await registerWithEmailPassword({
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        nome: formData.nome.toUpperCase(),
        municipioId: normalizedMunicipioId,
        role: role,
        metadata: {
          nascimento: formData.nascimento,
          cpf: formData.cpf,
          cargo: (formData.cargo || (role === 'admin' ? "GESTOR MUNICIPAL" : "FISCAL SANITÁRIO")).toUpperCase(),
          municipioNome: formData.municipio.toUpperCase(),
          fiscalCode: "" 
        }
      })

      if (role === 'admin' && documentFile && storage) {
        toast({ title: "Enviando Documento...", description: "Quase lá, salvando decreto de nomeação." });
        try {
          const storageRef = ref(storage, `decretos/${Date.now()}_${formData.cpf}`);
          await uploadBytes(storageRef, documentFile);
          const url = await getDownloadURL(storageRef);
        } catch (storageErr) {
          console.warn("Upload falhou mas conta criada", storageErr);
        }
      }

      toast({
        title: "Solicitação Enviada",
        description: "Seu cadastro foi realizado com sucesso. Aguarde a aprovação do Auditor."
      })
      router.push("/login")
    } catch (error: any) {
      setErrorMsg(error.message || "Erro inesperado. Tente novamente mais tarde.")
    } finally {
      setLoading(false)
    }
  }

  const handleSelectMunicipio = (val: string) => {
    setFormData(prev => ({ ...prev, municipio: val }));
    setOpen(false);
    setSearchTerm("");
  }

  return (
    <div className="w-full max-w-2xl space-y-6 relative z-10 py-10">
      <BackButton href="/login" label="Voltar ao Login" variant="dark" className="mb-4" />

      <Card className="bg-white border-none rounded-[2.5rem] shadow-2xl overflow-hidden">
        <CardHeader className="bg-slate-50 border-b border-slate-100 p-8 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto mb-4">
            <User className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Novo Cadastro</CardTitle>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Acesso exclusivo para servidores públicos</p>
        </CardHeader>
        
        <CardContent className="p-8 space-y-8">
          <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-2">
            <button 
              type="button" 
              onClick={() => setRole('fiscal')}
              className={cn("flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", role === 'fiscal' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400")}
            >
              Fiscal Sanitário
            </button>
            <button 
              type="button" 
              onClick={() => setRole('admin')}
              className={cn("flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", role === 'admin' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400")}
            >
              Gestor Municipal
            </button>
          </div>

          {errorMsg && (
            <Alert variant="destructive" className="bg-rose-50 border-rose-200 rounded-2xl">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs font-bold uppercase tracking-tight">{errorMsg}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">Município de Atuação</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-14 rounded-2xl border-slate-100 bg-slate-50 text-slate-900 font-bold uppercase justify-between hover:bg-slate-100"
                  >
                    {formData.municipio ? formData.municipio.toUpperCase() : "Clique para selecionar sua cidade..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border-slate-200 rounded-2xl shadow-2xl">
                  <Command className="bg-transparent" shouldFilter={false}>
                    <CommandInput 
                      placeholder="Pesquisar cidade..." 
                      value={searchTerm}
                      onValueChange={setSearchTerm}
                      className="h-12 border-none focus:ring-0" 
                    />
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      {filteredMunicipios.length === 0 && (
                        <CommandEmpty className="p-4 text-center text-[10px] text-slate-400 uppercase font-bold">Não encontrado.</CommandEmpty>
                      )}
                      <CommandGroup>
                        {filteredMunicipios.map((m) => (
                          <div
                            key={m}
                            onClick={() => handleSelectMunicipio(m)}
                            className="hover:bg-blue-50 cursor-pointer py-3.5 px-4 transition-colors font-bold uppercase text-xs border-b border-slate-50 last:border-0"
                          >
                            {m}
                          </div>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">Nome Completo</Label>
                <Input value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none uppercase font-bold" required />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">CPF</Label>
                <Input placeholder="000.000.000-00" value={formData.cpf} onChange={(e) => setFormData({...formData, cpf: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold" required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">Data de Nascimento</Label>
                <Input placeholder="DD/MM/AAAA" value={formData.nascimento} onChange={(e) => setFormData({...formData, nascimento: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold" required />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">Cargo Atual</Label>
                <Input placeholder="Ex: Fiscal Sanitário" value={formData.cargo} onChange={(e) => setFormData({...formData, cargo: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold uppercase" required />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">E-mail para Login</Label>
              <Input type="email" placeholder="seu@email.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none font-bold" required />
              {role === 'admin' && <p className="text-[9px] font-black text-blue-600 uppercase mt-1 ml-1">Obrigatório uso de e-mail .pr.gov.br para gestores.</p>}
            </div>

            {role === 'admin' && (
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase text-blue-600 ml-1">Decreto de Nomeação</Label>
                <div className={cn("relative border-2 border-dashed rounded-2xl p-6 text-center transition-all", documentFile ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-primary/40")}>
                  <input type="file" id="doc-upload" className="sr-only" accept=".pdf,image/*" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} />
                  <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    {documentFile ? (
                      <>
                        <FileCheck2 className="h-8 w-8 text-emerald-600" />
                        <p className="text-xs font-bold text-emerald-900 uppercase truncate max-w-[250px]">{documentFile.name}</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-slate-300" />
                        <p className="text-[10px] font-black text-slate-400 uppercase">Anexar PDF ou Foto do Decreto</p>
                      </>
                    )}
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">Senha de Acesso</Label>
                <Input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none" required />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase text-slate-500 ml-1">Confirmar Senha</Label>
                <Input type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} className="h-14 rounded-2xl bg-slate-50 border-none" required />
              </div>
            </div>

            <Button type="submit" disabled={loading} className={cn("w-full h-16 font-black uppercase text-[12px] tracking-[0.2em] rounded-2xl shadow-xl transition-all active:scale-95", role === 'admin' ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700")}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Solicitar Credencial"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SolicitarAcessoPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-start p-6 font-sans relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 left-[-10%] w-[50%] h-[50%] bg-blue-100 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-[-10%] w-[50%] h-[50%] bg-emerald-50 blur-[120px] rounded-full" />
      </div>

      <Suspense fallback={<Loader2 className="h-12 w-12 animate-spin text-primary" />}>
        <SolicitarAcessoForm />
      </Suspense>
    </div>
  )
}

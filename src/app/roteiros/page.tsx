
"use client"

import {
  ClipboardList,
  Search,
  FileText,
  ChevronRight,
  ShieldCheck,
  Plus
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { BackButton } from "@/components/back-button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

// ÍCONE CUSTOMIZADO: DENTE (ODONTOLOGIA)
const ToothIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M5 8c.5-4.5 2.5-5 7-5s6.5.5 7 5c.3 3.5-1 5-2 6 .5 3 0 5.5-1.5 7-1.5-1.5-2-4-1.5-7-.5-.5-1.5-.5-2 0 .5 3 0 5.5-1.5 7-1.5-1.5-2-4-1.5-7-1-1-2.3-2.5-2-6Z" />
  </svg>
)

const roteiros = [
  { id: 'odontologia', titulo: 'Roteiro de Inspeção de Odontologia', categoria: 'Saúde', icone: ToothIcon, cor: 'text-emerald-500', base: 'Resolução SESA nº 0414/2001' },
]

export default function RoteirosPage() {
  const [search, setSearch] = useState("")
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false)

  const filteredRoteiros = roteiros.filter(r => 
    r.titulo.toLowerCase().includes(search.toLowerCase()) || 
    r.categoria.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto w-full p-4 sm:p-8 space-y-8 font-sans">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary shadow-lg shadow-primary/10">
                <ClipboardList className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Roteiros Técnicos</h1>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] ml-1">Instrumentos oficiais para fiscalização sanitária</p>
        </div>

        <div className="flex items-center gap-3">
           <BackButton href="/dashboard" />

           <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
             <DialogTrigger asChild>
                <Button className="h-12 px-6 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest gap-2 shadow-xl shadow-primary/20 transition-all active:scale-95">
                  <Plus className="h-4 w-4" /> Novo Roteiro
                </Button>
             </DialogTrigger>
             <DialogContent className="rounded-[2.5rem] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Criar Novo Roteiro</DialogTitle>
                  <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Defina o título do novo instrumento de fiscalização
                  </DialogDescription>
                </DialogHeader>
                <div className="py-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-zinc-400 ml-1">Título do Roteiro</Label>
                    <Input placeholder="EX: MODELO UNIVERSAL DE INSPEÇÃO" className="h-12 rounded-xl bg-zinc-50 border-none font-bold text-xs uppercase" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setIsNewDialogOpen(false)} className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest">
                    Iniciar Cadastro
                  </Button>
                </DialogFooter>
             </DialogContent>
           </Dialog>
        </div>
      </header>

      <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] p-4 flex items-center shadow-xl shadow-slate-200/50">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Buscar roteiro por atividade ou categoria..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-14 rounded-2xl border-none bg-slate-50 text-slate-900 placeholder:text-slate-400 font-bold text-sm focus-visible:ring-primary/20" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredRoteiros.map((r) => (
          <Link key={r.id} href={`/roteiros/${r.id}`}>
            <div className="group bg-white border-2 border-slate-100 p-8 rounded-[3rem] hover:border-primary/30 transition-all cursor-pointer shadow-sm hover:shadow-2xl active:scale-[0.98] h-full flex flex-col justify-between">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className={cn("p-5 rounded-3xl bg-slate-50 shadow-inner group-hover:scale-110 transition-transform duration-500", r.cor)}>
                    <r.icone className="h-8 w-8" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{r.categoria}</span>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-tight group-hover:text-primary transition-colors">{r.titulo}</h3>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-primary group-hover:text-white transition-all">
                  <ChevronRight className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Base: {r.base}</span>
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-primary bg-primary/5 px-3 py-1.5 rounded-full">
                      <FileText className="h-3 w-3" /> Iniciar Inspeção
                  </div>
              </div>
            </div>
          </Link>
        ))}

        {filteredRoteiros.length === 0 && (
            <div className="col-span-full py-40 flex flex-col items-center justify-center gap-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem]">
                <ClipboardList className="h-16 w-16 text-slate-200" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">Nenhum roteiro técnico encontrado</p>
            </div>
        )}
      </div>

      <footer className="bg-slate-900 text-white p-8 rounded-[3rem] flex flex-col sm:flex-row items-center gap-6 shadow-2xl">
          <div className="p-4 rounded-3xl bg-white/10">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="flex-1">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-1">Validade Técnica</p>
              <p className="text-[10px] font-medium text-slate-400 uppercase leading-relaxed">
                  Estes roteiros são ferramentas de apoio e não substituem o livre convencimento da autoridade sanitária. 
                  Sempre verifique as atualizações de resoluções da SESA e ANVISA.
              </p>
          </div>
      </footer>
    </div>
  )
}

"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Plus, Trash2, UserPlus, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { autoridadeSchema } from "@/lib/schema"
import { useToast } from "@/hooks/use-toast"
import { Separator } from "./ui/separator"
import { Autoridade } from "@/lib/types"

interface GerenciarAutoridadesDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    addAutoridade: (data: z.infer<typeof autoridadeSchema>) => Promise<void>;
    deleteAutoridade: (id: string) => Promise<void>;
    autoridades: Autoridade[];
}

export function GerenciarAutoridadesDialog({ 
  isOpen, 
  onOpenChange, 
  addAutoridade, 
  deleteAutoridade, 
  autoridades 
}: GerenciarAutoridadesDialogProps) {
  const { toast } = useToast()

  const form = useForm<z.infer<typeof autoridadeSchema>>({
    resolver: zodResolver(autoridadeSchema.omit({ id: true })),
    defaultValues: {
      nome: "",
      cargo: "",
      rg: "",
    },
  })

  const { isSubmitting } = form.formState

  async function onSubmit(data: z.infer<typeof autoridadeSchema>) {
    try {
      await addAutoridade(data)
      form.reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro na Operação",
        description: "Ocorreu uma falha ao tentar salvar o registro.",
      })
    }
  }
  
  async function handleDelete(id: string) {
    if (!window.confirm("Deseja remover este fiscal da lista?")) return;
    try {
      await deleteAutoridade(id)
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao remover" })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px] rounded-[2.5rem] border-none bg-white text-zinc-950 shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-8 bg-zinc-50 border-b border-zinc-100">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase italic tracking-tighter text-zinc-900">Gerenciar Fiscais</DialogTitle>
              <DialogDescription className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                Cadastro central de autoridades sanitárias
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-8 space-y-6">
            <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Fiscais Ativos</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {autoridades.map((autoridade) => (
                        <div key={autoridade.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group transition-all hover:bg-zinc-100/50">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-primary border border-zinc-200">
                                {autoridade.nome[0]}
                            </div>
                            <div>
                                <p className="text-xs font-black tracking-tight text-zinc-900">{autoridade.nome}</p>
                                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{autoridade.cargo}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(autoridade.id)} className="h-8 w-8 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                    ))}
                    {autoridades.length === 0 && (
                        <p className="text-[10px] text-zinc-400 font-bold uppercase text-center py-8">Nenhum fiscal cadastrado.</p>
                    )}
                </div>
            </div>
            
            <Separator className="bg-zinc-100" />

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Novo Cadastro</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <FormField
                        control={form.control}
                        name="nome"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="text-[9px] font-black uppercase text-zinc-500">Nome Completo</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: João da Silva" {...field} className="rounded-xl bg-zinc-50 border-zinc-200 h-11 text-xs font-bold focus-visible:ring-primary/20 text-zinc-900" />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="cargo"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="text-[9px] font-black uppercase text-zinc-500">Cargo</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: Fiscal Sanitário" {...field} className="rounded-xl bg-zinc-50 border-zinc-200 h-11 text-xs font-bold focus-visible:ring-primary/20 text-zinc-900" />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                 <FormField
                    control={form.control}
                    name="rg"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel className="text-[9px] font-black uppercase text-zinc-500">RG/CPF N°</FormLabel>
                        <FormControl>
                            <Input placeholder="Ex: 12.345.678-9" {...field} className="rounded-xl bg-zinc-50 border-zinc-200 h-11 text-xs font-bold focus-visible:ring-primary/20 text-zinc-900" />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 transition-all active:scale-95">
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Salvar Autoridade
                  </Button>
                </DialogFooter>
              </form>
            </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
"use client"
import { useState, useMemo } from "react";
import { UserPlus, Plus, Check, Loader2, Search } from "lucide-react";
import { useAutoridades } from "@/hooks/use-autoridades";
import { Autoridade } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Command, CommandInput, CommandList } from "@/components/ui/command";
import { GerenciarAutoridadesDialog } from "./gerenciar-autoridades-dialog";
import { cn } from "@/lib/utils";

export function SelecionarAutoridadeParaFormulario({ onSelect }: { onSelect: (autoridade: Autoridade) => void }) {
    const { autoridades, addAutoridade, deleteAutoridade, loading } = useAutoridades();
    const [isOpen, setIsOpen] = useState(false);
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

    const filteredAutoridades = useMemo(() => {
        if (!searchTerm.trim()) return autoridades;
        const term = searchTerm.toLowerCase();
        return autoridades.filter(a => 
            (a.nome || "").toLowerCase().includes(term) || 
            (a.cargo || "").toLowerCase().includes(term) ||
            (a.rg || "").toLowerCase().includes(term)
        );
    }, [autoridades, searchTerm]);

    const handleSelect = (autoridade: Autoridade) => {
        const formattedAuth: Autoridade = {
            id: autoridade.id || Math.random().toString(),
            nome: (autoridade.nome || ""),
            cargo: (autoridade.cargo || ""),
            rg: (autoridade.rg || ""),
            signature: autoridade.signature || ""
        };

        onSelect(formattedAuth);
        setLastSelectedId(autoridade.id);
        
        setTimeout(() => {
            setIsOpen(false);
            setLastSelectedId(null);
            setSearchTerm("");
        }, 450);
    }
    
    return (
        <>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                 <Button variant="ghost" size="sm" className="no-print h-9 gap-1.5 px-4 rounded-xl font-black text-[9px] uppercase tracking-widest menu-metallic-cobalt text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-all shrink-0">
                    <UserPlus className="h-4 w-4" />
                    + FISCAL
                </Button>
            </DialogTrigger>
            <DialogContent 
                className="sm:max-w-xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white"
            >
                <DialogHeader className="bg-zinc-900 text-white p-6 sm:p-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-primary/20 text-primary">
                            <UserPlus className="h-6 w-6" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Fiscais Disponíveis</DialogTitle>
                            <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                                Selecione o fiscal para adicionar à autuação
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="p-4 sm:p-6 bg-white flex flex-col gap-4">
                    <Command className="border-zinc-200 rounded-2xl shadow-inner bg-white overflow-hidden" shouldFilter={false}>
                        <div className="flex items-center border-b border-zinc-100 px-4 bg-zinc-50/50">
                            <Search className="h-4 w-4 text-zinc-400 mr-2" />
                            <CommandInput 
                                placeholder="Pesquisar por nome ou cargo..." 
                                value={searchTerm}
                                onValueChange={setSearchTerm}
                                className="h-14 font-medium text-zinc-900 placeholder:text-zinc-400 border-none focus:ring-0" 
                            />
                        </div>
                        <CommandList className="max-h-[40vh] p-2">
                            {loading ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Carregando lista...</p>
                                </div>
                            ) : filteredAutoridades.length > 0 ? (
                                <div className="space-y-2">
                                    {filteredAutoridades.map(autoridade => (
                                        <div 
                                            key={autoridade.id}
                                            onClick={() => handleSelect(autoridade)}
                                            className={cn(
                                                "cursor-pointer flex items-center justify-between p-4 rounded-2xl transition-all border border-transparent group",
                                                lastSelectedId === autoridade.id 
                                                    ? "bg-primary/10 border-primary/20" 
                                                    : "bg-zinc-50 hover:bg-zinc-100 border-zinc-100"
                                            )}
                                        >
                                            <div className="flex items-center gap-4 flex-grow">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-xl flex items-center justify-center font-black text-xs transition-colors",
                                                    lastSelectedId === autoridade.id ? "bg-primary text-white" : "bg-zinc-200 text-zinc-500"
                                                )}>
                                                    {(autoridade.nome || "F")[0].toUpperCase()}
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className={cn(
                                                        "font-black text-sm tracking-tight transition-colors",
                                                        lastSelectedId === autoridade.id ? "text-primary" : "text-zinc-900"
                                                    )}>{autoridade.nome}</span>
                                                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                                                        {autoridade.cargo} — RG/CPF: {autoridade.rg}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className={cn(
                                                "shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                                                lastSelectedId === autoridade.id 
                                                    ? "bg-primary text-white scale-110 shadow-lg shadow-primary/20" 
                                                    : "bg-white text-zinc-300 group-hover:text-primary group-hover:bg-primary/10"
                                            )}>
                                                {lastSelectedId === autoridade.id ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-24 text-center">
                                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Nenhum fiscal encontrado.</p>
                                </div>
                            )}
                        </CommandList>
                    </Command>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2 px-2">
                        <p className="text-[9px] text-zinc-400 uppercase font-black tracking-widest">
                            {autoridades.length} fiscais cadastrados
                        </p>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setIsManageOpen(true)} 
                            className="h-10 px-4 rounded-xl text-[9px] font-black uppercase text-zinc-500 hover:bg-zinc-50 border-zinc-200"
                        >
                            Gerenciar Fiscais
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <GerenciarAutoridadesDialog 
            isOpen={isManageOpen}
            onOpenChange={setIsManageOpen}
            addAutoridade={addAutoridade} 
            deleteAutoridade={deleteAutoridade} 
            autoridades={autoridades}
        />
        </>
    )
}

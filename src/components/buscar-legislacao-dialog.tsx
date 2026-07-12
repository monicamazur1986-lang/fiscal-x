"use client"

import { useState, useMemo } from "react"
import { BookMarked, PlusCircle, Check, Search, ShieldCheck, Landmark, Stethoscope, Loader2, ChevronRight } from "lucide-react"

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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import legislacaoData from "@/lib/legislacao.json"
import type { ArtigoLegislacao } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  onSelect: (texto: string) => void;
}

export function BuscarLegislacaoDialog({ onSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("");
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const handleSelect = (artigo: ArtigoLegislacao, leiTitulo: string) => {
    const lawName = leiTitulo.split(' - ')[0];
    
    const normalizedLabel = artigo.label
      .replace("Art.", "art.")
      .replace("Inciso", "inciso");

    const formattedText = `${lawName}, ${normalizedLabel}`;
    
    setLastSelectedId(artigo.id);
    onSelect(formattedText);

    setTimeout(() => {
      setLastSelectedId(null);
    }, 800);
  }

  const normalizeText = (text: string) => 
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const laws = [
    { 
      key: 'LEI_MUNICIPAL_2276_2017', 
      title: 'Lei Municipal 2.276/2017', 
      desc: 'Código de Vigilância de Prudentópolis',
      icon: ShieldCheck,
      color: 'text-blue-500'
    },
    { 
      key: 'LEI_ESTADUAL_13331_2001', 
      title: 'Lei Estadual 13.331/2001', 
      desc: 'Código de Saúde do Paraná',
      icon: Landmark,
      color: 'text-emerald-500'
    },
    { 
      key: 'ODONTOLOGIA', 
      title: 'Normas de Odontologia', 
      desc: 'Resoluções SESA / RDC 63',
      icon: Stethoscope,
      color: 'text-violet-500'
    }
  ];

  const filteredLaws = useMemo(() => {
    const term = normalizeText(searchTerm);
    if (!term) return laws.map(law => ({ ...law, articles: undefined as any[] | undefined, hasMatch: true }));

    return laws.map(law => {
      const articles = (legislacaoData as any)[law.key].artigos.filter((art: any) => 
        normalizeText(art.label).includes(term) || 
        normalizeText(art.texto).includes(term) ||
        normalizeText(art.keywords || "").includes(term)
      );
      return { ...law, articles, hasMatch: articles.length > 0 || normalizeText(law.title).includes(term) };
    }).filter(law => law.hasMatch);
  }, [searchTerm]);

  const resetDialog = () => {
    setSearchTerm("");
    setLastSelectedId(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if(!open) resetDialog(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="no-print h-8 gap-1.5 px-2 rounded-lg font-black text-[9px] uppercase tracking-widest text-primary hover:bg-primary/10 border border-primary/10">
          <BookMarked className="h-3.5 w-3.5" />
          + LEI
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-3xl max-h-[90vh] flex flex-col rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        
        <DialogHeader className="bg-zinc-900 text-white p-6 sm:p-8 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-primary/20 text-primary">
                <BookMarked className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
                  Base Legal Salva
                </DialogTitle>
                <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                  Pesquise por termos ou navegue nas leis abaixo
                </DialogDescription>
              </div>
            </div>
            <Button 
              onClick={() => setIsOpen(false)}
              className="h-10 px-6 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
            >
              Finalizar
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder="Pesquisar infração (ex: validade, alvará, porco, higiene...)" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 h-12 rounded-xl bg-white border-zinc-200 shadow-sm font-medium focus-visible:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar p-4 sm:p-6 bg-zinc-50">
          <Accordion type="multiple" className="space-y-3">
            {filteredLaws.map((law) => {
              const fullLaw = (legislacaoData as any)[law.key];
              const articlesToShow = law.articles || fullLaw.artigos;

              return (
                <AccordionItem 
                  key={law.key} 
                  value={law.key}
                  className="bg-white border border-zinc-100 rounded-[2rem] overflow-hidden shadow-sm px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-6">
                    <div className="flex items-center gap-5 text-left">
                      <div className={cn("p-4 rounded-2xl bg-zinc-50 shadow-inner", law.color)}>
                        <law.icon className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm uppercase text-zinc-900 tracking-tight">{law.title}</h3>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{law.desc}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6">
                    <div className="space-y-1 mt-2">
                      {articlesToShow.map((artigo: any) => (
                        <div
                          key={artigo.id}
                          onClick={() => handleSelect(artigo, fullLaw.titulo)}
                          className={cn(
                            "cursor-pointer flex items-center justify-between p-4 rounded-2xl border border-transparent transition-all group",
                            lastSelectedId === artigo.id ? "bg-emerald-50 border-emerald-200" : "hover:bg-zinc-50"
                          )}
                        >
                          <div className="flex flex-col gap-1.5 pr-4 flex-grow">
                            <span className={cn(
                              "font-black text-xs uppercase tracking-tight transition-colors",
                              lastSelectedId === artigo.id ? "text-emerald-600" : "text-zinc-900"
                            )}>
                              {artigo.label}
                            </span>
                            <span className="text-[12px] text-zinc-600 leading-relaxed font-medium">
                              {artigo.texto}
                            </span>
                          </div>
                          <div className={cn(
                            "shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                            lastSelectedId === artigo.id 
                              ? "bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/20" 
                              : "bg-white border border-zinc-100 text-zinc-300 group-hover:text-primary group-hover:border-primary/20"
                          )}>
                            {lastSelectedId === artigo.id ? <Check className="h-5 w-5" /> : <PlusCircle className="h-5 w-5" />}
                          </div>
                        </div>
                      ))}
                      {articlesToShow.length === 0 && (
                         <p className="text-[10px] text-center py-10 font-bold uppercase text-zinc-300 tracking-widest">Nenhuma infração compatível nesta lei</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {filteredLaws.length === 0 && (
             <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
                <div className="h-16 w-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-300">
                  <Search className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Nenhuma lei ou artigo encontrado</p>
                  <p className="text-[9px] font-bold uppercase text-zinc-300 mt-1">Tente palavras mais simples ou limpe o filtro.</p>
                </div>
             </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-white border-t border-zinc-100 flex items-center justify-center">
          <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">
            Clique nos artigos para adicionar. O sistema agrupa incisos automaticamente.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
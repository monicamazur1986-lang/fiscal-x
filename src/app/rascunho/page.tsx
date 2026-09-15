"use client";

import { useState } from "react";
import { Sparkles, MessageCircleQuestion, Bot } from "lucide-react";
import { GerarRascunho } from "@/components/gerar-rascunho";
import { FiscalXChat } from "@/components/fiscal-x-chat";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * "Fiscal AI" unifica, num único ambiente, as duas formas de usar IA com
 * base na legislação sanitária: gerar o rascunho de um documento (aba
 * "Gerar Rascunho") ou tirar uma dúvida de campo em formato de conversa
 * (aba "Perguntar" — ver FiscalXChat). Antes eram duas telas/itens de menu
 * separados ("Fiscal AI" e "Pergunte ao Fiscal-X").
 *
 * O título da tela mora AQUI, e não dentro de GerarRascunho: ele nomeia as
 * duas abas, não só uma. Quando estava lá dentro, aparecia embaixo das abas
 * e dava a impressão de ser o título só da primeira.
 */
export default function RascunhoPage() {
    const [caseDescription, setCaseDescription] = useState("");

    return (
        <div className="max-w-5xl mx-auto w-full px-4 pt-5 space-y-5">
            <header className="flex items-center gap-3 no-print">
                <div className="p-2.5 rounded-xl bg-[#0E4A44] text-white shadow-sm shrink-0">
                    <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <h1 className="font-serif text-2xl sm:text-3xl text-[#262420] leading-tight">Fiscal AI</h1>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#A39D8C]">
                        Assistente inteligente da legislação sanitária
                    </p>
                </div>
            </header>

            <Tabs defaultValue="gerar" className="w-full">
                {/* Aba ativa em cheio na cor do sistema: no print anterior as duas
                    ficavam quase iguais e não dava pra saber onde se estava. */}
                <TabsList className="grid w-full max-w-lg grid-cols-2 h-auto bg-white border border-[#E4DFD1] rounded-2xl p-1.5 gap-1.5 shadow-sm">
                    <TabsTrigger
                        value="gerar"
                        className="gap-2 rounded-xl px-3 py-2.5 text-[12px] font-black uppercase tracking-wide text-[#6B6659] transition-colors hover:bg-[#F1EEE4] data-[state=active]:bg-[#0E4A44] data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                        <Sparkles className="h-4 w-4" /> Gerar Rascunho
                    </TabsTrigger>
                    <TabsTrigger
                        value="perguntar"
                        className="gap-2 rounded-xl px-3 py-2.5 text-[12px] font-black uppercase tracking-wide text-[#6B6659] transition-colors hover:bg-[#F1EEE4] data-[state=active]:bg-[#0E4A44] data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                        <MessageCircleQuestion className="h-4 w-4" /> Perguntar
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="gerar">
                    <GerarRascunho caseDescription={caseDescription} setCaseDescription={setCaseDescription} />
                </TabsContent>
                <TabsContent value="perguntar" className="pb-40">
                    <FiscalXChat />
                </TabsContent>
            </Tabs>
        </div>
    );
}

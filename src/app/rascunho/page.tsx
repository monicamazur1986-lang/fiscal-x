"use client";

import { useState } from "react";
import { Sparkles, MessageCircleQuestion } from "lucide-react";
import { GerarRascunho } from "@/components/gerar-rascunho";
import { FiscalXChat } from "@/components/fiscal-x-chat";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * "Fiscal AI" unifica, num único ambiente, as duas formas de usar IA com
 * base na legislação sanitária: gerar o rascunho de um documento (aba
 * "Gerar Rascunho") ou tirar uma dúvida de campo em formato de conversa
 * (aba "Perguntar" — ver FiscalXChat). Antes eram duas telas/itens de menu
 * separados ("Fiscal AI" e "Pergunte ao Fiscal-X").
 */
export default function RascunhoPage() {
    const [caseDescription, setCaseDescription] = useState("");

    return (
        <div className="max-w-5xl mx-auto w-full px-4 pt-4">
            <Tabs defaultValue="gerar" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="gerar" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Gerar Rascunho</TabsTrigger>
                    <TabsTrigger value="perguntar" className="gap-1.5"><MessageCircleQuestion className="h-3.5 w-3.5" /> Perguntar</TabsTrigger>
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

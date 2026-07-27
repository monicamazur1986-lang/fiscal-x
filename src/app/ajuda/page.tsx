"use client"

import { useState, useMemo } from "react"
import { HelpCircle, Search, Plus, Pencil, Trash2, Loader2, Inbox, Download } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useAuth } from "@/hooks/use-auth"
import { useFaq } from "@/hooks/use-faq"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { FaqItem } from "@/lib/types"

const CATEGORIA_PADRAO = "Geral";

// Conjunto inicial de perguntas, pra quem for gestor não começar do zero.
// Importado manualmente (botão "Importar Perguntas Padrão"), nunca escrito
// sozinho — assim o admin decide quando quer isso na base.
const DEFAULT_FAQ_SEED: { category: string; question: string; answer: string }[] = [
  {
    category: "Autuações",
    question: "Como eu crio uma nova autuação (termo de intimação ou auto de infração)?",
    answer: "No menu, toque em \"Nova Autuação\". Preencha os dados do estabelecimento, do responsável e a descrição da irregularidade. O sistema calcula automaticamente o prazo de defesa e organiza tudo pra você baixar o PDF oficial no final.",
  },
  {
    category: "Autuações",
    question: "Como funciona o cálculo do prazo de defesa?",
    answer: "O prazo é contado em dias úteis a partir da data de recebimento da autuação, descontando sábados, domingos e feriados. Ele aparece na tela de Documentos e também gera um alerta no Dashboard quando vence no dia.",
  },
  {
    category: "Autuações",
    question: "Posso salvar uma autuação como rascunho e continuar depois?",
    answer: "Sim. Toque em \"Salvar\" a qualquer momento durante o preenchimento; ela fica guardada em Documentos com o status \"Rascunho\" até você finalizar e gerar o PDF.",
  },
  {
    category: "Autuações",
    question: "Como organizo minhas autuações em pastas?",
    answer: "Em Documentos, use \"Nova Pasta\" pra criar categorias (por bairro, tipo de estabelecimento etc.) e mova os documentos pra dentro delas pelo menu de cada item.",
  },
  {
    category: "Roteiros de Inspeção",
    question: "O que é o Roteiro de Inspeção?",
    answer: "É o checklist oficial (ex.: Odontologia) que você preenche durante a vistoria, item por item, marcando Sim/Não/Não se aplica, anexando fotos e observações. Ele gera automaticamente um relatório de não conformidades no final.",
  },
  {
    category: "Roteiros de Inspeção",
    question: "Como eu incluo uma irregularidade que não está no checklist oficial?",
    answer: "Na tela de preenchimento, use a seção \"Não Conformidade Adicional\" pra descrever o problema e escolher a criticidade (Imprescindível, Necessário ou Recomendável) manualmente.",
  },
  {
    category: "Roteiros de Inspeção",
    question: "Como funciona o prazo de regularização no relatório do roteiro?",
    answer: "Você define o número de dias e a base legal (lei ou resolução) na seção \"Prazo para Regularização e Anexos\", antes de baixar o PDF. Prudentópolis já vem com 30 dias e a Lei Municipal nº 2.276/2017 preenchidos por padrão.",
  },
  {
    category: "Fiscal AI",
    question: "O que o Fiscal AI faz?",
    answer: "É um assistente de redação (Claude) que ajuda a transformar uma descrição informal da fiscalização num texto técnico e formal, pronto pra virar autuação — sem exagerar e sem trocar os fatos relatados.",
  },
  {
    category: "Fiscal AI",
    question: "Existe limite de uso do Fiscal AI?",
    answer: "Sim, há um limite mensal de gerações por usuário. Quando atingido, o sistema avisa e mantém seu texto original sem revisão até o mês seguinte.",
  },
  {
    category: "Biblioteca",
    question: "Onde encontro as leis e resoluções aplicáveis?",
    answer: "Em Biblioteca, organizada por esfera (federal, estadual, municipal). Documentos municipais só aparecem pra quem é daquele município; a pasta geral (estadual/federal) é visível pra todos.",
  },
  {
    category: "Docfacil",
    question: "Para que serve o Docfacil?",
    answer: "Pra gerar ofícios, memorandos e circulares a partir de modelos prontos, sem precisar redigir do zero toda vez.",
  },
  {
    category: "Conta e Acesso",
    question: "Como solicito acesso ao sistema?",
    answer: "Use a tela \"Solicitar Acesso\" na tela de login; um admin do seu município vai aprovar seu cadastro em Admin > Usuários.",
  },
  {
    category: "Conta e Acesso",
    question: "Um usuário foi revogado por engano, dá pra desfazer?",
    answer: "Sim. Em Admin > Usuários, a seção \"Acesso Revogado\" tem um botão \"Reautorizar\" pra devolver o acesso sem precisar recriar a conta.",
  },
  {
    category: "Suporte",
    question: "Encontrei um erro ou tenho uma sugestão, o que eu faço?",
    answer: "Abra um chamado em \"Suporte Técnico\", descrevendo o problema. A equipe responde por ali mesmo e você recebe uma notificação quando for resolvido.",
  },
];

export default function AjudaPage() {
  const { profile } = useAuth();
  const { items, loading, addFaqItem, updateFaqItem, deleteFaqItem } = useFaq();
  const { toast } = useToast();
  const isGestor = profile?.role === 'admin' || profile?.role === 'root';

  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<FaqItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formCategory, setFormCategory] = useState(CATEGORIA_PADRAO);
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const normalize = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const handleImportDefaults = async () => {
    setIsImporting(true);
    try {
      const existingQuestions = new Set(items.map(i => normalize(i.question)));
      const toImport = DEFAULT_FAQ_SEED.filter(seed => !existingQuestions.has(normalize(seed.question)));
      if (toImport.length === 0) {
        toast({ title: "Nada para importar", description: "Todas as perguntas padr\u00e3o j\u00e1 est\u00e3o cadastradas." });
        return;
      }
      const orderByCategory = new Map<string, number>();
      items.forEach(i => {
        const key = i.category || CATEGORIA_PADRAO;
        orderByCategory.set(key, Math.max(orderByCategory.get(key) ?? -1, i.order));
      });
      for (const seed of toImport) {
        const nextOrder = (orderByCategory.get(seed.category) ?? -1) + 1;
        orderByCategory.set(seed.category, nextOrder);
        await addFaqItem({ category: seed.category, question: seed.question, answer: seed.answer, order: nextOrder });
      }
      toast({ title: `${toImport.length} pergunta(s) importada(s)` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao importar", description: e?.message });
    } finally {
      setIsImporting(false);
    }
  };

  const existingCategories = useMemo(() => {
    const set = new Set(items.map(i => i.category).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const filteredGroups = useMemo(() => {
    const term = normalize(search);
    const filtered = term
      ? items.filter(i => normalize(i.question).includes(term) || normalize(i.answer).includes(term) || normalize(i.category).includes(term))
      : items;

    const groups = new Map<string, FaqItem[]>();
    filtered.forEach(item => {
      const key = item.category || CATEGORIA_PADRAO;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, search]);

  const openNewForm = () => {
    setEditingItem(null);
    setFormCategory(existingCategories[0] || CATEGORIA_PADRAO);
    setFormQuestion("");
    setFormAnswer("");
    setIsFormOpen(true);
  };

  const openEditForm = (item: FaqItem) => {
    setEditingItem(item);
    setFormCategory(item.category);
    setFormQuestion(item.question);
    setFormAnswer(item.answer);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formQuestion.trim() || !formAnswer.trim()) return;
    setIsSaving(true);
    try {
      const category = formCategory.trim() || CATEGORIA_PADRAO;
      if (editingItem) {
        await updateFaqItem(editingItem.id, {
          category,
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          order: editingItem.order,
        });
        toast({ title: "Pergunta atualizada" });
      } else {
        const orderInCategory = items.filter(i => (i.category || CATEGORIA_PADRAO) === category).length;
        await addFaqItem({
          category,
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          order: orderInCategory,
        });
        toast({ title: "Pergunta adicionada" });
      }
      setIsFormOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: e?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: FaqItem) => {
    if (!window.confirm(`Excluir a pergunta "${item.question}"?`)) return;
    try {
      await deleteFaqItem(item.id);
      toast({ title: "Pergunta excluída" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e?.message });
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        title="Central de Ajuda"
        subtitle="Manual e perguntas frequentes do sistema"
        actions={isGestor ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleImportDefaults}
              disabled={isImporting}
              className="h-9 rounded-md gap-1.5 text-xs font-medium border-[#E4DFD1]"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Importar Perguntas Padrão
            </Button>
            <Button size="sm" onClick={openNewForm} className="h-9 rounded-md gap-1.5 text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">
              <Plus className="h-4 w-4" /> Nova Pergunta
            </Button>
          </div>
        ) : undefined}
      />

      <div className="max-w-3xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
          <Input
            placeholder="Buscar por palavra-chave..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 rounded-md border-[#E4DFD1] bg-white text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#A39D8C]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center border border-dashed border-[#E4DFD1] rounded-lg bg-white">
            <Inbox className="h-8 w-8 text-[#A39D8C]" />
            <p className="text-sm text-[#6B6659]">
              {search ? "Nenhuma pergunta encontrada." : isGestor ? "Nenhuma pergunta cadastrada ainda. Comece adicionando a primeira." : "O manual ainda não tem perguntas cadastradas."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredGroups.map(([category, categoryItems]) => (
              <section key={category} className="space-y-2">
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">{category}</h2>
                <div className="rounded-lg border border-[#E4DFD1] bg-white shadow-[0_1px_2px_rgba(38,36,32,0.04)] px-4">
                  <Accordion type="multiple" className="w-full">
                    {categoryItems
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((item) => (
                        <AccordionItem key={item.id} value={item.id} className="border-[#F1EEE4]">
                          <div className="flex items-center gap-2">
                            <AccordionTrigger className="text-left font-serif text-[#262420] hover:no-underline">
                              {item.question}
                            </AccordionTrigger>
                            {isGestor && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openEditForm(item); }}
                                  className="h-8 w-8 flex items-center justify-center rounded-md text-[#A39D8C] hover:text-[#0E4A44] hover:bg-[#E4EEEC] transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                  className="h-8 w-8 flex items-center justify-center rounded-md text-[#A39D8C] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <AccordionContent className="text-[#6B6659] leading-relaxed whitespace-pre-wrap">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                  </Accordion>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">{editingItem ? "Editar Pergunta" : "Nova Pergunta"}</DialogTitle>
            <DialogDescription>Visível para todos os usuários do sistema, em qualquer município.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">Categoria</Label>
              <Input
                list="faq-categorias"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="Ex.: Roteiros, Autuações, Conta"
                className="h-10 rounded-md border-[#E4DFD1]"
              />
              <datalist id="faq-categorias">
                {existingCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">Pergunta</Label>
              <Input
                value={formQuestion}
                onChange={(e) => setFormQuestion(e.target.value)}
                placeholder="Ex.: Como eu gero o PDF de uma autuação?"
                className="h-10 rounded-md border-[#E4DFD1]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">Resposta</Label>
              <Textarea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                rows={6}
                placeholder="Explique o passo a passo..."
                className="rounded-md border-[#E4DFD1] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} className="rounded-md">Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !formQuestion.trim() || !formAnswer.trim()}
              className="rounded-md bg-[#0E4A44] hover:bg-[#0B3A35]"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

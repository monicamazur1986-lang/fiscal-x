"use client"

import { useEffect, useRef, useState } from "react"
import { Send, Loader2, ThumbsUp, ThumbsDown, BookOpen, MessageCircleQuestion } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { askFiscalX, submitFiscalXFeedback } from "@/ai/flows/ask-fiscal-x"
import type { CitacaoFiscalX } from "@/lib/fiscal-x-feedback-search"

interface Mensagem {
  role: 'user' | 'assistant';
  texto: string;
  citacoes?: CitacaoFiscalX[];
  perguntaId?: string | null;
  feedback?: 'like' | 'dislike' | null;
  isError?: boolean;
}

const SUGESTOES = [
  "Encontrei um cigarro eletrônico à venda numa loja de conveniência — o que a legislação diz sobre isso?",
  "O estabelecimento não tem responsável técnico presente. Isso já é motivo de auto de infração?",
  "Qual o prazo de defesa depois de lavrado um Auto de Infração?",
];

/**
 * "Pergunte ao Fiscal-X" — dúvidas de campo em formato de chat, na mesma
 * base legal do gerador de rascunho (ver GerarRascunho). Componente
 * separado (em vez de página própria) porque agora vive como uma aba dentro
 * da mesma tela do Fiscal AI — ver src/app/rascunho/page.tsx.
 */
export function FiscalXChat() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, loading]);

  const enviar = async (textoForcado?: string) => {
    const pergunta = (textoForcado ?? input).trim();
    if (!pergunta || loading || !profile) return;

    const historico = mensagens
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, texto: m.texto }));

    setMensagens((prev) => [...prev, { role: 'user', texto: pergunta }]);
    setInput("");
    setLoading(true);

    try {
      const result = await askFiscalX({ uid: profile.uid, pergunta, historico });
      if (result.error) {
        setMensagens((prev) => [...prev, { role: 'assistant', texto: result.error!, isError: true }]);
      } else {
        setMensagens((prev) => [...prev, {
          role: 'assistant',
          texto: result.resposta,
          citacoes: result.citacoes,
          perguntaId: result.perguntaId,
          feedback: null,
        }]);
      }
    } catch {
      setMensagens((prev) => [...prev, { role: 'assistant', texto: 'Não foi possível obter uma resposta agora. Tente novamente em instantes.', isError: true }]);
    } finally {
      setLoading(false);
    }
  };

  const avaliar = async (index: number, feedback: 'like' | 'dislike') => {
    const msg = mensagens[index];
    if (!msg.perguntaId) return;
    setMensagens((prev) => prev.map((m, i) => (i === index ? { ...m, feedback } : m)));
    const { ok } = await submitFiscalXFeedback(msg.perguntaId, feedback);
    if (!ok) {
      toast({ variant: "destructive", title: "Não foi possível registrar a avaliação" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-4 pb-4 max-h-[65vh] overflow-y-auto">
        {mensagens.length === 0 && (
          <div className="bg-white border border-[#E4DFD1] rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#E4EEEC] text-[#0E4A44] flex items-center justify-center shrink-0">
                <MessageCircleQuestion className="h-5 w-5" />
              </div>
              <div>
                <p className="font-serif text-[15px] text-[#262420]">Descreva a situação ou faça uma pergunta</p>
                <p className="text-xs text-[#A39D8C]">A resposta usa só a legislação sanitária já indexada no sistema — nunca inventa lei ou artigo.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="w-full text-left text-xs text-[#6B6659] bg-[#FAF8F3] hover:bg-[#F1EEE4] border border-[#E4DFD1] rounded-lg px-3 py-2 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={cn("flex", m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                m.role === 'user'
                  ? "bg-[#0E4A44] text-white rounded-br-sm"
                  : m.isError
                    ? "bg-rose-50 text-rose-700 border border-rose-200 rounded-bl-sm"
                    : "bg-white text-[#262420] border border-[#E4DFD1] rounded-bl-sm"
              )}
            >
              {m.texto}

              {m.role === 'assistant' && !m.isError && (
                <div className="mt-2.5 pt-2.5 border-t border-[#F1EEE4] flex items-center justify-between gap-2">
                  {m.citacoes && m.citacoes.length > 0 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0E4A44] hover:text-[#0B3A35] transition-colors">
                          <BookOpen className="h-3.5 w-3.5" /> Base legal ({m.citacoes.length})
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[min(26rem,90vw)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0 bg-white border-zinc-200 rounded-xl shadow-xl">
                        <div className="p-4 space-y-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Trechos usados na resposta</p>
                          {m.citacoes.map((c) => (
                            <div key={c.id} className="border border-zinc-100 rounded-lg p-3 space-y-1 bg-zinc-50/60">
                              <p className="text-[10px] font-semibold uppercase text-primary tracking-wide">{c.lawTitle}</p>
                              <p className="text-xs font-semibold text-zinc-700">{c.label}</p>
                              <p className="text-xs text-zinc-600 leading-relaxed">{c.texto}</p>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : <span />}

                  {m.perguntaId && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => avaliar(i, 'like')}
                        aria-label="Gostei"
                        className={cn("h-7 w-7 rounded-full flex items-center justify-center transition-colors", m.feedback === 'like' ? "bg-emerald-100 text-emerald-600" : "text-[#C9C2AC] hover:bg-[#F5F2EA] hover:text-[#0E4A44]")}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => avaliar(i, 'dislike')}
                        aria-label="Não gostei"
                        className={cn("h-7 w-7 rounded-full flex items-center justify-center transition-colors", m.feedback === 'dislike' ? "bg-rose-100 text-rose-600" : "text-[#C9C2AC] hover:bg-[#F5F2EA] hover:text-rose-500")}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#E4DFD1] rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-[#A39D8C]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 flex items-end gap-2 pt-2 border-t border-[#E4DFD1]">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Descreva a situação ou digite sua dúvida..."
          className="min-h-[44px] max-h-32 resize-none rounded-xl border-[#E4DFD1] bg-white text-sm"
          disabled={loading}
        />
        <Button
          type="button"
          onClick={() => enviar()}
          disabled={loading || !input.trim()}
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl bg-[#0E4A44] hover:bg-[#0B3A35]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

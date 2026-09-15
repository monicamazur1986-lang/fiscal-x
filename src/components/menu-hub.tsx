"use client"

import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"

import { darkenHex } from "@/lib/dashboard-menu-items"
import { cn } from "@/lib/utils"

export type CartaoHub = {
  href: string;
  label: string;
  /** Uma linha explicando o que a pessoa encontra ali — o sistema é usado por
   *  quem não é da área, então o rótulo sozinho não basta. */
  descricao: string;
  icon: LucideIcon;
  color: string;
  /** Quantos itens existem naquele destino. `undefined` esconde o contador
   *  (ex.: "Roteiros", que não é uma lista e sim o catálogo). */
  contagem?: number;
  /** Ação principal da tela — ocupa a largura toda, acima das demais. */
  destaque?: boolean;
};

/**
 * Tela-menu que abre ao entrar em Roteiros ou em Autuações: em vez de cair
 * direto numa lista cheia de filtros, a pessoa escolhe primeiro o que quer
 * fazer (criar, retomar o que ficou pela metade, ou consultar o que já foi
 * concluído).
 *
 * São dois pesos de propósito, e não três cartões iguais:
 *
 *   A AÇÃO — larga, colorida, com a frase explicando. É o que a tela existe
 *   para oferecer, e some no meio quando divide o palco.
 *
 *   OS ARQUIVOS — dois ladrilhos com cara de pasta, rótulo embaixo e a
 *   quantidade em cima do ícone. Lugar onde as coisas estão guardadas se
 *   reconhece pelo desenho antes de se ler o nome; isso tira da tela o ar de
 *   formulário e deixa a navegação mais parecida com mexer em pastas do que
 *   com preencher um sistema.
 */
export function MenuHub({
  chapeu,
  titulo,
  subtitulo,
  cartoes,
}: {
  /** Opcionais: os cartões já dizem onde a pessoa está e o que há para
   *  fazer. Repetir isso num título e num subtítulo acrescentava três linhas
   *  de leitura antes da primeira ação. */
  chapeu?: string;
  titulo?: string;
  subtitulo?: string;
  cartoes: CartaoHub[];
}) {
  const destaques = cartoes.filter((c) => c.destaque);
  const demais = cartoes.filter((c) => !c.destaque);

  return (
    <div className="min-h-screen bg-[#F5F2EA] px-4 py-6 sm:px-8 sm:py-10">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {(chapeu || titulo) && (
          <div className="space-y-1.5 text-center">
            {chapeu && <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9C7A3C]">{chapeu}</p>}
            {titulo && <h1 className="font-serif text-2xl sm:text-3xl text-[#262420]">{titulo}</h1>}
            {subtitulo && <p className="text-sm text-[#6B6659] max-w-lg mx-auto">{subtitulo}</p>}
          </div>
        )}

        <div className="space-y-5">
          {destaques.map((cartao) => (
            <CartaoPrincipal key={cartao.href} cartao={cartao} />
          ))}
          {demais.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {demais.map((cartao) => (
                <LadrilhoArquivo key={cartao.href} cartao={cartao} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A ação da tela: larga, com cor e com a frase sempre visível. */
function CartaoPrincipal({ cartao }: { cartao: CartaoHub }) {
  return (
    <Link
      href={cartao.href}
      style={{
        // A cor entra como tom claro de fundo, não como bloco saturado com
        // texto branco: o contraste vem do texto escurecido.
        ['--tom' as any]: `${cartao.color}1C`,
        ['--tom-hover' as any]: `${cartao.color}2B`,
        ['--tom-icone' as any]: `${cartao.color}29`,
        ['--tom-borda' as any]: `${cartao.color}4D`,
        ['--tom-texto' as any]: darkenHex(cartao.color, 34),
      }}
      className={cn(
        "group relative flex items-center gap-5 rounded-[1.75rem] border border-[var(--tom-borda)] bg-[var(--tom)]",
        "p-6 sm:p-7 shadow-[0_1px_2px_rgba(38,36,32,0.03)]",
        "transition-all duration-200 hover:bg-[var(--tom-hover)] hover:-translate-y-0.5",
        "hover:shadow-[0_14px_30px_-16px_rgba(38,36,32,0.45)] active:scale-[0.99] active:duration-75"
      )}
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--tom-icone)] text-[var(--tom-texto)] transition-transform duration-200 group-hover:scale-105">
        <cartao.icon className="h-8 w-8" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-serif font-bold text-[21px] sm:text-[23px] leading-tight text-[var(--tom-texto)]">
          {cartao.label}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-[#6B6659]">{cartao.descricao}</p>
      </div>

      <ChevronRight className="h-6 w-6 shrink-0 text-[var(--tom-texto)] opacity-40 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
    </Link>
  );
}

/**
 * Um lugar onde há coisas guardadas — desenhado como pasta, não como linha de
 * formulário.
 *
 * A quantidade fica sobre o canto do ícone, como o número de e-mails não lidos:
 * lê-se junto com a pasta, sem precisar de uma linha só para ela. Zero fica no
 * tom do papel, porque não é notícia.
 */
function LadrilhoArquivo({ cartao }: { cartao: CartaoHub }) {
  const vazio = cartao.contagem === 0;
  return (
    <Link
      href={cartao.href}
      title={cartao.descricao}
      style={{
        ['--tom' as any]: `${cartao.color}14`,
        ['--tom-hover' as any]: `${cartao.color}24`,
        ['--tom-borda' as any]: `${cartao.color}40`,
        ['--tom-texto' as any]: darkenHex(cartao.color, 32),
      }}
      className={cn(
        "group flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-[#E4DFD1] bg-white",
        "px-3 py-6 text-center transition-all duration-200",
        "hover:border-[var(--tom-borda)] hover:bg-[var(--tom)] hover:-translate-y-0.5",
        "hover:shadow-[0_12px_26px_-16px_rgba(38,36,32,0.4)] active:scale-[0.98] active:duration-75"
      )}
    >
      <div className="relative">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--tom)] text-[var(--tom-texto)] transition-all duration-200 group-hover:bg-white group-hover:scale-105">
          <cartao.icon className="h-7 w-7" strokeWidth={1.6} />
        </div>
        {cartao.contagem !== undefined && (
          <span
            className={cn(
              "absolute -right-1.5 -top-1.5 flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5",
              "text-[11px] font-black tabular-nums leading-none ring-2 ring-white",
              vazio ? "bg-[#EEEBE3] text-[#A39D8C]" : "bg-[var(--tom-texto)] text-white"
            )}
          >
            {cartao.contagem}
          </span>
        )}
      </div>

      <p className="text-[13px] font-bold leading-tight text-[#3F3B33] group-hover:text-[var(--tom-texto)]">
        {cartao.label}
      </p>
    </Link>
  );
}

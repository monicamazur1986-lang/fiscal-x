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
 * concluído). Cada destino tem cor, ícone e uma frase explicando — mesma
 * linguagem visual dos cartões do Dashboard, pra não parecer outro sistema.
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

        <div className="space-y-3">
          {destaques.map((cartao) => (
            <CartaoMenu key={cartao.href} cartao={cartao} grande />
          ))}
          {demais.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {demais.map((cartao) => (
                <CartaoMenu key={cartao.href} cartao={cartao} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CartaoMenu({ cartao, grande = false }: { cartao: CartaoHub; grande?: boolean }) {
  return (
    <Link
      href={cartao.href}
      style={{
        // Mesma receita do menu de Roteiros e da lista de Nova Autuação: a cor
        // entra como tom claro de fundo, não como bloco saturado com texto
        // branco. O contraste vem do texto escurecido, não da saturação — três
        // blocos fortes empilhados pesavam a tela, e a ação principal acabava
        // competindo com as secundárias em vez de se destacar.
        ['--tom' as any]: `${cartao.color}${grande ? '1C' : '12'}`,
        ['--tom-hover' as any]: `${cartao.color}${grande ? '2B' : '22'}`,
        ['--tom-icone' as any]: `${cartao.color}29`,
        ['--tom-borda' as any]: `${cartao.color}${grande ? '4D' : '33'}`,
        ['--tom-texto' as any]: darkenHex(cartao.color, 34),
      }}
      className={cn(
        "group relative flex items-center gap-4 rounded-2xl border border-[var(--tom-borda)] bg-[var(--tom)] p-5",
        "shadow-[0_1px_2px_rgba(38,36,32,0.03)]",
        "transition-all duration-200 hover:bg-[var(--tom-hover)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(38,36,32,0.4)] active:scale-[0.99] active:duration-75",
        grande && "sm:p-6"
      )}
    >
      <div className={cn(
        "flex items-center justify-center rounded-xl bg-[var(--tom-icone)] text-[var(--tom-texto)] shrink-0",
        grande ? "h-14 w-14" : "h-12 w-12"
      )}>
        <cartao.icon className={cn(grande ? "h-7 w-7" : "h-6 w-6")} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("font-serif font-bold leading-tight text-[var(--tom-texto)]", grande ? "text-[19px]" : "text-[17px]")}>
            {cartao.label}
          </p>
          {cartao.contagem !== undefined && (
            // Zero em destaque puxava o olho para o que não existe: a lista
            // vazia fica com o número apagado, no tom do papel.
            <span
              className={cn(
                "rounded-full px-2 py-[2px] text-[11px] font-bold tabular-nums leading-none",
                cartao.contagem > 0
                  ? "bg-[var(--tom-icone)] text-[var(--tom-texto)]"
                  : "bg-[#EEEBE3] text-[#A39D8C]"
              )}
            >
              {cartao.contagem}
            </span>
          )}
        </div>
        {/* Mesma regra dos cartões do Dashboard (ver dashboard-menu-grid): o
            nome fica sempre visível e a explicação só aparece ao passar o
            mouse ou encostar na tela. Continua ocupando o espaço mesmo
            invisível (opacity, não display), então o cartão não "pula" de
            tamanho quando a descrição aparece. */}
        {/* O cartão principal mostra a descrição SEMPRE. Os menores seguem
            revelando ao passar o mouse ou encostar. Com a saída do cabeçalho
            da tela, esconder as três descrições deixava quem chega sem uma
            frase sequer para se situar — e no celular não existe hover para
            descobrir. Uma frase visível no cartão de destaque resolve isso
            sem devolver o peso do cabeçalho. */}
        <p
          className={cn(
            "text-[12px] text-[#6B6659] mt-1 leading-snug transition-opacity duration-200",
            !grande &&
              "opacity-0 group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100"
          )}
        >
          {cartao.descricao}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-[var(--tom-texto)] opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  );
}

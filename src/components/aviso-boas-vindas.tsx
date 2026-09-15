"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  FlaskConical,
  MessageSquare,
  MonitorSmartphone,
  X,
} from "lucide-react";

import { salvarItemLocal } from "@/lib/cache-colecao-local";

/**
 * ORIENTAÇÃO DE BOAS-VINDAS — período de teste do MVP.
 *
 * Aparece uma vez por fiscal, no topo do Dashboard, e some quando a pessoa
 * fecha. Três avisos aqui existem porque, se forem descobertos só no uso, o
 * prejuízo já aconteceu:
 *
 *   1. a sugestão de artigos da IA ainda erra, e um enquadramento errado gera
 *      auto nulo — por isso o alerta vem destacado, não como rodapé;
 *   2. brasão, logo e cabeçalho precisam estar configurados ANTES da primeira
 *      inspeção, porque é o que sai impresso no relatório;
 *   3. é um teste, e crítica é o que se espera — não um sistema fechado onde
 *      o fiscal presume que o defeito é culpa dele.
 *
 * A dispensa é gravada no aparelho (não na conta): quem usa no computador e
 * no celular vê o aviso uma vez em cada um, que é o desejado enquanto a
 * orientação ainda for nova.
 */
const CHAVE_DISPENSA = "fiscal_x_boas_vindas_mvp_v1";

export function AvisoBoasVindas({ uid }: { uid?: string }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!uid) return;
    try {
      if (localStorage.getItem(`${CHAVE_DISPENSA}_${uid}`) !== "1") setVisivel(true);
    } catch {
      // Navegador com armazenamento bloqueado: mostra o aviso, que é melhor
      // do que engolir a orientação.
      setVisivel(true);
    }
  }, [uid]);

  const dispensar = () => {
    setVisivel(false);
    if (uid) salvarItemLocal(`${CHAVE_DISPENSA}_${uid}`, "1");
  };

  if (!visivel) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#9C7A3C]/30 bg-[#FBF7EE] p-5 sm:p-7 shadow-[0_1px_2px_rgba(38,36,32,0.04),0_12px_28px_-14px_rgba(38,36,32,0.18)]">
      <button
        type="button"
        onClick={dispensar}
        aria-label="Fechar orientação"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-[#A39D8C] transition-colors hover:bg-[#9C7A3C]/10 hover:text-[#262420]"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#9C7A3C]/15 text-[#7A5D2A]">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div className="min-w-0 pr-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9C7A3C]">
            Versão de teste · 90 dias
          </p>
          <h2 className="mt-1 font-serif text-xl sm:text-2xl leading-tight text-[#262420]">
            Bem-vindo ao Fiscal-X
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#4A463D]">
            Esta é a primeira versão do sistema, aberta para um período de teste de{" "}
            <strong>90 dias</strong>. A intenção é justamente essa: que você use no dia a dia,
            perceba o que atrapalha e nos diga. <strong>Sugestões e críticas são bem-vindas</strong> —
            é com elas que o sistema vai sendo corrigido e melhorado.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {/* O alerta da IA vem primeiro e com a cor mais forte: é o único item
            aqui cujo descuido produz um documento juridicamente nulo. */}
        <div className="flex items-start gap-3 rounded-xl border border-[#A15437]/25 bg-[#A15437]/[0.06] p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A15437]" />
          <p className="text-[13px] leading-relaxed text-[#4A463D]">
            <strong className="text-[#8A4429]">Confira sempre os artigos sugeridos pela IA.</strong>{" "}
            O Assistente de IA ainda está sendo ajustado e <strong>pode errar o enquadramento</strong>.
            Antes de lavrar qualquer autuação, leia com atenção os artigos listados e confirme se
            descrevem mesmo a conduta constatada. Você pode escolher o artigo manualmente a qualquer
            momento — a decisão é sua, não da máquina.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-[#E4DFD1] bg-white/70 p-3.5">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0E4A44]" />
          <p className="text-[13px] leading-relaxed text-[#4A463D]">
            <strong>Antes da primeira inspeção, configure a Identidade Municipal.</strong> Brasão,
            logo e cabeçalho são exatamente o que aparece impresso nos relatórios e nas autuações.
            Dá para preencher e finalizar na hora da inspeção, mas deixar pronto antes evita
            retrabalho.{" "}
            <Link
              href="/admin/configuracoes"
              className="inline-flex items-center gap-0.5 font-bold text-[#0E4A44] underline underline-offset-2 hover:text-[#0B3A35]"
            >
              Configurar agora <ChevronRight className="h-3 w-3" />
            </Link>
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-[#E4DFD1] bg-white/70 p-3.5">
          <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#0E4A44]" />
          <p className="text-[13px] leading-relaxed text-[#4A463D]">
            <strong>Use no computador, no tablet e no celular ao mesmo tempo.</strong> É a mesma
            conta e os mesmos dados: você começa a inspeção no celular, em campo, e termina o
            relatório no computador, sem copiar nada de um lado para o outro.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-[#E4DFD1] bg-white/70 p-3.5">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#0E4A44]" />
          <p className="text-[13px] leading-relaxed text-[#4A463D]">
            <strong>Qualquer dúvida, é só mandar mensagem.</strong> Encontrou erro, achou algo
            confuso ou sentiu falta de alguma função? Conte pra gente — é isso que faz o sistema
            melhorar.{" "}
            <Link
              href="/suporte"
              className="inline-flex items-center gap-0.5 font-bold text-[#0E4A44] underline underline-offset-2 hover:text-[#0B3A35]"
            >
              Abrir chamado <ChevronRight className="h-3 w-3" />
            </Link>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={dispensar}
        className="mt-5 h-11 w-full rounded-xl bg-[#0E4A44] text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-[#0B3A35] sm:w-auto sm:px-8"
      >
        Entendi, vamos começar
      </button>
    </section>
  );
}

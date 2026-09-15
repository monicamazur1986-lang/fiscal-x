"use client"

import { IntimacaoForm } from "@/components/intimacao-form";
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Intimacao } from "@/lib/types";
import { ScrollText, Gavel, Lock, Unlock, PackageX, Trash2, Ban, Scale, ChevronRight, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { darkenHex } from "@/lib/dashboard-menu-items";

// Mesmas opções de "termoOptions" (documento-oficial-body.tsx), agora como um
// rol simples: o Auto de Infração primeiro (é o ponto de partida mais comum) e
// os Termos depois, em ordem alfabética.
//
// Antes vinham agrupados por fase do processo, com título de grupo e a
// explicação de cada tipo sempre visível — oito itens, quatro cabeçalhos e oito
// parágrafos numa tela só, informação demais pra uma escolha que é basicamente
// "qual documento eu vou lavrar". A fase não sumiu: virou a cor do ícone
// (verde = abertura, latão = interdição, terracota = apreensão/inutilização,
// azul = encerramento), e a explicação aparece ao passar o mouse ou encostar,
// como nos demais menus do sistema.
const TIPOS_AUTUACAO = [
  {
    value: "AUTO DE INFRAÇÃO",
    label: "Auto de Infração",
    description: "Registra a irregularidade e abre prazo de defesa. Ponto de partida mais comum.",
    icon: Gavel,
    accent: "#0E4A44",
  },
  {
    value: "TERMO DE APREENSÃO",
    label: "Termo de Apreensão",
    description: "Recolhe produtos irregulares. Defesa corre no Auto vinculado.",
    icon: PackageX,
    accent: "#A15437",
  },
  {
    value: "TERMO DE APREENSÃO E INUTILIZAÇÃO",
    label: "Termo de Apreensão e Inutilização",
    description: "Recolhe e já inutiliza produtos impróprios, num só documento.",
    icon: Trash2,
    accent: "#A15437",
  },
  {
    value: "TERMO DE DESINTERDIÇÃO",
    label: "Termo de Desinterdição",
    description: "Encerra a interdição e libera o reinício das atividades.",
    icon: Unlock,
    accent: "#9C7A3C",
  },
  {
    value: "TERMO DE IMPOSIÇÃO DE PENALIDADE",
    label: "Termo de Imposição de Penalidade",
    description: "Aplica a penalidade ao final do processo. Abre prazo de recurso.",
    icon: Scale,
    accent: "#3D5A73",
  },
  {
    value: "TERMO DE INTERDIÇÃO",
    label: "Termo de Interdição",
    description: "Suspende o funcionamento até a regularização.",
    icon: Lock,
    accent: "#9C7A3C",
  },
  {
    value: "TERMO DE INTIMAÇÃO",
    label: "Termo de Intimação",
    description: "Notifica formalmente uma exigência, sem caracterizar infração ainda.",
    icon: ScrollText,
    accent: "#0E4A44",
  },
  {
    value: "TERMO DE INUTILIZAÇÃO",
    label: "Termo de Inutilização",
    description: "Formaliza a inutilização de produtos impróprios.",
    icon: Ban,
    accent: "#A15437",
  },
] as const;


function EscolherTipoAutuacao() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F5F2EA] p-4 sm:p-8">
      <div className="max-w-xl mx-auto w-full space-y-6 py-8">
        {/* Volta pro menu de Autuações. Sem isto, a única saída era o "Início"
            do cabeçalho global, que leva pra dashboard — perdendo o caminho
            que a pessoa estava percorrendo. */}
        <Link
          href="/intimacoes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <div className="space-y-1.5 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9C7A3C]">Nova Autuação</p>
          <h1 className="font-serif text-2xl sm:text-3xl text-[#262420]">Qual documento você vai lavrar?</h1>
        </div>

        <div className="space-y-2">
          {TIPOS_AUTUACAO.map((tipo) => (
            <button
              key={tipo.value}
              type="button"
              onClick={() => router.push(`/intimacoes/nova?tipo=${encodeURIComponent(tipo.value)}`)}
              style={{
                // Mesma técnica do menu de Roteiros: a cor da fase do processo
                // vira o tom de fundo, em versão bem clara.
                ['--tom' as any]: `${tipo.accent}12`,
                ['--tom-hover' as any]: `${tipo.accent}22`,
                ['--tom-icone' as any]: `${tipo.accent}29`,
                ['--tom-borda' as any]: `${tipo.accent}33`,
                ['--tom-texto' as any]: darkenHex(tipo.accent, 34),
              }}
              className="group w-full flex items-center gap-3.5 rounded-xl border border-[var(--tom-borda)] bg-[var(--tom)] px-4 py-3.5 text-left transition-all duration-200 hover:bg-[var(--tom-hover)] hover:shadow-[0_6px_18px_-10px_rgba(38,36,32,0.35)] active:scale-[0.99]"
            >
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--tom-icone)] text-[var(--tom-texto)]">
                <tipo.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif font-bold text-[17px] leading-snug text-[var(--tom-texto)]">{tipo.label}</p>
                {/* Mesma regra dos outros menus: o nome fica sempre visível e a
                    explicação só aparece ao passar o mouse ou encostar na tela. */}
                <p className="text-xs text-[#6B6659] leading-snug line-clamp-1 mt-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100">
                  {tipo.description}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--tom-texto)] opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreFilledForm() {
  const searchParams = useSearchParams();

  // Dados vindos da Extração Visual (Scanner)
  const extractedData = searchParams.get('data');

  // Dados vindos do Fiscal AI (Chatbot Jurídico)
  const draftText = searchParams.get('draftText');
  const legalBase = searchParams.get('legalBase');
  const reportType = searchParams.get('type');

  // Tipo escolhido na tela de seleção (nenhum conteúdo pré-preenchido, só o
  // tipo do documento) — última prioridade, cai pra tela de escolha se nem
  // isso vier na URL.
  const tipoEscolhido = searchParams.get('tipo');

  let defaultValues: Partial<Intimacao> | undefined = undefined;

  // Prioridade 1: Dados do Fiscal AI
  if (draftText || legalBase) {
    defaultValues = {
      teor: draftText || '',
      legislacaoBase: legalBase || '',
      tipoTermo: reportType || 'TERMO DE INTIMAÇÃO',
      status: 'rascunho'
    };
  }
  // Prioridade 2: Dados extraídos via Scanner/OCR
  else if (extractedData) {
    try {
      const parsedData = JSON.parse(extractedData);
      defaultValues = {
        autor: parsedData.autor || '',
        teor: parsedData.teor || parsedData.descricao || '',
        cnpj: parsedData.cnpj || '',
        endereco: parsedData.endereco || parsedData.logradouro || '',
        bairro: parsedData.bairro || '',
        cnae: parsedData.cnae || '',
        telefone: parsedData.telefone || '',
        reu: parsedData.responsavel_legal || '',
        status: 'rascunho'
      };
    } catch (e) {
      console.error("Failed to parse extracted data from URL", e);
    }
  }
  // Prioridade 3: só o tipo, escolhido na tela de seleção
  else if (tipoEscolhido) {
    defaultValues = {
      tipoTermo: tipoEscolhido,
      status: 'rascunho'
    };
  }
  // Nenhuma das três: ainda não se sabe que documento o fiscal quer lavrar.
  else {
    return <EscolherTipoAutuacao />;
  }

  return <IntimacaoForm defaultValues={defaultValues} />;
}


export default function NovaIntimacaoPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#F5F2EA]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PreFilledForm />
    </Suspense>
  )
}

"use client"

import { IntimacaoForm } from "@/components/intimacao-form";
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Intimacao } from "@/lib/types";
import { ScrollText, Gavel, Lock, Unlock, PackageX, Trash2, Ban, Scale, ChevronRight, Loader2 } from "lucide-react";

// Mesmas opções de "termoOptions" (documento-oficial-body.tsx), com a
// orientação de quando usar cada uma — a mesma escolha que hoje só existe
// como um <select> dentro do próprio documento, agora explicada antes de
// abrir a página em branco. Agrupadas por fase do processo (em vez de uma
// lista plana de 8 itens, cada um com uma cor diferente) para reduzir a
// poluição visual: uma cor por grupo, não uma por item.
const GRUPOS_AUTUACAO = [
  {
    titulo: "Abertura do processo",
    accent: "#0E4A44",
    tipos: [
      {
        value: "AUTO DE INFRAÇÃO",
        label: "Auto de Infração",
        description: "Registra a irregularidade e abre prazo de defesa. Ponto de partida mais comum.",
        icon: Gavel,
      },
      {
        value: "TERMO DE INTIMAÇÃO",
        label: "Termo de Intimação",
        description: "Notifica formalmente uma exigência, sem caracterizar infração ainda.",
        icon: ScrollText,
      },
    ],
  },
  {
    titulo: "Interdição",
    accent: "#9C7A3C",
    tipos: [
      {
        value: "TERMO DE INTERDIÇÃO",
        label: "Termo de Interdição",
        description: "Suspende o funcionamento até a regularização.",
        icon: Lock,
      },
      {
        value: "TERMO DE DESINTERDIÇÃO",
        label: "Termo de Desinterdição",
        description: "Encerra a interdição e libera o reinício das atividades.",
        icon: Unlock,
      },
    ],
  },
  {
    titulo: "Apreensão e inutilização",
    accent: "#A15437",
    tipos: [
      {
        value: "TERMO DE APREENSÃO",
        label: "Termo de Apreensão",
        description: "Recolhe produtos irregulares. Defesa corre no Auto vinculado.",
        icon: PackageX,
      },
      {
        value: "TERMO DE APREENSÃO E INUTILIZAÇÃO",
        label: "Termo de Apreensão e Inutilização",
        description: "Recolhe e já inutiliza produtos impróprios, num só documento.",
        icon: Trash2,
      },
      {
        value: "TERMO DE INUTILIZAÇÃO",
        label: "Termo de Inutilização",
        description: "Formaliza a inutilização de produtos impróprios.",
        icon: Ban,
      },
    ],
  },
  {
    titulo: "Encerramento",
    accent: "#3D5A73",
    tipos: [
      {
        value: "TERMO DE IMPOSIÇÃO DE PENALIDADE",
        label: "Termo de Imposição de Penalidade",
        description: "Aplica a penalidade ao final do processo. Abre prazo de recurso.",
        icon: Scale,
      },
    ],
  },
] as const;

function EscolherTipoAutuacao() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F5F2EA] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto w-full space-y-10 py-8">
        <div className="space-y-1.5 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9C7A3C]">Nova Autuação</p>
          <h1 className="font-serif text-2xl sm:text-3xl text-[#262420]">Qual documento você vai lavrar?</h1>
          <p className="text-sm text-[#6B6659] max-w-lg mx-auto">Escolha o tipo — o documento já abre com o texto e o prazo certos para ele.</p>
        </div>

        <div className="space-y-7">
          {GRUPOS_AUTUACAO.map((grupo) => (
            <div key={grupo.titulo} className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: grupo.accent }}>{grupo.titulo}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {grupo.tipos.map((tipo) => (
                  <button
                    key={tipo.value}
                    type="button"
                    onClick={() => router.push(`/intimacoes/nova?tipo=${encodeURIComponent(tipo.value)}`)}
                    className="group flex items-center gap-3 text-left bg-white border border-[#E4DFD1] rounded-lg p-3.5 shadow-sm hover:border-[#0E4A44]/30 hover:shadow-md transition-all"
                  >
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${grupo.accent}14`, color: grupo.accent }}>
                      <tipo.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-serif text-[15px] text-[#262420] leading-tight">{tipo.label}</p>
                      <p className="text-xs text-[#8A8474] leading-snug line-clamp-1">{tipo.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#C4BEAC] shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0E4A44]" />
                  </button>
                ))}
              </div>
            </div>
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

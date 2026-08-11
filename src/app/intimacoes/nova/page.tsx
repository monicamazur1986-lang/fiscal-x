"use client"

import { IntimacaoForm } from "@/components/intimacao-form";
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Intimacao } from "@/lib/types";
import { ScrollText, Gavel, Lock, Unlock, PackageX, Trash2, Ban, Scale, ChevronRight, Loader2 } from "lucide-react";

// Mesmas opções de "termoOptions" (documento-oficial-body.tsx), com a
// orientação de quando usar cada uma — a mesma escolha que hoje só existe
// como um <select> dentro do próprio documento, agora explicada antes de
// abrir a página em branco. A ordem acompanha o fluxo processual e mantém
// juntos os pares que se referenciam.
const TIPOS_AUTUACAO = [
  {
    value: "AUTO DE INFRAÇÃO",
    label: "Auto de Infração",
    description: "Registra a irregularidade constatada e abre prazo de defesa. Ponto de partida mais comum.",
    icon: Gavel,
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
    value: "TERMO DE INTERDIÇÃO",
    label: "Termo de Interdição",
    description: "Suspende total ou parcialmente o funcionamento do estabelecimento até a regularização.",
    icon: Lock,
    accent: "#A15437",
  },
  {
    value: "TERMO DE DESINTERDIÇÃO",
    label: "Termo de Desinterdição",
    description: "Encerra a interdição depois de sanadas as irregularidades e libera o reinício das atividades.",
    icon: Unlock,
    accent: "#3F6B4A",
  },
  {
    value: "TERMO DE APREENSÃO",
    label: "Termo de Apreensão",
    description: "Recolhe produtos ou materiais irregulares. O prazo de defesa corre no Auto de Infração vinculado.",
    icon: PackageX,
    accent: "#3D5A73",
  },
  {
    value: "TERMO DE APREENSÃO E INUTILIZAÇÃO",
    label: "Termo de Apreensão e Inutilização",
    description: "Reúne os dois atos: recolhe e já inutiliza produtos impróprios, num único documento.",
    icon: Trash2,
    accent: "#7A4A3A",
  },
  {
    value: "TERMO DE INUTILIZAÇÃO",
    label: "Termo de Inutilização",
    description: "Formaliza a inutilização de produtos impróprios para consumo ou uso.",
    icon: Ban,
    accent: "#6B4C80",
  },
  {
    value: "TERMO DE IMPOSIÇÃO DE PENALIDADE",
    label: "Termo de Imposição de Penalidade",
    description: "Aplica a penalidade ao final do processo. Abre prazo de recurso, não de defesa prévia.",
    icon: Scale,
    accent: "#5A4632",
  },
] as const;

function EscolherTipoAutuacao() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#F5F2EA] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto w-full space-y-8 py-8">
        <div className="space-y-2 text-center sm:text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9C7A3C]">Nova Autuação</p>
          <h1 className="font-serif text-2xl sm:text-3xl text-[#262420]">Qual documento você vai lavrar?</h1>
          <p className="text-sm text-[#6B6659] max-w-xl sm:mx-0 mx-auto">Escolha o tipo — o documento já abre com o texto e o prazo padrão certos para ele. Dá pra trocar depois, se precisar.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TIPOS_AUTUACAO.map((tipo) => (
            <button
              key={tipo.value}
              type="button"
              onClick={() => router.push(`/intimacoes/nova?tipo=${encodeURIComponent(tipo.value)}`)}
              className="group flex items-start gap-4 text-left bg-white border border-[#E4DFD1] rounded-lg p-5 shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)] hover:border-[#0E4A44]/30 hover:shadow-[0_1px_2px_rgba(38,36,32,0.06),0_12px_28px_-12px_rgba(14,74,68,0.18)] transition-all"
            >
              <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${tipo.accent}1A`, color: tipo.accent }}>
                <tipo.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-serif text-lg text-[#262420]">{tipo.label}</p>
                <p className="text-xs text-[#6B6659] leading-relaxed">{tipo.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-[#A39D8C] shrink-0 mt-1.5 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0E4A44]" />
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

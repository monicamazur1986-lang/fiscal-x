"use client"

import { IntimacaoForm } from "@/components/intimacao-form";
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Intimacao } from "@/lib/types";

function PreFilledForm() {
  const searchParams = useSearchParams();
  
  // Dados vindos da Extração Visual (Scanner)
  const extractedData = searchParams.get('data');
  
  // Dados vindos do Fiscal AI (Chatbot Jurídico)
  const draftText = searchParams.get('draftText');
  const legalBase = searchParams.get('legalBase');
  const reportType = searchParams.get('type');

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

  return <IntimacaoForm defaultValues={defaultValues} />;
}


export default function NovaIntimacaoPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center font-black uppercase text-zinc-400 animate-pulse">Iniciando Formulário...</div>}>
      <PreFilledForm />
    </Suspense>
  )
}

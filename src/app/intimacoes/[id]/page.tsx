"use client"

import { IntimacaoForm } from "@/components/intimacao-form";
import { useIntimacoes } from "@/hooks/use-intimacoes";
import { notFound } from "next/navigation";
import React, { useEffect, useState, use, Suspense } from "react";
import type { Intimacao } from "@/lib/types";
import { Loader2 } from "lucide-react";

function EditarIntimacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getIntimacaoById, loading } = useIntimacoes();
  const [intimacao, setIntimacao] = useState<Intimacao | null | undefined>(undefined);

  useEffect(() => {
    if (!loading) {
      const foundIntimacao = getIntimacaoById(id);
      setIntimacao(foundIntimacao);
    }
  }, [id, getIntimacaoById, loading]);


  if (loading || intimacao === undefined) {
    return (
      <div className="flex h-[50vh] w-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em]">Carregando</p>
      </div>
    );
  }

  if (intimacao === null) {
    return notFound();
  }

  return (
    <Suspense fallback={<Loader2 className="animate-spin" />}>
      <IntimacaoForm defaultValues={intimacao} intimacaoId={intimacao.id} />
    </Suspense>
  );
}

export default function EditarIntimacaoPage({ params }: { params: Promise<{ id: string }> }) {
  return <EditarIntimacao params={params} />;
}
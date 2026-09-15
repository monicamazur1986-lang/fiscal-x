"use client"

import { useMemo } from "react"
import { ClipboardList, Clock, FileCheck } from "lucide-react"

import { MenuHub, type CartaoHub } from "@/components/menu-hub"
import { useInspecoes } from "@/hooks/use-inspecoes"

/**
 * Tela-menu do módulo Roteiros. Antes, entrar em "Roteiros" jogava a pessoa
 * direto no catálogo inteiro de roteiros com busca, organização por arrastar e
 * as listas de andamento/relatórios por cima — informação demais de uma vez
 * pra quem não é da área. Agora a primeira pergunta é só "o que você quer
 * fazer?", e cada resposta tem sua própria tela.
 */
export default function RoteirosHubPage() {
  const { inspecoes } = useInspecoes();

  const contagens = useMemo(() => {
    const vivas = inspecoes.filter((i) => !i.deleted);
    return {
      emAndamento: vivas.filter((i) => i.status === 'rascunho').length,
      relatorios: vivas.filter((i) => i.status === 'concluido').length,
    };
  }, [inspecoes]);

  const cartoes: CartaoHub[] = [
    {
      href: "/roteiros/nova-inspecao",
      label: "Roteiros de Inspeção",
      descricao: "Escolha o roteiro da atividade e comece a vistoria.",
      icon: ClipboardList,
      color: "#1F7A5C",
      destaque: true,
    },
    {
      href: "/roteiros/em-andamento",
      label: "Inspeções em Andamento",
      descricao: "Vistorias começadas que ainda não foram concluídas.",
      icon: Clock,
      color: "#9C7A3C",
      contagem: contagens.emAndamento,
    },
    {
      href: "/roteiros/relatorios",
      label: "Relatórios",
      descricao: "Relatórios de vistoria já concluídos e arquivados.",
      icon: FileCheck,
      color: "#6B4C80",
      contagem: contagens.relatorios,
    },
  ];

  return (
    <MenuHub
      chapeu="Roteiros"
      titulo="O que você vai fazer?"
      subtitulo="Checklists técnicos de inspeção sanitária."
      cartoes={cartoes}
    />
  );
}

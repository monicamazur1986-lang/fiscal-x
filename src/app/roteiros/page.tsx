"use client"

import { useMemo } from "react"
import { ClipboardList, FolderClock, FolderCheck } from "lucide-react"

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
      label: "Roteiros",
      descricao: "Escolha o roteiro da atividade e comece a vistoria.",
      icon: ClipboardList,
      color: "#1F7A5C",
      destaque: true,
    },
    {
      href: "/roteiros/em-andamento",
      label: "Em Andamento",
      descricao: "Vistorias começadas que ainda não foram concluídas.",
      icon: FolderClock,
      color: "#9C7A3C",
      contagem: contagens.emAndamento,
    },
    {
      href: "/roteiros/relatorios",
      label: "Relatórios Finalizados",
      descricao: "Vistorias concluídas, com relatório pronto e arquivado.",
      icon: FolderCheck,
      color: "#6B4C80",
      contagem: contagens.relatorios,
    },
  ];

  return <MenuHub cartoes={cartoes} />;
}

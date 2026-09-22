"use client"

import { useMemo } from "react"
import { ClipboardList, FolderClock, FolderCheck, Users } from "lucide-react"

import { MenuHub, type CartaoHub } from "@/components/menu-hub"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useAuth } from "@/hooks/use-auth"

/**
 * Tela-menu do módulo Roteiros. Antes, entrar em "Roteiros" jogava a pessoa
 * direto no catálogo inteiro de roteiros com busca, organização por arrastar e
 * as listas de andamento/relatórios por cima — informação demais de uma vez
 * pra quem não é da área. Agora a primeira pergunta é só "o que você quer
 * fazer?", e cada resposta tem sua própria tela.
 */
export default function RoteirosHubPage() {
  const { inspecoes } = useInspecoes();
  const { profile } = useAuth();

  const contagens = useMemo(() => {
    const vivas = inspecoes.filter((i) => !i.deleted);
    const meuUid = profile?.uid;
    return {
      emAndamento: vivas.filter((i) => i.status === 'rascunho').length,
      relatorios: vivas.filter((i) => i.status === 'concluido').length,
      // Vindas de colega: recorte por origem, então cruzam os outros dois
      // (uma compartilhada em rascunho conta aqui e em "Em Andamento").
      compartilhados: meuUid ? vivas.filter((i) => (i.compartilhadoCom || []).includes(meuUid)).length : 0,
    };
  }, [inspecoes, profile?.uid]);

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
    {
      href: "/roteiros/compartilhados",
      label: "Compartilhados Comigo",
      descricao: "Roteiros e relatórios que um colega dividiu com você para editar junto.",
      icon: Users,
      color: "#7A4F9C",
      contagem: contagens.compartilhados,
    },
  ];

  return <MenuHub cartoes={cartoes} />;
}

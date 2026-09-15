"use client"

import { useMemo } from "react"
import { FilePlus2, Clock, FileCheck } from "lucide-react"

import { MenuHub, type CartaoHub } from "@/components/menu-hub"
import { useIntimacoes } from "@/hooks/use-intimacoes"

/**
 * Tela-menu do módulo Autuações — o mesmo papel que /roteiros faz pras
 * vistorias. Substitui o antigo menu "Documentos", que era uma lista única
 * misturando autuação e relatório, rascunho e finalizado, com todos os filtros
 * de uma vez. Aqui a pessoa escolhe primeiro o que quer fazer; o aparato de
 * arquivo (pastas, lixeira, ZIP, relatório municipal) vive dentro de cada
 * lista (ver AcervoDocumentos).
 */
export default function AutuacoesHubPage() {
  const { intimacoes } = useIntimacoes();

  const contagens = useMemo(() => {
    const vivas = intimacoes.filter((i) => !i.deleted);
    return {
      emAndamento: vivas.filter((i) => i.status === 'rascunho').length,
      finalizadas: vivas.filter((i) => i.status === 'finalizado').length,
    };
  }, [intimacoes]);

  const cartoes: CartaoHub[] = [
    {
      href: "/intimacoes/nova",
      label: "Nova Autuação",
      descricao: "Auto de infração, termo de intimação, interdição e outros.",
      icon: FilePlus2,
      color: "#1F7A5C",
      destaque: true,
    },
    {
      href: "/intimacoes/em-andamento",
      label: "Autuações em Andamento",
      descricao: "Documentos começados que ainda não foram finalizados.",
      icon: Clock,
      color: "#9C7A3C",
      contagem: contagens.emAndamento,
    },
    {
      href: "/intimacoes/finalizadas",
      label: "Autuações Finalizadas",
      descricao: "Documentos já lavrados, com prazo de defesa em contagem.",
      icon: FileCheck,
      color: "#3D5A73",
      contagem: contagens.finalizadas,
    },
  ];

  return (
    <MenuHub
      chapeu="Autuações"
      titulo="O que você vai fazer?"
      subtitulo="Documentos oficiais da fiscalização sanitária."
      cartoes={cartoes}
    />
  );
}

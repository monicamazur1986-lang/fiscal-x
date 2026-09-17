"use client"

import { useMemo } from "react"
import { FilePlus2, FolderClock, FolderCheck, Users } from "lucide-react"

import { MenuHub, type CartaoHub } from "@/components/menu-hub"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useAuth } from "@/hooks/use-auth"

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
  const { profile } = useAuth();

  const contagens = useMemo(() => {
    const vivas = intimacoes.filter((i) => !i.deleted);
    const meuUid = profile?.uid;
    return {
      emAndamento: vivas.filter((i) => i.status === 'rascunho').length,
      finalizadas: vivas.filter((i) => i.status === 'finalizado').length,
      // Vindas de colega: recorte por origem, então cruzam os outros dois
      // (uma compartilhada em rascunho conta aqui e em "Em Andamento").
      compartilhadas: meuUid ? vivas.filter((i) => (i.compartilhadoCom || []).includes(meuUid)).length : 0,
    };
  }, [intimacoes, profile?.uid]);

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
      label: "Em Andamento",
      descricao: "Documentos começados que ainda não foram finalizados.",
      icon: FolderClock,
      color: "#9C7A3C",
      contagem: contagens.emAndamento,
    },
    {
      href: "/intimacoes/finalizadas",
      label: "Finalizadas",
      descricao: "Documentos já lavrados, com prazo de defesa em contagem.",
      icon: FolderCheck,
      color: "#3D5A73",
      contagem: contagens.finalizadas,
    },
    {
      href: "/intimacoes/compartilhadas",
      label: "Compartilhadas Comigo",
      descricao: "Autuações que um colega dividiu com você para editar junto.",
      icon: Users,
      color: "#7A4F9C",
      contagem: contagens.compartilhadas,
    },
  ];

  return <MenuHub cartoes={cartoes} />;
}


"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  FileText,
  Sparkles,
  Archive,
  ClipboardList,
  CalendarDays,
  CalendarClock,
  Inbox,
  Library,
  Landmark,
  LifeBuoy,
  FileSignature,
  UserCheck,
  Clock,
  HelpCircle,
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { calculateDeadline } from "@/lib/prazo"
import { usePendingAlerts } from "@/hooks/use-pending-alerts"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AlertCard } from "@/components/alert-card"
import { isSameDay, format } from "date-fns"
import { ptBR } from "date-fns/locale"

// Escurece uma cor hex em `amount` (0-255) por canal — usado só pra gerar o
// 2º ponto do gradiente de cada cartão do menu a partir da cor-base já
// escolhida, sem precisar cadastrar um par de tons pra cada item à mão.
function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default function Dashboard() {
  const { profile } = useAuth()
  const { inspecoes } = useInspecoes()
  const { intimacoes } = useIntimacoes()
  const { pendingUsersCount, pendingUserNames, pendingChamadosCount } = usePendingAlerts()
  const [greeting, setGreeting] = useState("Olá")
  const [currentTime, setCurrentTime] = useState("")

  useEffect(() => {
    const updateDashboardHeader = () => {
      const now = new Date()
      const hour = now.getHours()

      if (hour >= 5 && hour < 12) setGreeting("Bom dia")
      else if (hour >= 12 && hour < 18) setGreeting("Boa tarde")
      else setGreeting("Boa noite")

      setCurrentTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    }

    updateDashboardHeader()
    const timer = setInterval(updateDashboardHeader, 60000)
    return () => clearInterval(timer)
  }, [])

  const agendaHoje = useMemo(() => {
    return inspecoes
      .filter(i => isSameDay(new Date(i.data), new Date()) && i.status !== 'arquivado')
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }, [inspecoes])

  const proximoCompromisso = useMemo(() => {
    return agendaHoje.find(i => new Date(i.data).getTime() >= Date.now())
  }, [agendaHoje])

  // Autuações finalizadas cujo prazo de defesa vence hoje (0 dias úteis
  // restantes) — mesmo cálculo usado em Documentos (src/lib/prazo.ts).
  const prazosVencendoHoje = useMemo(() => {
    return intimacoes.filter(i => !i.deleted && calculateDeadline(i)?.remaining === 0)
  }, [intimacoes])

  const isGestor = profile?.role === 'admin' || profile?.role === 'root';
  const temAlertas = agendaHoje.length > 0 || prazosVencendoHoje.length > 0 || pendingChamadosCount > 0 || pendingUsersCount > 0;

  const userName = profile?.displayName || "Fiscal";

  const pendingNotificationTitle = pendingUserNames.length === 1
    ? `${pendingUserNames[0]} aguardando aprovação`
    : pendingUserNames.length > 1
      ? `${pendingUserNames[0]} e mais ${pendingUserNames.length - 1} aguardando aprovação`
      : "";

  // Cartões coloridos (mantendo a distinção visual rápida entre os itens),
  // com tons abatidos/profundos adaptados à paleta institucional — não os
  // puros do Tailwind, pra não destoar do papel/verde-petróleo/latão do
  // resto do sistema. Cada cor vira um gradiente sutil de dois tons (ver
  // darkenHex abaixo) em vez de um preenchimento chapado.
  const menuItems = [
    { href: "/intimacoes/nova", label: "Nova Autuação", description: "Termo de intimação ou auto de infração", icon: FileText, color: "#1F7A5C" },
    { href: "/rascunho", label: "Fiscal AI", description: "Assistente de redação com inteligência artificial", icon: Sparkles, color: "#9C7A3C" },
    { href: "/agenda", label: "Agenda", description: "Compromissos e inspeções do dia", icon: CalendarDays, color: "#3D5A73" },
    { href: "/intimacoes", label: "Documentos", description: "Autuações emitidas e rascunhos", icon: Archive, color: "#524E45" },
    { href: "/roteiros", label: "Roteiros", description: "Checklists técnicos de inspeção", icon: ClipboardList, color: "#6B4C80" },
    { href: "/biblioteca", label: "Biblioteca", description: "Legislação e normas aplicáveis", icon: Library, color: "#8A4B5C" },
    { href: "/consulta-anvisa", label: "Consulta ANVISA", description: "Registros e processos sanitários", icon: Landmark, color: "#2F6668" },
    { href: "/docfacil", label: "Docfacil", description: "Modelos e documentos administrativos", icon: FileSignature, color: "#454680" },
    { href: "/suporte", label: "Suporte Técnico", description: "Abrir chamado com a equipe", icon: LifeBuoy, color: "#A15437" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#F5F2EA] p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto w-full space-y-8">

        <section className="flex items-center gap-4 rounded-2xl border border-[#E4DFD1] bg-white p-5 shadow-[0_1px_2px_rgba(38,36,32,0.04),0_12px_28px_-14px_rgba(38,36,32,0.18)] relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0E4A44] to-[#9C7A3C]" />
          <Avatar className="h-14 w-14 ring-2 ring-white shadow-md border border-[#0E4A44]/10">
            <AvatarImage src={profile?.photoURL} className="object-cover" />
            <AvatarFallback className="bg-[#0E4A44] text-white font-black text-lg uppercase">
              {userName[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#6B6659]">{greeting},</p>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-xl font-bold text-[#262420] truncate">{userName}</h1>
              {isGestor && (
                <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-white bg-[#9C7A3C] px-2 py-0.5 rounded-full">Gestor</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-black text-[#0E4A44] tabular-nums">{currentTime}</p>
            <p className="text-[10px] font-semibold text-[#6B6659] capitalize">{format(new Date(), "dd 'de' MMMM", { locale: ptBR })}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Avisos</h2>
          {agendaHoje.length > 0 && (
            <AlertCard
              icon={CalendarClock}
              tone="urgent"
              title={`Você tem ${agendaHoje.length} ${agendaHoje.length === 1 ? 'compromisso' : 'compromissos'} hoje`}
              description={proximoCompromisso ? `Próximo às ${format(new Date(proximoCompromisso.data), "HH:mm")} — ${proximoCompromisso.titulo}` : undefined}
              href="/agenda"
            />
          )}
          {prazosVencendoHoje.length > 0 && (
            <AlertCard
              icon={Clock}
              tone="urgent"
              title={prazosVencendoHoje.length === 1
                ? `Prazo de ${prazosVencendoHoje[0].numeroProcesso || prazosVencendoHoje[0].autor || "1 autuação"} vence hoje`
                : `${prazosVencendoHoje.length} prazos vencem hoje`}
              description="Toque para revisar"
              href="/intimacoes"
            />
          )}
          {isGestor && pendingUsersCount > 0 && (
            <AlertCard
              icon={UserCheck}
              tone="warning"
              title={pendingNotificationTitle}
              description="Toque para revisar"
              href="/admin/usuarios"
            />
          )}
          {isGestor && pendingChamadosCount > 0 && (
            <AlertCard
              icon={Inbox}
              tone="warning"
              title={`${pendingChamadosCount} ${pendingChamadosCount === 1 ? 'chamado pendente' : 'chamados pendentes'} de suporte`}
              description="Aguardando resposta"
              href="/admin/suporte"
            />
          )}
          {!temAlertas && (
            <div className="rounded-lg border border-dashed border-[#E4DFD1] px-4 py-3">
              <p className="text-xs text-[#A39D8C]">Nenhum alerta por agora — tudo em dia.</p>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Menu</h2>
          <nav className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex min-h-[124px] flex-col items-center justify-center gap-2 rounded-lg p-4 text-center shadow-[0_10px_24px_-12px_rgba(38,36,32,0.4)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_32px_-14px_rgba(38,36,32,0.45)] active:scale-[0.98] active:duration-75"
                style={{
                  background: `linear-gradient(135deg, ${item.color} 0%, ${darkenHex(item.color, 28)} 100%)`,
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-serif text-[15px] font-semibold text-white leading-tight">{item.label}</p>
                  <p className="text-[10.5px] text-white/75 mt-1 leading-snug opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100">
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </nav>
        </section>

        <div className="flex justify-center pb-10">
          <Link
            href="/ajuda"
            className="flex items-center gap-1.5 text-xs font-medium text-[#A39D8C] hover:text-[#0E4A44] transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" /> Central de Ajuda
          </Link>
        </div>
      </div>
    </div>
  )
}

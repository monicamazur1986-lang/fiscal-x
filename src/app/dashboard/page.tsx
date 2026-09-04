
"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  CalendarClock,
  Inbox,
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
import { DashboardMenuGrid } from "@/components/dashboard-menu-grid"
import { DASHBOARD_MENU_ITEMS } from "@/lib/dashboard-menu-items"
import { isSameDay, format } from "date-fns"
import { ptBR } from "date-fns/locale"

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

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#F5F2EA] p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto w-full space-y-8">

        <section className="relative overflow-hidden rounded-2xl bg-[#EEEBE3] border border-[#E4DFD1] p-5 sm:p-7 shadow-[0_1px_2px_rgba(38,36,32,0.04),0_12px_28px_-14px_rgba(38,36,32,0.18)]">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#9C7A3C]/10 blur-[80px] rounded-full pointer-events-none" />
          <div className="relative z-10 flex items-center gap-4 sm:gap-5">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 ring-4 ring-white shadow-md shrink-0">
              <AvatarImage src={profile?.photoURL} className="object-cover" />
              <AvatarFallback className="bg-[#0E4A44] text-white font-black text-xl sm:text-2xl uppercase">
                {userName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-[#6B6659]">{greeting},</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <h1 className="font-serif text-xl sm:text-3xl font-bold text-[#262420] truncate">{userName}</h1>
                {isGestor && (
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-white bg-[#9C7A3C] px-2.5 py-1 rounded-full">Gestor</span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg sm:text-2xl font-black text-[#0E4A44] tabular-nums leading-none">{currentTime}</p>
              <p className="text-[10px] sm:text-xs font-semibold text-[#6B6659] capitalize mt-1.5">{format(new Date(), "dd 'de' MMMM", { locale: ptBR })}</p>
            </div>
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

        <DashboardMenuGrid items={DASHBOARD_MENU_ITEMS} />

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

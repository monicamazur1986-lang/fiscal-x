
"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  HelpCircle,
  Camera,
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { calculateDeadline } from "@/lib/prazo"
import { usePendingAlerts } from "@/hooks/use-pending-alerts"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AvisoBoasVindas } from "@/components/aviso-boas-vindas"
import { AlertCard } from "@/components/alert-card"
import { DashboardMenuGrid } from "@/components/dashboard-menu-grid"
import { DASHBOARD_MENU_ITEMS } from "@/lib/dashboard-menu-items"
import { ProfileEditDialog } from "@/components/profile-edit-dialog"
import { isSameDay, format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function Dashboard() {
  const { profile } = useAuth()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
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

        <section className="relative overflow-hidden rounded-2xl bg-[#EEEBE3] border border-[#E4DFD1] p-5 sm:p-8 shadow-[0_1px_2px_rgba(38,36,32,0.04),0_12px_28px_-14px_rgba(38,36,32,0.18)]">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#9C7A3C]/10 blur-[80px] rounded-full pointer-events-none" />
          <div className="relative z-10 flex items-center gap-4 sm:gap-6">
            {/* Halo suave atrás do avatar (mesmo tom do sistema) em vez de
                mexer no formato da foto em si — dá destaque sem inventar
                moldura estranha. Tocar na foto abre "Meu Perfil" direto
                pra trocar a imagem, sem precisar achar o menu no topo. */}
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              aria-label="Alterar foto de perfil"
              title="Alterar foto de perfil"
              className="relative shrink-0 group"
            >
              <div className="absolute inset-0 rounded-full bg-[#0E4A44]/15 blur-lg scale-125" />
              <Avatar className="relative h-24 w-24 sm:h-32 sm:w-32 ring-4 ring-white shadow-lg transition-transform group-hover:scale-[1.03] group-active:scale-95">
                <AvatarImage src={profile?.photoURL} className="object-cover" />
                <AvatarFallback className="bg-[#0E4A44] text-white font-black text-3xl sm:text-4xl uppercase">
                  {userName[0]}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-[#0E4A44] text-white flex items-center justify-center ring-2 ring-white shadow-md group-hover:bg-[#0B3A35] transition-colors">
                <Camera className="h-4 w-4" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm sm:text-base font-medium text-[#6B6659]">{greeting},</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <h1 className="font-serif text-2xl sm:text-4xl font-bold text-[#262420] truncate">{userName}</h1>
                {isGestor && (
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-white bg-[#9C7A3C] px-2.5 py-1 rounded-full">Gestor</span>
                )}
              </div>
              {/* Data e hora juntas, numa linha discreta — antes ficavam
                  destacadas num bloco à parte, competindo com o nome pela
                  atenção. */}
              <p className="mt-1.5 text-xs sm:text-sm font-semibold text-[#9C7A3C] tabular-nums">
                {currentTime} · <span className="capitalize">{format(new Date(), "dd 'de' MMMM", { locale: ptBR })}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Orientação do período de teste — antes dos avisos operacionais,
            porque fala de como usar o sistema, não do que fazer hoje. */}
        <AvisoBoasVindas uid={profile?.uid} />

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Avisos</h2>
          {agendaHoje.length > 0 && (
            <AlertCard
              emoji="⏰"
              tone="urgent"
              title={`Você tem ${agendaHoje.length} ${agendaHoje.length === 1 ? 'compromisso' : 'compromissos'} hoje`}
              description={proximoCompromisso ? `Próximo às ${format(new Date(proximoCompromisso.data), "HH:mm")} — ${proximoCompromisso.titulo}` : undefined}
              href="/agenda"
            />
          )}
          {prazosVencendoHoje.length > 0 && (
            <AlertCard
              emoji="⏳"
              tone="urgent"
              title={prazosVencendoHoje.length === 1
                ? `Prazo de ${prazosVencendoHoje[0].numeroProcesso || prazosVencendoHoje[0].autor || "1 autuação"} vence hoje`
                : `${prazosVencendoHoje.length} prazos vencem hoje`}
              description="Toque para revisar"
              // Prazo de defesa só corre em autuação finalizada: com um só, vai
              // direto ao documento; com vários, cai na lista de finalizadas,
              // onde o prazo de cada um aparece com o destaque de vencido.
              href={prazosVencendoHoje.length === 1 ? `/intimacoes/${prazosVencendoHoje[0].id}` : "/intimacoes/finalizadas"}
            />
          )}
          {isGestor && pendingUsersCount > 0 && (
            <AlertCard
              emoji="🧑‍💼"
              tone="warning"
              title={pendingNotificationTitle}
              description="Toque para revisar"
              href="/admin/usuarios"
            />
          )}
          {isGestor && pendingChamadosCount > 0 && (
            <AlertCard
              emoji="📨"
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

      <ProfileEditDialog isOpen={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </div>
  )
}

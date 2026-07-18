
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
import { cn } from "@/lib/utils"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { calculateDeadline } from "@/lib/prazo"
import { usePendingAlerts } from "@/hooks/use-pending-alerts"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AlertCard } from "@/components/alert-card"
import { isSameDay, format } from "date-fns"

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

  // Cartões coloridos de volta (fundo sólido, como era antes), mas com tons
  // adaptados à paleta institucional — mais profundos/abatidos que as cores
  // puras do Tailwind, pra não destoar do papel/verde-petróleo/latão do
  // resto do sistema, mantendo a distinção visual rápida entre os itens.
  const menuItems = [
    { href: "/intimacoes/nova", label: "Nova Autuação", description: "Termo de intimação ou auto de infração", icon: FileText, bg: "bg-[#1F7A5C]" },
    { href: "/rascunho", label: "Fiscal AI", description: "Assistente de redação com inteligência artificial", icon: Sparkles, bg: "bg-[#9C7A3C]" },
    { href: "/agenda", label: "Agenda", description: "Compromissos e inspeções do dia", icon: CalendarDays, bg: "bg-[#3D5A73]" },
    { href: "/intimacoes", label: "Documentos", description: "Autuações emitidas e rascunhos", icon: Archive, bg: "bg-[#524E45]" },
    { href: "/roteiros", label: "Roteiros", description: "Checklists técnicos de inspeção", icon: ClipboardList, bg: "bg-[#6B4C80]" },
    { href: "/biblioteca", label: "Biblioteca", description: "Legislação e normas aplicáveis", icon: Library, bg: "bg-[#8A4B5C]" },
    { href: "/consulta-anvisa", label: "Consulta ANVISA", description: "Registros e processos sanitários", icon: Landmark, bg: "bg-[#2F6668]" },
    { href: "/docfacil", label: "Docfacil", description: "Modelos e documentos administrativos", icon: FileSignature, bg: "bg-[#454680]" },
    { href: "/suporte", label: "Suporte Técnico", description: "Abrir chamado com a equipe", icon: LifeBuoy, bg: "bg-[#A15437]" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#F5F2EA] p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto w-full space-y-8">

        <section className="flex items-center gap-4 rounded-lg border border-[#E4DFD1] bg-white p-5 shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
          <Avatar className="h-14 w-14 border-2 border-[#E4EEEC] shadow-sm">
            <AvatarImage src={profile?.photoURL} className="object-cover" />
            <AvatarFallback className="bg-[#E4EEEC] text-[#0E4A44] font-black text-lg uppercase">
              {userName[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#A39D8C]">{greeting},</p>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-lg text-[#262420] truncate">{userName}</h1>
              {isGestor && (
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[#9C7A3C] bg-[#F1E9D6] px-2 py-0.5 rounded-full">Gestor</span>
              )}
            </div>
          </div>
          <span className="shrink-0 text-xs font-medium text-[#A39D8C] tabular-nums">{currentTime}</span>
        </section>

        <section className="space-y-2">
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
            <p className="text-xs text-[#A39D8C] px-1">Nenhum alerta por agora.</p>
          )}
        </section>

        <section className="space-y-2 pb-20">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Menu</h2>
          <nav className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-lg p-4 text-center shadow-[0_8px_20px_-10px_rgba(38,36,32,0.35)] transition-transform duration-200 hover:-translate-y-0.5",
                  item.bg
                )}
              >
                <item.icon className="h-6 w-6 text-white/85" />
                <div className="min-w-0">
                  <p className="font-serif text-base font-semibold text-white leading-tight">{item.label}</p>
                  <p className="text-[11px] text-white/70 mt-1 leading-snug opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100">
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </nav>
        </section>

        <div className="flex justify-center pb-10 -mt-12">
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

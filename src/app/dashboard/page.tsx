
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
  ArrowUpRight
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useChamados } from "@/hooks/use-chamados"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AlertCard } from "@/components/alert-card"
import { isSameDay, format } from "date-fns"

export default function Dashboard() {
  const { profile } = useAuth()
  const { inspecoes } = useInspecoes()
  const { chamados } = useChamados()
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

  const chamadosPendentes = useMemo(() => {
    if (profile?.role !== 'admin') return [];
    return chamados.filter(c => c.status !== 'resolvido');
  }, [chamados, profile?.role]);

  const temAlertas = agendaHoje.length > 0 || chamadosPendentes.length > 0;

  const userName = profile?.displayName || "Fiscal";

  const menuItems = [
    { href: "/intimacoes/nova", label: "Nova Autuação", icon: FileText, bg: "bg-emerald-500" },
    { href: "/rascunho", label: "Fiscal AI", icon: Sparkles, bg: "bg-amber-500", isAI: true },
    { href: "/agenda", label: "Agenda", icon: CalendarDays, bg: "bg-sky-500" },
    { href: "/intimacoes", label: "Documentos", icon: Archive, bg: "bg-slate-700" },
    { href: "/roteiros", label: "Roteiros", icon: ClipboardList, bg: "bg-violet-500" },
    { href: "/biblioteca", label: "Biblioteca", icon: Library, bg: "bg-pink-500" },
    { href: "/consulta-anvisa", label: "Consulta ANVISA", icon: Landmark, bg: "bg-cyan-600" },
    { href: "/docfacil", label: "DOCFACIL", icon: FileSignature, bg: "bg-indigo-600" },
    { href: "/suporte", label: "Suporte Técnico", icon: LifeBuoy, bg: "bg-red-500" }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto w-full space-y-6">

        <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Avatar className="h-14 w-14 border-2 border-white shadow">
            <AvatarImage src={profile?.photoURL} className="object-cover" />
            <AvatarFallback className="bg-slate-100 text-slate-400 font-bold text-lg uppercase">
              {userName[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">{greeting},</p>
            <h1 className="text-lg font-bold text-slate-900 truncate">{userName}</h1>
          </div>
          <span className="shrink-0 text-xs font-medium text-slate-400">{currentTime}</span>
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
          {chamadosPendentes.length > 0 && (
            <AlertCard
              icon={Inbox}
              tone="warning"
              title={`${chamadosPendentes.length} ${chamadosPendentes.length === 1 ? 'chamado pendente' : 'chamados pendentes'} de suporte`}
              description="Aguardando resposta"
              href="/admin/suporte"
            />
          )}
          {!temAlertas && (
            <p className="text-xs text-slate-400 px-1">Nenhum alerta por agora.</p>
          )}
        </section>

        <nav className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-20 pt-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex min-h-[92px] items-center gap-3 rounded-[1.75rem] px-4 py-4 shadow-md transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300",
                item.bg
              )}
            >
              <div className="flex flex-col items-start gap-1.5 shrink-0">
                <item.icon className="h-6 w-6 text-white" />
                <ArrowUpRight className="h-3.5 w-3.5 text-white/60" />
              </div>
              <span className="text-sm font-bold text-white leading-tight">
                {item.label}
              </span>
              {item.isAI && (
                <span className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-white" />
              )}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

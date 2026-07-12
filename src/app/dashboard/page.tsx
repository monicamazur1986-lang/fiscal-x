
"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  FileText,
  Sparkles,
  Archive,
  ClipboardList,
  CalendarDays,
  ChevronRight,
  Clock,
  Library
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { isSameDay, format } from "date-fns"

export default function Dashboard() {
  const { profile } = useAuth()
  const { inspecoes } = useInspecoes()
  const [greeting, setGreeting] = useState("Olá")
  const [currentTime, setCurrentTime] = useState("")

  useEffect(() => {
    const updateDashboardHeader = () => {
      const now = new Date()
      const hour = now.getHours()
      
      if (hour >= 5 && hour < 12) setGreeting("BOM DIA")
      else if (hour >= 12 && hour < 18) setGreeting("BOA TARDE")
      else setGreeting("BOA NOITE")

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

  let userName = (profile?.displayName || "FISCAL").toUpperCase();

  const menuItems = [
    { href: "/intimacoes/nova", label: "Nova Autuação", icon: FileText, satinClass: "dash-tile-emerald" },
    { href: "/rascunho", label: "Fiscal AI", icon: Sparkles, satinClass: "dash-tile-amber", isAI: true },
    { href: "/agenda", label: "Agenda", icon: CalendarDays, satinClass: "dash-tile-cobalt" },
    { href: "/intimacoes", label: "Documentos", icon: Archive, satinClass: "dash-tile-dark" },
    { href: "/roteiros", label: "Roteiros", icon: ClipboardList, satinClass: "dash-tile-violet" },
    { href: "/biblioteca", label: "Biblioteca", icon: Library, satinClass: "dash-tile-rose" }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(0,169,157,0.10),_transparent_35%),linear-gradient(135deg,_#f8fafc_0%,_#eef2ff_50%,_#f8fafc_100%)] p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto w-full space-y-8">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/80 bg-white/85 p-6 sm:p-8 lg:p-10 shadow-[0_30px_90px_-35px_rgba(15,23,42,0.45)] backdrop-blur-md">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,169,157,0.14),_transparent_45%)]" />
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-slate-900" />

          <div className="relative flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">{currentTime}</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-8 flex-1">
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-full bg-emerald-400/25 blur-2xl" />
                <Avatar className="relative h-40 w-40 sm:h-44 sm:w-44 border-[10px] border-white shadow-[0_20px_50px_-15px_rgba(15,23,42,0.28)] ring-1 ring-slate-100">
                  <AvatarImage src={profile?.photoURL} className="object-cover" />
                  <AvatarFallback className="bg-slate-100 text-slate-400 font-black text-5xl uppercase">
                    {(userName || "F")[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 h-10 w-10 rounded-full border-[4px] border-white bg-emerald-500 shadow-lg" />
              </div>

              <div className="flex flex-col text-center sm:text-left space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.35em] text-slate-400">{greeting},</p>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tighter text-slate-900 leading-[0.9]">{userName}</h2>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
                  {agendaHoje.length > 0 && (
                    <Link href="/agenda" className="flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-rose-600 transition-all hover:bg-rose-100 group">
                      <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                      <span>
                        {agendaHoje.length} {agendaHoje.length === 1 ? 'compromisso hoje' : 'compromissos hoje'}
                        {proximoCompromisso && <> · próximo às {format(new Date(proximoCompromisso.data), "HH:mm")}</>}
                      </span>
                      <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden xl:flex items-center gap-3 rounded-[1.75rem] border border-slate-200/70 bg-slate-50/80 p-4 shadow-inner">
              <div className="flex flex-col gap-2">
                <div className="h-2 w-20 rounded-full bg-slate-200" />
                <div className="h-2 w-14 rounded-full bg-slate-200" />
                <div className="h-2 w-24 rounded-full bg-slate-200" />
              </div>
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-lg" />
            </div>
          </div>
        </section>

        <nav className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pb-20">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex min-h-[180px] items-center gap-5 overflow-hidden rounded-[2rem] border border-white/70 p-6 sm:p-7 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_-20px_rgba(15,23,42,0.45)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-slate-900",
                item.satinClass
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.5rem] bg-black/10 shadow-inner transition-transform duration-500 group-hover:scale-110">
                <item.icon className="h-8 w-8 text-white" />
              </div>

              <div className="relative flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-white leading-none">
                    {item.label}
                  </h3>
                  {item.isAI && (
                    <Badge className="border-none bg-white/20 px-3 text-[9px] font-black uppercase tracking-[0.25em] text-white">AI</Badge>
                  )}
                </div>
              </div>

              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white shadow-lg transition-all group-hover:bg-white group-hover:text-slate-900">
                <ChevronRight className="h-6 w-6" />
              </div>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

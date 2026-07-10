
"use client"

import Link from "next/link"
import {
  FileText,
  Home,
  Archive,
  CalendarDays,
  Sparkles,
  ClipboardList,
  MessageSquare,
  Library
} from "lucide-react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { SentinelaMascot } from "./brand-logo"

const navItems = [
  { href: "/dashboard", icon: Home, label: "Início" },
  { href: "/intimacoes/nova", icon: FileText, label: "Nova Autuação" },
  { href: "/rascunho", icon: Sparkles, label: "Fiscal AI" },
  { href: "/recados", icon: MessageSquare, label: "Recados" },
  { href: "/intimacoes", icon: Archive, label: "Documentos" },
  { href: "/agenda", icon: CalendarDays, label: "Agenda" },
  { href: "/roteiros", icon: ClipboardList, label: "Roteiros" },
  { href: "/legislacao", icon: Library, label: "Biblioteca" },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <div className="h-full border-r bg-muted/30 no-print">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="scale-75 -ml-2">
              <SentinelaMascot className="w-12 h-12" />
            </div>
          </Link>
        </div>
        <div className="flex-1">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4 py-4 space-y-1">
            {navItems.map((item) => {
                const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-muted-foreground transition-all hover:text-primary hover:bg-primary/5",
                      isActive && "bg-primary/10 text-primary font-bold shadow-sm"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
                  </Link>
                )
            })}
          </nav>
        </div>
        <div className="p-4 mt-auto border-t bg-card/50">
          <p className="text-[9px] text-muted-foreground text-center uppercase tracking-widest font-black opacity-40">
            Vigilância Sanitária PR
          </p>
        </div>
      </div>
    </div>
  )
}


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
        <div className="flex h-14 items-center justify-center border-b px-2 lg:h-[60px] lg:justify-start lg:px-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="scale-75 -ml-2 lg:scale-100 lg:-ml-0">
              <SentinelaMascot className="w-12 h-12" />
            </div>
          </Link>
        </div>
        <div className="flex-1 overflow-hidden">
          <nav className="grid items-start px-1.5 py-3 text-sm font-medium lg:px-3 space-y-1.5">
            {navItems.map((item) => {
                const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-muted-foreground transition-all hover:text-primary hover:bg-primary/5 lg:justify-start lg:gap-3 lg:px-4",
                      isActive && "bg-primary/10 text-primary font-bold shadow-sm"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] text-current lg:inline lg:text-[10px]">
                      {item.label}
                    </span>
                  </Link>
                )
            })}
          </nav>
        </div>
        <div className="mt-auto border-t bg-card/50 p-2 lg:p-4">
          <p className="text-[8px] text-muted-foreground text-center uppercase tracking-[0.16em] font-black opacity-40 lg:text-[9px]">
            Vigilância Sanitária PR
          </p>
        </div>
      </div>
    </div>
  )
}


"use client"

import Link from "next/link"
import {
  FileText,
  Home,
  CalendarDays,
  Sparkles,
  ClipboardList,
  MessageSquare,
  Library,
  ShieldAlert,
  Scale
} from "lucide-react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { SentinelaMascot } from "./brand-logo"

/** `emDesenvolvimento` marca o módulo que já dá pra usar mas ainda está sendo
 *  construído — mesmo selo do cartão no Dashboard (ver dashboard-menu-items).
 *  O item continua clicável: a sinalização é pra expectativa do usuário, não
 *  um bloqueio. */
const navItems: { href: string; icon: typeof Home; label: string; emDesenvolvimento?: boolean }[] = [
  { href: "/dashboard", icon: Home, label: "Início" },
  { href: "/intimacoes", icon: FileText, label: "Autuações" },
  { href: "/rascunho", icon: Sparkles, label: "Fiscal AI" },
  { href: "/recados", icon: MessageSquare, label: "Recados" },
  { href: "/agenda", icon: CalendarDays, label: "Agenda" },
  { href: "/roteiros", icon: ClipboardList, label: "Roteiros" },
  { href: "/pas", icon: Scale, label: "PAS" },
  { href: "/legislacao", icon: Library, label: "Biblioteca" },
  { href: "/risco-sanitario", icon: ShieldAlert, label: "Risco Sanitário" },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <div className="h-full border-r bg-muted/30 no-print">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center justify-center border-b px-2 lg:h-[60px] lg:justify-start lg:px-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="scale-75 -ml-2 lg:scale-100 lg:-ml-0">
              <SentinelaMascot className="w-12 h-12" simplified />
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
                    title={item.emDesenvolvimento ? `${item.label} — módulo em desenvolvimento` : undefined}
                    className={cn(
                      "flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-muted-foreground transition-all hover:text-primary hover:bg-primary/5 lg:justify-start lg:gap-3 lg:px-4",
                      isActive && "bg-primary/10 text-primary font-bold shadow-sm"
                    )}
                  >
                    <span className="relative shrink-0">
                      <item.icon className={cn("h-4 w-4 sm:h-5 sm:w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                      {/* Barra recolhida (só ícones): o selo textual não cabe,
                          então o aviso vira um ponto — o title do link diz o
                          que ele significa. */}
                      {item.emDesenvolvimento && (
                        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 lg:hidden" />
                      )}
                    </span>
                    <span className="hidden min-w-0 truncate text-[9px] font-black uppercase tracking-[0.16em] text-current lg:inline lg:text-[10px]">
                      {item.label}
                    </span>
                    {item.emDesenvolvimento && (
                      <span className="hidden shrink-0 rounded-full bg-amber-100 px-1.5 py-[2px] text-[7px] font-black uppercase tracking-[0.1em] leading-none text-amber-700 lg:inline">
                        em dev
                      </span>
                    )}
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

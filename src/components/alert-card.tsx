"use client"

import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface AlertCardProps {
  icon: LucideIcon;
  tone: "urgent" | "warning";
  title: string;
  description?: string;
  href: string;
}

const TONE_STYLES: Record<AlertCardProps["tone"], { card: string; icon: string }> = {
  urgent: {
    card: "border-rose-100 bg-rose-50/80 hover:bg-rose-50",
    icon: "bg-rose-500 text-white",
  },
  warning: {
    card: "border-amber-100 bg-amber-50/80 hover:bg-amber-50",
    icon: "bg-amber-500 text-white",
  },
};

export function AlertCard({ icon: Icon, tone, title, description, href }: AlertCardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-4 rounded-2xl border p-4 shadow-sm transition-colors",
        styles.card
      )}
    >
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900 truncate">{title}</p>
        {description && <p className="text-xs text-slate-500 truncate">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

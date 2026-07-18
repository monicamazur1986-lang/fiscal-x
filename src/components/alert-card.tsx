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

const TONE_STYLES: Record<AlertCardProps["tone"], { bar: string; icon: string }> = {
  urgent: {
    bar: "bg-rose-500",
    icon: "bg-rose-50 text-rose-600",
  },
  warning: {
    bar: "bg-amber-500",
    icon: "bg-amber-50 text-amber-600",
  },
};

export function AlertCard({ icon: Icon, tone, title, description, href }: AlertCardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <Link
      href={href}
      className="group relative flex items-center gap-4 overflow-hidden rounded-lg border border-[#E4DFD1] bg-white pl-5 pr-4 py-3.5 shadow-[0_1px_2px_rgba(38,36,32,0.04)] transition-colors hover:bg-[#FAF8F3]"
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", styles.bar)} />
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", styles.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-sm text-[#262420] truncate">{title}</p>
        {description && <p className="text-xs text-[#A39D8C] truncate mt-0.5">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#C9C2AC] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

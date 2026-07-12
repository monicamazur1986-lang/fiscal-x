"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface BackButtonProps {
  href: string;
  label?: string;
  variant?: "light" | "dark";
  className?: string;
}

export function BackButton({ href, label = "Voltar", variant = "light", className }: BackButtonProps) {
  return (
    <Button
      asChild
      variant="outline"
      className={cn(
        "no-print h-11 px-6 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm transition-all",
        variant === "light"
          ? "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          : "bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-blue-200",
        className
      )}
    >
      <Link href={href}>
        <ArrowLeft className="mr-2 h-4 w-4" /> {label}
      </Link>
    </Button>
  )
}

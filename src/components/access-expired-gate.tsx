'use client';

import { CalendarClock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

/**
 * Tela de bloqueio para quando o prazo de acesso de teste do usuário (ver
 * betaAccessDurationDays em useAppConfig, contado a partir de
 * profile.createdAt) já venceu. Renderizada pelo AuthGuard antes de liberar
 * o resto do app — root nunca cai aqui.
 */
export function AccessExpiredGate() {
  const { logout } = useAuth();

  return (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-[#020617] p-6 text-center">
      <div className="w-full max-w-md space-y-8">
        <div className="p-10 rounded-[3rem] bg-slate-900/40 border border-white/5 text-white backdrop-blur-xl flex flex-col items-center gap-6">
          <div className="h-20 w-20 rounded-3xl bg-amber-500/20 flex items-center justify-center">
            <CalendarClock className="h-9 w-9 text-amber-400" />
          </div>
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">Acesso de Teste Encerrado</h2>
          <p className="text-sm font-bold text-slate-300 leading-relaxed">
            O período de avaliação da versão de testes do Fiscal-X para esta conta chegou ao fim.
            Entre em contato com o responsável pelo sistema para renovar seu acesso.
          </p>
        </div>
        <Button onClick={logout} variant="outline" className="h-16 w-full rounded-3xl border-white/10 text-slate-400 gap-3">
          <LogOut className="h-4 w-4" /> Encerrar Sessão
        </Button>
      </div>
    </div>
  );
}

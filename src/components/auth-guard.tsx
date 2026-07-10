'use client';

import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FileWarning, LogOut, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

/**
 * AuthGuard - Proteção de rotas resiliente.
 * Garante que a página de login esteja sempre acessível.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthorized, profile, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthPage = pathname === "/login" || pathname === "/solicitar-acesso";

  useEffect(() => {
    if (!mounted || loading) return;

    if (!user && !isAuthPage) {
      router.replace("/login");
    } else if (user && isAuthorized && isAuthPage) {
      router.replace("/dashboard");
    }
  }, [user, isAuthorized, loading, pathname, router, mounted, isAuthPage]);

  // Prevenção de erro de hidratação
  if (!mounted) return null;

  // Se estiver na tela de login, libera imediatamente sem overlays
  if (isAuthPage) return <>{children}</>;

  // Splash Screen apenas para áreas protegidas enquanto carrega
  if (loading && !isAuthPage) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#020617]">
        <div className="flex flex-col items-center gap-6">
          <div className="h-12 w-12 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.8em] animate-pulse">
            Iniciando
          </p>
        </div>
      </div>
    );
  }

  if (profile?.status === 'rejected') {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#020617] p-6 text-center">
        <div className="max-w-md space-y-8">
          <div className="p-10 rounded-[3rem] bg-rose-500/10 border border-rose-500/20 text-white flex flex-col items-center gap-6">
            <FileWarning className="h-20 w-20 text-rose-500" />
            <h2 className="text-3xl font-black uppercase italic tracking-tighter">Acesso Negado</h2>
            <p className="text-sm font-bold text-slate-300 italic">{profile?.adminFeedback || "Seu perfil foi recusado pela auditoria técnica."}</p>
          </div>
          <Button onClick={logout} variant="outline" className="h-16 w-full rounded-3xl border-white/10 text-slate-400 gap-3">
            <LogOut className="h-4 w-4" /> Encerrar Sessão
          </Button>
        </div>
      </div>
    );
  }

  if (profile?.role === 'root' || isAuthorized) {
    return <>{children}</>;
  }

  if (user && !isAuthorized) {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#020617] p-6 text-center">
        <div className="w-full max-w-md space-y-8">
          <div className="p-10 rounded-[4rem] bg-slate-900/40 border border-white/5 text-white backdrop-blur-xl flex flex-col items-center">
            <div className="h-20 w-20 rounded-3xl bg-blue-500/20 flex items-center justify-center">
               <div className="h-8 w-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter mt-8">Análise em Curso</h2>
          </div>
          <p className="text-[11px] font-bold text-slate-400 leading-relaxed px-6 uppercase tracking-widest">
              Aguarde a liberação do seu Gestor Municipal.
          </p>
          <Button onClick={logout} variant="outline" className="h-14 w-full text-[10px] font-black uppercase text-slate-400 border-white/10 bg-white/5 rounded-2xl tracking-widest">
            Desconectar
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

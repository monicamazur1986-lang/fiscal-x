"use client"

import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  User,
  Lock,
  Eye,
  EyeOff,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SentinelaMascot } from "@/components/brand-logo";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { isConfigReady } from "@/firebase/config";

export default function LoginPage() {
  const { user, loginWithEmailPassword, isAuthorized, loading: authLoading, getSavedPassword } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [localLoading, setLocalLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(true);

  useEffect(() => {
    if (user && isAuthorized) {
        router.replace("/dashboard");
    }
  }, [user, isAuthorized, router]);

  useEffect(() => {
    if (!email) return;
    const savedPassword = getSavedPassword(email);
    if (savedPassword) {
      setPassword(savedPassword);
    }
  }, [email, getSavedPassword]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || localLoading) return;
    
    setLocalLoading(true);
    try {
      await loginWithEmailPassword(email, password, { rememberPassword });
      toast({ title: "Acesso Autorizado", description: "Bem-vindo ao vigilanT." });
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Falha no Acesso", 
        description: "E-mail ou senha incorretos." 
      });
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(0,169,157,0.16),_transparent_35%),linear-gradient(135deg,_#0f172a_0%,_#111827_45%,_#0f766e_100%)] flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-8%] w-[45%] h-[45%] bg-emerald-400/30 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-8%] right-[-8%] w-[45%] h-[45%] bg-cyan-400/20 blur-[140px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px]" />
      </div>

      <div className="w-full max-w-[430px] space-y-6 animate-in fade-in zoom-in duration-700 relative z-10">
        <div className="flex flex-col items-center">
          <div className="rounded-[2rem] bg-white/10 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl border border-white/20">
            <SentinelaMascot width={220} height={220} className="rounded-[1.5rem]" />
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.45)] p-7 sm:p-8 border border-white/70 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-slate-800" />

          {(localLoading || authLoading) && (
            <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center rounded-[2rem]">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
              <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-4 text-slate-500">Verificando Credenciais</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-[0.25em]">E-mail</Label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors">
                    <User className="w-full h-full" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="exemplo@municipio.pr.gov.br"
                    className="w-full h-14 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition-all text-sm font-semibold shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-[0.25em]">Senha</Label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors">
                    <Lock className="w-full h-full" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={setPassword.target ? (e) => setPassword(e.target.value) : (e: any) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-14 pl-12 pr-12 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition-all text-sm font-semibold shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Salvar senha neste dispositivo
              </label>

              <Button
                type="submit"
                disabled={localLoading}
                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-2xl shadow-[0_12px_30px_-10px_rgba(16,185,129,0.45)] text-[11px] uppercase tracking-[0.25em] transition-all active:scale-[0.98]"
              >
                Login <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="text-center pt-4 border-t border-slate-100 mt-6">
              <Link href="/solicitar-acesso" className="text-[10px] font-black uppercase text-slate-500 hover:text-emerald-600 transition-colors tracking-[0.25em]">
                Solicitar Credencial Municipal
              </Link>
            </div>
          </form>
        </div>

        <div className="flex flex-col items-center gap-2 opacity-70 select-none">
          <ShieldCheck className="h-5 w-5 text-white/80" />
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/70">Sentinela Cloud Security V6</p>
        </div>
      </div>
    </div>
  );
}

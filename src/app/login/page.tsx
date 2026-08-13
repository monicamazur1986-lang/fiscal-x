"use client"

import { useAuth, getLastUsedEmail } from "@/hooks/use-auth";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail } from "lucide-react";

export default function LoginPage() {
  const { user, profile, loginWithEmailPassword, resetPassword, isAuthorized, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [localLoading, setLocalLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepConnected, setKeepConnected] = useState(true);

  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [pendingLoginToast, setPendingLoginToast] = useState(false);

  useEffect(() => {
    setEmail(getLastUsedEmail());
  }, []);

  useEffect(() => {
    if (user && isAuthorized) {
        router.replace("/dashboard");
    }
  }, [user, isAuthorized, router]);

  // Só mostra o toast de resultado do login depois que o perfil (status de
  // aprovação) terminar de carregar — evita dizer "Acesso Autorizado" pra
  // quem ainda está pendente só porque o login no Firebase Auth funcionou.
  useEffect(() => {
    if (!pendingLoginToast || authLoading) return;
    setPendingLoginToast(false);
    if (!user) return;

    if (!isAuthorized && profile?.status === 'rejected') {
      toast({
        variant: "destructive",
        title: "Acesso Negado",
        description: profile.adminFeedback || "Seu cadastro foi recusado pelo gestor municipal."
      });
    } else if (!isAuthorized) {
      toast({
        title: "Login Realizado",
        description: "Sua conta ainda está aguardando aprovação do gestor municipal."
      });
    }
  }, [pendingLoginToast, authLoading, user, isAuthorized, profile, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || localLoading) return;

    setLocalLoading(true);
    try {
      await loginWithEmailPassword(email, password, { keepConnected });
      setPendingLoginToast(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Falha no Acesso",
        description: error.message || "E-mail ou senha incorretos."
      });
    } finally {
      setLocalLoading(false);
    }
  };

  const handleOpenReset = () => {
    setResetEmail(email);
    setIsResetOpen(true);
  };

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || isSendingReset) return;

    setIsSendingReset(true);
    try {
      await resetPassword(resetEmail);
      toast({
        title: "Verifique seu E-mail",
        description: "Se este e-mail estiver cadastrado, você vai receber um link para redefinir a senha em instantes."
      });
      setIsResetOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Não foi Possível Enviar",
        description: error.message || "Tente novamente mais tarde."
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F2EA] flex items-center justify-center p-4 sm:p-6 lg:p-10 font-sans relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-70">
        <div className="absolute top-[-10%] left-[-8%] w-[45%] h-[45%] bg-[#0E4A44]/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-8%] right-[-8%] w-[45%] h-[45%] bg-[#9C7A3C]/10 blur-[140px] rounded-full" />
      </div>

      <div className="w-full max-w-[980px] relative z-10 animate-in fade-in zoom-in duration-700">
        <div className="lg:flex rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-[0_30px_90px_-20px_rgba(38,36,32,0.35)] border border-[#E4DFD1] bg-white">

          {/* Painel institucional — só desktop; a imagem cheia do mascote
              carrega a marca sozinha, sem texto competindo com ela. */}
          <div className="hidden lg:flex lg:w-[44%] flex-col items-center justify-center gap-7 p-10 relative overflow-hidden bg-gradient-to-br from-[#0E4A44] via-[#0C3F3A] to-[#082623] text-white text-center">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-16 -right-16 w-72 h-72 bg-[#9C7A3C]/25 blur-[100px] rounded-full" />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px]" />
            </div>

            <div className="relative z-10 rounded-[2rem] bg-white p-3 shadow-2xl">
              <SentinelaMascot width={220} height={220} className="rounded-[1.5rem]" />
            </div>

            <div className="relative z-10">
              <p className="font-black text-xl tracking-tight">FISCAL-X</p>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mt-1.5">Vigilância Sanitária</p>
            </div>

            <div className="relative z-10 pt-6 mt-1 border-t border-white/10 w-full flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-white/40" />
            </div>
          </div>

          {/* Formulário */}
          <div className="w-full lg:w-[56%] p-7 sm:p-10 lg:p-12 relative">
            <div className="flex lg:hidden flex-col items-center mb-8">
              <div className="rounded-[2rem] bg-white p-2 shadow-[0_10px_30px_-8px_rgba(38,36,32,0.25)] border border-[#E4DFD1] mb-4">
                <SentinelaMascot width={96} height={96} className="rounded-[1.5rem]" />
              </div>
              <p className="font-black text-[#262420] text-sm tracking-tight">FISCAL-X</p>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#A39D8C] mt-1.5">Vigilância Sanitária</p>
            </div>

            {(localLoading || authLoading) && (
              <div className="absolute inset-0 z-20 bg-white/85 backdrop-blur-md flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-[#0E4A44]" />
                <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-4 text-[#6B6659]">Verificando Credenciais</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-[#6B6659] ml-2 tracking-[0.25em]">E-mail</Label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A39D8C] group-focus-within:text-[#0E4A44] transition-colors">
                    <User className="w-full h-full" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="exemplo@municipio.pr.gov.br"
                    className="w-full h-14 pl-12 pr-4 bg-[#FAF8F3] border border-[#E4DFD1] rounded-2xl outline-none focus:bg-white focus:border-[#0E4A44]/50 focus:ring-4 focus:ring-[#0E4A44]/10 transition-all text-sm font-semibold shadow-[inset_0_1px_2px_rgba(38,36,32,0.03)]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-[#6B6659] ml-2 tracking-[0.25em]">Senha</Label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A39D8C] group-focus-within:text-[#0E4A44] transition-colors">
                    <Lock className="w-full h-full" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-14 pl-12 pr-12 bg-[#FAF8F3] border border-[#E4DFD1] rounded-2xl outline-none focus:bg-white focus:border-[#0E4A44]/50 focus:ring-4 focus:ring-[#0E4A44]/10 transition-all text-sm font-semibold shadow-[inset_0_1px_2px_rgba(38,36,32,0.03)]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-full text-[#A39D8C] hover:text-[#0E4A44] hover:bg-[#E4EEEC] transition-all"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={handleOpenReset}
                    className="text-[10px] font-black uppercase text-[#A39D8C] hover:text-[#0E4A44] transition-colors tracking-[0.2em]"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 rounded-2xl border border-[#E4DFD1] bg-[#FAF8F3] px-4 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-[#6B6659]">
                <input
                  type="checkbox"
                  checked={keepConnected}
                  onChange={(e) => setKeepConnected(e.target.checked)}
                  className="h-4 w-4 rounded border-[#C9C2AC] text-[#0E4A44] focus:ring-[#0E4A44]"
                />
                Manter conectado neste dispositivo
              </label>

              <Button
                type="submit"
                disabled={localLoading}
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl shadow-[0_12px_30px_-10px_rgba(14,74,68,0.45)] text-[11px] uppercase tracking-[0.25em] transition-all active:scale-[0.98]"
              >
                Login <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="text-center pt-4 border-t border-[#F1EEE4] mt-6">
              <Link href="/solicitar-acesso" className="text-[10px] font-black uppercase text-[#6B6659] hover:text-[#0E4A44] transition-colors tracking-[0.25em]">
                Solicitar Credencial Municipal
              </Link>
            </div>
            </form>
          </div>
        </div>

        <div className="flex lg:hidden items-center justify-center mt-6 opacity-80 select-none">
          <ShieldCheck className="h-5 w-5 text-[#0E4A44]/70" />
        </div>
      </div>

      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="rounded-[2rem] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#262420]">Redefinir Senha</DialogTitle>
            <DialogDescription>Informe o e-mail cadastrado. Vamos enviar um link para você criar uma nova senha.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendReset} className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-[#6B6659] ml-2 tracking-[0.25em]">E-mail</Label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A39D8C] group-focus-within:text-[#0E4A44] transition-colors">
                  <Mail className="w-full h-full" />
                </div>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="exemplo@municipio.pr.gov.br"
                  className="w-full h-14 pl-12 pr-4 bg-[#FAF8F3] border border-[#E4DFD1] rounded-2xl outline-none focus:bg-white focus:border-[#0E4A44]/50 focus:ring-4 focus:ring-[#0E4A44]/10 transition-all text-sm font-semibold"
                  required
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSendingReset}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-[11px] uppercase tracking-[0.25em]"
              >
                {isSendingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar Link de Redefinição"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

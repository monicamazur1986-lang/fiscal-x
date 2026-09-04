'use client';

import { useState } from "react";
import { FlaskConical, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

/**
 * Tela de bloqueio obrigatória, exibida uma única vez por conta (até o
 * clique em "Concordo"), avisando que o sistema está em fase de testes e
 * proibindo reprodução/cópia/divulgação sem autorização. Renderizada pelo
 * AuthGuard antes de liberar o resto do app — ver betaTermsAcceptedAt em
 * src/hooks/use-auth.tsx.
 */
export function BetaNoticeGate() {
  const { updateProfileData, logout } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    setSaving(true);
    try {
      await updateProfileData({ betaTermsAcceptedAt: new Date().toISOString() });
    } catch (e) {
      toast({ variant: "destructive", title: "Não foi possível confirmar", description: "Tente novamente." });
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-[#020617] p-6 text-center overflow-y-auto">
      <div className="w-full max-w-lg space-y-8 py-10">
        <div className="p-10 rounded-[3rem] bg-amber-500/10 border border-amber-500/20 text-white flex flex-col items-center gap-6">
          <FlaskConical className="h-16 w-16 text-amber-400" />
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">Versão de Testes</h2>
          <div className="space-y-4 text-sm text-slate-300 leading-relaxed text-left">
            <p>
              Você está acessando uma <strong className="text-white">versão em fase de testes</strong> do Fiscal-X.
              O sistema pode apresentar instabilidades, dados de exemplo ou funcionalidades incompletas, e passar
              por alterações sem aviso prévio.
            </p>
            <p className="flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                O acesso é restrito e de uso exclusivo dos usuários autorizados. É <strong className="text-white">expressamente
                proibida a reprodução, cópia, distribuição ou divulgação</strong> do sistema — código, telas, dados ou
                conteúdo, no todo ou em parte — sem autorização prévia e por escrito.
              </span>
            </p>
            <p className="text-xs text-slate-400">
              Ao clicar em "Concordo", você declara estar ciente e de acordo com essas condições.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <Button
            onClick={handleAccept}
            disabled={saving}
            className="h-14 w-full rounded-2xl bg-amber-500 hover:bg-amber-600 text-[#020617] font-black uppercase text-sm tracking-widest gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Concordo
          </Button>
          <Button
            onClick={logout}
            variant="outline"
            className="h-12 w-full rounded-2xl border-white/10 text-slate-400 text-xs font-black uppercase tracking-widest"
          >
            Não concordo — sair
          </Button>
        </div>
      </div>
    </div>
  );
}

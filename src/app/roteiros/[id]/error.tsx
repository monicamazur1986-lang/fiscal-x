'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Copy, RotateCcw, ArrowLeft, Check } from "lucide-react";
import { auth } from "@/lib/firebase";

/**
 * Erro boundary específico da tela de preenchimento de roteiro — sem isso,
 * qualquer exceção aqui cai na tela genérica do Next.js ("Application
 * error: a client-side exception has occurred"), que não mostra nada útil
 * pra quem está com o problema relatar de volta. Aqui, além de mostrar o
 * texto do erro direto na tela (sem precisar abrir o console do
 * navegador), também registra no Firestore (clientErrorLogs) pra consulta
 * direta via Admin SDK.
 */
export default function RoteiroError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false);
  const [logged, setLogged] = useState<'pending' | 'ok' | 'fail'>('pending');

  useEffect(() => {
    const send = async () => {
      try {
        const idToken = await auth?.currentUser?.getIdToken().catch(() => null);
        const res = await fetch('/api/log-client-error', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            message: error.message,
            stack: error.stack,
            digest: error.digest,
            url: typeof window !== 'undefined' ? window.location.href : '',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          }),
        });
        setLogged(res.ok ? 'ok' : 'fail');
      } catch {
        setLogged('fail');
      }
    };
    send();
  }, [error]);

  const fullText = `${error.message}\n\n${error.stack || ''}`.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-rose-200 rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-rose-50 border-b border-rose-200">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-serif text-lg text-[#262420]">Não foi possível carregar este roteiro</p>
            <p className="text-xs text-rose-700">
              {logged === 'ok' ? 'Erro registrado — já podemos investigar.' : logged === 'pending' ? 'Registrando erro...' : 'Não foi possível registrar automaticamente — copie o texto abaixo e envie.'}
            </p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-[#F5F2EA] border border-[#E4DFD1] rounded-md p-4">
            <pre className="text-xs text-[#262420] whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">{fullText}</pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 h-9 rounded-md px-3 text-xs font-medium border border-[#E4DFD1] bg-white text-[#6B6659] hover:bg-[#F5F2EA]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar texto do erro'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 h-9 rounded-md px-3 text-xs font-medium bg-[#0E4A44] text-white hover:bg-[#0B3A35]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
            </button>
            <Link
              href="/roteiros"
              className="flex items-center gap-1.5 h-9 rounded-md px-3 text-xs font-medium border border-[#E4DFD1] bg-white text-[#6B6659] hover:bg-[#F5F2EA]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para Roteiros
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

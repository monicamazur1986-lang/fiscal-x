"use client"

import { useState } from "react"
import { AlertTriangle, Database, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/firebase"

/**
 * DESTRAVAR A FILA DE GRAVAÇÕES DO FIRESTORE
 *
 * O SDK guarda em IndexedDB, neste aparelho, toda gravação ainda não
 * confirmada pelo servidor, e recusa a de número 501:
 *
 *   "Write stream exhausted maximum allowed queued writes"
 *
 * A partir daí nada mais é salvo neste navegador, nem depois de corrigido o
 * que enchia a fila — as 500 presas continuam lá, e o app só volta a gravar
 * quando elas saem. Como elas não saem justamente porque o servidor não as
 * está aceitando, é preciso descartá-las à mão.
 *
 * A alternativa era mandar o usuário no DevTools ("Application > Storage >
 * Clear site data"), que além de exigir conhecimento técnico apaga também o
 * login, os rascunhos locais e as preferências. Aqui o alvo é só o cache do
 * Firestore.
 *
 * O QUE SE PERDE: as gravações que nunca chegaram ao servidor. Na prática são
 * quase todas repetição do mesmo documento — o que enche a fila é um laço
 * regravando o mesmo rascunho —, e o estado final continua no cache local de
 * cada tela, que é regravado na edição seguinte. Mas se houver uma vistoria
 * inteira que nunca sincronizou, ela vai junto: por isso a confirmação diz
 * como verificar antes.
 */
export function LimparFilaFirestore() {
  const { toast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [limpando, setLimpando] = useState(false);

  const limpar = async () => {
    setLimpando(true);
    try {
      const { terminate, clearIndexedDbPersistence } = await import('firebase/firestore');
      // clearIndexedDbPersistence exige a instância encerrada — com ela ativa,
      // o próprio SDK rejeita a limpeza (failed-precondition).
      await terminate(db as any);
      await clearIndexedDbPersistence(db as any);
      toast({
        title: "Fila de gravações esvaziada",
        description: "Recarregando o aplicativo…",
      });
      // Recarrega porque a instância do Firestore foi encerrada: qualquer tela
      // aberta ficaria sem banco até o app subir de novo.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      console.error('Falha ao limpar a fila do Firestore:', e);
      toast({
        variant: "destructive",
        title: "Não foi possível limpar",
        description: e?.code === 'failed-precondition'
          ? "Feche as outras abas do sistema e tente de novo — a limpeza só funciona com uma aba aberta."
          : (e?.message || "Erro desconhecido."),
      });
      setLimpando(false);
    }
  };

  return (
    <Card className="bg-white border-[#E4DFD1] rounded-lg overflow-hidden shadow-sm">
      <CardHeader className="bg-[#FAF8F3] border-b border-[#E4DFD1]">
        <CardTitle className="font-serif text-lg text-[#262420] flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" /> Fila de gravações
        </CardTitle>
        <CardDescription className="text-[#A39D8C] font-bold uppercase text-[9px] tracking-widest">
          Só usar quando o sistema parar de salvar
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-[#6B6659] leading-relaxed">
          Quando o aparelho fica sem confirmação do servidor, as gravações se acumulam aqui mesmo,
          no navegador. Passando de 500, o Firestore recusa as seguintes e o sistema
          <strong> para de salvar neste aparelho</strong> — no console aparece
          <em> “Write stream exhausted maximum allowed queued writes”</em>.
        </p>
        <p className="text-sm text-[#6B6659] leading-relaxed">
          Esvaziar a fila descarta o que nunca chegou ao servidor e devolve o aplicativo ao normal.
          Não apaga o seu login nem nada que já esteja salvo na nuvem.
        </p>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmando(true)}
            disabled={limpando}
            className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2 h-11 px-6 border-amber-300 text-amber-800 hover:bg-amber-50"
          >
            {limpando ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Esvaziar fila
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tighter text-xl italic">
              Esvaziar a fila de gravações?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  As gravações que ainda não chegaram ao servidor serão descartadas. O que já está
                  na nuvem permanece.
                </p>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <strong>Antes de confirmar:</strong> abra o sistema numa janela anônima e confira se
                  as vistorias e autuações de hoje aparecem lá. O que aparecer está salvo na nuvem;
                  o que não aparecer será perdido.
                </p>
                <p>O aplicativo será recarregado em seguida.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); limpar(); }}
              disabled={limpando}
              className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-amber-600 hover:bg-amber-700"
            >
              {limpando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Esvaziar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

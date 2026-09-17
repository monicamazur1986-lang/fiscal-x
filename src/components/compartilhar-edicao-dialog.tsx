"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { Check, Loader2, User, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { db } from "@/lib/firebase"
import { useAuth } from "@/hooks/use-auth"
import { normalizeId, cn } from "@/lib/utils"

export interface ColegaCompartilhado {
  uid: string;
  nome: string;
}

interface Colega extends ColegaCompartilhado {
  role: 'admin' | 'fiscal' | 'root';
}

/**
 * COMPARTILHAR A EDIÇÃO DE UMA AUTUAÇÃO
 *
 * Diferente do "Encaminhar" do PAS, que passa o processo adiante: aqui o
 * documento continua sendo de quem o abriu e os dois passam a poder editar e
 * finalizar. É o caso do fiscal que começa o auto em campo e o colega termina
 * no escritório, ou dos dois que fizeram a vistoria juntos.
 *
 * A lista é o cadastro de USUÁRIOS do município (`users`), não o de
 * autoridades — este último guarda nome, cargo e RG para assinar documentos, e
 * não tem conta de acesso. Quem aparece aqui é quem consegue entrar no sistema.
 *
 * Marcar e desmarcar não salva nada: a caixa devolve a lista inteira ao
 * confirmar. Assim dá pra tirar alguém por engano e voltar atrás sem que o
 * acesso tenha ido e voltado no meio do caminho.
 */
export function CompartilharEdicaoDialog({
  open,
  onOpenChange,
  compartilhadoCom,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quem já tem acesso hoje — marca os nomes ao abrir. */
  compartilhadoCom: ColegaCompartilhado[];
  onConfirmar: (colegas: ColegaCompartilhado[]) => Promise<void>;
}) {
  const { profile } = useAuth();
  const [colegas, setColegas] = useState<Colega[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  // Ao abrir, parte do que está gravado. Depois disso o estado é da caixa —
  // reagir a `compartilhadoCom` durante a edição desfaria o que a pessoa
  // acabou de marcar quando o snapshot do Firestore chegasse.
  useEffect(() => {
    if (open) setSelecionados(compartilhadoCom.map((c) => c.uid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !db || !profile?.municipioId) return;
    const mid = normalizeId(profile.municipioId);
    const q = query(collection(db, "users"), where("municipioId", "==", mid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs
        .map((d) => ({ uid: d.id, ...d.data() } as any))
        .filter((u) => u.isAuthorized && u.uid !== profile.uid && (u.role === 'admin' || u.role === 'fiscal'))
        .map((u) => ({ uid: u.uid, nome: u.displayName || u.email || 'Sem nome', role: u.role }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setColegas(lista);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [open, profile?.municipioId, profile?.uid]);

  const alternar = (uid: string) => {
    setSelecionados((atual) => atual.includes(uid) ? atual.filter((u) => u !== uid) : [...atual, uid]);
  };

  const mudou = useMemo(() => {
    const antes = [...compartilhadoCom.map((c) => c.uid)].sort().join('|');
    const agora = [...selecionados].sort().join('|');
    return antes !== agora;
  }, [compartilhadoCom, selecionados]);

  const confirmar = async () => {
    setSalvando(true);
    try {
      // Os nomes vão junto dos uids para a tela conseguir dizer "compartilhado
      // com Fulano" sem consultar a coleção de usuários — inclusive offline.
      await onConfirmar(
        selecionados.map((uid) => {
          const daLista = colegas.find((c) => c.uid === uid);
          const jaGravado = compartilhadoCom.find((c) => c.uid === uid);
          return { uid, nome: daLista?.nome || jaGravado?.nome || 'Fiscal' };
        })
      );
      onOpenChange(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Compartilhar edição</DialogTitle>
          <DialogDescription>
            Quem você marcar passa a ver esta autuação na lista dele e pode editar e finalizar junto com você. A autuação continua sendo sua — só você ou o gestor podem apagá-la.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 py-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#A39D8C]" /></div>
          ) : colegas.length === 0 ? (
            <p className="text-sm text-[#6B6659] text-center py-8">Nenhum colega encontrado no seu município.</p>
          ) : (
            colegas.map((colega) => {
              const marcado = selecionados.includes(colega.uid);
              return (
                <button
                  key={colega.uid}
                  type="button"
                  onClick={() => alternar(colega.uid)}
                  className={cn(
                    "w-full flex items-center gap-3 text-left border rounded-md p-3 transition-colors",
                    marcado
                      ? "border-[#0E4A44]/40 bg-[#E4EEEC]"
                      : "border-[#E4DFD1] hover:border-[#0E4A44]/30 hover:bg-[#F5F2EA]"
                  )}
                >
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    marcado ? "bg-[#0E4A44] text-white" : "bg-[#F5F2EA] text-[#6B6659]"
                  )}>
                    {marcado ? <Check className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <span className="flex-1 text-sm font-medium text-[#262420]">{colega.nome}</span>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-medium h-5 px-2 border-none",
                    colega.role === 'admin' ? "bg-[#E4EEEC] text-[#0E4A44]" : "bg-amber-50 text-amber-700"
                  )}>
                    {colega.role === 'admin' ? 'Gestor' : 'Fiscal'}
                  </Badge>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-black uppercase text-[10px] tracking-widest">
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={!mudou || salvando} className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            {selecionados.length === 0 ? 'Remover acesso' : 'Compartilhar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

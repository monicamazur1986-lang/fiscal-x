"use client"

import { useEffect, useState } from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { Loader2, Send, User } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { db } from "@/lib/firebase"
import { useAuth } from "@/hooks/use-auth"
import { normalizeId } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface Colega {
  uid: string;
  displayName: string;
  role: 'admin' | 'fiscal' | 'root';
}

/**
 * Encaminha o processo pra uma pessoa específica do município — não é uma
 * trava de permissão (qualquer gestor/fiscal do papel certo ainda pode agir
 * normalmente), é só um jeito de deixar explícito "isto é com você agora" e
 * mandar um aviso, pra o processo não ficar parado só porque ninguém
 * percebeu de quem era a vez.
 */
export function PasEncaminharDialog({
  open,
  onOpenChange,
  onEscolher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEscolher: (colega: Colega) => Promise<void>;
}) {
  const { profile } = useAuth();
  const [colegas, setColegas] = useState<Colega[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviandoUid, setEnviandoUid] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !db || !profile?.municipioId) return;
    const mid = normalizeId(profile.municipioId);
    const q = query(collection(db, "users"), where("municipioId", "==", mid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs
        .map((d) => ({ uid: d.id, ...d.data() } as any))
        .filter((u) => u.isAuthorized && u.uid !== profile.uid && (u.role === 'admin' || u.role === 'fiscal'))
        .map((u) => ({ uid: u.uid, displayName: u.displayName || u.email || 'Sem nome', role: u.role }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      setColegas(lista);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [open, profile?.municipioId, profile?.uid]);

  const handleEscolher = async (colega: Colega) => {
    setEnviandoUid(colega.uid);
    try {
      await onEscolher(colega);
      onOpenChange(false);
    } finally {
      setEnviandoUid(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Encaminhar processo</DialogTitle>
          <DialogDescription>Escolha quem deve cuidar do próximo passo — a pessoa recebe um aviso, e o processo mostra "encaminhado para" ela.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 py-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#A39D8C]" /></div>
          ) : colegas.length === 0 ? (
            <p className="text-sm text-[#6B6659] text-center py-8">Nenhum colega encontrado no seu município.</p>
          ) : (
            colegas.map((colega) => (
              <button
                key={colega.uid}
                disabled={!!enviandoUid}
                onClick={() => handleEscolher(colega)}
                className="w-full flex items-center gap-3 text-left border border-[#E4DFD1] rounded-md p-3 hover:border-[#0E4A44]/30 hover:bg-[#F5F2EA] transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-[#F5F2EA] flex items-center justify-center shrink-0 text-[#6B6659]">
                  <User className="h-4 w-4" />
                </div>
                <span className="flex-1 text-sm font-medium text-[#262420]">{colega.displayName}</span>
                <Badge variant="outline" className={cn("text-[10px] font-medium h-5 px-2 border-none", colega.role === 'admin' ? "bg-[#E4EEEC] text-[#0E4A44]" : "bg-amber-50 text-amber-700")}>
                  {colega.role === 'admin' ? 'Gestor' : 'Fiscal'}
                </Badge>
                {enviandoUid === colega.uid ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Send className="h-4 w-4 text-[#C4BEAC] shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

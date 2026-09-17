"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Plus, Loader2, ChevronRight, Building2 } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { usePas } from "@/hooks/use-pas"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { agruparProcessos, CartaoPas, SecaoPas, VazioPas } from "@/components/pas/lista-pas"
import { cn } from "@/lib/utils"
import municipiosPR from "@/lib/municipios-pr.json"

function PasPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { profile } = useAuth();
  const isRoot = profile?.role === 'root';
  // Root não pertence a um município (perfil nasce com municipioId:
  // 'geral') — precisa escolher qual visualizar, senão a consulta do PAS
  // (filtrada por município) sempre voltava vazia mesmo com acesso liberado
  // nas regras do Firestore.
  const [selectedMunicipio, setSelectedMunicipio] = useState("");
  const municipioOverride = isRoot ? { municipioIdOverride: selectedMunicipio || undefined } : undefined;
  const { processos, loading, criarPas, needsMunicipioSelection } = usePas(municipioOverride);
  const { intimacoes, updateIntimacaoMeta } = useIntimacoes(municipioOverride);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // A lista era cronológica e plana: num município com trinta processos
  // abertos, descobrir de qual cuidar exigia abrir um por um. O que decide a
  // ordem num PAS não é a data — é prazo vencido, é estar encaminhado para
  // você, é estar parado esperando julgamento.
  const grupos = useMemo(() => agruparProcessos(processos, profile?.uid), [processos, profile?.uid]);

  // Autos de Infração finalizados que ainda não têm PAS aberto — candidatos
  // a virar processo novo (o PAS, no manual, sempre nasce de um AI).
  const aisElegiveis = useMemo(() => {
    return intimacoes.filter(i => i.status === 'finalizado' && i.tipoTermo === 'AUTO DE INFRAÇÃO' && !i.pasId && !i.deleted);
  }, [intimacoes]);

  // Chegando de "Abrir PAS" no menu Documentos (?abrir=<intimacaoId>) — abre
  // o seletor já filtrado nesse AI específico.
  const abrirId = searchParams.get('abrir');
  useEffect(() => {
    if (abrirId) setIsPickerOpen(true);
  }, [abrirId]);

  const handleCriarPas = async (autoInfracaoId: string) => {
    const ai = intimacoes.find(i => i.id === autoInfracaoId);
    if (!ai || !profile) return;
    setIsCreating(true);
    try {
      const dataCiencia = ai.dataRecebimento || ai.dataIntimacao;
      const id = await criarPas({
        numeroProcesso: ai.numeroProcesso,
        autoInfracaoId: ai.id,
        // Mesmo cuidado do anexoUrl em use-pas.ts: cnpj/endereco só entram no
        // objeto quando o Auto de Infração de fato os tem — um valor
        // `undefined` explícito faz o Firestore rejeitar a gravação inteira.
        estabelecimento: {
          fantasia: ai.autor || 'Estabelecimento não informado',
          ...(ai.cnpj ? { cnpj: ai.cnpj } : {}),
          ...(ai.endereco ? { endereco: ai.endereco } : {}),
        },
        autuanteUid: profile.uid,
        autuanteNome: profile.displayName || 'Fiscal',
        dataCienciaAI: new Date(dataCiencia).toISOString(),
      });
      await updateIntimacaoMeta(ai.id, { pasId: id });
      setIsPickerOpen(false);
      router.push(`/pas/${id}`);
    } catch (e) {
      console.error('Erro ao criar o PAS:', e);
      toast({ variant: "destructive", title: "Erro ao abrir o PAS" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        title="PAS"
        subtitle="Processo Administrativo Sanitário"
        actions={
          <div className="flex items-center gap-2">
            {isRoot && (
              <div className="flex items-center gap-2 bg-white border border-[#E4DFD1] rounded-xl px-3 h-9">
                <Building2 className="h-3.5 w-3.5 text-[#A39D8C]" />
                <select value={selectedMunicipio} onChange={(e) => setSelectedMunicipio(e.target.value)} className="text-[11px] font-bold uppercase outline-none bg-transparent">
                  <option value="">Selecionar Município</option>
                  {municipiosPR.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {/* Root só acompanha os processos (visão de suporte/auditoria) —
                abrir um PAS novo grava sob o município do próprio perfil
                (nunca o município selecionado aqui), então fica reservado
                pra fiscal/gestor de verdade, donos do processo. */}
            {!isRoot && (
              <Button size="sm" onClick={() => setIsPickerOpen(true)} className="h-9 rounded-md gap-1.5 text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">
                <Plus className="h-4 w-4" /> Abrir PAS
              </Button>
            )}
          </div>
        }
      />

      <div className="max-w-4xl mx-auto w-full p-4 sm:p-8 space-y-4 pb-40">
        {isRoot && needsMunicipioSelection ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center border border-dashed border-[#E4DFD1] rounded-lg bg-white">
            <Building2 className="h-8 w-8 text-[#A39D8C]" />
            <p className="text-sm text-[#6B6659]">Selecione um município acima pra visualizar os processos administrativos sanitários dele.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20 text-[#A39D8C]"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : processos.length === 0 ? (
          <VazioPas isRoot={isRoot} />
        ) : (
          <div className="space-y-8">
            {grupos.map((grupo) => (
              <SecaoPas key={grupo.chave} grupo={grupo}>
                {grupo.processos.map((p) => (
                  <CartaoPas key={p.id} pas={p} onAbrir={() => router.push(`/pas/${p.id}`)} />
                ))}
              </SecaoPas>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Abrir PAS a partir de um Auto de Infração</DialogTitle>
            <DialogDescription>Só Autos de Infração já finalizados e sem PAS aberto aparecem aqui.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-1.5 py-2">
            {aisElegiveis.length === 0 ? (
              <p className="text-sm text-[#6B6659] text-center py-8">Nenhum Auto de Infração disponível pra abrir um PAS novo.</p>
            ) : (
              aisElegiveis.map((ai) => (
                <button
                  key={ai.id}
                  disabled={isCreating}
                  onClick={() => handleCriarPas(ai.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 text-left border rounded-md p-3 hover:border-[#0E4A44]/30 hover:bg-[#F5F2EA] transition-colors",
                    ai.id === abrirId ? "border-[#0E4A44] bg-[#E4EEEC]" : "border-[#E4DFD1]"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#262420] truncate">{ai.autor || 'Estabelecimento não informado'}</p>
                    <p className="text-xs text-[#A39D8C]">AI nº {ai.numeroProcesso}</p>
                  </div>
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <ChevronRight className="h-4 w-4 text-[#C4BEAC] shrink-0" />}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PasPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#F5F2EA]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PasPageInner />
    </Suspense>
  )
}

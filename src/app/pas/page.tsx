"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Plus, Loader2, ChevronRight, Building2, Archive, Folder, FolderPlus } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePas } from "@/hooks/use-pas"
import { useFolders } from "@/hooks/use-folders"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { cancelarLembretePrazo } from "@/lib/prazo-lembrete"
import { agruparProcessos, CartaoPas, FiltroPastaPas, SecaoPas, VazioPas } from "@/components/pas/lista-pas"
import type { Pas } from "@/lib/types"
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
  const { processos, loading, criarPas, atualizarPas, excluirPas, needsMunicipioSelection } = usePas(municipioOverride);
  const { intimacoes, updateIntimacaoMeta } = useIntimacoes(municipioOverride);
  const { deleteInspecao } = useInspecoes();
  const { folders: pastas, createFolder } = useFolders('pas');

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // 'todos' esconde os arquivados (arquivar é "tirar da vista"); uma pasta
  // específica ou 'arquivados' filtram por esse critério, ignorando o outro.
  const [filtro, setFiltro] = useState<string>('todos');
  const [isPastaDialogOpen, setIsPastaDialogOpen] = useState(false);
  const [novaPastaNome, setNovaPastaNome] = useState("");

  const processosFiltrados = useMemo(() => {
    if (filtro === 'arquivados') return processos.filter((p) => p.arquivado);
    if (filtro === 'todos') return processos.filter((p) => !p.arquivado);
    return processos.filter((p) => !p.arquivado && p.folderId === filtro);
  }, [processos, filtro]);

  // A lista era cronológica e plana: num município com trinta processos
  // abertos, descobrir de qual cuidar exigia abrir um por um. O que decide a
  // ordem num PAS não é a data — é prazo vencido, é estar encaminhado para
  // você, é estar parado esperando julgamento. Arquivados não entram nessa
  // triagem por urgência (já foram tirados da vista de propósito).
  const grupos = useMemo(
    () => (filtro === 'arquivados' ? [] : agruparProcessos(processosFiltrados, profile?.uid)),
    [processosFiltrados, filtro, profile?.uid]
  );

  const handleCriarPasta = async () => {
    if (!novaPastaNome.trim()) return;
    try {
      await createFolder(novaPastaNome);
      setNovaPastaNome("");
      setIsPastaDialogOpen(false);
    } catch (e) {
      console.error('Erro ao criar pasta do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao criar pasta" });
    }
  };

  const handleArquivar = async (id: string, arquivado: boolean) => {
    try {
      await atualizarPas(id, { arquivado, arquivadoEm: arquivado ? new Date().toISOString() : "" });
      toast({ title: arquivado ? "Processo arquivado" : "Processo desarquivado" });
    } catch (e) {
      console.error('Erro ao arquivar PAS:', e);
      toast({ variant: "destructive", title: "Erro ao arquivar" });
    }
  };

  const handleMoverPasta = async (id: string, folderId: string | null) => {
    try {
      await atualizarPas(id, { folderId: folderId || "" });
    } catch (e) {
      console.error('Erro ao mover PAS de pasta:', e);
      toast({ variant: "destructive", title: "Erro ao mover para a pasta" });
    }
  };

  // Mesma limpeza de pas/[id]/page.tsx (handleExcluirPas) — excluir só o
  // documento deixava o lembrete de prazo órfão na Agenda e o Auto de
  // Infração de origem travado (pasId apontando pra um PAS que não existe
  // mais, impedindo reabrir um processo novo a partir dele).
  const handleExcluir = async (p: Pas) => {
    try {
      await cancelarLembretePrazo(deleteInspecao, p.agendaLembreteId);
      await cancelarLembretePrazo(deleteInspecao, p.encaminhamentoLembreteId);
      await excluirPas(p.id);
      // Limpeza de referência, não pode impedir a exclusão do PAS em si
      // (já aconteceu na linha acima) — ver o mesmo cuidado, com o motivo
      // completo, em handleExcluirPas de pas/[id]/page.tsx.
      try {
        await updateIntimacaoMeta(p.autoInfracaoId, { pasId: null });
      } catch (e) {
        console.warn('PAS excluído, mas não foi possível liberar o Auto de Infração de origem:', e);
      }
      toast({ title: "Processo excluído" });
    } catch (e) {
      console.error('Erro ao excluir PAS:', e);
      toast({ variant: "destructive", title: "Erro ao excluir processo" });
    }
  };

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
        // Quem estava na inspeção (já casado por nome de autoridade no
        // auto de origem, ver compartilharComAutoridades) acompanha o PAS
        // desde que ele nasce — sem isso, só quem abre o PAS o vê, e o
        // colega que via o auto perdia esse acesso justamente na hora em
        // que ele passa a interessar mais (o processo administrativo).
        ...(ai.compartilhadoCom?.length ? { compartilhadoCom: ai.compartilhadoCom } : {}),
        ...(ai.compartilhadoComNomes?.length ? { compartilhadoComNomes: ai.compartilhadoComNomes } : {}),
      });
      await updateIntimacaoMeta(ai.id, { pasId: id });
      // NÃO referencia o Auto de Infração/termo vinculado aqui — isso agora
      // é o passo 1, manual, da fase de Instauração (ver "instauracao" em
      // pas/[id]/page.tsx, handleAnexarDocumentosOrigem): a autoridade
      // confirma o que entra nos autos antes de seguir, em vez do sistema
      // inserir isso sozinho na hora de abrir o PAS.
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
          <>
            {/* Pastas só organizam a lista (não têm efeito jurídico nenhum) —
                por isso ficam numa faixa de filtros, igual ao Acervo de
                Documentos, em vez de uma coluna lateral fixa. */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[#EFEADC] rounded-lg p-1">
              <FiltroPastaPas ativa={filtro === 'todos'} onClick={() => setFiltro('todos')}>
                Todos <span className="tabular-nums opacity-60">{processos.filter((p) => !p.arquivado).length}</span>
              </FiltroPastaPas>
              {pastas.map((f) => (
                <FiltroPastaPas key={f.id} ativa={filtro === f.id} onClick={() => setFiltro(f.id)}>
                  <Folder className="h-3.5 w-3.5" /> {f.name}
                </FiltroPastaPas>
              ))}
              <FiltroPastaPas ativa={filtro === 'arquivados'} tom="arquivados" onClick={() => setFiltro('arquivados')}>
                <Archive className="h-3.5 w-3.5" /> Arquivados <span className="tabular-nums opacity-60">{processos.filter((p) => p.arquivado).length}</span>
              </FiltroPastaPas>
              <button
                type="button"
                onClick={() => setIsPastaDialogOpen(true)}
                title="Nova pasta"
                className="h-8 w-8 rounded-md flex items-center justify-center text-[#A39D8C] hover:text-[#0E4A44] hover:bg-white transition-colors"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>

            {processosFiltrados.length === 0 ? (
              <VazioPas isRoot={isRoot} filtro={filtro === 'arquivados' ? 'arquivados' : filtro === 'todos' ? 'todos' : 'pasta'} />
            ) : filtro === 'arquivados' ? (
              <div className="space-y-2">
                {processosFiltrados.map((p) => (
                  <CartaoPas
                    key={p.id}
                    pas={p}
                    pastas={pastas}
                    onAbrir={() => router.push(`/pas/${p.id}`)}
                    onMoverPasta={(folderId) => handleMoverPasta(p.id, folderId)}
                    onArquivar={(arquivado) => handleArquivar(p.id, arquivado)}
                    onExcluir={() => handleExcluir(p)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-8">
                {grupos.map((grupo) => (
                  <SecaoPas key={grupo.chave} grupo={grupo}>
                    {grupo.processos.map((p) => (
                      <CartaoPas
                        key={p.id}
                        pas={p}
                        pastas={pastas}
                        onAbrir={() => router.push(`/pas/${p.id}`)}
                        onMoverPasta={(folderId) => handleMoverPasta(p.id, folderId)}
                        onArquivar={(arquivado) => handleArquivar(p.id, arquivado)}
                        onExcluir={() => handleExcluir(p)}
                        // Dentro de uma pasta específica todo cartão já é
                        // daquela pasta — o crachá só repetiria o filtro que
                        // a própria tela já está aplicando.
                        mostrarBadgePasta={filtro === 'todos'}
                        // "Encaminhados para você" É o responsável — mostrar
                        // de novo o próprio nome em cada cartão do grupo não
                        // soma informação, só ocupa linha.
                        ocultarResponsavel={grupo.chave === 'comigo'}
                      />
                    ))}
                  </SecaoPas>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={isPastaDialogOpen} onOpenChange={setIsPastaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Nova pasta</DialogTitle>
            <DialogDescription>Organize os processos como preferir — não muda a fase nem o andamento de nenhum PAS.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <Label className="text-xs font-medium text-[#6B6659]">Nome da pasta</Label>
            <Input value={novaPastaNome} onChange={(e) => setNovaPastaNome(e.target.value)} placeholder="Ex: Fiscalização Norte" className="h-10 rounded-md border-[#E4DFD1] bg-white text-sm" />
          </div>
          <DialogFooter>
            <Button onClick={handleCriarPasta} size="sm" className="h-9 rounded-md text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">Criar pasta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

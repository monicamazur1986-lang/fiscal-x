"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Download, FileText, Loader2, Save, Trash2, History, Eraser, Sparkles, Folder as FolderIcon, CheckCircle2 } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DocfacilEditor } from "@/components/docfacil-editor"
import { OfficialLetterhead } from "@/components/official-letterhead"
import { useDocfacil } from "@/hooks/use-docfacil"
import { useFolders } from "@/hooks/use-folders"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { polishDocfacilText } from "@/ai/flows/polish-docfacil-text"
import { format } from "date-fns"
import type { DocfacilDocumento, DocfacilTipo } from "@/lib/types"

// Sentinela pro Radix Select — ele não aceita item com value="" (é reservado
// pra "sem seleção"), então "root" representa "sem pasta" e é convertido
// pra "" só na hora de gravar/comparar com o resto do app.
const SEM_PASTA = "root";

const TIPO_LABEL: Record<DocfacilTipo, string> = {
  oficio: "OFÍCIO",
  memorando: "MEMORANDO",
  circular: "CIRCULAR",
};

export default function GerarDocumentoPage({ params }: { params: Promise<{ modeloId: string }> }) {
  const { modeloId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { modelos, documentos, loading, salvarDocumento, excluirDocumento } = useDocfacil();
  const { folders } = useFolders('docfacil');
  const reportRef = useRef<HTMLDivElement>(null);

  const modelo = modelos.find((m) => m.id === modeloId) || null;

  const [destinatario, setDestinatario] = useState("");
  const [assunto, setAssunto] = useState("");
  const [conteudo, setConteudo] = useState("");
  // Começa com a pasta de onde o fiscal veio (se veio de dentro de uma), mas
  // pode ser trocada aqui mesmo — "dar uma destinação ao arquivo" não devia
  // depender de por onde a tela foi aberta.
  const [folderId, setFolderId] = useState(searchParams.get("folderId") || "");
  const [view, setView] = useState<"edicao" | "relatorio">("edicao");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  // Só permite revisar de novo se o conteúdo mudou desde a última revisão —
  // clique repetido no mesmo texto não deve gastar cota de IA de novo.
  const [lastPolishedContent, setLastPolishedContent] = useState<string | null>(null);
  const [documentoEmitido, setDocumentoEmitido] = useState<DocfacilDocumento | null>(null);

  // Documento (rascunho ou finalizado) que está sendo editado nesta tela —
  // uma vez definido, todo save atualiza o mesmo registro (mesmo número) em
  // vez de criar outro. Começa vazio; vira o id do rascunho retomado, ou do
  // próprio rascunho assim que o primeiro autosave/"Salvar Rascunho" ocorrer.
  const [currentDocumentoId, setCurrentDocumentoId] = useState<string | null>(null);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const [draftToResume, setDraftToResume] = useState<DocfacilDocumento | null>(null);
  const hasCheckedDraftRef = useRef(false);

  useEffect(() => {
    if (modelo && !conteudo) setConteudo(modelo.conteudo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo?.id]);

  // Ao abrir a tela pela primeira vez (nunca quando já se está editando um
  // documento carregado), procura um rascunho anterior deste mesmo modelo,
  // feito pelo próprio fiscal — igual ao "retomar vistoria" dos Roteiros.
  useEffect(() => {
    if (loading || !profile || hasCheckedDraftRef.current || currentDocumentoId) return;
    hasCheckedDraftRef.current = true;
    const draft = documentos.find((d) => d.status === 'rascunho' && d.modeloId === modeloId && d.createdBy === profile.uid);
    if (draft) {
      setDraftToResume(draft);
      setIsResumeDialogOpen(true);
    }
  }, [loading, profile, documentos, modeloId, currentDocumentoId]);

  const handleResumeDraft = () => {
    if (draftToResume) {
      setDestinatario(draftToResume.destinatario);
      setAssunto(draftToResume.assunto);
      setConteudo(draftToResume.conteudo);
      setFolderId(draftToResume.folderId || "");
      setCurrentDocumentoId(draftToResume.id);
      toast({ title: "Rascunho retomado" });
    }
    setIsResumeDialogOpen(false);
  };

  const handleStartFresh = async () => {
    if (draftToResume?.id) {
      try {
        await excluirDocumento(draftToResume.id);
      } catch (e) {
        toast({ variant: "destructive", title: "Erro ao excluir rascunho anterior" });
      }
    }
    setIsResumeDialogOpen(false);
  };

  // Autosave discreto — mesma ideia do heartbeat de Roteiros: se o fiscal sair
  // sem clicar em nada, o rascunho ainda assim não se perde.
  const isDirtyRef = useRef(false);
  const handleSaveDraftRef = useRef<(showToast?: boolean) => Promise<void>>();

  const handleSaveDraft = useCallback(async (showToast = true) => {
    if (!modelo) return;
    if (!destinatario.trim() && !assunto.trim() && !conteudo.trim()) return;
    setIsSavingDraft(true);
    try {
      const novo = await salvarDocumento({
        modeloId: modelo.id,
        tipo: modelo.tipo,
        destinatario: destinatario.trim(),
        assunto: assunto.trim(),
        conteudo,
        folderId,
        status: 'rascunho',
      }, currentDocumentoId || undefined);
      setCurrentDocumentoId(novo.id);
      isDirtyRef.current = false;
      if (showToast) toast({ title: "Rascunho salvo" });
    } catch (e) {
      if (showToast) toast({ variant: "destructive", title: "Erro ao salvar rascunho" });
    } finally {
      setIsSavingDraft(false);
    }
  }, [modelo, destinatario, assunto, conteudo, folderId, currentDocumentoId, salvarDocumento, toast]);

  useEffect(() => { handleSaveDraftRef.current = handleSaveDraft; }, [handleSaveDraft]);

  const isFirstDirtyCheckRef = useRef(true);
  useEffect(() => {
    if (isFirstDirtyCheckRef.current) { isFirstDirtyCheckRef.current = false; return; }
    isDirtyRef.current = true;
  }, [destinatario, assunto, conteudo, folderId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirtyRef.current) handleSaveDraftRef.current?.(false);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleDeleteDraft = async () => {
    if (!currentDocumentoId) return;
    if (!window.confirm("Excluir este rascunho? Essa ação não pode ser desfeita.")) return;
    setIsDeletingDraft(true);
    try {
      await excluirDocumento(currentDocumentoId);
      toast({ title: "Rascunho excluído" });
      setCurrentDocumentoId(null);
      setDestinatario("");
      setAssunto("");
      setConteudo(modelo?.conteudo || "");
      setFolderId(searchParams.get("folderId") || "");
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao excluir rascunho" });
    } finally {
      setIsDeletingDraft(false);
    }
  };

  // Aceita o conteúdo como parâmetro (em vez de só ler `conteudo` do estado)
  // porque, no caminho "Revisar e Gerar", o texto revisado só existe nesse
  // momento — setState é assíncrono, então ler `conteudo` aqui ainda pegaria
  // a versão antiga se não fosse passado explicitamente.
  //
  // Só gera uma PRÉ-VISUALIZAÇÃO (status continua 'rascunho') — finalizar de
  // fato é uma ação separada e explícita (handleFinalizarOficio), disparada
  // só a partir da tela de revisão, igual ao "Finalizar Relatório" dos
  // Roteiros (que também é distinto de "Ver Relatório").
  const handleGerar = async (conteudoParaGerar: string = conteudo) => {
    if (!modelo) return;
    if (!assunto.trim()) {
      toast({ variant: "destructive", title: "Informe o assunto do documento" });
      return;
    }
    setIsGenerating(true);
    try {
      const novo = await salvarDocumento({
        modeloId: modelo.id,
        tipo: modelo.tipo,
        destinatario: destinatario.trim(),
        assunto: assunto.trim(),
        conteudo: conteudoParaGerar,
        folderId,
        status: 'rascunho',
      }, currentDocumentoId || undefined);
      setCurrentDocumentoId(novo.id);
      setDocumentoEmitido(novo);
      setView("relatorio");
    } catch (e) {
      console.error("Erro ao gerar documento:", e);
      toast({ variant: "destructive", title: "Erro ao gerar documento" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Ação de conclusão de fato: marca como 'finalizado' (some da lista de
  // rascunhos retomáveis), baixa o PDF definitivo e volta pro DOCFACIL —
  // "encerrar a execução" do ofício.
  const handleFinalizarOficio = async () => {
    if (!documentoEmitido) return;
    if (!window.confirm("Finalizar este documento? Ele será marcado como concluído e não poderá mais ser editado por aqui.")) return;
    setIsFinalizing(true);
    try {
      const atualizado = await salvarDocumento({
        modeloId: documentoEmitido.modeloId,
        tipo: documentoEmitido.tipo,
        destinatario: documentoEmitido.destinatario,
        assunto: documentoEmitido.assunto,
        conteudo: documentoEmitido.conteudo,
        folderId: documentoEmitido.folderId,
        status: 'finalizado',
      }, documentoEmitido.id);
      setDocumentoEmitido(atualizado);
      await downloadPdf();
      toast({ title: "Ofício finalizado", description: "O documento foi concluído e o PDF foi baixado." });
      router.push('/docfacil');
    } catch (e) {
      console.error("Erro ao finalizar documento:", e);
      toast({ variant: "destructive", title: "Erro ao finalizar documento" });
    } finally {
      setIsFinalizing(false);
    }
  };

  // A IA só é oferecida aqui — no clique final de "Visualizar Documento",
  // nunca solta na barra de ferramentas durante a digitação — e no máximo
  // uma vez por versão do texto (se já foi revisado e nada mudou desde
  // então, gera direto sem perguntar de novo).
  const [isConfirmGerarOpen, setIsConfirmGerarOpen] = useState(false);

  const handleClickVisualizar = () => {
    if (!assunto.trim()) {
      toast({ variant: "destructive", title: "Informe o assunto do documento" });
      return;
    }
    if (conteudo.trim() && conteudo !== lastPolishedContent) {
      setIsConfirmGerarOpen(true);
    } else {
      handleGerar();
    }
  };

  const handleConfirmGerarSemRevisar = () => {
    setIsConfirmGerarOpen(false);
    handleGerar();
  };

  const handleConfirmGerarComRevisao = async () => {
    setIsConfirmGerarOpen(false);
    setIsPolishing(true);
    try {
      const result = await polishDocfacilText({ html: conteudo, uid: profile?.uid || '' });
      if (result.error) {
        toast({ variant: "destructive", title: "IA indisponível", description: result.error });
      } else {
        setConteudo(result.polishedHtml);
        setLastPolishedContent(result.polishedHtml);
      }
      await handleGerar(result.polishedHtml);
    } finally {
      setIsPolishing(false);
    }
  };

  const downloadPdf = async () => {
    if (!reportRef.current || !documentoEmitido) return;
    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(reportRef.current, { scale: 3.0, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; const pageHeight = 297; const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight; let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) { position = heightLeft - imgHeight; pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight); heightLeft -= pageHeight; }
      pdf.save(`${TIPO_LABEL[documentoEmitido.tipo]} ${documentoEmitido.numero.replace('/', '-')}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading || !modelo) {
    return (
      <div className="max-w-4xl mx-auto w-full p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
      </div>
    );
  }

  if (view === "relatorio" && documentoEmitido) {
    const isFinalizado = documentoEmitido.status === 'finalizado';
    return (
      <div className="min-h-screen bg-white">
        <DocfacilTopbar
          onBack={() => setView("edicao")}
          title={`${TIPO_LABEL[documentoEmitido.tipo]} Nº ${documentoEmitido.numero}`}
          subtitle={isFinalizado ? "Documento finalizado" : "Pré-visualização — ainda não finalizado"}
          actions={
            <div className="flex items-center gap-2">
              <Button onClick={downloadPdf} disabled={isDownloading} variant="outline" size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium border-[#E4DFD1]">
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar PDF Oficial
              </Button>
              {isFinalizado ? (
                <span className="h-9 px-3 rounded-md text-xs font-medium bg-[#E3F1EA] text-[#1F7A5C] flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Finalizado</span>
              ) : (
                <Button onClick={handleFinalizarOficio} disabled={isFinalizing} size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium bg-[#0E4A44] hover:bg-[#0B3A35]">
                  {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Finalizar Ofício
                </Button>
              )}
            </div>
          }
        />
        <div className="document-container font-serif pb-40">
          <div className="document-paper-wrapper custom-scrollbar">
            <div ref={reportRef} className="document-paper h-auto bg-white">
              <div className="mb-1 pb-2 border-none">
                <OfficialLetterhead />
                <p className="text-[14pt] font-black uppercase italic tracking-tighter mt-2 border-y border-zinc-200 py-1 text-center">{TIPO_LABEL[documentoEmitido.tipo]} Nº {documentoEmitido.numero}</p>
              </div>

              <div className="mb-6 mt-6 space-y-1">
                {documentoEmitido.destinatario && <p className="text-[10pt] font-bold uppercase">Destinatário: {documentoEmitido.destinatario}</p>}
                <p className="text-[10pt] font-bold uppercase">Assunto: {documentoEmitido.assunto}</p>
              </div>

              <div className="text-[11pt] leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(documentoEmitido.conteudo) }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <DocfacilTopbar
        backHref="/docfacil"
        title={`Gerar ${TIPO_LABEL[modelo.tipo]}`}
        subtitle={`A partir do modelo: ${modelo.descricao}`}
        actions={
          <div className="flex items-center gap-2">
            {currentDocumentoId && (
              <Button onClick={handleDeleteDraft} disabled={isDeletingDraft} variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-md text-rose-500 hover:bg-rose-50">
                {isDeletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
            <Button onClick={() => handleSaveDraft(true)} disabled={isSavingDraft} variant="outline" size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium border-[#E4DFD1]">
              {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Rascunho
            </Button>
            <Button onClick={handleClickVisualizar} disabled={isGenerating || isPolishing} size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Visualizar Documento
            </Button>
          </div>
        }
      />

      <div className="max-w-4xl mx-auto w-full py-6 space-y-4 pb-40">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-0">
          <Input
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value.toUpperCase())}
            placeholder="Destinatário"
            className="h-8 flex-1 min-w-[180px] rounded-md text-xs uppercase"
          />
          <Input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder="Assunto"
            className="h-8 flex-1 min-w-[180px] rounded-md text-xs"
          />
          <Select value={folderId || SEM_PASTA} onValueChange={(v) => setFolderId(v === SEM_PASTA ? "" : v)}>
            <SelectTrigger className="h-8 w-auto min-w-[170px] rounded-md text-xs gap-1.5 border-[#E4DFD1]">
              <FolderIcon className="h-3.5 w-3.5 text-[#9C7A3C] shrink-0" />
              <SelectValue placeholder="Pasta de destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PASTA}>Sem pasta (Todos os Documentos)</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DocfacilEditor defaultValue={conteudo} onChange={setConteudo} forceContent={conteudo} />
      </div>

      <Dialog open={isResumeDialogOpen} onOpenChange={setIsResumeDialogOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl bg-white overflow-hidden p-0">
          <DialogHeader className="p-8 bg-zinc-900 text-white border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-primary/20 text-primary"><History className="h-6 w-6" /></div>
              <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Retomar Rascunho?</DialogTitle>
                <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Existe um documento em andamento seu</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-4">
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">Assunto:</p>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-slate-800 uppercase truncate">{draftToResume?.assunto || "SEM ASSUNTO"}</span>
              </div>
              <p className="text-[10px] font-medium text-slate-500 italic">Preenchido até às {draftToResume?.updatedAt ? format(new Date(draftToResume.updatedAt), "HH:mm") : "..."}</p>
            </div>
            <p className="text-[11px] font-bold text-slate-500 text-center leading-relaxed">Deseja continuar exatamente de onde parou ou iniciar um novo documento?</p>
          </div>
          <DialogFooter className="p-8 bg-zinc-50 border-t border-zinc-100 flex gap-3">
            <Button variant="ghost" onClick={handleStartFresh} className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] text-rose-500 hover:bg-rose-50 gap-2"><Eraser className="h-3.5 w-3.5" /> Novo Zero</Button>
            <Button onClick={handleResumeDraft} className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-[10px] uppercase tracking-widest shadow-xl">Retomar Agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmGerarOpen} onOpenChange={setIsConfirmGerarOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl bg-white overflow-hidden p-0">
          <DialogHeader className="p-8 bg-zinc-900 text-white border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-violet-500/20 text-violet-400"><Sparkles className="h-6 w-6" /></div>
              <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Revisar com IA?</DialogTitle>
                <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Última chance antes da pré-visualização</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-8">
            <p className="text-[11px] font-bold text-slate-500 text-center leading-relaxed">Quer que a IA revise a gramática e o tom do texto antes de visualizar o documento?</p>
          </div>
          <DialogFooter className="p-8 bg-zinc-50 border-t border-zinc-100 flex gap-3">
            <Button variant="ghost" onClick={handleConfirmGerarSemRevisar} className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] text-slate-500 hover:bg-slate-100">Visualizar Sem Revisar</Button>
            <Button onClick={handleConfirmGerarComRevisao} disabled={isPolishing} className="flex-[2] h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-[10px] uppercase tracking-widest shadow-xl gap-2">
              {isPolishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Revisar e Visualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

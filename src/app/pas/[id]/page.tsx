"use client"

import { use, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Loader2, Timer, FileStack, Send, Paperclip, CheckCircle2,
  AlertTriangle, ChevronDown, Download, X, FileDown, Landmark, Pencil, Trash2,
} from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { PasDica } from "@/components/pas/pas-dica"
import { PasPecaReviewDialog, type PasPecaRevisao } from "@/components/pas/pas-peca-review-dialog"
import { PasEncaminharDialog } from "@/components/pas/pas-encaminhar-dialog"
import municipiosPR from "@/lib/municipios-pr.json"
import { usePas, usePasPecas } from "@/hooks/use-pas"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useAuth } from "@/hooks/use-auth"
import { useAppConfig } from "@/hooks/use-app-config"
import { useToast } from "@/hooks/use-toast"
import { addBusinessDays, calculateDeadline } from "@/lib/prazo"
import { criarLembretePrazo, cancelarLembretePrazo } from "@/lib/prazo-lembrete"
import { storage } from "@/lib/firebase"
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { blobToDataUrl } from "@/lib/compress-image"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { renderReportIntoPdf } from "@/lib/generate-roteiro-pdf"
import type { PasPeca } from "@/lib/types"
import {
  textoDespachoInicial,
  textoDespachoInstrucao,
  textoTermoJuntadaInstrucao,
  textoTermoJuntadaProva,
  textoTermoJuntadaDefesa,
  textoTermoInformacaoSemDefesa,
  textoDespachoEncerramentoInstrucao,
  PAS_PECA_TITULOS,
  PAS_FASE_LABEL,
  PAS_FASE_COR,
} from "@/lib/pas-textos-padrao"
import { cn, normalizeId } from "@/lib/utils"

/** Sobe o anexo externo escolhido na revisão (ver PasPecaReviewDialog),
 * quando houver — usado por todas as peças pra destravar uma etapa que não
 * foi feita pelo sistema (documento já pronto, escaneado). */
async function uploadAnexoExterno(pasId: string, file?: File): Promise<string | undefined> {
  if (!file) return undefined;
  return uploadArquivoPas(pasId, file);
}

async function uploadArquivoPas(pasId: string, file: File): Promise<string> {
  try {
    if (!storage) throw new Error('Storage indisponível.');
    const path = `pas/${pasId}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return await getDownloadURL(ref);
  } catch (e) {
    // Sem Storage configurado, guarda o arquivo direto no documento (mesmo
    // fallback já usado nas fotos de roteiro).
    return blobToDataUrl(file);
  }
}

export default function PasDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { processos, loading: loadingPas, atualizarPas, excluirPas } = usePas();
  const { pecas, loading: loadingPecas, adicionarPeca, adicionarPecas } = usePasPecas(id);
  const { saveInspecao, deleteInspecao } = useInspecoes();
  const { updateIntimacaoMeta } = useIntimacoes();
  const { config } = useAppConfig({ municipioIdOverride: profile?.municipioId });

  const pas = useMemo(() => processos.find(p => p.id === id), [processos, id]);
  const isGestor = profile?.role === 'admin' || profile?.role === 'root';
  const isAutuante = pas?.autuanteUid === profile?.uid;

  const [isSalvandoRelatorio, setIsSalvandoRelatorio] = useState(false);
  const [isDefesaDialogOpen, setIsDefesaDialogOpen] = useState(false);
  const [isRegistrandoDefesa, setIsRegistrandoDefesa] = useState(false);

  const [fatos, setFatos] = useState("");
  const [antecedentes, setAntecedentes] = useState("");
  const provasInputRef = useRef<HTMLInputElement>(null);
  const [provasSelecionadas, setProvasSelecionadas] = useState<File[]>([]);

  const defesaArquivoRef = useRef<HTMLInputElement>(null);
  const [defesaArquivo, setDefesaArquivo] = useState<File | null>(null);
  const [defesaData, setDefesaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [defesaProtocolo, setDefesaProtocolo] = useState("");

  // Toda peça passa por aqui antes de ser gravada — revisão do texto +
  // assinatura obrigatória (ver PasPecaReviewDialog).
  const [revisao, setRevisao] = useState<PasPecaRevisao | null>(null);

  // config.municipioNome vem "MUNICÍPIO" por padrão quando o gestor nunca
  // preencheu esse campo à parte (comum quando ele já customizou o timbre
  // inteiro via "Identidade Municipal" > cabeçalho rico) — pra não imprimir
  // esse texto genérico no "local" do fechamento do documento, prioriza o
  // nome oficial do próprio município (a partir do id salvo no perfil, que
  // esse sim é sempre confiável) antes de cair no campo de config.
  const nomeMunicipioExibicao = useMemo(() => {
    const porId = (municipiosPR as string[]).find(m => normalizeId(m) === normalizeId(profile?.municipioId || ''));
    if (porId) return porId;
    if (config.municipioNome && config.municipioNome !== 'MUNICÍPIO') return config.municipioNome;
    return 'Prudentópolis';
  }, [profile?.municipioId, config.municipioNome]);

  // PDF de cada peça — reaproveita o mesmo algoritmo de paginação do
  // relatório de roteiro (renderReportIntoPdf), só trocando o corpo/HTML.
  // O "papel" fica sempre montado, mas fora da tela (position:fixed,
  // left:-99999px) — precisa estar de verdade no DOM (não display:none) pra
  // offsetWidth/offsetHeight terem valor real na hora de gerar o PDF.
  const [pecaParaBaixar, setPecaParaBaixar] = useState<PasPeca | null>(null);
  const [isBaixandoPdf, setIsBaixandoPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pecaParaBaixar || !pas) return;
    let stagingEl: HTMLDivElement | null = null;
    (async () => {
      // Um frame de espera garante que o React já pintou o conteúdo da peça
      // no printRef antes de medir/capturar — sem isso, a primeira geração
      // depois de trocar de peça podia capturar o HTML anterior.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const { jsPDF } = await import("jspdf");
        stagingEl = document.createElement('div');
        stagingEl.style.position = 'fixed';
        stagingEl.style.left = '-99999px';
        stagingEl.style.top = '0';
        document.body.appendChild(stagingEl);
        const pdf = new jsPDF('p', 'mm', 'a4');
        if (!printRef.current) throw new Error('Modelo de impressão não encontrado.');
        await renderReportIntoPdf(pdf, printRef.current, stagingEl);
        const nomeArquivo = `${pecaParaBaixar.titulo} - PAS ${pas.numeroProcesso}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
        pdf.save(nomeArquivo);
      } catch (e) {
        console.error('Erro ao gerar PDF da peça do PAS:', e);
        toast({ variant: "destructive", title: "Erro ao gerar o PDF" });
      } finally {
        if (stagingEl) document.body.removeChild(stagingEl);
        setIsBaixandoPdf(false);
        setPecaParaBaixar(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pecaParaBaixar]);

  const handleBaixarPeca = (peca: PasPeca) => {
    setIsBaixandoPdf(true);
    setPecaParaBaixar(peca);
  };

  const [isEncaminharOpen, setIsEncaminharOpen] = useState(false);

  const [isEditarNumeroOpen, setIsEditarNumeroOpen] = useState(false);
  const [novoNumero, setNovoNumero] = useState("");
  const [isSalvandoNumero, setIsSalvandoNumero] = useState(false);

  const handleSalvarNumero = async () => {
    if (!pas || !novoNumero.trim()) return;
    setIsSalvandoNumero(true);
    try {
      await atualizarPas(pas.id, { numeroProcesso: novoNumero.trim() });
      setIsEditarNumeroOpen(false);
      toast({ title: "Número do processo atualizado" });
    } catch (e) {
      console.error('Erro ao editar o número do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setIsSalvandoNumero(false);
    }
  };

  // Documento complementar — qualquer arquivo que não se encaixe nas peças
  // fixas (ex.: um laudo, um ofício recebido, uma foto adicional) entra nos
  // autos como Termo de Juntada avulso, disponível a qualquer momento da
  // instrução, sem depender de nenhuma etapa anterior.
  const [isDocComplementarOpen, setIsDocComplementarOpen] = useState(false);
  const [docComplementarDescricao, setDocComplementarDescricao] = useState("");
  const docComplementarArquivoRef = useRef<HTMLInputElement>(null);
  const [docComplementarArquivo, setDocComplementarArquivo] = useState<File | null>(null);
  const [isSalvandoDocComplementar, setIsSalvandoDocComplementar] = useState(false);

  const handleSalvarDocComplementar = async () => {
    if (!pas || !docComplementarDescricao.trim() || !docComplementarArquivo) {
      toast({ variant: "destructive", title: "Descreva o documento e anexe o arquivo" });
      return;
    }
    setIsSalvandoDocComplementar(true);
    try {
      const url = await uploadArquivoPas(pas.id, docComplementarArquivo);
      await adicionarPeca({
        tipo: 'termo_juntada',
        titulo: `${PAS_PECA_TITULOS.termo_juntada} — Documento Complementar`,
        conteudoHtml: `Junto ao presente processo o documento complementar a seguir descrito: <strong>${docComplementarDescricao.trim()}</strong>.`,
        anexoUrl: url,
        assinadoForaDoSistema: true,
      });
      await limparEncaminhamento();
      setIsDocComplementarOpen(false);
      setDocComplementarDescricao("");
      setDocComplementarArquivo(null);
      toast({ title: "Documento complementar adicionado" });
    } catch (e) {
      console.error('Erro ao adicionar documento complementar ao PAS:', e);
      toast({ variant: "destructive", title: "Erro ao adicionar o documento" });
    } finally {
      setIsSalvandoDocComplementar(false);
    }
  };

  const [isExcluindoPas, setIsExcluindoPas] = useState(false);

  const handleExcluirPas = async () => {
    if (!pas) return;
    setIsExcluindoPas(true);
    try {
      await cancelarLembretePrazo(deleteInspecao, pas.agendaLembreteId);
      await cancelarLembretePrazo(deleteInspecao, pas.encaminhamentoLembreteId);
      await excluirPas(pas.id);
      // Libera o Auto de Infração pra abrir um PAS novo de novo.
      await updateIntimacaoMeta(pas.autoInfracaoId, { pasId: null });
      toast({ title: "Processo excluído" });
      router.push('/pas');
    } catch (e) {
      console.error('Erro ao excluir o PAS:', e);
      toast({ variant: "destructive", title: "Erro ao excluir" });
      setIsExcluindoPas(false);
    }
  };

  const handleEscolherEncaminhamento = async (colega: { uid: string; displayName: string }) => {
    if (!pas || !profile?.municipioId) return;
    try {
      // Notificação quase imediata — reaproveita o mesmo lembrete de prazo,
      // só que sem antecedência nenhuma (a "data" do aviso é agora mesmo),
      // pra a pessoa receber o aviso pela Agenda/push já existentes, sem
      // precisar de nenhum código novo de notificação.
      const lembreteId = await criarLembretePrazo(saveInspecao, {
        titulo: `PAS encaminhado pra você — ${pas.estabelecimento.fantasia} (nº ${pas.numeroProcesso})`,
        prazoISO: new Date().toISOString(),
        diasAntecedencia: 0,
        fiscalId: colega.uid,
        fiscalNome: colega.displayName,
        municipioId: profile.municipioId,
      });
      await atualizarPas(pas.id, { responsavelAtualUid: colega.uid, responsavelAtualNome: colega.displayName, encaminhamentoLembreteId: lembreteId });
      toast({ title: `Encaminhado para ${colega.displayName}` });
    } catch (e) {
      console.error('Erro ao encaminhar o PAS:', e);
      toast({ variant: "destructive", title: "Erro ao encaminhar" });
    }
  };

  // Sempre que alguém efetivamente age (uma peça nova entra nos autos), o
  // encaminhamento pendente se resolve sozinho — sem isso, o aviso "com
  // fulano" continuaria aparecendo mesmo depois de resolvido.
  const limparEncaminhamento = async () => {
    if (!pas?.responsavelAtualUid) return;
    await atualizarPas(pas.id, { responsavelAtualUid: null, responsavelAtualNome: null });
    await cancelarLembretePrazo(deleteInspecao, pas.encaminhamentoLembreteId);
  };

  if (loadingPas || loadingPecas) {
    return <div className="min-h-screen bg-[#F5F2EA] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#A39D8C]" /></div>;
  }
  if (!pas) {
    return (
      <div className="min-h-screen bg-[#F5F2EA]">
        <DocfacilTopbar title="PAS" backHref="/pas" />
        <p className="text-center text-sm text-[#6B6659] py-20">Processo não encontrado.</p>
      </div>
    );
  }

  const temDespachoInstrucao = pecas.some(p => p.tipo === 'despacho_instrucao');
  const temRelatorioInstrucao = pecas.some(p => p.tipo === 'relatorio_instrucao');
  const temDefesaOuInformacao = !!pas.defesa || pecas.some(p => p.tipo === 'termo_informacao');
  const deadline = pas.prazoDefesaData ? calculateDeadline({ status: 'finalizado', dataIntimacao: pas.dataCienciaAI, prazoDias: 15 }) : null;
  const prazoVencido = deadline ? deadline.remaining < 0 : false;
  // Não existe um cadastro de "coordenador(a)" no sistema — o modelo de
  // referência sempre endereça os despachos/termos a uma pessoa específica,
  // então usamos dinamicamente quem já emitiu o despacho de instrução deste
  // processo (a autoridade que já está de fato acompanhando o caso). Antes
  // disso existir, os textos caem num endereçamento genérico ao cargo.
  const gestorResponsavel = pecas.find(p => p.tipo === 'despacho_instrucao');
  const destinatarioGestor = gestorResponsavel ? { nome: gestorResponsavel.criadoPorNome, cargo: 'Coordenação da Vigilância Sanitária Municipal' } : undefined;

  const handleIniciarInstrucao = () => {
    setRevisao({
      titulo: PAS_PECA_TITULOS.despacho_inicial,
      conteudoInicial: textoDespachoInicial({ numeroAI: pas.numeroProcesso, estabelecimento: pas.estabelecimento.fantasia, destinatario: destinatarioGestor }),
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'despacho_inicial', titulo: PAS_PECA_TITULOS.despacho_inicial, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl });
          await atualizarPas(pas.id, { fase: 'instrucao' });
          toast({ title: "Instrução iniciada" });
          await limparEncaminhamento();
          setRevisao(null);
        } catch (e) {
          console.error('Erro ao iniciar a instrução do PAS:', e);
          toast({ variant: "destructive", title: "Erro ao iniciar a instrução" });
        }
      },
    });
  };

  const handleEmitirDespachoInstrucao = () => {
    if (!profile?.municipioId) return;
    const prazoData = addBusinessDays(new Date(pas.dataCienciaAI), 15);
    const prazoFormatada = format(prazoData, "dd/MM/yyyy");
    setRevisao({
      titulo: PAS_PECA_TITULOS.despacho_instrucao,
      conteudoInicial: textoDespachoInstrucao({ numeroAI: pas.numeroProcesso, prazoDefesaData: prazoFormatada }),
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'despacho_instrucao', titulo: PAS_PECA_TITULOS.despacho_instrucao, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl });
          const lembreteId = await criarLembretePrazo(saveInspecao, {
            titulo: `Prazo de defesa (PAS) vence em breve — ${pas.estabelecimento.fantasia}`,
            prazoISO: prazoData.toISOString(),
            fiscalId: pas.autuanteUid,
            fiscalNome: pas.autuanteNome,
            municipioId: profile.municipioId!,
          });
          await atualizarPas(pas.id, { prazoDefesaData: prazoData.toISOString(), agendaLembreteId: lembreteId });
          toast({ title: "Despacho de instrução emitido" });
          await limparEncaminhamento();
          setRevisao(null);
        } catch (e) {
          console.error('Erro ao emitir o despacho de instrução do PAS:', e);
          toast({ variant: "destructive", title: "Erro ao emitir o despacho" });
        }
      },
    });
  };

  const handleSalvarRelatorio = async () => {
    if (!fatos.trim()) {
      toast({ variant: "destructive", title: "Descreva os fatos antes de salvar" });
      return;
    }
    setIsSalvandoRelatorio(true);
    try {
      // Cada prova anexada gera seu próprio Termo de Juntada, sempre ANTES do
      // Relatório na lista de peças — só esses aqui não passam por
      // revisão/assinatura individual (são recibos de anexação, não peças de
      // conteúdo); o Relatório em si (que é o texto de verdade) ainda passa
      // pela revisão antes de ser gravado, junto com essas juntadas no mesmo
      // lote (adicionarPecas numera tudo sequencialmente, sem risco de
      // corrida entre chamadas).
      const itensProva: { tipo: 'termo_juntada'; titulo: string; conteudoHtml: string; anexoUrl: string }[] = [];
      for (const file of provasSelecionadas) {
        const url = await uploadArquivoPas(pas.id, file);
        itensProva.push({ tipo: 'termo_juntada' as const, titulo: PAS_PECA_TITULOS.termo_juntada, conteudoHtml: textoTermoJuntadaProva(file.name), anexoUrl: url });
      }
      const relatorioHtml = [
        `<p><strong>1. DOS FATOS</strong></p><p>${fatos.replace(/\n/g, '<br>')}</p>`,
        antecedentes.trim() ? `<p><strong>2. DOS ANTECEDENTES</strong></p><p>${antecedentes.replace(/\n/g, '<br>')}</p>` : '',
      ].filter(Boolean).join('');

      setRevisao({
        titulo: PAS_PECA_TITULOS.relatorio_instrucao,
        conteudoInicial: relatorioHtml,
        onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile }) => {
          try {
            const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
            await adicionarPecas([
              ...itensProva,
              // Regra de ouro do manual: o relatório precisa do próprio Termo
              // de Juntada imediatamente antes dele, mesmo sem prova anexada
              // em arquivo (Título III, Cap.2, item 2.4, Figura 14) — sem
              // isso, ele entrava nos autos desacompanhado sempre que nenhum
              // arquivo era anexado.
              { tipo: 'termo_juntada', titulo: PAS_PECA_TITULOS.termo_juntada, conteudoHtml: textoTermoJuntadaInstrucao({ destinatario: destinatarioGestor }) },
              { tipo: 'relatorio_instrucao', titulo: PAS_PECA_TITULOS.relatorio_instrucao, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl },
            ]);
            setFatos(""); setAntecedentes(""); setProvasSelecionadas([]);
            toast({ title: "Relatório técnico registrado" });
            await limparEncaminhamento();
            setRevisao(null);
          } catch (e) {
            console.error('Erro ao salvar o relatório técnico do PAS:', e);
            toast({ variant: "destructive", title: "Erro ao salvar o relatório" });
          }
        },
      });
    } catch (e) {
      console.error('Erro ao preparar as provas do relatório técnico do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao anexar as provas" });
    } finally {
      setIsSalvandoRelatorio(false);
    }
  };

  const handleRegistrarDefesa = async () => {
    if (!defesaArquivo) {
      toast({ variant: "destructive", title: "Anexe o arquivo da defesa" });
      return;
    }
    setIsRegistrandoDefesa(true);
    try {
      const url = await uploadArquivoPas(pas.id, defesaArquivo);
      // Meio-dia local (não meia-noite UTC) — "2026-09-06" interpretado como
      // UTC vira 05/09 à noite no horário do Brasil, o que podia classificar
      // errado uma defesa recebida bem na borda do prazo.
      const recebidaEm = new Date(`${defesaData}T12:00:00`);
      const tempestividade = pas.prazoDefesaData && recebidaEm.getTime() <= new Date(pas.prazoDefesaData).getTime() ? 'tempestiva' as const : 'intempestiva' as const;
      const dataFormatada = format(recebidaEm, "dd/MM/yyyy");
      setIsDefesaDialogOpen(false);
      setDefesaArquivo(null);
      setDefesaProtocolo("");
      setRevisao({
        titulo: `${PAS_PECA_TITULOS.termo_juntada} — Defesa Administrativa`,
        conteudoInicial: textoTermoJuntadaDefesa({ tempestividade, dataRecebimento: dataFormatada, numeroProtocolo: defesaProtocolo.trim() || undefined, destinatario: destinatarioGestor }),
        onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile }) => {
          try {
            // O anexo principal aqui já é a própria defesa (url, escolhida
            // antes de abrir esta revisão) — um "anexo externo" adicional só
            // reforça que o Termo em si foi tratado fora do sistema, sem
            // substituir o documento da defesa.
            await adicionarPeca({
              tipo: 'termo_juntada',
              titulo: `${PAS_PECA_TITULOS.termo_juntada} — Defesa Administrativa`,
              conteudoHtml: conteudoFinal,
              anexoUrl: url,
              assinaturaUrl,
              assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile,
            });
            await atualizarPas(pas.id, { defesa: { recebidaEm: recebidaEm.toISOString(), tempestividade, anexoUrl: url } });
            await cancelarLembretePrazo(deleteInspecao, pas.agendaLembreteId);
            toast({ title: `Defesa registrada (${tempestividade})` });
            await limparEncaminhamento();
            setRevisao(null);
          } catch (e) {
            console.error('Erro ao registrar a defesa no PAS:', e);
            toast({ variant: "destructive", title: "Erro ao registrar a defesa" });
          }
        },
      });
    } catch (e) {
      console.error('Erro ao enviar o arquivo da defesa do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao anexar a defesa" });
    } finally {
      setIsRegistrandoDefesa(false);
    }
  };

  const handleGerarTermoInformacao = () => {
    const prazoFormatada = pas.prazoDefesaData ? format(new Date(pas.prazoDefesaData), "dd/MM/yyyy") : '';
    setRevisao({
      titulo: PAS_PECA_TITULOS.termo_informacao,
      conteudoInicial: textoTermoInformacaoSemDefesa({ numeroAI: pas.numeroProcesso, prazoDefesaData: prazoFormatada }),
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'termo_informacao', titulo: PAS_PECA_TITULOS.termo_informacao, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl });
          await cancelarLembretePrazo(deleteInspecao, pas.agendaLembreteId);
          toast({ title: "Termo de Informação gerado" });
          await limparEncaminhamento();
          setRevisao(null);
        } catch (e) {
          console.error('Erro ao gerar o Termo de Informação do PAS:', e);
          toast({ variant: "destructive", title: "Erro ao gerar o termo" });
        }
      },
    });
  };

  const handleEncaminharJulgamento = () => {
    setRevisao({
      titulo: PAS_PECA_TITULOS.despacho_encerramento_instrucao,
      conteudoInicial: textoDespachoEncerramentoInstrucao({ destinatario: destinatarioGestor }),
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'despacho_encerramento_instrucao', titulo: PAS_PECA_TITULOS.despacho_encerramento_instrucao, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl });
          await atualizarPas(pas.id, { fase: 'aguardando_julgamento' });
          toast({ title: "Encaminhado para julgamento" });
          await limparEncaminhamento();
          setRevisao(null);
        } catch (e) {
          console.error('Erro ao encaminhar o PAS para julgamento:', e);
          toast({ variant: "destructive", title: "Erro ao encaminhar" });
        }
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        title={`PAS — AI nº ${pas.numeroProcesso}`}
        subtitle={pas.estabelecimento.fantasia}
        backHref="/pas"
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setNovoNumero(pas.numeroProcesso); setIsEditarNumeroOpen(true); }}
              title="Editar número do processo"
              className="h-8 w-8 rounded-md flex items-center justify-center text-[#6B6659] hover:text-[#0E4A44] hover:bg-[#E4EEEC] transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {(isGestor || isAutuante) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    title="Excluir processo"
                    className="h-8 w-8 rounded-md flex items-center justify-center text-[#A39D8C] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[2rem]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-black uppercase tracking-tighter text-xl italic">Excluir este PAS?</AlertDialogTitle>
                    <AlertDialogDescription>Isso apaga o processo e todas as suas peças permanentemente (não é uma lixeira). O Auto de Infração volta a ficar disponível pra abrir um PAS novo.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExcluirPas} disabled={isExcluindoPas} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700">
                      {isExcluindoPas ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <div className="max-w-3xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className={cn("text-xs font-medium h-6 px-2.5 border-none", PAS_FASE_COR[pas.fase])}>{PAS_FASE_LABEL[pas.fase]}</Badge>
          {pas.responsavelAtualNome && (
            <Badge variant="outline" className="text-xs font-medium h-6 px-2.5 border-none bg-violet-50 text-violet-700">
              Encaminhado para {pas.responsavelAtualNome}
            </Badge>
          )}
          {deadline && pas.fase === 'instrucao' && !temDefesaOuInformacao && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded",
              deadline.status === 'vencido' ? "bg-rose-50 text-rose-700" : deadline.status === 'alerta' ? "bg-amber-50 text-amber-700" : "bg-[#E4EEEC] text-[#0E4A44]"
            )}>
              <Timer className="h-3.5 w-3.5" />
              {deadline.remaining < 0 ? `Prazo de defesa vencido há ${Math.abs(deadline.remaining)} dias` : `Prazo de defesa: ${deadline.remaining} dias`}
            </div>
          )}
        </div>

        {/* Linha do tempo das peças */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C] px-1">Autos do processo</h2>
          {pecas.length === 0 ? (
            <p className="text-sm text-[#A39D8C] px-1">Nenhuma peça ainda.</p>
          ) : (
            <div className="rounded-lg border border-[#E4DFD1] bg-white divide-y divide-[#F1EEE4]">
              {pecas.map((peca) => (
                <details key={peca.id} className="group">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                    <span className="h-6 w-6 rounded-full bg-[#F5F2EA] text-[#6B6659] text-[11px] font-black flex items-center justify-center shrink-0">{peca.numero}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#262420] truncate">{peca.titulo}</p>
                      <p className="text-[11px] text-[#A39D8C]">{peca.criadoPorNome} — {format(new Date(peca.criadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBaixarPeca(peca); }}
                      disabled={isBaixandoPdf}
                      title="Baixar PDF desta peça"
                      className="h-7 w-7 rounded-md flex items-center justify-center text-[#6B6659] hover:text-[#0E4A44] hover:bg-[#E4EEEC] transition-colors shrink-0 disabled:opacity-50"
                    >
                      {isBaixandoPdf && pecaParaBaixar?.id === peca.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    </button>
                    <ChevronDown className="h-4 w-4 text-[#C4BEAC] shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 space-y-2">
                    <div className="text-sm text-[#3F3B33] leading-relaxed pl-9" dangerouslySetInnerHTML={{ __html: peca.conteudoHtml }} />
                    {peca.anexoUrl && (
                      <a href={peca.anexoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 pl-9 text-xs font-medium text-[#0E4A44] hover:underline">
                        <Download className="h-3.5 w-3.5" /> Baixar anexo
                      </a>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        {/* Ações da fase atual */}
        <div className="rounded-lg border border-[#E4DFD1] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Próxima ação</h2>
            {isGestor && pas.fase !== 'aguardando_julgamento' && (
              <button
                type="button"
                onClick={() => setIsEncaminharOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors"
              >
                <Send className="h-3.5 w-3.5" /> Encaminhar
              </button>
            )}
          </div>

          {pas.fase === 'instauracao' && (
            isAutuante ? (
              <div className="flex items-center gap-2">
                <Button onClick={handleIniciarInstrucao} className="bg-[#0E4A44] hover:bg-[#0B3A35]">
                  <FileStack className="h-4 w-4 mr-2" /> Iniciar Instrução
                </Button>
              </div>
            ) : (
              <p className="text-sm text-[#A39D8C]">Aguardando o fiscal autuante iniciar a instrução.</p>
            )
          )}

          {/* Trilha completa da Instrução — sempre visível, mesmo pra quem só
              consegue AGIR em parte dela. Só as ações exclusivas do gestor
              ficam de fato bloqueadas (o próprio manual exige essa separação
              de papéis); todo o resto (relatório, provas, defesa) o fiscal
              pode ir adiantando na hora que quiser, sem depender de ordem. */}
          {pas.fase === 'instrucao' && (
            <div className="space-y-5">
              <div className={cn("flex items-start gap-3 pb-4", !temRelatorioInstrucao && "border-b border-[#F1EEE4]")}>
                <span className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black mt-0.5", temDespachoInstrucao ? "bg-[#E3F1EA] text-[#1F7A5C]" : "bg-[#F5F2EA] text-[#A39D8C]")}>
                  {temDespachoInstrucao ? <CheckCircle2 className="h-3.5 w-3.5" /> : "1"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#262420]">Despacho de Instrução</p>
                    <span className="text-[10px] uppercase font-bold text-[#9C7A3C]">Exclusivo do gestor</span>
                  </div>
                  {!temDespachoInstrucao && (
                    isGestor ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Button onClick={handleEmitirDespachoInstrucao} className="bg-[#0E4A44] hover:bg-[#0B3A35]">
                          <FileStack className="h-4 w-4 mr-2" /> Emitir Despacho de Instrução
                        </Button>
                        <PasDica chave="despachoInstrucao" />
                      </div>
                    ) : (
                      <p className="text-xs text-[#A39D8C] mt-1">Aguardando o gestor emitir o despacho de instrução.</p>
                    )
                  )}
                </div>
              </div>

              <div className={cn("flex items-start gap-3 pb-4", (!temDefesaOuInformacao) && "border-b border-[#F1EEE4]")}>
                <span className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black mt-0.5", temRelatorioInstrucao ? "bg-[#E3F1EA] text-[#1F7A5C]" : "bg-[#F5F2EA] text-[#A39D8C]")}>
                  {temRelatorioInstrucao ? <CheckCircle2 className="h-3.5 w-3.5" /> : "2"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#262420]">Relatório Técnico de Instrução</p>
                    <PasDica chave="relatorioInstrucao" />
                  </div>
                  {!temRelatorioInstrucao && (
                    <div className="space-y-3 mt-2">
                      <p className="text-xs text-[#A39D8C]">Pode preencher a qualquer momento — não precisa esperar o despacho de instrução.</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-[#6B6659]">Dos Fatos</Label>
                        <Textarea value={fatos} onChange={(e) => setFatos(e.target.value)} rows={5} placeholder="Contexto da inspeção, o que foi constatado, e por que isso configura risco sanitário..." className="rounded-md border-[#E4DFD1] resize-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-[#6B6659]">Antecedentes (opcional)</Label>
                        <Textarea value={antecedentes} onChange={(e) => setAntecedentes(e.target.value)} rows={3} className="rounded-md border-[#E4DFD1] resize-none" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-[#6B6659]">Provas anexadas</Label>
                          <PasDica chave="provas" />
                        </div>
                        <input ref={provasInputRef} type="file" multiple className="hidden" onChange={(e) => setProvasSelecionadas(prev => [...prev, ...Array.from(e.target.files || [])])} />
                        <div className="flex flex-wrap gap-1.5">
                          {provasSelecionadas.map((f, i) => (
                            <span key={i} className="flex items-center gap-1 bg-[#F5F2EA] rounded px-2 py-1 text-xs text-[#6B6659]">
                              {f.name}
                              <button type="button" onClick={() => setProvasSelecionadas(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3 text-[#A39D8C] hover:text-rose-500" /></button>
                            </span>
                          ))}
                          <Button type="button" variant="outline" size="sm" onClick={() => provasInputRef.current?.click()} className="h-7 rounded-md text-[11px] gap-1"><Paperclip className="h-3 w-3" /> Anexar arquivo</Button>
                        </div>
                      </div>
                      <Button onClick={handleSalvarRelatorio} disabled={isSalvandoRelatorio} className="bg-[#0E4A44] hover:bg-[#0B3A35]">
                        {isSalvandoRelatorio ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Salvar Relatório
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 pb-4 border-b border-[#F1EEE4]">
                <span className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black mt-0.5", temDefesaOuInformacao ? "bg-[#E3F1EA] text-[#1F7A5C]" : "bg-[#F5F2EA] text-[#A39D8C]")}>
                  {temDefesaOuInformacao ? <CheckCircle2 className="h-3.5 w-3.5" /> : "3"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#262420]">Defesa do Autuado</p>
                    <PasDica chave="defesa" />
                  </div>
                  {!temDefesaOuInformacao && (
                    !pas.prazoDefesaData ? (
                      <p className="text-xs text-[#A39D8C] mt-1">Só dá pra registrar depois do despacho de instrução (é ele que define o prazo).</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Button onClick={() => setIsDefesaDialogOpen(true)} variant="outline" className="rounded-md gap-1.5"><Paperclip className="h-4 w-4" /> Registrar defesa recebida</Button>
                        {prazoVencido && (
                          <Button onClick={handleGerarTermoInformacao} variant="outline" className="rounded-md gap-1.5 text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100">
                            <AlertTriangle className="h-4 w-4" /> Gerar Termo de Informação (sem defesa)
                          </Button>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black mt-0.5 bg-[#F5F2EA] text-[#A39D8C]">4</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#262420]">Encerramento da Instrução</p>
                    <PasDica chave="encerramentoInstrucao" />
                  </div>
                  {temRelatorioInstrucao && temDefesaOuInformacao ? (
                    <Button onClick={handleEncaminharJulgamento} className="mt-2 bg-[#0E4A44] hover:bg-[#0B3A35]">
                      <Send className="h-4 w-4 mr-2" /> Encaminhar para Julgamento
                    </Button>
                  ) : (
                    <p className="text-xs text-[#A39D8C] mt-1">Falta concluir o relatório técnico e a defesa (ou o termo de informação) acima.</p>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-[#F1EEE4]">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsDocComplementarOpen(true)} className="h-8 rounded-md text-xs gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" /> Adicionar documento complementar
                </Button>
              </div>
            </div>
          )}

          {pas.fase === 'aguardando_julgamento' && (
            <div className="flex items-center gap-2 text-sm text-[#6B6659]">
              <CheckCircle2 className="h-4 w-4 text-[#1F7A5C]" /> Instrução concluída — aguardando julgamento. Essa fase ainda não tem tela própria neste sistema.
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDefesaDialogOpen} onOpenChange={setIsDefesaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Registrar defesa recebida</DialogTitle>
            <DialogDescription>Anexe o documento e informe a data em que a defesa foi recebida/protocolada — o sistema classifica sozinho tempestiva ou intempestiva.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">Data de recebimento</Label>
              <Input type="date" value={defesaData} onChange={(e) => setDefesaData(e.target.value)} className="h-10 rounded-md border-[#E4DFD1]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">Nº de protocolo (opcional)</Label>
              <Input value={defesaProtocolo} onChange={(e) => setDefesaProtocolo(e.target.value)} placeholder="Ex.: 123/2026" className="h-10 rounded-md border-[#E4DFD1]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">Arquivo da defesa</Label>
              <input ref={defesaArquivoRef} type="file" className="hidden" onChange={(e) => setDefesaArquivo(e.target.files?.[0] || null)} />
              <Button type="button" variant="outline" onClick={() => defesaArquivoRef.current?.click()} className="w-full h-10 rounded-md justify-start gap-2 text-[#6B6659]">
                <Paperclip className="h-4 w-4" /> {defesaArquivo ? defesaArquivo.name : "Escolher arquivo"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDefesaDialogOpen(false)} className="rounded-md">Cancelar</Button>
            <Button onClick={handleRegistrarDefesa} disabled={isRegistrandoDefesa} className="rounded-md bg-[#0E4A44] hover:bg-[#0B3A35]">
              {isRegistrandoDefesa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PasPecaReviewDialog
        revisao={revisao}
        onFechar={() => setRevisao(null)}
        numeroProcesso={pas.numeroProcesso}
        autuado={pas.estabelecimento.fantasia}
        cnpj={pas.estabelecimento.cnpj}
        nomeMunicipioExibicao={nomeMunicipioExibicao}
        nomeAssinante={profile?.displayName || 'Fiscal'}
        logoUrl={config.logoUrl}
        headerRichText={config.headerRichText}
        municipioNome={config.municipioNome}
        secretaria={config.secretaria}
        departamento={config.departamento}
      />

      <PasEncaminharDialog
        open={isEncaminharOpen}
        onOpenChange={setIsEncaminharOpen}
        onEscolher={handleEscolherEncaminhamento}
      />

      <Dialog open={isEditarNumeroOpen} onOpenChange={setIsEditarNumeroOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Editar número do processo</DialogTitle>
            <DialogDescription>Não muda o número do Auto de Infração original — só a referência deste PAS.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs font-semibold uppercase text-[#6B6659]">Número</Label>
            <Input value={novoNumero} onChange={(e) => setNovoNumero(e.target.value)} className="h-10 rounded-md border-[#E4DFD1] mt-1.5" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditarNumeroOpen(false)} className="rounded-md">Cancelar</Button>
            <Button onClick={handleSalvarNumero} disabled={isSalvandoNumero || !novoNumero.trim()} className="rounded-md bg-[#0E4A44] hover:bg-[#0B3A35]">
              {isSalvandoNumero ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDocComplementarOpen} onOpenChange={setIsDocComplementarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Adicionar documento complementar</DialogTitle>
            <DialogDescription>Pra qualquer papel que não se encaixa nas peças padrão (laudo, ofício recebido, foto extra) — entra nos autos como um Termo de Juntada avulso.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">O que é este documento?</Label>
              <Textarea value={docComplementarDescricao} onChange={(e) => setDocComplementarDescricao(e.target.value)} rows={3} placeholder="Ex.: Laudo do IAP sobre a amostra de água coletada" className="rounded-md border-[#E4DFD1] resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">Arquivo</Label>
              <input ref={docComplementarArquivoRef} type="file" className="hidden" onChange={(e) => setDocComplementarArquivo(e.target.files?.[0] || null)} />
              <Button type="button" variant="outline" onClick={() => docComplementarArquivoRef.current?.click()} className="w-full h-10 rounded-md justify-start gap-2 text-[#6B6659]">
                <Paperclip className="h-4 w-4" /> {docComplementarArquivo ? docComplementarArquivo.name : "Escolher arquivo"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDocComplementarOpen(false)} className="rounded-md">Cancelar</Button>
            <Button onClick={handleSalvarDocComplementar} disabled={isSalvandoDocComplementar} className="rounded-md bg-[#0E4A44] hover:bg-[#0B3A35]">
              {isSalvandoDocComplementar ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modelo de impressão — sempre montado, fora da tela, reaproveitando o
          mesmo cabeçalho/rodapé institucional (Identidade Municipal) e o
          mesmo algoritmo de paginação do relatório de roteiro
          (renderReportIntoPdf). Só o conteúdo muda conforme `pecaParaBaixar`. */}
      <div style={{ position: 'fixed', left: -99999, top: 0 }} aria-hidden="true">
        <div ref={printRef} className="document-paper h-auto bg-white">
          <div data-pdf-header className="flex flex-row items-center justify-between gap-6 mb-1 pb-2 border-none">
            <div className="w-[140px] h-[100px] flex items-center justify-start overflow-hidden">
              {config.logoUrl ? (
                <img
                  src={config.logoUrl.startsWith('data:') ? config.logoUrl : `/api/proxy-image?url=${encodeURIComponent(config.logoUrl)}`}
                  className="max-w-full max-h-full object-contain block"
                  alt="Brasão"
                  crossOrigin={config.logoUrl.startsWith('data:') ? undefined : "anonymous"}
                />
              ) : (
                <Landmark className="w-2/3 h-2/3 text-zinc-300" strokeWidth={1} />
              )}
            </div>
            <div className="flex-1 text-center">
              {config.headerRichText ? (
                <div style={{ fontFamily: "'Times New Roman', Times, serif" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(config.headerRichText) }} />
              ) : (
                <>
                  <p className="text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "PRUDENTÓPOLIS"}</p>
                  <h2 className="text-[12pt] font-black uppercase leading-tight">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2>
                  <h3 className="text-[10pt] font-bold uppercase text-zinc-700">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3>
                </>
              )}
              <p className="text-[13pt] font-black uppercase text-center tracking-tighter mt-2 border-y border-zinc-200 py-1">Processo Administrativo Sanitário</p>
            </div>
          </div>

          {pecaParaBaixar && (
            <div data-pdf-block className="mb-4 text-[10pt]" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              <p><strong>Processo Administrativo Sanitário nº:</strong> {pas.numeroProcesso}</p>
              <p><strong>Autuado:</strong> {pas.estabelecimento.fantasia}</p>
              {pas.estabelecimento.cnpj && <p><strong>CNPJ:</strong> {pas.estabelecimento.cnpj}</p>}
            </div>
          )}

          {pecaParaBaixar && (
            <div data-pdf-block className="mb-6">
              <div className="sub-header-row text-center">{pecaParaBaixar.titulo.toUpperCase()}</div>
              <div
                className="p-4"
                style={{ fontSize: '10pt', lineHeight: 1.6, textAlign: 'justify', fontWeight: 500, color: '#18181b', fontFamily: "'Times New Roman', Times, serif" }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(pecaParaBaixar.conteudoHtml) }}
              />
            </div>
          )}

          {pecaParaBaixar && (
            <div data-pdf-block className="mt-16 text-center space-y-6" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              <p className="text-[10pt]">{nomeMunicipioExibicao.toUpperCase()}, {format(new Date(pecaParaBaixar.criadoEm), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.</p>
              {pecaParaBaixar.assinaturaUrl && (
                <img src={pecaParaBaixar.assinaturaUrl} alt="Assinatura" className="h-16 mx-auto object-contain" />
              )}
              <div className="pt-1 mx-auto w-full max-w-[280px] border-t border-black">
                <p className="font-bold uppercase text-[10pt] mt-1">{pecaParaBaixar.criadoPorNome}</p>
              </div>
            </div>
          )}

          <div
            data-pdf-footer
            className="pt-2 mt-4 border-t border-black/20 text-center text-[8pt] text-black"
            style={{ fontFamily: "'Times New Roman', Times, serif" }}
          >
            {config.footerRichText && <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(config.footerRichText) }} />}
            <p data-pdf-pagenum className="mt-1">Página 1 de 1</p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client"

import { use, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Loader2, Timer, FileStack, Send, Paperclip, CheckCircle2,
  AlertTriangle, ChevronDown, Download, X, FileDown, Landmark, Pencil, Trash2,
  Sparkles, MoreHorizontal, Eye, Undo2, Save,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
import { DocfacilEditor } from "@/components/docfacil-editor"
import { PasTimbreOficial } from "@/components/pas/pas-timbre-oficial"
import { PasPecaReviewDialog, type PasPecaRevisao } from "@/components/pas/pas-peca-review-dialog"
import { PasPecaVisualizarDialog } from "@/components/pas/pas-peca-visualizar-dialog"
import { PasEncaminharDialog } from "@/components/pas/pas-encaminhar-dialog"
import municipiosPR from "@/lib/municipios-pr.json"
import { usePas, usePasPecas } from "@/hooks/use-pas"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useAuth } from "@/hooks/use-auth"
import { useAppConfig } from "@/hooks/use-app-config"
import { useToast } from "@/hooks/use-toast"
import { addPrazo, calculateDeadline } from "@/lib/prazo"
import { baseLegalDoMunicipio } from "@/lib/base-legal-municipal"
import { criarLembretePrazo, cancelarLembretePrazo } from "@/lib/prazo-lembrete"
import { storage } from "@/lib/firebase"
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { blobToDataUrl } from "@/lib/compress-image"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { renderPasIntoPdf } from "@/lib/generate-pas-pdf"
import type { PasPeca, PasFase } from "@/lib/types"
import {
  textoDespachoInicial,
  textoDespachoInstrucao,
  textoTermoJuntadaInstrucao,
  textoTermoJuntadaProva,
  textoTermoJuntadaDefesa,
  textoTermoInformacaoSemDefesa,
  textoDespachoEncerramentoInstrucao,
  textoAdmissibilidadeJulgamento,
  textoDespachoEncaminhamentoTip,
  textoTermoImposicaoPenalidade,
  textoTermoRetificacao,
  PAS_PECA_TITULOS,
  PAS_FASE_LABEL,
  PAS_FASE_ORDEM,
  PAS_FASE_APOS_PECA,
} from "@/lib/pas-textos-padrao"
import { cn, normalizeId } from "@/lib/utils"

/** Sobe o anexo externo escolhido na revisão (ver PasPecaReviewDialog),
 * quando houver — usado por todas as peças pra destravar uma etapa que não
 * foi feita pelo sistema (documento já pronto, escaneado). */
/** Falha na geração do PDF costuma vir de biblioteca (html2canvas/pdf.js) com
 *  formato imprevisível — inclusive um `Event` cru, que vira "[object Event]"
 *  se for jogado direto na tela. Aqui sempre sai um texto legível. */
function descreverErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'type' in e) return `Falha ao carregar um recurso (${(e as Event).type}).`;
  return 'Tente novamente.';
}

async function uploadAnexoExterno(pasId: string, file?: File): Promise<string | undefined> {
  if (!file) return undefined;
  return uploadArquivoPas(pasId, file);
}

// Acima disso, cair pra base64 dentro do próprio documento do Firestore
// quase certamente estoura o limite de 1 MiB por documento — melhor
// falhar alto e claro do que gravar a peça pela metade. Foi exatamente
// essa combinação (arquivo grande em base64 dentro do campo) que já
// travou a fila de gravações da vistoria antes (ver comentário em
// saveInspecao, use-inspecoes.ts) — ali era foto; aqui é PDF de
// relatório, tipicamente maior ainda, e o efeito é o mesmo: a peça nunca
// termina de gravar, o processo não avança, e não fica claro por quê.
const TETO_BASE64_ANEXO_BYTES = 700 * 1024;

async function uploadArquivoPas(pasId: string, file: File): Promise<string> {
  try {
    if (!storage) throw new Error('Storage indisponível.');
    const path = `pas/${pasId}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return await getDownloadURL(ref);
  } catch (e) {
    if (file.size > TETO_BASE64_ANEXO_BYTES) {
      throw new Error(`Não foi possível enviar "${file.name}" (${Math.round(file.size / 1024)} KB) — sem conexão com o Storage neste momento, e o arquivo é grande demais para gravar direto no documento. Tente de novo.`);
    }
    // Arquivo pequeno (ex.: assinatura) e Storage indisponível — guarda
    // direto no documento (mesmo fallback já usado nas fotos de roteiro).
    return blobToDataUrl(file);
  }
}

export default function PasDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { processos, loading: loadingPas, atualizarPas, excluirPas } = usePas();
  const { pecas, loading: loadingPecas, adicionarPeca, adicionarPecas, excluirPeca } = usePasPecas(id);
  const { inspecoes, saveInspecao, deleteInspecao } = useInspecoes();
  const { intimacoes, updateIntimacaoMeta } = useIntimacoes();
  const { config } = useAppConfig({ municipioIdOverride: profile?.municipioId });

  const pas = useMemo(() => processos.find(p => p.id === id), [processos, id]);
  const isGestor = profile?.role === 'admin' || profile?.role === 'root';
  const isAutuante = pas?.autuanteUid === profile?.uid;

  // A TRILHA ATÉ A VISTORIA
  //
  // O PAS nasce do Auto de Infração; o Auto guarda o id da inspeção que o
  // originou (campo inspecaoId, herdado do Termo de Intimação gerado pelo
  // relatório). É por aqui que o processo alcança os itens não conformes
  // apurados em campo, em vez de depender do fiscal redigitá-los.
  const autoInfracao = useMemo(
    () => intimacoes.find(i => String(i.id) === String(pas?.autoInfracaoId)),
    [intimacoes, pas?.autoInfracaoId]
  );
  const termoVinculado = useMemo(() => {
    const idVinculado = autoInfracao?.documentoOrigemId || autoInfracao?.autoInfracaoVinculadaId;
    if (!idVinculado) return undefined;
    const t = intimacoes.find(i => String(i.id) === String(idVinculado));
    if (!t) return undefined;
    return {
      tipo: t.tipoTermo || 'Termo vinculado',
      numero: t.numeroProcesso,
      teor: (t.teor || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      itens: (t.itensApreendidos || [])
        .map((b: any) => [b.produto, b.marcaLote, b.quantidade && `${b.quantidade} ${b.unidade || ''}`.trim()].filter(Boolean).join(' — '))
        .filter(Boolean),
    };
  }, [intimacoes, autoInfracao?.documentoOrigemId, autoInfracao?.autoInfracaoVinculadaId]);

  const inspecaoOrigem = useMemo(() => {
    const idInspecao = autoInfracao?.inspecaoId;
    return idInspecao ? inspecoes.find(i => String(i.id) === String(idInspecao)) : undefined;
  }, [inspecoes, autoInfracao?.inspecaoId]);

  // Itens reprovados do roteiro, já no formato que o flow espera. O relatório
  // guarda as respostas em checklistData; "NAO" é a reprovação.
  const naoConformidades = useMemo(() => {
    const dados: any = inspecaoOrigem?.checklistData;
    if (!dados?.answers) return [] as { requisito: string; observacao?: string }[];
    return Object.entries(dados.answers as Record<string, any>)
      .filter(([, resposta]) => resposta === 'NAO')
      .map(([itemId]) => ({
        requisito: itemId,
        observacao: typeof dados.observations?.[itemId] === 'string' ? dados.observations[itemId] : undefined,
      }));
  }, [inspecaoOrigem]);

  const [isGerandoIa, setIsGerandoIa] = useState(false);
  // Lembra se o conteúdo atual do campo saiu da IA, para não realimentá-la
  // com a própria saída na tentativa seguinte.
  const geradoPelaIaRef = useRef(false);

  // Redação assistida. Compõe a partir do que o sistema já sabe — auto de
  // infração, itens não conformes da vistoria, peças dos autos, prazos — e
  // devolve rascunho: nada é gravado aqui, o texto cai nos campos da tela
  // para a autoridade ler, corrigir e só então emitir.
  const handleGerarComIa = async (etapa: 'instrucao' | 'julgamento') => {
    if (!pas || !profile) return;
    setIsGerandoIa(true);
    try {
      const { gerarInstrucaoPas } = await import('@/ai/flows/gerar-instrucao-pas');
      const dados: any = inspecaoOrigem?.checklistData;
      const r = await gerarInstrucaoPas({
        uid: profile.uid,
        etapa,
        numeroProcesso: pas.numeroProcesso,
        estabelecimento: pas.estabelecimento.fantasia,
        cnpj: pas.estabelecimento.cnpj,
        endereco: pas.estabelecimento.endereco,
        teorAutoInfracao: (autoInfracao?.teor || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
        legislacaoBase: autoInfracao?.legislacaoBase,
        dataCiencia: pas.dataCienciaAI ? format(new Date(pas.dataCienciaAI), "dd/MM/yyyy") : undefined,
        naoConformidades,
        conclusaoInspecao: (dados?.conclusaoHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || undefined,
        defesa: {
          apresentada: !!pas.defesa,
          tempestividade: pas.defesa?.tempestividade,
          recebidaEm: pas.defesa?.recebidaEm ? format(new Date(pas.defesa.recebidaEm), "dd/MM/yyyy") : undefined,
        },
        termoVinculado,
        quantidadeProvas: provasSelecionadas.length + provasRascunho.length,
        pecas: pecas.map(pc => pc.titulo),
        // Só entra como nota se o fiscal escreveu algo À MÃO. Depois de uma
        // geração, o campo guarda o próprio rascunho da IA — reenviá-lo faria
        // o modelo reescrever em cima do que ele mesmo produziu, acumulando
        // desvios a cada nova tentativa. fatos agora é HTML (documento
        // rico, com foto inserível) — despe a marcação antes de mandar pro
        // prompt, que é texto corrido, não HTML.
        notasDoFiscal: geradoPelaIaRef.current ? undefined : (fatos.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || undefined),
      });

      if (r.error) {
        toast({ variant: "destructive", title: "Não foi possível gerar", description: r.error });
        return;
      }

      // Julgamento continua em campo de texto simples — a conversão abaixo
      // preserva as quebras de parágrafo e descarta o resto da marcação.
      // O relatório NÃO passa mais por isso: agora é editado como
      // documento rico (DocfacilEditor, com foto inserível no meio do
      // texto), então o HTML da IA entra direto, preservando os títulos em
      // negrito de cada seção em vez de achatar tudo pra texto puro.
      const comoTexto = (html?: string) => (html || '')
        .replace(/<\/p>|<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (etapa === 'julgamento') {
        if (r.julgamentoFundamentacaoHtml) setJulgamentoFundamentacao(comoTexto(r.julgamentoFundamentacaoHtml));
        if (r.julgamentoDecisaoHtml) setJulgamentoDecisao(comoTexto(r.julgamentoDecisaoHtml));
        toast({ title: "Rascunho do julgamento gerado", description: "Revise cada afirmação antes de emitir — a decisão é ato seu, não da IA." });
      } else {
        setFatos(r.relatorioInstrucaoHtml || '');
        geradoPelaIaRef.current = true;
        toast({ title: "Rascunho do relatório gerado", description: "Confira os fatos e os artigos citados antes de registrar." });
      }
    } catch (e) {
      console.error('Erro na redação assistida do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao gerar o rascunho" });
    } finally {
      setIsGerandoIa(false);
    }
  };

  const [isSalvandoRelatorio, setIsSalvandoRelatorio] = useState(false);
  const [isDefesaDialogOpen, setIsDefesaDialogOpen] = useState(false);
  const [isRegistrandoDefesa, setIsRegistrandoDefesa] = useState(false);

  const [fatos, setFatos] = useState("");
  // Uma coisa exclui a outra: ou a autoridade redige (com ou sem ajuda da
  // IA) dentro do sistema, ou o relatório já foi feito fora e só entra
  // como anexo — não as duas ao mesmo tempo, e anexar não pode depender de
  // digitar algo primeiro (nem que seja um "segue em anexo" de fachada só
  // pra passar da validação de conteúdo).
  const [modoRelatorio, setModoRelatorio] = useState<'sistema' | 'anexo'>('sistema');
  const provasInputRef = useRef<HTMLInputElement>(null);
  const [provasSelecionadas, setProvasSelecionadas] = useState<File[]>([]);
  // RASCUNHO DO RELATÓRIO. Diferente dos despachos (só existem depois de
  // abrir a revisão — ver salvarRascunhoPeca mais abaixo), o relatório é
  // digitado num campo livre ANTES da revisão. "Edita no computador, assina
  // depois no tablet" perdia esse texto inteiro ao trocar de aparelho,
  // mesmo com o rascunho dos despachos já resolvido — fatos era só estado
  // local, sem sincronizar em lugar nenhum. fatos é o HTML de verdade
  // (o mesmo formato de conteudoHtml — o relatório é um documento rico,
  // com foto inserível no meio do texto, não texto puro), então o rascunho
  // entra direto, sem conversão. provasRascunho guarda os arquivos
  // ANEXADOS (não as fotos inseridas no corpo — essas já foram enviadas ao
  // Storage na hora da inserção, ver handleImagemRelatorio) já enviados ao
  // Storage neste rascunho — um `File` do navegador não sobrevive à troca
  // de aparelho, só a URL depois de já estar na nuvem.
  const [provasRascunho, setProvasRascunho] = useState<{ url: string; nome: string }[]>([]);
  const [isSalvandoRascunhoRelatorio, setIsSalvandoRascunhoRelatorio] = useState(false);
  const rascunhoRelatorioCarregadoRef = useRef(false);
  useEffect(() => {
    if (rascunhoRelatorioCarregadoRef.current || !pas) return;
    rascunhoRelatorioCarregadoRef.current = true;
    const rascunho = pas.rascunhosPecas?.relatorio_instrucao;
    if (!rascunho) return;
    setFatos((atual) => atual.trim() ? atual : rascunho.conteudoHtml);
    if (rascunho.provas?.length) setProvasRascunho(rascunho.provas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pas]);

  // Cada foto inserida pelo botão de imagem do editor sobe pro Storage na
  // hora (mesmo caminho de uploadArquivoPas já usado nos outros anexos do
  // PAS) — sem isto, o SunEditor embutiria a foto em base64 dentro do
  // próprio HTML do relatório, e é exatamente essa combinação (foto em
  // base64 dentro do campo) que já travou a fila de gravações da vistoria
  // antes (ver comentário em saveInspecao, use-inspecoes.ts).
  const handleImagemRelatorio = (files: File[], _info: unknown, uploadHandler: (response: unknown) => void) => {
    if (!pas) return;
    (async () => {
      try {
        const resultado = await Promise.all(files.map(async (file) => ({
          url: await uploadArquivoPas(pas.id, file),
          name: file.name,
          size: file.size,
        })));
        uploadHandler({ result: resultado });
      } catch (e) {
        console.error('Erro ao enviar imagem do relatório do PAS:', e);
        uploadHandler('Não foi possível enviar a imagem — tente de novo.');
      }
    })();
  };

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

  // PDF — gerador próprio dos autos (renderPasIntoPdf): folhas A4 de verdade,
  // um documento por folha, numeração contínua a partir da capa e os arquivos
  // anexados juntados logo depois da peça a que se referem. Serve tanto pra
  // baixar uma peça isolada quanto várias juntas (processo completo ou só
  // uma etapa) — a lista sempre tem 1+ peças; o "papel" fica sempre montado,
  // mas fora da tela (position:fixed, left:-99999px) — precisa estar de
  // verdade no DOM (não display:none) pra offsetWidth/offsetHeight terem
  // valor real na hora de gerar o PDF.
  const [pecasParaBaixar, setPecasParaBaixar] = useState<PasPeca[] | null>(null);
  const [nomeArquivoBaixar, setNomeArquivoBaixar] = useState("");
  // true pra download de etapa/processo completo (a capa entra junto, pronta
  // pra imprimir); false pra baixar uma peça avulsa, onde uma capa seria
  // redundante.
  const [incluirCapaNoDownload, setIncluirCapaNoDownload] = useState(true);
  const [isBaixandoPdf, setIsBaixandoPdf] = useState(false);
  // Autos completos com anexos escaneados chegam fácil a algumas dezenas de
  // folhas — sem um "folha 7 de 32" o usuário acha que travou.
  const [progressoPdf, setProgressoPdf] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pecasParaBaixar || !pas) return;
    let stagingEl: HTMLDivElement | null = null;
    (async () => {
      // Um frame de espera garante que o React já pintou o conteúdo no
      // printRef antes de medir/capturar — sem isso, a primeira geração
      // depois de trocar a lista podia capturar o HTML anterior.
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
        await renderPasIntoPdf(pdf, printRef.current, stagingEl, {
          onProgress: (folha, total) => setProgressoPdf(`${folha}/${total}`),
        });
        pdf.save(`${nomeArquivoBaixar} - PAS ${pas.numeroProcesso}.pdf`.replace(/[\\/:*?"<>|]/g, '_'));
      } catch (e) {
        console.error('Erro ao gerar PDF do PAS:', e);
        toast({ variant: "destructive", title: "Erro ao gerar o PDF", description: descreverErro(e) });
      } finally {
        if (stagingEl) document.body.removeChild(stagingEl);
        setIsBaixandoPdf(false);
        setProgressoPdf("");
        setPecasParaBaixar(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pecasParaBaixar]);

  const iniciarDownload = (pecasList: PasPeca[], nomeArquivo: string, comCapa = true) => {
    if (pecasList.length === 0) return;
    setNomeArquivoBaixar(nomeArquivo);
    setIncluirCapaNoDownload(comCapa);
    setIsBaixandoPdf(true);
    setPecasParaBaixar(pecasList);
  };

  const handleBaixarPeca = (peca: PasPeca) => iniciarDownload([peca], peca.titulo, false);
  const handleBaixarProcessoCompleto = () => iniciarDownload(pecas, "Processo Completo");

  // Agrupa as peças por etapa pra download avulso — peças não guardam a
  // fase em que nasceram, então o agrupamento é posicional: tudo até o
  // despacho inicial é Instauração, dali até o encerramento da instrução é
  // Instrução, dali até o TIP é Julgamento (cobre também o Termo de Juntada
  // do julgamento, que tem `tipo: 'termo_juntada'` igual aos da Instrução —
  // agrupar por posição em vez de por tipo evita misturar etapas erradas).
  /**
   * Cor de cada etapa do rito. Mesma paleta das fases (pas-textos-padrao.ts),
   * para a etapa de uma peça nos autos e a fase mostrada na régua do topo
   * falarem a mesma língua — um processo em Instrução tem a régua em âmbar e
   * as peças daquela etapa em âmbar.
   *
   * A cor fica na borda lateral e no rótulo, não no fundo da linha: colorir a
   * linha inteira faria a lista competir com o conteúdo das peças.
   */
  const CORES_ETAPA: Record<string, { rotulo: string; texto: string; barra: string; fundo: string }> = {
    instauracao: { rotulo: 'Instauração', texto: 'text-sky-700', barra: 'bg-sky-400', fundo: 'bg-sky-50' },
    instrucao: { rotulo: 'Instrução', texto: 'text-amber-700', barra: 'bg-amber-400', fundo: 'bg-amber-50' },
    julgamento: { rotulo: 'Julgamento', texto: 'text-violet-700', barra: 'bg-violet-400', fundo: 'bg-violet-50' },
    posTip: { rotulo: 'Recursal / Arquivamento', texto: 'text-zinc-600', barra: 'bg-zinc-300', fundo: 'bg-zinc-50' },
  };

  const etapasParaDownload = useMemo(() => {
    const idxInicial = pecas.findIndex(p => p.tipo === 'despacho_inicial');
    const idxEncerramento = pecas.findIndex(p => p.tipo === 'despacho_encerramento_instrucao');
    const idxTip = pecas.findIndex(p => p.tipo === 'termo_imposicao_penalidade');
    const grupos = [
      { key: 'instauracao', label: 'Etapa 1 — Instauração', pecas: idxInicial >= 0 ? pecas.slice(0, idxInicial + 1) : [] },
      { key: 'instrucao', label: 'Etapa 2 — Instrução', pecas: idxInicial >= 0 ? pecas.slice(idxInicial + 1, idxEncerramento >= 0 ? idxEncerramento + 1 : undefined) : [] },
      { key: 'julgamento', label: 'Etapa 3 — Julgamento', pecas: idxEncerramento >= 0 ? pecas.slice(idxEncerramento + 1, idxTip >= 0 ? idxTip + 1 : undefined) : [] },
      { key: 'posTip', label: 'Etapa 4 — Recursal/Arquivamento', pecas: idxTip >= 0 ? pecas.slice(idxTip + 1) : [] },
    ];
    return grupos.filter(g => g.pecas.length > 0);
  }, [pecas]);

  // Etiqueta de capa — não é uma peça dos autos, é só uma folha de
  // identificação pra colar na pasta física do processo (prática comum em
  // processos administrativos em papel). PDF próprio, mais simples, sem
  // paginação (sempre cabe numa folha só).
  const [isBaixandoCapa, setIsBaixandoCapa] = useState(false);
  const capaRef = useRef<HTMLDivElement>(null);

  const handleBaixarEtiquetaCapa = async () => {
    if (!pas) return;
    setIsBaixandoCapa(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let stagingEl: HTMLDivElement | null = null;
    try {
      const { jsPDF } = await import("jspdf");
      stagingEl = document.createElement('div');
      stagingEl.style.position = 'fixed';
      stagingEl.style.left = '-99999px';
      stagingEl.style.top = '0';
      document.body.appendChild(stagingEl);
      const pdf = new jsPDF('p', 'mm', 'a4');
      if (!capaRef.current) throw new Error('Modelo de etiqueta não encontrado.');
      await renderPasIntoPdf(pdf, capaRef.current, stagingEl);
      pdf.save(`Etiqueta de Capa - PAS ${pas.numeroProcesso}.pdf`.replace(/[\\/:*?"<>|]/g, '_'));
    } catch (e) {
      console.error('Erro ao gerar a etiqueta de capa do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao gerar a etiqueta", description: descreverErro(e) });
    } finally {
      if (stagingEl) document.body.removeChild(stagingEl);
      setIsBaixandoCapa(false);
    }
  };

  // Peça aberta para leitura. Ver o documento como foi lavrado — timbre,
  // identificação do processo, assinatura — sem gerar o PDF do processo
  // inteiro só para conferir uma folha.
  const [pecaEmLeitura, setPecaEmLeitura] = useState<PasPeca | null>(null);

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

  // Julgamento — texto livre (mesmo padrão do Relatório Técnico: estado
  // local, editável a qualquer momento, sem depender de nada estar fechado
  // antes) e emissão de verdade só quando handlePodeEmitirJulgamento liberar
  // mais abaixo (relatório + defesa/informação já completos).
  const [julgamentoFundamentacao, setJulgamentoFundamentacao] = useState("");
  const [julgamentoDecisao, setJulgamentoDecisao] = useState("");
  const [isEmitindoJulgamento, setIsEmitindoJulgamento] = useState(false);
  const [isEncaminhandoTip, setIsEncaminhandoTip] = useState(false);
  const [isArquivando, setIsArquivando] = useState(false);
  const [isVoltandoEtapa, setIsVoltandoEtapa] = useState(false);

  const [isExcluindoPas, setIsExcluindoPas] = useState(false);

  const handleExcluirPas = async () => {
    if (!pas) return;
    setIsExcluindoPas(true);
    try {
      await cancelarLembretePrazo(deleteInspecao, pas.agendaLembreteId);
      await cancelarLembretePrazo(deleteInspecao, pas.encaminhamentoLembreteId);
      await excluirPas(pas.id);
      // Libera o Auto de Infração pra abrir um PAS novo de novo — limpeza de
      // referência, não pode impedir a exclusão do PAS em si (que já
      // aconteceu na linha acima). Um PAS aberto a partir de um auto
      // compartilhado por um colega (a lista de "Abrir PAS" já inclui os
      // compartilhados, ver aisElegiveis em pas/page.tsx) deixa o usuário
      // como dono do PAS, mas não necessariamente com acesso de escrita no
      // auto original — sem isolar esta chamada, uma negativa de permissão
      // aqui fazia o catch de fora achar que o PAS não tinha sido excluído,
      // quando na verdade já tinha.
      try {
        await updateIntimacaoMeta(pas.autoInfracaoId, { pasId: null });
      } catch (e) {
        console.warn('PAS excluído, mas não foi possível liberar o Auto de Infração de origem:', e);
      }
      toast({ title: "Processo excluído" });
      router.push('/pas');
    } catch (e) {
      console.error('Erro ao excluir o PAS:', e);
      toast({ variant: "destructive", title: "Erro ao excluir", description: descreverErro(e) });
      setIsExcluindoPas(false);
    }
  };

  // Remoção de peça juntada por engano (documento errado ou duplicado). Não
  // é edição dos autos: pra corrigir o CONTEÚDO de uma peça válida o caminho
  // continua sendo o Termo de Retificação, que preserva a original. Aqui é o
  // caso em que a peça simplesmente não deveria existir.
  const [pecaParaExcluir, setPecaParaExcluir] = useState<PasPeca | null>(null);
  const [isExcluindoPeca, setIsExcluindoPeca] = useState(false);
  const podeExcluirPeca = isGestor || isAutuante;
  // "Fazer o colega assumir o PAS no meu lugar" é isso: encaminhar já não é
  // trava de permissão nenhuma (ver PasEncaminharDialog — a regra do
  // Firestore já aceita responsavelAtualUid pra agir), só faltava o próprio
  // autuante (não só o gestor) conseguir chamar a caixa. Quem já está com a
  // "vez" (encaminhado antes) também pode passar adiante — permite uma
  // cadeia de encaminhamentos, não só um handoff único do dono.
  const podeEncaminhar = isGestor || isAutuante || pas?.responsavelAtualUid === profile?.uid;

  const handleExcluirPeca = async () => {
    if (!pecaParaExcluir || !pas) return;
    setIsExcluindoPeca(true);
    try {
      const { renumerado } = await excluirPeca(pecaParaExcluir.id);

      // O SISTEMA VOLTA SOZINHO PRO FLUXO PADRÃO.
      //
      // Certas peças SÃO o próprio ato que avança a fase (despacho inicial,
      // encerramento da instrução, julgamento, TIP — ver PAS_FASE_APOS_PECA).
      // Excluir uma dessas por ter sido lavrada errada não podia deixar o
      // processo preso na fase que ela abriu: os botões pra redigir de novo
      // (relatório, termos) ficam escondidos assim que a fase avança, e sem
      // reverter a fase eles não voltavam a aparecer mesmo com a peça já
      // fora dos autos. Só reverte quando a fase ainda é exatamente a que
      // essa peça abriu — se o processo já seguiu adiante (ex.: excluiu o
      // despacho de instauração depois de já ter julgamento emitido), a
      // fase não recua sozinha; use "Voltar etapa" (no card de ações) pra
      // decidir isso manualmente.
      const faseQueEstaPecaAbriu = PAS_FASE_APOS_PECA[pecaParaExcluir.tipo];
      let faseAnteriorRestaurada: PasFase | null = null;
      if (faseQueEstaPecaAbriu && pas.fase === faseQueEstaPecaAbriu) {
        const idx = PAS_FASE_ORDEM.indexOf(faseQueEstaPecaAbriu);
        if (idx > 0) {
          faseAnteriorRestaurada = PAS_FASE_ORDEM[idx - 1];
          await atualizarPas(pas.id, { fase: faseAnteriorRestaurada });
        }
      }

      const descricaoFase = faseAnteriorRestaurada ? ` A etapa voltou para ${PAS_FASE_LABEL[faseAnteriorRestaurada]}.` : '';
      toast(renumerado
        ? { title: "Peça excluída", description: `As peças seguintes foram renumeradas.${descricaoFase}` }
        : { title: "Peça excluída", description: `A numeração das peças seguintes não pôde ser ajustada — publique as regras do Firestore e reabra o processo.${descricaoFase}` });
      setPecaParaExcluir(null);
    } catch (e) {
      console.error('Erro ao excluir peça do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao excluir a peça", description: descreverErro(e) });
    } finally {
      setIsExcluindoPeca(false);
    }
  };

  // Passa a "vez de agir" pra alguém — mesma mecânica tanto pro
  // encaminhamento manual (handleEscolherEncaminhamento, abaixo) quanto pras
  // devoluções automáticas de fase (ex.: handleEncaminharJulgamento, quando a
  // instrução termina e o despacho retorna pro gestor que o emitiu): cria
  // uma notificação quase imediata na Agenda/push já existentes (sem
  // antecedência nenhuma) e marca quem passou a vez, pra avisar essa pessoa
  // de volta quando o processo "voltar" pra ela (ver limparEncaminhamento).
  const notificarProximaAcao = async (destino: { uid: string; nome: string }, titulo: string) => {
    if (!pas || !profile?.municipioId) return;
    const lembreteId = await criarLembretePrazo(saveInspecao, {
      titulo,
      prazoISO: new Date().toISOString(),
      diasAntecedencia: 0,
      fiscalId: destino.uid,
      fiscalNome: destino.nome,
      municipioId: profile.municipioId,
      origemHref: `/pas/${pas.id}`,
    });
    await atualizarPas(pas.id, {
      responsavelAtualUid: destino.uid,
      responsavelAtualNome: destino.nome,
      encaminhamentoLembreteId: lembreteId,
      encaminhadoPorUid: profile.uid,
      encaminhadoPorNome: profile.displayName || 'Fiscal',
    });
  };

  const handleEscolherEncaminhamento = async (colega: { uid: string; displayName: string }) => {
    if (!pas) return;
    try {
      await notificarProximaAcao({ uid: colega.uid, nome: colega.displayName }, `PAS encaminhado pra você — ${pas.estabelecimento.fantasia} (nº ${pas.numeroProcesso})`);
      toast({ title: `Encaminhado para ${colega.displayName}` });
    } catch (e) {
      console.error('Erro ao encaminhar o PAS:', e);
      toast({ variant: "destructive", title: "Erro ao encaminhar" });
    }
  };

  // Sempre que alguém efetivamente age (uma peça nova entra nos autos), o
  // encaminhamento pendente se resolve sozinho — sem isso, o aviso "com
  // fulano" continuaria aparecendo mesmo depois de resolvido. A DEVOLUÇÃO
  // avisa quem tinha encaminhado/despachado (encaminhadoPorUid) que a vez
  // voltou pra ele — não avisa quando é a própria pessoa agindo (ela já
  // sabe, foi ela mesma).
  const limparEncaminhamento = async () => {
    if (!pas?.responsavelAtualUid) return;
    if (pas.encaminhadoPorUid && pas.encaminhadoPorUid !== profile?.uid) {
      try {
        await criarLembretePrazo(saveInspecao, {
          titulo: `Devolvido pra você — ${pas.estabelecimento.fantasia} (nº ${pas.numeroProcesso})`,
          prazoISO: new Date().toISOString(),
          diasAntecedencia: 0,
          fiscalId: pas.encaminhadoPorUid,
          fiscalNome: pas.encaminhadoPorNome || 'Fiscal',
          municipioId: pas.municipioId,
          origemHref: `/pas/${pas.id}`,
        });
      } catch (e) {
        // Aviso de devolução é conveniência, não pode travar a ação
        // principal (registrar defesa, emitir julgamento etc.).
        console.error('Erro ao avisar a devolução do PAS:', e);
      }
    }
    await atualizarPas(pas.id, { responsavelAtualUid: null, responsavelAtualNome: null, encaminhadoPorUid: null, encaminhadoPorNome: null });
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

  // Roadmap sempre visível no topo — mostra o percurso inteiro do PAS, não
  // só a fase atual, pra dar contexto de onde o processo está e o que ainda
  // falta, mesmo em fases que ainda não têm ação própria na tela.
  const ROADMAP_STEPS: { key: string; label: string; fases: PasFase[] }[] = [
    { key: 'instauracao', label: 'Instauração', fases: ['instauracao'] },
    { key: 'instrucao', label: 'Instrução', fases: ['instrucao'] },
    { key: 'julgamento', label: 'Julgamento', fases: ['aguardando_julgamento', 'julgamento', 'recursal'] },
    { key: 'arquivamento', label: 'Arquivamento', fases: ['arquivamento'] },
  ];
  const roadmapIndexAtual = ROADMAP_STEPS.findIndex(s => s.fases.includes(pas.fase));

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

  // Julgamento: só a EMISSÃO de verdade exige a instrução completa (julgar
  // com o processo incompleto é ato prematuro, invalidável — Título III,
  // Cap.3 do manual); redigir a fundamentação não depende de nada disso, por
  // isso o bloco de Julgamento aparece sempre, mesmo em fases anteriores.
  const temJulgamento = pecas.some(p => p.tipo === 'julgamento_primeira_instancia');
  const temTip = pecas.some(p => p.tipo === 'termo_imposicao_penalidade');
  const podeEmitirJulgamento = temRelatorioInstrucao && temDefesaOuInformacao;

  // RASCUNHO DE DESPACHO/TERMO ANTES DE ASSINAR.
  //
  // A revisão (PasPecaReviewDialog) só grava a peça de verdade quando tem
  // assinatura, anexo ou "assinado fora do sistema" — até lá, fechar o
  // diálogo (ou sair da tela) perdia qualquer ajuste feito no texto padrão.
  // Guardado no próprio documento do PAS (não como peça dos autos: um
  // rascunho não é ato processual, não tem número, não deveria aparecer na
  // lista de peças), por tipo — cada despacho/termo só tem um rascunho
  // pendente por vez, e ele some assim que a peça de verdade é gravada.
  const salvarRascunhoPeca = async (chave: string, titulo: string, conteudoHtml: string, provas?: { url: string; nome: string }[]) => {
    try {
      // `provas` só vem preenchido quando quem chama tem provas pra guardar
      // (hoje, só o relatório) — omitido (undefined), preserva as que já
      // estavam salvas em vez de apagá-las (ex.: um "salvar rascunho" feito
      // de dentro da revisão, depois de provas já terem sido guardadas na
      // tela anterior).
      const existente = pas.rascunhosPecas?.[chave];
      await atualizarPas(pas.id, {
        rascunhosPecas: {
          ...(pas.rascunhosPecas || {}),
          [chave]: {
            titulo,
            conteudoHtml,
            atualizadoEm: new Date().toISOString(),
            ...(provas !== undefined ? { provas } : (existente?.provas ? { provas: existente.provas } : {})),
          },
        },
      });
      toast({ title: "Rascunho salvo", description: "Continue quando quiser — abra a mesma ação de novo pra retomar." });
    } catch (e) {
      console.error('Erro ao salvar rascunho de peça do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao salvar o rascunho" });
    }
  };

  const limparRascunhoPeca = async (chave: string) => {
    if (!pas.rascunhosPecas?.[chave]) return;
    const { [chave]: _removido, ...restantes } = pas.rascunhosPecas;
    try {
      await atualizarPas(pas.id, { rascunhosPecas: restantes });
    } catch (e) {
      // A peça já foi gravada — um rascunho velho sobrando não trava nada,
      // só reaparece (inofensivamente) na próxima vez que essa ação abrir.
      console.error('Erro ao limpar rascunho de peça do PAS já gravada:', e);
    }
  };

  const handleEmitirJulgamento = () => {
    if (!julgamentoFundamentacao.trim()) {
      toast({ variant: "destructive", title: "Escreva a fundamentação antes de emitir" });
      return;
    }
    const admissibilidade = textoAdmissibilidadeJulgamento({
      temDefesa: !!pas.defesa,
      tempestividade: pas.defesa?.tempestividade,
    });
    const julgamentoHtml = [
      `<p><strong>1. ADMISSIBILIDADE</strong></p><p>${admissibilidade}</p>`,
      `<p><strong>2. FUNDAMENTAÇÃO</strong></p><p>${julgamentoFundamentacao.replace(/\n/g, '<br>')}</p>`,
      `<p><strong>3. DECISÃO</strong></p><p>${(julgamentoDecisao || 'A definir.').replace(/\n/g, '<br>')}</p>`,
    ].join('');
    const chaveRascunho = 'julgamento_primeira_instancia';
    setRevisao({
      titulo: PAS_PECA_TITULOS.julgamento_primeira_instancia,
      conteudoInicial: pas.rascunhosPecas?.[chaveRascunho]?.conteudoHtml || julgamentoHtml,
      chaveRascunho,
      onSalvarRascunho: salvarRascunhoPeca,
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
        setIsEmitindoJulgamento(true);
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPecas([
            { tipo: 'termo_juntada', titulo: PAS_PECA_TITULOS.termo_juntada, conteudoHtml: `Junto aos autos o Julgamento em 1ª Instância proferido nesta data, para os devidos fins.`, criadoEm: dataAto },
            { tipo: 'julgamento_primeira_instancia', titulo: PAS_PECA_TITULOS.julgamento_primeira_instancia, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl, criadoEm: dataAto },
          ]);
          await atualizarPas(pas.id, { fase: 'julgamento' });
          await limparRascunhoPeca(chaveRascunho);
          setJulgamentoFundamentacao(""); setJulgamentoDecisao("");
          toast({ title: "Julgamento emitido" });
          await limparEncaminhamento();
          setRevisao(null);
        } catch (e) {
          console.error('Erro ao emitir o julgamento do PAS:', e);
          toast({ variant: "destructive", title: "Erro ao emitir o julgamento" });
        } finally {
          setIsEmitindoJulgamento(false);
        }
      },
    });
  };

  const handleEncaminharTip = () => {
    const chaveRascunho = 'despacho_encaminhamento_tip';
    setRevisao({
      titulo: PAS_PECA_TITULOS.despacho_encaminhamento_tip,
      conteudoInicial: pas.rascunhosPecas?.[chaveRascunho]?.conteudoHtml || textoDespachoEncaminhamentoTip({ destinatario: destinatarioGestor }),
      chaveRascunho,
      onSalvarRascunho: salvarRascunhoPeca,
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
        setIsEncaminhandoTip(true);
        try {
          // O prazo recursal conta a partir da CIÊNCIA da decisão — a data do
          // ato escolhida na revisão (não "hoje"), pra o TIP não sair com um
          // prazo calculado do dia em que alguém sentou pra digitar os autos
          // quando o processo é montado com atraso. Por isso o cálculo (e o
          // texto do TIP, que o cita) só acontece aqui, depois de a data ser
          // escolhida — nunca antes de abrir a revisão.
          const baseLegal = baseLegalDoMunicipio(profile?.municipioId);
          const dataDoAto = new Date(dataAto);
          const prazoRecursal = addPrazo(dataDoAto, baseLegal.recurso.dias, baseLegal.contagemPrazo);
          const prazoRecursalFormatada = format(prazoRecursal, "dd/MM/yyyy");
          const prazoRecursalMultaData = baseLegal.recurso.diasMulta
            ? format(addPrazo(dataDoAto, baseLegal.recurso.diasMulta, baseLegal.contagemPrazo), "dd/MM/yyyy")
            : undefined;
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPecas([
            { tipo: 'despacho_encaminhamento_tip', titulo: PAS_PECA_TITULOS.despacho_encaminhamento_tip, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl, criadoEm: dataAto },
            { tipo: 'termo_imposicao_penalidade', titulo: PAS_PECA_TITULOS.termo_imposicao_penalidade, conteudoHtml: textoTermoImposicaoPenalidade({ numeroAI: pas.numeroProcesso, prazoRecursalData: prazoRecursalFormatada, prazoRecursalMultaData, municipioId: profile?.municipioId }), criadoEm: dataAto },
          ]);
          const lembreteId = await criarLembretePrazo(saveInspecao, {
            titulo: `Prazo recursal (PAS) vence em breve — ${pas.estabelecimento.fantasia}`,
            prazoISO: prazoRecursal.toISOString(),
            fiscalId: pas.autuanteUid,
            fiscalNome: pas.autuanteNome,
            municipioId: profile!.municipioId,
            origemHref: `/pas/${pas.id}`,
          });
          await atualizarPas(pas.id, { fase: 'recursal', agendaLembreteId: lembreteId });
          await limparRascunhoPeca(chaveRascunho);
          toast({ title: "TIP emitido — prazo recursal em andamento" });
          await limparEncaminhamento();
          setRevisao(null);
        } catch (e) {
          console.error('Erro ao encaminhar o TIP do PAS:', e);
          toast({ variant: "destructive", title: "Erro ao encaminhar o TIP" });
        } finally {
          setIsEncaminhandoTip(false);
        }
      },
    });
  };

  const handleArquivarProcesso = async () => {
    setIsArquivando(true);
    try {
      // Também marca `arquivado` (o mesmo campo usado pra tirar da vista na
      // lista do PAS) — sem isso, encerrar o processo aqui não bastava: ele
      // continuava aparecendo em "Todos" até alguém arquivar de novo, à mão,
      // pelo menu da lista.
      await atualizarPas(pas.id, { fase: 'arquivamento', arquivado: true, arquivadoEm: new Date().toISOString() });
      toast({ title: "Processo arquivado" });
    } catch (e) {
      console.error('Erro ao arquivar o PAS:', e);
      toast({ variant: "destructive", title: "Erro ao arquivar" });
    } finally {
      setIsArquivando(false);
    }
  };

  // Escape hatch manual — pra quando a peça errada já foi excluída ANTES
  // deste recurso existir (ou numa situação que o revert automático de
  // handleExcluirPeca não cobre) e o processo ficou preso numa fase cujas
  // ações já sumiram da tela. Não apaga nem restaura peça nenhuma: só muda
  // qual etapa está "aberta", pra a autoridade poder redigir de novo o que
  // precisar. Mesmo acesso de quem já pode excluir peça (isGestor || isAutuante).
  const faseAtualIdx = PAS_FASE_ORDEM.indexOf(pas.fase);
  const faseParaVoltar = faseAtualIdx > 0 ? PAS_FASE_ORDEM[faseAtualIdx - 1] : null;

  const handleVoltarEtapa = async () => {
    if (!faseParaVoltar) return;
    setIsVoltandoEtapa(true);
    try {
      await atualizarPas(pas.id, { fase: faseParaVoltar });
      toast({ title: `Etapa voltou para ${PAS_FASE_LABEL[faseParaVoltar]}`, description: "Nenhuma peça foi apagada — os autos continuam como estavam." });
    } catch (e) {
      console.error('Erro ao voltar a etapa do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao voltar a etapa" });
    } finally {
      setIsVoltandoEtapa(false);
    }
  };

  // Corrigir uma peça já lavrada nunca edita/apaga a original (Título III,
  // Cap.2, §1.1–1.2 do manual) — abre a mesma revisão de sempre, só que
  // pré-preenchida com o conteúdo da peça errada como ponto de partida, e
  // grava um Termo de Retificação novo que referencia a original por número.
  const handleRetificarPeca = (pecaOriginal: PasPeca) => {
    const chaveRascunho = `termo_retificacao_${pecaOriginal.numero}`;
    setRevisao({
      titulo: `${PAS_PECA_TITULOS.termo_retificacao} — Peça nº ${pecaOriginal.numero}`,
      conteudoInicial: pas.rascunhosPecas?.[chaveRascunho]?.conteudoHtml
        || textoTermoRetificacao({ pecaOriginalTitulo: pecaOriginal.titulo, pecaOriginalNumero: pecaOriginal.numero }) + pecaOriginal.conteudoHtml,
      chaveRascunho,
      onSalvarRascunho: salvarRascunhoPeca,
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({
            tipo: 'termo_retificacao',
            titulo: `${PAS_PECA_TITULOS.termo_retificacao} — Peça nº ${pecaOriginal.numero}`,
            conteudoHtml: conteudoFinal,
            assinaturaUrl,
            assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile,
            anexoUrl,
            refPecaId: pecaOriginal.id,
            refPecaNumero: pecaOriginal.numero,
            criadoEm: dataAto,
          });
          await limparRascunhoPeca(chaveRascunho);
          toast({ title: "Termo de retificação registrado" });
          await limparEncaminhamento();
          setRevisao(null);
        } catch (e) {
          console.error('Erro ao retificar peça do PAS:', e);
          toast({ variant: "destructive", title: "Erro ao registrar a retificação" });
        }
      },
    });
  };

  const handleIniciarInstrucao = () => {
    const chaveRascunho = 'despacho_inicial';
    setRevisao({
      titulo: PAS_PECA_TITULOS.despacho_inicial,
      conteudoInicial: pas.rascunhosPecas?.[chaveRascunho]?.conteudoHtml
        || textoDespachoInicial({ numeroAI: pas.numeroProcesso, estabelecimento: pas.estabelecimento.fantasia, destinatario: destinatarioGestor }),
      chaveRascunho,
      onSalvarRascunho: salvarRascunhoPeca,
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'despacho_inicial', titulo: PAS_PECA_TITULOS.despacho_inicial, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl, criadoEm: dataAto });
          await atualizarPas(pas.id, { fase: 'instrucao' });
          await limparRascunhoPeca(chaveRascunho);
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
    const baseLegal = baseLegalDoMunicipio(profile.municipioId);
    const prazoData = addPrazo(new Date(pas.dataCienciaAI), baseLegal.defesa.dias, baseLegal.contagemPrazo);
    const prazoFormatada = format(prazoData, "dd/MM/yyyy");
    const chaveRascunho = 'despacho_instrucao';
    setRevisao({
      titulo: PAS_PECA_TITULOS.despacho_instrucao,
      conteudoInicial: pas.rascunhosPecas?.[chaveRascunho]?.conteudoHtml
        || textoDespachoInstrucao({ numeroAI: pas.numeroProcesso, prazoDefesaData: prazoFormatada, municipioId: profile.municipioId }),
      chaveRascunho,
      onSalvarRascunho: salvarRascunhoPeca,
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'despacho_instrucao', titulo: PAS_PECA_TITULOS.despacho_instrucao, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl, criadoEm: dataAto });
          const lembreteId = await criarLembretePrazo(saveInspecao, {
            titulo: `Prazo de defesa (PAS) vence em breve — ${pas.estabelecimento.fantasia}`,
            prazoISO: prazoData.toISOString(),
            fiscalId: pas.autuanteUid,
            fiscalNome: pas.autuanteNome,
            municipioId: profile.municipioId!,
            origemHref: `/pas/${pas.id}`,
          });
          await atualizarPas(pas.id, { prazoDefesaData: prazoData.toISOString(), agendaLembreteId: lembreteId });
          await limparRascunhoPeca(chaveRascunho);
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
    // No modo "sistema", precisa ter conteúdo de verdade antes de abrir a
    // revisão. fatos é HTML de um editor rico — vazio de verdade não é ""
    // (o SunEditor sem nada digitado costuma devolver "<p><br></p>"), e
    // uma foto sem nenhuma palavra ao redor ainda é conteúdo válido. No
    // modo "anexo" essa exigência não existe — o relatório já está pronto
    // fora do sistema, e é ele (anexado na revisão a seguir) que vale,
    // não um texto escrito aqui só pra passar da validação.
    if (modoRelatorio === 'sistema') {
      const temConteudoReal = /<img[\s>]/i.test(fatos) || fatos.replace(/<[^>]*>/g, '').trim().length > 0;
      if (!temConteudoReal) {
        toast({ variant: "destructive", title: "Descreva os fatos antes de salvar" });
        return;
      }
    }
    setIsSalvandoRelatorio(true);
    try {
      // Cada prova anexada gera seu próprio Termo de Juntada, sempre ANTES do
      // Relatório na lista de peças — só esses aqui não passam por
      // revisão/assinatura individual (são recibos de anexação, não peças de
      // conteúdo); o Relatório em si (que é o texto de verdade) ainda passa
      // pela revisão antes de ser gravado, junto com essas juntadas no mesmo
      // lote (adicionarPecas numera tudo sequencialmente, sem risco de
      // corrida entre chamadas). As já salvas num rascunho (provasRascunho)
      // entram direto — foram enviadas ao Storage quando o rascunho foi
      // salvo, reenviar de novo duplicaria o arquivo.
      const itensProva: { tipo: 'termo_juntada'; titulo: string; conteudoHtml: string; anexoUrl: string }[] =
        provasRascunho.map((p) => ({ tipo: 'termo_juntada' as const, titulo: PAS_PECA_TITULOS.termo_juntada, conteudoHtml: textoTermoJuntadaProva(p.nome), anexoUrl: p.url }));
      for (const file of provasSelecionadas) {
        const url = await uploadArquivoPas(pas.id, file);
        itensProva.push({ tipo: 'termo_juntada' as const, titulo: PAS_PECA_TITULOS.termo_juntada, conteudoHtml: textoTermoJuntadaProva(file.name), anexoUrl: url });
      }
      // Modo "sistema": fatos já É o HTML de verdade (documento rico, com
      // foto inserível no meio do texto) — entra direto, sem conversão nem
      // cabeçalho "1. DOS FATOS" embrulhando por fora (duplicaria o que o
      // próprio texto traz). Modo "anexo": uma frase de juntada curta e
      // automática — não pedida à autoridade — porque não HÁ outro
      // documento pra anunciar: aqui a própria peça É o termo de juntada,
      // não um relatório separado que o termo precederia.
      const tituloPeca = modoRelatorio === 'anexo'
        ? `${PAS_PECA_TITULOS.termo_juntada} — ${PAS_PECA_TITULOS.relatorio_instrucao}`
        : PAS_PECA_TITULOS.relatorio_instrucao;
      const relatorioHtml = modoRelatorio === 'anexo'
        ? 'Junto aos presentes autos o Relatório Técnico de Instrução, anexo a este termo, para os devidos fins.'
        : fatos;
      const chaveRascunho = 'relatorio_instrucao';

      setRevisao({
        titulo: tituloPeca,
        conteudoInicial: relatorioHtml,
        // Rascunho só faz sentido no modo "sistema" — no modo "anexo" não
        // há redação em andamento pra guardar, o documento já está pronto.
        ...(modoRelatorio === 'sistema' ? { chaveRascunho, onSalvarRascunho: salvarRascunhoPeca } : {}),
        onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
          try {
            const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
            await adicionarPecas([
              ...itensProva.map((p) => ({ ...p, criadoEm: dataAto })),
              // Modo "anexo": SÓ o termo de juntada — ele já é a peça
              // "relatorio_instrucao" (é o que destrava o passo seguinte
              // do processo), sem uma segunda folha de assinatura vazia
              // atrás dele. Modo "sistema": regra de ouro do manual, o
              // relatório (texto de verdade) precisa do próprio Termo de
              // Juntada imediatamente antes, mesmo sem prova em arquivo
              // (Título III, Cap.2, item 2.4, Figura 14).
              ...(modoRelatorio === 'sistema'
                ? [{ tipo: 'termo_juntada' as const, titulo: PAS_PECA_TITULOS.termo_juntada, conteudoHtml: textoTermoJuntadaInstrucao({ destinatario: destinatarioGestor }), criadoEm: dataAto }]
                : []),
              { tipo: 'relatorio_instrucao', titulo: tituloPeca, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl, criadoEm: dataAto },
            ]);
            await limparRascunhoPeca(chaveRascunho);
            setFatos(""); setProvasSelecionadas([]); setProvasRascunho([]); setModoRelatorio('sistema');
            toast({ title: "Relatório técnico registrado" });
            await limparEncaminhamento();
            setRevisao(null);
          } catch (e) {
            console.error('Erro ao salvar o relatório técnico do PAS:', e);
            toast({ variant: "destructive", title: "Erro ao salvar o relatório", description: descreverErro(e) });
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

  // Diferente dos despachos (só existem depois de abrir a revisão), o
  // relatório é digitado num campo livre antes disso — sem este botão, o
  // "salvar rascunho" da revisão nunca entraria em cena pra quem larga o
  // relatório na metade, antes mesmo de clicar em "Salvar Relatório".
  const handleSalvarRascunhoRelatorio = async () => {
    if (!fatos.trim() && provasSelecionadas.length === 0 && provasRascunho.length === 0) return;
    setIsSalvandoRascunhoRelatorio(true);
    try {
      const novasProvas: { url: string; nome: string }[] = [];
      for (const file of provasSelecionadas) {
        const url = await uploadArquivoPas(pas.id, file);
        novasProvas.push({ url, nome: file.name });
      }
      const todasProvas = [...provasRascunho, ...novasProvas];
      await salvarRascunhoPeca('relatorio_instrucao', PAS_PECA_TITULOS.relatorio_instrucao, fatos, todasProvas);
      setProvasRascunho(todasProvas);
      setProvasSelecionadas([]);
    } catch (e) {
      console.error('Erro ao salvar rascunho do relatório do PAS:', e);
      toast({ variant: "destructive", title: "Erro ao salvar o rascunho" });
    } finally {
      setIsSalvandoRascunhoRelatorio(false);
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
        onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
          try {
            // O anexo principal aqui já é a própria defesa (url, escolhida
            // antes de abrir esta revisão) — um "anexo externo" adicional só
            // reforça que o Termo em si foi tratado fora do sistema, sem
            // substituir o documento da defesa. dataAto aqui é a data do ATO
            // de juntada (quando o termo foi lavrado), diferente de
            // defesaData (quando a defesa em si foi recebida) — os dois
            // podem ser dias diferentes.
            await adicionarPeca({
              tipo: 'termo_juntada',
              titulo: `${PAS_PECA_TITULOS.termo_juntada} — Defesa Administrativa`,
              conteudoHtml: conteudoFinal,
              anexoUrl: url,
              assinaturaUrl,
              assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile,
              criadoEm: dataAto,
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
    const chaveRascunho = 'termo_informacao';
    setRevisao({
      titulo: PAS_PECA_TITULOS.termo_informacao,
      conteudoInicial: pas.rascunhosPecas?.[chaveRascunho]?.conteudoHtml
        || textoTermoInformacaoSemDefesa({ numeroAI: pas.numeroProcesso, prazoDefesaData: prazoFormatada, municipioId: profile?.municipioId }),
      chaveRascunho,
      onSalvarRascunho: salvarRascunhoPeca,
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'termo_informacao', titulo: PAS_PECA_TITULOS.termo_informacao, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl, criadoEm: dataAto });
          await cancelarLembretePrazo(deleteInspecao, pas.agendaLembreteId);
          await limparRascunhoPeca(chaveRascunho);
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
    const chaveRascunho = 'despacho_encerramento_instrucao';
    setRevisao({
      titulo: PAS_PECA_TITULOS.despacho_encerramento_instrucao,
      conteudoInicial: pas.rascunhosPecas?.[chaveRascunho]?.conteudoHtml
        || textoDespachoEncerramentoInstrucao({ destinatario: destinatarioGestor }),
      chaveRascunho,
      onSalvarRascunho: salvarRascunhoPeca,
      onConfirmar: async (conteudoFinal, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto }) => {
        try {
          const anexoUrl = await uploadAnexoExterno(pas.id, anexoExternoFile);
          await adicionarPeca({ tipo: 'despacho_encerramento_instrucao', titulo: PAS_PECA_TITULOS.despacho_encerramento_instrucao, conteudoHtml: conteudoFinal, assinaturaUrl, assinadoForaDoSistema: assinadoForaDoSistema || !!anexoExternoFile, anexoUrl, criadoEm: dataAto });
          await atualizarPas(pas.id, { fase: 'aguardando_julgamento' });
          await limparRascunhoPeca(chaveRascunho);
          await limparEncaminhamento();
          // "Retornem-se os autos conclusos" — o próprio texto do despacho de
          // instrução já promete isso (ver textoDespachoInstrucao). Instrução
          // concluída avisa automaticamente quem emitiu aquele despacho de
          // que o processo voltou, pronto pra julgamento.
          if (gestorResponsavel) {
            await notificarProximaAcao(
              { uid: gestorResponsavel.criadoPorUid, nome: gestorResponsavel.criadoPorNome },
              `Instrução concluída, despacho retorna para julgamento — ${pas.estabelecimento.fantasia} (nº ${pas.numeroProcesso})`
            );
          }
          toast({ title: "Encaminhado para julgamento" });
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
        {/* O selo da fase saiu daqui: a régua de etapas logo abaixo já diz em
            que fase o processo está, e diz melhor — mostra também o que veio
            antes e o que vem depois. Dois lugares dizendo a mesma coisa era
            parte do que deixava a tela confusa.

            Ficam só as duas informações que a régua NÃO carrega: de quem é a vez
            agora, e quanto falta do prazo. */}
        <div className="flex flex-wrap items-center gap-3 empty:hidden">
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

        {/* Percurso completo do PAS — sempre visível, não só a fase atual. */}
        <div className="flex items-center">
          {ROADMAP_STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <span className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0",
                  i < roadmapIndexAtual ? "bg-[#E3F1EA] text-[#1F7A5C]" : i === roadmapIndexAtual ? "bg-[#0E4A44] text-white" : "bg-[#F1EEE4] text-[#A39D8C]"
                )}>
                  {i < roadmapIndexAtual ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("text-[10px] font-bold uppercase whitespace-nowrap", i === roadmapIndexAtual ? "text-[#0E4A44]" : "text-[#A39D8C]")}>{step.label}</span>
              </div>
              {i < ROADMAP_STEPS.length - 1 && (
                <div className={cn("h-0.5 flex-1 mx-2 mb-4", i < roadmapIndexAtual ? "bg-[#1F7A5C]" : "bg-[#E4DFD1]")} />
              )}
            </div>
          ))}
        </div>


        {/* Ações da fase atual */}
        <div className="rounded-lg border border-[#E4DFD1] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Próxima ação</h2>
            <div className="flex items-center gap-3">
              {/* Escape hatch pra quando o processo ficou preso numa fase sem
                  as peças que a abriram (excluídas por engano) — muda só qual
                  etapa está aberta, sem apagar nem restaurar peça nenhuma. */}
              {podeExcluirPeca && faseParaVoltar && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={isVoltandoEtapa}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors disabled:opacity-50"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Voltar etapa
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Voltar para {PAS_FASE_LABEL[faseParaVoltar]}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Usa isso quando uma peça que abriu a etapa atual ({PAS_FASE_LABEL[pas.fase]}) foi excluída por engano e o processo ficou sem os botões pra redigir de novo. Nenhuma peça é apagada ou restaurada — só a etapa aberta muda, liberando as ações de {PAS_FASE_LABEL[faseParaVoltar]}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleVoltarEtapa} disabled={isVoltandoEtapa}>
                        {isVoltandoEtapa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Voltar etapa
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {podeEncaminhar && pas.fase !== 'aguardando_julgamento' && (
                <button
                  type="button"
                  onClick={() => setIsEncaminharOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors"
                >
                  <Send className="h-3.5 w-3.5" /> Encaminhar
                </button>
              )}
            </div>
          </div>

          {pas.fase === 'instauracao' && (
            // Encaminhado (responsavelAtualUid) age igual ao autuante — é
            // exatamente o "colega faz o PAS no meu lugar": o autuante
            // original encaminha (ver podeEncaminhar acima) e quem recebe
            // já consegue agir, não só olhar. A regra do Firestore
            // (atualizarPas) já aceita responsavelAtualUid pra isto.
            (isAutuante || pas.responsavelAtualUid === profile?.uid) ? (
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
                  {/* "Exclusivo do gestor" é explicação de por que NÃO há botão.
                      Para o gestor, que tem o botão logo abaixo, era só ruído —
                      e aparecia de novo no Julgamento, com outra pontuação. Fica
                      só para quem não pode agir, como já era feito lá. */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#262420]">Despacho de Instrução</p>
                    {!isGestor && (
                      <span className="text-[10px] uppercase font-bold text-[#9C7A3C]">Exclusivo do gestor</span>
                    )}
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

                      {/* Uma coisa exclui a outra: ou redige no sistema, ou o
                          relatório já está pronto e só entra como anexo — não
                          precisa "preencher" nada pra anexar, nem que seja só
                          uma frase de fachada pra passar da validação. */}
                      <div className="inline-flex items-center gap-1 bg-[#F5F2EA] rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setModoRelatorio('sistema')}
                          className={cn("px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors", modoRelatorio === 'sistema' ? "bg-white text-[#0E4A44] shadow-sm" : "text-[#A39D8C] hover:text-[#6B6659]")}
                        >
                          Redigir no sistema
                        </button>
                        <button
                          type="button"
                          onClick={() => setModoRelatorio('anexo')}
                          className={cn("px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors", modoRelatorio === 'anexo' ? "bg-white text-[#0E4A44] shadow-sm" : "text-[#A39D8C] hover:text-[#6B6659]")}
                        >
                          Já pronto (anexar PDF)
                        </button>
                      </div>

                      {modoRelatorio === 'anexo' ? (
                        <p className="text-xs text-[#6B6659] bg-[#F5F2EA] rounded-md px-3 py-2.5">
                          O relatório pronto é anexado na tela seguinte, junto com a assinatura — não precisa escrever nada aqui.
                        </p>
                      ) : (
                        <>
                          {/* Redação assistida. Fica acima do campo porque é por onde
                              a maioria vai começar; quem prefere escrever do zero
                              simplesmente ignora e digita abaixo. Uma frase só —
                              o que a IA usa e o que ela NÃO faz juntos, mesmo
                              formato do box equivalente do Julgamento — em vez de
                              duas caixas de texto competindo pela mesma leitura. */}
                          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-violet-900">Redigir com IA</p>
                              <p className="text-[11px] text-violet-800/80 leading-snug mt-0.5">
                                {inspecaoOrigem
                                  ? `Usa o auto de infração e os ${naoConformidades.length} ${naoConformidades.length === 1 ? 'item não conforme' : 'itens não conformes'} do relatório de inspeção — não lê arquivos anexados aos autos. Confira os fatos e os artigos antes de registrar.`
                                  : 'Usa o auto de infração e o que você escrever abaixo (sem relatório de inspeção vinculado) — não lê arquivos anexados aos autos. Confira os fatos e os artigos antes de registrar.'}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isGerandoIa}
                              onClick={() => handleGerarComIa('instrucao')}
                              className="shrink-0 h-9 gap-1.5 border-violet-300 bg-white text-violet-700 hover:bg-violet-100 text-xs font-bold"
                            >
                              {isGerandoIa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                              Gerar rascunho
                            </Button>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-[#6B6659]">Texto do relatório</Label>
                              {fatos.replace(/<[^>]*>/g, '').trim() && (
                                // Também apaga o rascunho salvo (se houver) — senão um
                                // recarregamento da página trazia o texto "limpo" de
                                // volta, restaurado do rascunho que continuava lá.
                                <button type="button" onClick={() => { setFatos(""); limparRascunhoPeca('relatorio_instrucao'); }} className="text-[10px] font-bold uppercase tracking-widest text-[#A39D8C] hover:text-rose-600 transition-colors">
                                  Limpar
                                </button>
                              )}
                            </div>
                            {/* Documento de verdade em vez de caixa de texto solta —
                                a foto entra pelo próprio botão de imagem da barra de
                                ferramentas, no meio do parágrafo onde ela faz
                                sentido (redimensiona arrastando o canto), em vez de
                                uma lista de arquivos à parte. Cada foto sobe pro
                                Storage na hora da inserção (handleImagemRelatorio),
                                não em base64 — o mesmo cuidado já tomado nos outros
                                anexos do PAS. */}
                            <div className="rounded-md border border-[#E4DFD1] overflow-hidden">
                              <DocfacilEditor
                                defaultValue={fatos}
                                forceContent={fatos}
                                onChange={setFatos}
                                onImageUploadBefore={handleImagemRelatorio}
                                showLetterhead={false}
                                placeholder="Gere o rascunho acima e revise aqui, ou escreva do zero — fatos, antecedentes, o que for preciso relatar. Insira fotos pelo botão de imagem da barra de ferramentas."
                              />
                            </div>
                          </div>
                        </>
                      )}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-[#6B6659]">Provas anexadas</Label>
                          <PasDica chave="provas" />
                        </div>
                        <input ref={provasInputRef} type="file" multiple className="hidden" onChange={(e) => setProvasSelecionadas(prev => [...prev, ...Array.from(e.target.files || [])])} />
                        <div className="flex flex-wrap gap-1.5">
                          {/* Já salvas num rascunho anterior — enviadas ao Storage
                              na hora, então sobrevivem à troca de aparelho.
                              Removê-las aqui só tira da lista local; some de
                              vez do rascunho salvo na próxima gravação. */}
                          {provasRascunho.map((p, i) => (
                            <span key={`rascunho-${i}`} className="flex items-center gap-1 bg-[#E3F1EA] rounded px-2 py-1 text-xs text-[#1F7A5C]">
                              {p.nome}
                              <button type="button" onClick={() => setProvasRascunho(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3 text-[#1F7A5C]/60 hover:text-rose-500" /></button>
                            </span>
                          ))}
                          {provasSelecionadas.map((f, i) => (
                            <span key={i} className="flex items-center gap-1 bg-[#F5F2EA] rounded px-2 py-1 text-xs text-[#6B6659]">
                              {f.name}
                              <button type="button" onClick={() => setProvasSelecionadas(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3 text-[#A39D8C] hover:text-rose-500" /></button>
                            </span>
                          ))}
                          <Button type="button" variant="outline" size="sm" onClick={() => provasInputRef.current?.click()} className="h-7 rounded-md text-[11px] gap-1"><Paperclip className="h-3 w-3" /> Anexar arquivo</Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={handleSalvarRelatorio} disabled={isSalvandoRelatorio || isSalvandoRascunhoRelatorio} className="bg-[#0E4A44] hover:bg-[#0B3A35]">
                          {isSalvandoRelatorio ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} {modoRelatorio === 'anexo' ? 'Continuar para assinatura' : 'Salvar Relatório'}
                        </Button>
                        {/* Só no modo "sistema" — no modo "anexo" não há
                            redação em andamento pra guardar. Falta algo pra
                            concluir agora (confirmar um fato, esperar mais
                            provas) e vai assinar só depois, talvez no
                            tablet — guarda o texto e as provas já anexadas
                            sem virar peça de verdade ainda. */}
                        {modoRelatorio === 'sistema' && (
                          <Button type="button" variant="outline" onClick={handleSalvarRascunhoRelatorio} disabled={isSalvandoRelatorio || isSalvandoRascunhoRelatorio} className="rounded-md gap-1.5 text-[#6B6659]">
                            {isSalvandoRascunhoRelatorio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar rascunho
                          </Button>
                        )}
                      </div>
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
            </div>
          )}

        </div>

        {/* Julgamento — sempre visível, mesmo antes de a Instrução fechar:
            só a EMISSÃO de verdade (abaixo) exige o processo completo;
            redigir a fundamentação pode começar a qualquer momento, do
            mesmo jeito que o Relatório Técnico já funciona. */}
        {pas.fase !== 'arquivamento' && (
        <div className="rounded-lg border border-[#E4DFD1] bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Julgamento</h2>
            <PasDica chave="julgamento" />
          </div>

          <div className="flex items-start gap-3 pb-4 border-b border-[#F1EEE4]">
            <span className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black mt-0.5", temJulgamento ? "bg-[#E3F1EA] text-[#1F7A5C]" : "bg-[#F5F2EA] text-[#A39D8C]")}>
              {temJulgamento ? <CheckCircle2 className="h-3.5 w-3.5" /> : "1"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#262420]">Julgamento em 1ª Instância</p>
              {!temJulgamento && isGestor && (
                <div className="space-y-3 mt-2">
                  {!podeEmitirJulgamento && (
                    <p className="text-xs text-[#A39D8C]">Pode redigir desde já — a emissão só libera depois de relatório técnico e defesa (ou termo de informação) prontos.</p>
                  )}
                  <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-violet-900">Rascunho da decisão com IA</p>
                      <p className="text-[11px] text-violet-800/80 leading-snug mt-0.5">
                        Propõe fundamentação e dispositivo a partir dos autos. <strong>O julgamento é ato seu</strong> — a IA não arbitra valor de multa e deixa entre colchetes o que exige seu juízo.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isGerandoIa}
                      onClick={() => handleGerarComIa('julgamento')}
                      className="shrink-0 h-9 gap-1.5 border-violet-300 bg-white text-violet-700 hover:bg-violet-100 text-xs font-bold"
                    >
                      {isGerandoIa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Gerar rascunho
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#6B6659]">Fundamentação</Label>
                    <Textarea value={julgamentoFundamentacao} onChange={(e) => setJulgamentoFundamentacao(e.target.value)} rows={5} placeholder="Análise dos fatos, das provas e do enquadramento legal..." className="rounded-md border-[#E4DFD1] resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#6B6659]">Decisão</Label>
                    <Textarea value={julgamentoDecisao} onChange={(e) => setJulgamentoDecisao(e.target.value)} rows={3} placeholder="Procedência/improcedência e sanção aplicada..." className="rounded-md border-[#E4DFD1] resize-none" />
                  </div>
                  <Button onClick={handleEmitirJulgamento} disabled={!podeEmitirJulgamento || isEmitindoJulgamento} className="bg-[#0E4A44] hover:bg-[#0B3A35]">
                    {isEmitindoJulgamento ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Emitir Julgamento
                  </Button>
                </div>
              )}
              {!temJulgamento && !isGestor && (
                <p className="text-xs text-[#A39D8C] mt-1">Exclusivo do gestor.</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black mt-0.5", temTip ? "bg-[#E3F1EA] text-[#1F7A5C]" : "bg-[#F5F2EA] text-[#A39D8C]")}>
              {temTip ? <CheckCircle2 className="h-3.5 w-3.5" /> : "2"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[#262420]">Termo de Imposição de Penalidade (TIP)</p>
                <PasDica chave="tip" />
              </div>
              {!temTip && (
                temJulgamento && isGestor ? (
                  <Button onClick={handleEncaminharTip} disabled={isEncaminhandoTip} className="mt-2 bg-[#0E4A44] hover:bg-[#0B3A35]">
                    {isEncaminhandoTip ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Encaminhar TIP
                  </Button>
                ) : (
                  <p className="text-xs text-[#A39D8C] mt-1">Libera depois do julgamento acima.</p>
                )
              )}
            </div>
          </div>

          {temTip && isGestor && (
            <div className="pt-4 border-t border-[#F1EEE4]">
              <Button type="button" variant="outline" onClick={handleArquivarProcesso} disabled={isArquivando} className="rounded-md gap-1.5">
                {isArquivando ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Arquivar Processo
              </Button>
            </div>
          )}
        </div>
        )}

        {/* O ARQUIVO VEM DEPOIS DA AÇÃO.

            Antes os autos abriam a tela: quem entrava para dar o próximo passo
            rolava a lista inteira de peças até achar o que fazer — e a lista só
            cresce com o processo. A ordem agora segue o uso: em que fase está,
            o que fazer agora, o julgamento, e por último o que já foi lavrado,
            que é consulta, não ação. */}
        {/* Linha do tempo das peças */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Autos do processo</h2>
            {/* UMA ação à vista, o resto atrás de um menu.

                Eram até seis botões iguais em fileira — "Processo Completo"
                tinha o mesmo peso visual de "Etapa 2", e a linha virava uma
                parede de retângulos idênticos. Baixar o processo completo é o
                que se faz quase sempre; baixar uma etapa isolada é exceção.

                A "Etiqueta de Capa" saiu da linha de frente: é a folha para
                colar na pasta FÍSICA, e este módulo existe para a tramitação
                ser online. Segue no menu, para quem ainda monta a pasta. */}
            <div className="flex items-center gap-2">
              {isBaixandoPdf && progressoPdf && (
                <span className="text-[11px] text-[#6B6659] tabular-nums">folha {progressoPdf}</span>
              )}
              {/* Sempre disponível, em qualquer fase — não só na Instrução.
                  Um fato novo pode surgir a qualquer momento do processo
                  (uma liminar da Justiça, o levantamento de uma interdição,
                  um ofício recebido no Julgamento ou na fase Recursal) e os
                  autos precisam poder registrar isso sem esperar o processo
                  "voltar" pra Instrução. */}
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDocComplementarOpen(true)} className="h-9 rounded-lg gap-1.5 text-xs">
                <Paperclip className="h-3.5 w-3.5" /> Adicionar documento
              </Button>
              {pecas.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleBaixarProcessoCompleto}
                  disabled={isBaixandoPdf}
                  className="h-9 rounded-lg gap-2 text-xs font-bold bg-[#0E4A44] hover:bg-[#0B3A35]"
                >
                  {isBaixandoPdf && nomeArquivoBaixar === "Processo Completo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Baixar processo
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-9 w-9 rounded-lg p-0 shrink-0" title="Outros downloads">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {etapasParaDownload.map((etapa) => (
                    <DropdownMenuItem key={etapa.key} disabled={isBaixandoPdf} onClick={() => iniciarDownload(etapa.pecas, etapa.label)} className="gap-2 text-xs">
                      <FileDown className="h-4 w-4 shrink-0 text-[#A39D8C]" /> {etapa.label}
                    </DropdownMenuItem>
                  ))}
                  {etapasParaDownload.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem disabled={isBaixandoCapa} onClick={handleBaixarEtiquetaCapa} className="gap-2 text-xs">
                    {isBaixandoCapa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4 shrink-0 text-[#A39D8C]" />}
                    Etiqueta de capa (pasta física)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {pecas.length === 0 ? (
            <p className="text-sm text-[#A39D8C] px-1">Nenhuma peça ainda.</p>
          ) : (
            /* AS PEÇAS AGRUPADAS PELA ETAPA EM QUE NASCERAM.

               Era uma lista corrida: vinte peças numeradas em sequência, sem
               dizer onde a Instauração termina e a Instrução começa. Num
               processo com defesa, juntadas e retificações, achar "a peça do
               julgamento" exigia ler os títulos um por um.

               O agrupamento é o mesmo do download por etapa (etapasParaDownload),
               e é posicional de propósito: as peças não guardam a fase em que
               foram lavradas, e agrupar por TIPO misturaria etapas — um Termo de
               Juntada existe tanto na Instrução quanto no Julgamento. */
            <div className="space-y-4">
              {etapasParaDownload.map((etapa) => {
                const cor = CORES_ETAPA[etapa.key] || CORES_ETAPA.posTip;
                return (
                <div key={etapa.key} className="rounded-lg border border-[#E4DFD1] bg-white overflow-hidden">
                  <div className={cn("flex items-center justify-between gap-2 px-4 py-2", cor.fundo)}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn("h-3 w-1 rounded-full shrink-0", cor.barra)} />
                      <h3 className={cn("text-[11px] font-black uppercase tracking-widest truncate", cor.texto)}>{cor.rotulo}</h3>
                      <span className="text-[10px] font-bold tabular-nums text-[#A39D8C] shrink-0">{etapa.pecas.length}</span>
                    </div>
                    <button
                      type="button"
                      disabled={isBaixandoPdf}
                      onClick={() => iniciarDownload(etapa.pecas, etapa.label)}
                      title={`Baixar as peças de ${cor.rotulo}`}
                      className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-[#6B6659] hover:bg-white/70 transition-colors disabled:opacity-40"
                    >
                      <FileDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="divide-y divide-[#F1EEE4]">
              {etapa.pecas.map((peca) => {
                // A original nunca é alterada — só marcada visualmente com a
                // peça de retificação que a corrigiu (ver handleRetificarPeca).
                const retificadaPor = pecas.find(p => p.refPecaId === peca.id);
                return (
                <details key={peca.id} className="group">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                    <span className="h-6 w-6 rounded-full bg-[#F5F2EA] text-[#6B6659] text-[11px] font-black flex items-center justify-center shrink-0">{peca.numero}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#262420] truncate">{peca.titulo}</p>
                        {retificadaPor && (
                          <Badge variant="outline" className="text-[9px] font-medium h-[18px] px-1.5 border-none bg-amber-50 text-amber-700 shrink-0">
                            Retificada pela peça nº {retificadaPor.numero}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-[#A39D8C]">{peca.criadoPorNome} — {format(new Date(peca.criadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                    {/* Visualizar, baixar e excluir na própria linha da peça:
                        conferir uma folha não pode exigir baixar o processo
                        inteiro. O acordeão continua abrindo o texto cru; este
                        botão mostra o DOCUMENTO, como ele foi lavrado. */}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPecaEmLeitura(peca); }}
                      title="Visualizar esta peça como documento"
                      className="h-10 w-10 rounded-lg flex items-center justify-center border border-[#E4DFD1] bg-white text-[#6B6659] hover:bg-[#F5F2EA] hover:border-[#0E4A44]/30 transition-colors shrink-0"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBaixarPeca(peca); }}
                      disabled={isBaixandoPdf}
                      title="Baixar PDF desta peça"
                      className="h-10 w-10 rounded-lg flex items-center justify-center border border-[#E4DFD1] bg-white text-[#0E4A44] hover:bg-[#E4EEEC] hover:border-[#0E4A44]/40 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {isBaixandoPdf && pecasParaBaixar?.length === 1 && pecasParaBaixar[0].id === peca.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
                    </button>
                    {podeExcluirPeca && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPecaParaExcluir(peca); }}
                        title="Excluir esta peça dos autos"
                        className="h-10 w-10 rounded-lg flex items-center justify-center border border-[#E4DFD1] bg-white text-rose-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors shrink-0"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                    <ChevronDown className="h-4 w-4 text-[#C4BEAC] shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 space-y-2">
                    <div className="text-sm text-[#3F3B33] leading-relaxed pl-9" dangerouslySetInnerHTML={{ __html: peca.conteudoHtml }} />
                    {peca.refPecaNumero && (
                      <p className="text-xs text-[#A39D8C] pl-9">Retifica a peça nº {peca.refPecaNumero}.</p>
                    )}
                    <div className="flex items-center gap-3 pl-9 pt-1">
                      {peca.anexoUrl && (
                        <a href={peca.anexoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0E4A44] hover:underline">
                          <Download className="h-3.5 w-3.5" /> Baixar anexo
                        </a>
                      )}
                      {!retificadaPor && (
                        <button
                          type="button"
                          onClick={() => handleRetificarPeca(peca)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9C7A3C] hover:underline"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Retificar
                        </button>
                      )}
                    </div>
                  </div>
                </details>
                );
              })}
                  </div>
                </div>
                );
              })}
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

      <PasPecaVisualizarDialog
        peca={pecaEmLeitura}
        onFechar={() => setPecaEmLeitura(null)}
        onBaixar={(peca) => { setPecaEmLeitura(null); handleBaixarPeca(peca); }}
        baixando={isBaixandoPdf}
        config={config}
        numeroProcesso={pas.numeroProcesso}
        autuado={pas.estabelecimento.fantasia}
        cnpj={pas.estabelecimento.cnpj}
        nomeMunicipioExibicao={nomeMunicipioExibicao}
      />

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
            <DialogTitle className="font-serif">Adicionar documento</DialogTitle>
            <DialogDescription>Pra qualquer fato novo que não se encaixa nas peças padrão do rito — um laudo, ofício recebido, liminar da Justiça, levantamento de interdição, foto extra — em qualquer fase do processo. Entra nos autos como um Termo de Juntada avulso, sem mudar a fase atual.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-[#6B6659]">O que é este documento?</Label>
              <Textarea value={docComplementarDescricao} onChange={(e) => setDocComplementarDescricao(e.target.value)} rows={3} placeholder="Ex.: Decisão judicial concedendo liminar para levantamento da interdição" className="rounded-md border-[#E4DFD1] resize-none" />
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

      <AlertDialog open={!!pecaParaExcluir} onOpenChange={(aberto) => { if (!aberto && !isExcluindoPeca) setPecaParaExcluir(null); }}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tighter text-xl italic">Excluir a peça nº {pecaParaExcluir?.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pecaParaExcluir?.titulo} — juntada por {pecaParaExcluir?.criadoPorNome}.
              {' '}Use isso só para documento errado ou duplicado: a peça é apagada de vez (não é lixeira) e as seguintes são renumeradas.
              {pecaParaExcluir?.anexoUrl ? ' O arquivo anexado deixa de aparecer nos autos e no PDF.' : ''}
              {' '}{pecaParaExcluir && PAS_FASE_APOS_PECA[pecaParaExcluir.tipo]
                ? 'Se esta era a peça que abriu a etapa atual, a etapa volta sozinha para a anterior, liberando os botões pra redigir de novo.'
                : 'Se esta peça era a que abriu a fase atual, use "Voltar etapa" (no card de ações) pra destravar as ações da fase anterior.'}
              {' '}Para corrigir o conteúdo de uma peça válida, use o Termo de Retificação, que preserva a original.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExcluindoPeca} className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleExcluirPeca(); }}
              disabled={isExcluindoPeca}
              className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700"
            >
              {isExcluindoPeca ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modelo de impressão — sempre montado, fora da tela, reaproveitando o
          cabeçalho/rodapé institucional (Identidade Municipal). Aceita 1 peça
          (download avulso) ou várias (processo completo/etapa). Cada
          `data-pdf-doc` é um documento dos autos e sempre começa numa folha
          nova: capa, depois o 1º despacho, e assim por diante — o
          renderPasIntoPdf quebra o conteúdo de cada documento em folhas A4 e
          numera tudo de forma contínua a partir da capa. */}
      <div style={{ position: 'fixed', left: -99999, top: 0 }} aria-hidden="true">
        <div ref={printRef} className="document-paper h-auto bg-white">
          {/* Identificação do processo (nº/autuado) entrou aqui dentro do
              timbre — que é capturado uma vez só e estampado em TODA folha do
              PDF (ver renderPasIntoPdf) — em vez de ser um `data-pdf-block`
              repetido no início de cada peça. Era subdivisão redundante: só
              aparecia na 1ª folha de cada peça (nunca nas de continuação),
              consumia espaço do orçamento de paginação de toda peça curta, e
              já é a mesma autuação/estabelecimento do início ao fim do
              processo. Mesmo tratamento já usado na autuação e no roteiro. */}
          <div data-pdf-header className="mb-1 pb-2 border-none" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
            <div className="flex flex-row items-center justify-between gap-6">
              <PasTimbreOficial
                logoUrl={config.logoUrl}
                headerRichText={config.headerRichText}
                secretaria={config.secretaria}
                departamento={config.departamento}
                nomeMunicipioExibicao={nomeMunicipioExibicao}
                tamanho="pdf"
              />
            </div>
            <div className="text-[9pt] mt-2 pt-2 border-t border-zinc-200">
              <p><strong>Processo Administrativo Sanitário nº:</strong> {pas.numeroProcesso}</p>
              <p><strong>Autuado:</strong> {pas.estabelecimento.fantasia}{pas.estabelecimento.cnpj ? ` — CNPJ: ${pas.estabelecimento.cnpj}` : ''}</p>
            </div>
          </div>

          {/* Capa — só entra no PDF de etapa/processo completo (download
              avulso de uma peça não precisa dela). Mesmo conteúdo da
              Etiqueta de Capa avulsa, mas já dentro do próprio arquivo,
              pronta pra imprimir junto — era exatamente o que faltava:
              baixar a etapa já vinha com todos os documentos em ordem, só
              não vinha com a capa junto. */}
          {incluirCapaNoDownload && pecasParaBaixar && pecasParaBaixar.length > 0 && (
            <div data-pdf-doc>
              <div data-pdf-block className="text-center" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              <p className="text-[18pt] font-black uppercase tracking-tight mt-4">Processo Administrativo Sanitário</p>
              <p className="text-[14pt] font-bold mt-1">Nº {pas.numeroProcesso}</p>
              <p className="text-[11pt] uppercase mt-1 text-zinc-600">{nomeArquivoBaixar}</p>
              <table className="w-full max-w-[420px] mx-auto border-collapse mt-10 text-left text-[11pt]">
                <tbody>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Autuado:</td><td className="py-2 uppercase">{pas.estabelecimento.fantasia}</td></tr>
                  {pas.estabelecimento.cnpj && (<tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">CNPJ:</td><td className="py-2">{pas.estabelecimento.cnpj}</td></tr>)}
                  {pas.estabelecimento.endereco && (<tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Endereço:</td><td className="py-2">{pas.estabelecimento.endereco}</td></tr>)}
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Auto de Infração de origem:</td><td className="py-2">nº {pas.numeroProcesso}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Autuante:</td><td className="py-2 uppercase">{pas.autuanteNome}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Data de instauração:</td><td className="py-2">{format(new Date(pas.dataCienciaAI), "dd/MM/yyyy")}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Fase atual:</td><td className="py-2">{PAS_FASE_LABEL[pas.fase]}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Peças neste volume:</td><td className="py-2">{pecasParaBaixar[0].numero} a {pecasParaBaixar[pecasParaBaixar.length - 1].numero}</td></tr>
                </tbody>
              </table>
            </div>
            </div>
          )}

          {/* Uma peça = um documento = uma folha nova. O `data-pdf-anexo-url`
              faz o arquivo juntado (defesa escaneada, prova, peça assinada
              fora do sistema) entrar logo depois dela, no tamanho real. */}
          {pecasParaBaixar?.map((peca) => (
            <div
              key={peca.id}
              data-pdf-doc
              data-pdf-anexo-url={peca.anexoUrl || undefined}
              data-pdf-anexo-nome={peca.anexoUrl ? `${peca.numero}. ${peca.titulo}` : undefined}
            >
              <div data-pdf-block className="mb-4">
                <div className="sub-header-row text-center">{peca.numero}. {peca.titulo.toUpperCase()}</div>
              </div>

              {/* Só recuo lateral: quando o corpo é maior que uma folha, o
                  gerador o reparte repetindo esta mesma "casca" em cada
                  folha — com padding vertical isso viraria um espaço em
                  branco fantasma no meio do texto. */}
              <div
                data-pdf-block
                className="px-4"
                style={{ fontSize: '10pt', lineHeight: 1.6, textAlign: 'justify', fontWeight: 500, color: '#18181b', fontFamily: "'Times New Roman', Times, serif" }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(peca.conteudoHtml) }}
              />

              {/* O vão antes da assinatura já foi de 64px + 40px embaixo — isso
                  respondia por boa parte da folha em branco numa peça curta
                  (um termo de juntada tem três linhas) e fazia o bloco não
                  caber, migrando sozinho pra folha seguinte. O espaço entre a
                  data e a assinatura em si (space-y, abaixo) é outra medida —
                  aumentá-lo um pouco não reintroduz aquele problema porque a
                  paginação (renderPasIntoPdf) mede a altura real do bloco a
                  cada peça, não presume um tamanho fixo. */}
              <div data-pdf-block className="mt-10 mb-6 text-center space-y-7" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                <p className="text-[10pt]">{nomeMunicipioExibicao.toUpperCase()}, {format(new Date(peca.criadoEm), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.</p>
                {peca.assinaturaUrl && (
                  <img src={peca.assinaturaUrl} alt="Assinatura" className="h-16 mx-auto object-contain" />
                )}
                <div className="pt-1 mx-auto w-full max-w-[280px] border-t border-black">
                  <p className="font-bold uppercase text-[10pt] mt-1">{peca.criadoPorNome}</p>
                </div>
              </div>
            </div>
          ))}

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

      {/* Etiqueta de capa — folha de identificação avulsa (não é uma peça
          dos autos), pensada pra colar na pasta física do processo. Sempre
          cabe numa página só, sem precisar da lógica de paginação. */}
      <div style={{ position: 'fixed', left: -99999, top: 0 }} aria-hidden="true">
        <div ref={capaRef} className="document-paper h-auto bg-white">
          <div data-pdf-header className="flex flex-row items-center justify-between gap-6 mb-1 pb-2 border-none">
            <PasTimbreOficial
              logoUrl={config.logoUrl}
              headerRichText={config.headerRichText}
              secretaria={config.secretaria}
              departamento={config.departamento}
              nomeMunicipioExibicao={nomeMunicipioExibicao}
              tamanho="pdf"
              comTituloProcesso={false}
            />
          </div>

          <div data-pdf-block className="mt-10 text-center" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
            <p className="text-[20pt] font-black uppercase tracking-tight">Processo Administrativo Sanitário</p>
            <p className="text-[16pt] font-bold mt-2">Nº {pas?.numeroProcesso}</p>
          </div>

          {pas && (
            <div data-pdf-block className="mt-14 mx-auto max-w-[420px] text-[11pt]" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              <table className="w-full border-collapse">
                <tbody>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Autuado:</td><td className="py-2 uppercase">{pas.estabelecimento.fantasia}</td></tr>
                  {pas.estabelecimento.cnpj && (<tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">CNPJ:</td><td className="py-2">{pas.estabelecimento.cnpj}</td></tr>)}
                  {pas.estabelecimento.endereco && (<tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Endereço:</td><td className="py-2">{pas.estabelecimento.endereco}</td></tr>)}
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Auto de Infração de origem:</td><td className="py-2">nº {pas.numeroProcesso}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Autuante:</td><td className="py-2 uppercase">{pas.autuanteNome}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Data de instauração:</td><td className="py-2">{format(new Date(pas.dataCienciaAI), "dd/MM/yyyy")}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Fase atual:</td><td className="py-2">{PAS_FASE_LABEL[pas.fase]}</td></tr>
                  <tr><td className="py-2 pr-3 font-bold align-top whitespace-nowrap">Volume:</td><td className="py-2">1</td></tr>
                </tbody>
              </table>
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

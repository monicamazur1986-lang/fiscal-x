"use client"

import React, { useEffect, useState, useRef, Suspense } from "react"
import { useForm, useFieldArray, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Loader2,
  Trash2,
  Save,
  FileCheck2,
  FileText,
  Download,
  Share2,
  Lock,
  PackageX,
  Eye,
  Pencil,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useAppConfig } from "@/hooks/use-app-config"
import { useAuth } from "@/hooks/use-auth"
import { auth as firebaseAuth } from "@/lib/firebase"
import { intimacaoSchema, DEFAULT_PRAZO_TEXT, INTERDICAO_PRAZO_TEXT, APREENSAO_PRAZO_TEXT } from "@/lib/schema"
import { Intimacao, Autoridade } from "@/lib/types"
import { Label } from "@/components/ui/label"
import { SignaturePad } from "./signature-pad"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "./ui/alert-dialog"
import { DocumentoOficialBody, type IntimacaoFormValues, type SignatureTargetType } from "./documento-oficial-body"
import { renderDocumentIntoPdf, computePageGroups } from "@/lib/generate-intimacao-pdf"

const TIPOS_QUE_GERAM_AUTO_INFRACAO = ["TERMO DE APREENSÃO", "TERMO DE INTERDIÇÃO"];
// Muitos fiscais começam a autuação direto pelo Auto de Infração (em vez de
// partir de uma Interdição/Apreensão) — por isso ele também precisa oferecer
// o mesmo sistema de documento vinculado, só que na direção oposta: gera um
// Termo de Interdição OU de Apreensão, não outro Auto de Infração.
const TIPO_QUE_GERA_INTERDICAO_OU_APREENSAO = "AUTO DE INFRAÇÃO";

type SignatureTarget = { doc: 'main' | 'anexo', type: SignatureTargetType, index?: number };
type EditingFiscal = { doc: 'main' | 'anexo', index: number, data: Autoridade };

type LivePageBreak = { beforeIndex: number; pageNumber: number; totalPages: number };

// Altura estimada do LivePageHeader (documento-oficial-body.tsx) — contador
// de página + o mesmo brasão/identificação institucional compacta do topo +
// a linha de identificação do documento. Não dá pra medir de verdade porque
// ele só existe DEPOIS de decidirmos onde entra (ovo e galinha); documentado
// como aproximação — a paginação real do PDF (renderDocumentIntoPdf) mede o
// cabeçalho oculto de verdade, não depende desta constante.
const LIVE_HEADER_HEIGHT_PT = 135;
const PT_TO_MM = 25.4 / 72;

// Recalcula, para um documento específico, onde cairiam as quebras de página
// A4 (297mm) e devolve os pontos exatos (índice do bloco original em
// documento-oficial-body.tsx) onde um LivePageHeader deve entrar — usando a
// MESMA lógica de agrupamento por seção do PDF real (computePageGroups,
// generate-intimacao-pdf.tsx) em vez de uma estimativa cega por pixel.
function useLivePagination(containerRef: React.RefObject<HTMLDivElement>, headerRef: React.RefObject<HTMLElement>, fitToScreen: boolean, extraDeps: any[] = []) {
  const [livePageBreaks, setLivePageBreaks] = useState<LivePageBreak[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const A4_WIDTH_MM = 210;
    const A4_HEIGHT_MM = 297;

    const recalculate = () => {
      const sourceForm = el.querySelector('form') as HTMLElement | null;
      const bodyContainer = sourceForm?.querySelector('tbody > tr > td') as HTMLElement | null;
      const footer = sourceForm?.querySelector('footer') as HTMLElement | null;
      if (!bodyContainer) { setLivePageBreaks(prev => prev.length ? [] : prev); return; }

      const pxPerMm = el.offsetWidth / A4_WIDTH_MM;
      const pageHeightPx = A4_HEIGHT_MM * pxPerMm;
      const headerHeightPx = headerRef.current?.offsetHeight || 0;
      const footerHeightPx = footer?.offsetHeight || 0;
      const liveHeaderHeightPx = LIVE_HEADER_HEIGHT_PT * PT_TO_MM * pxPerMm;

      const firstPageWindowPx = Math.max(pageHeightPx - headerHeightPx - footerHeightPx, 1);
      const continuationWindowPx = Math.max(pageHeightPx - liveHeaderHeightPx - footerHeightPx, 1);

      // Exclui os LivePageHeader já inseridos numa rodada anterior — sem
      // isso, a medição contaria a própria decoração como conteúdo e
      // entraria em loop, deslocando a quebra a cada nova renderização.
      const bodyChildren = Array.from(bodyContainer.children).filter(
        (child) => !child.hasAttribute('data-live-page-header')
      ) as HTMLElement[];
      const groups = computePageGroups(bodyChildren, firstPageWindowPx, continuationWindowPx);

      const next: LivePageBreak[] = [];
      groups.forEach((group, idx) => {
        if (idx === 0) return;
        const sectionIndexAttr = group[0]?.getAttribute('data-section-index');
        const beforeIndex = sectionIndexAttr != null ? parseInt(sectionIndexAttr, 10) : NaN;
        if (!Number.isNaN(beforeIndex)) {
          next.push({ beforeIndex, pageNumber: idx + 1, totalPages: groups.length });
        }
      });

      setLivePageBreaks(prev => {
        const same = prev.length === next.length && prev.every((b, i) =>
          b.beforeIndex === next[i].beforeIndex && b.pageNumber === next[i].pageNumber && b.totalPages === next[i].totalPages
        );
        return same ? prev : next;
      });
    };

    recalculate();
    const observer = new ResizeObserver(recalculate);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToScreen, ...extraDeps]);

  return livePageBreaks;
}

function FormContent({ defaultValues, intimacaoId }: { defaultValues?: Partial<Intimacao>, intimacaoId?: string }) {
    const { generateNewNumeroProcesso, saveIntimacao, loading: loadingIntimacoes } = useIntimacoes();
    const { config } = useAppConfig();
    const { profile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const mainDocumentRef = useRef<HTMLDivElement>(null);
    const mainHeaderRef = useRef<HTMLElement>(null);
    const mainFormRef = useRef<HTMLFormElement>(null);
    const anexoDocumentRef = useRef<HTMLDivElement>(null);
    const anexoHeaderRef = useRef<HTMLElement>(null);
    const anexoFormRef = useRef<HTMLFormElement>(null);
    const anexoIdRef = useRef<string | undefined>(undefined);
    const isPersistingRef = useRef(false);
    // Guarda o id real do documento principal assim que o 1º salvamento (manual
    // ou automático) cria o registro na nuvem — sem isso, cada novo salvamento
    // em "Nova Autuação" criava um documento duplicado, já que a prop
    // `intimacaoId` nunca muda dentro da mesma sessão de edição.
    const mainIdRef = useRef<string | undefined>(intimacaoId);
    // Evita repetir a gravação de vínculo (documentoOrigemId) a cada autosave
    // depois que o Auto de Infração já foi ligado ao documento principal uma vez.
    // Se já estamos editando um documento existente, o id verdadeiro já é
    // conhecido desde o 1º salvamento do anexo — não precisa de um 2º patch.
    const anexoOrigemLinkedRef = useRef(!!intimacaoId);
    // Marca true assim que o fiscal editar o campo de prazo manualmente, para
    // parar de sobrescrevê-lo ao trocar o tipoTermo. Comparar o HTML atual contra
    // os textos-padrão é frágil (o contentEditable pode reformatar a marcação sem
    // o usuário ter mudado nada), então usamos um sinal explícito em vez disso.
    const prazoEditadoManualmenteRef = useRef(false);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDirtyRef = useRef(false);
    const cloudWarningShownRef = useRef(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isSharingPdf, setIsSharingPdf] = useState(false);
    // "Visualizar" — mostra o documento limpo, sem os controles de edição por
    // cima (mesmo truque já usado durante a geração do PDF: os campos viram
    // texto estático em vez de <input>/<Select>), sem precisar finalizar
    // (travar a edição de vez) só pra conferir como o termo vai ficar.
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [signatureTarget, setSignatureTarget] = useState<SignatureTarget | null>(null);
    const [editingFiscal, setEditingFiscal] = useState<EditingFiscal | null>(null);
    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [hasAnexo, setHasAnexo] = useState(false);
    const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

    const methods = useForm<IntimacaoFormValues>({
        resolver: zodResolver(intimacaoSchema),
        defaultValues: {
            ...defaultValues,
            status: defaultValues?.status || 'rascunho',
            tipoTermo: defaultValues?.tipoTermo || "TERMO DE INTIMAÇÃO",
            comarca: defaultValues?.comarca || config.municipioNome || "PRUDENTÓPOLIS",
            autoridades: defaultValues?.autoridades || [],
            teor: defaultValues?.teor || "",
            legislacaoBase: defaultValues?.legislacaoBase || "",
            recusouAssinar: defaultValues?.recusouAssinar || false,
            prazo: defaultValues?.prazo || DEFAULT_PRAZO_TEXT,
            dataIntimacao: defaultValues?.dataIntimacao || new Date(),
            dataRecebimento: defaultValues?.dataRecebimento ? new Date(defaultValues.dataRecebimento) : undefined,
            dataDocumento: defaultValues?.dataDocumento || format(new Date(), "dd/MM/yyyy"),
            horaDocumento: defaultValues?.horaDocumento || format(new Date(), "HH:mm"),
            reuCargo: defaultValues?.reuCargo || "",
            responsavelTecnico: defaultValues?.responsavelTecnico || "",
            responsavelTecnicoConselho: defaultValues?.responsavelTecnicoConselho || "",
            responsavelTecnicoIdentidade: defaultValues?.responsavelTecnicoIdentidade || "",
            dataRecebimentoTecnico: defaultValues?.dataRecebimentoTecnico ? new Date(defaultValues.dataRecebimentoTecnico) : undefined,
            testemunha1Nome: defaultValues?.testemunha1Nome || "",
            testemunha2Nome: defaultValues?.testemunha2Nome || "",
        },
    });

    const anexoMethods = useForm<IntimacaoFormValues>({
        resolver: zodResolver(intimacaoSchema),
        defaultValues: intimacaoSchema.parse({}),
    });

    const { control, handleSubmit, watch, setValue, getValues } = methods;
    const { fields, append, remove, update } = useFieldArray({ control, name: "autoridades" });
    const { fields: anexoFields, append: anexoAppend, remove: anexoRemove, update: anexoUpdate, replace: anexoReplaceAutoridades } = useFieldArray({ control: anexoMethods.control, name: "autoridades" });

    const isFinalized = watch("status") === 'finalizado';
    const anexoIsFinalized = anexoMethods.watch("status") === 'finalizado';
    const tipoTermoAtual = watch("tipoTermo");
    const recusouAssinar = watch("recusouAssinar");
    const signatureResponsavel = watch("signatureResponsavel");
    const dataRecebimento = watch("dataRecebimento");

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Encolhe o documento A4 (794px) automaticamente quando não cabe na
    // largura disponível (telas estreitas) — sem controle manual: numa tela
    // larga o zoom já fica travado em 100% de qualquer forma (nunca precisa
    // encolher além do tamanho real), então uma opção pra "forçar o ajuste"
    // não tinha efeito prático nenhum ali, só confundia.
    const fitToScreen = windowWidth - 32 < 794;

    const livePageBreaksMain = useLivePagination(mainDocumentRef, mainHeaderRef, fitToScreen);
    const livePageBreaksAnexo = useLivePagination(anexoDocumentRef, anexoHeaderRef, fitToScreen, [hasAnexo]);

    useEffect(() => {
        if (profile && !getValues('numeroProcesso') && !loadingIntimacoes) {
            generateNewNumeroProcesso().then(num => {
                setValue('numeroProcesso', num);
            });
        }
    }, [profile, loadingIntimacoes, getValues, setValue, generateNewNumeroProcesso]);

    // Interdição não abre prazo de defesa (é uma determinação); Apreensão remete
    // o prazo de defesa ao Auto de Infração anexo. Só troca o texto se o fiscal
    // ainda não tiver editado esse campo manualmente.
    const handleTipoTermoChange = (value: string) => {
        if (prazoEditadoManualmenteRef.current) return;
        if (value === 'TERMO DE INTERDIÇÃO') setValue('prazo', INTERDICAO_PRAZO_TEXT);
        else if (value === 'TERMO DE APREENSÃO') setValue('prazo', APREENSAO_PRAZO_TEXT);
        else setValue('prazo', DEFAULT_PRAZO_TEXT);
    };

    // Gera o documento vinculado (anexo) com os dados do estabelecimento,
    // autoridades e fundamentação já preenchidos no principal. O tipo do
    // anexo depende de quem está chamando: Interdição/Apreensão sempre geram
    // um Auto de Infração; o próprio Auto de Infração gera Interdição ou
    // Apreensão (o fiscal escolhe qual, ver botões no card abaixo).
    const handleGerarAnexo = async (tipoAnexo: string) => {
        const novoNumero = await generateNewNumeroProcesso();
        const main = getValues();
        const base = intimacaoSchema.parse({});
        const prazoAnexo = tipoAnexo === 'TERMO DE INTERDIÇÃO' ? INTERDICAO_PRAZO_TEXT
            : tipoAnexo === 'TERMO DE APREENSÃO' ? APREENSAO_PRAZO_TEXT
            : DEFAULT_PRAZO_TEXT;
        anexoMethods.reset({
            ...base,
            tipoTermo: tipoAnexo,
            numeroProcesso: novoNumero,
            prazo: prazoAnexo,
            comarca: main.comarca,
            autor: main.autor,
            cnpj: main.cnpj,
            endereco: main.endereco,
            bairro: main.bairro,
            reu: main.reu,
            reuCargo: main.reuCargo,
            responsavelLegalIdentidade: main.responsavelLegalIdentidade,
            responsavelTecnico: main.responsavelTecnico,
            responsavelTecnicoConselho: main.responsavelTecnicoConselho,
            responsavelTecnicoIdentidade: main.responsavelTecnicoIdentidade,
            telefone: main.telefone,
            cnae: main.cnae,
            municipioId: main.municipioId,
            dataDocumento: main.dataDocumento,
            horaDocumento: main.horaDocumento,
            teor: main.teor,
            legislacaoBase: main.legislacaoBase,
        });
        // Usa o replace() do próprio useFieldArray (em vez de incluir "autoridades"
        // no reset()) para o RHF gerar corretamente os ids internos de cada linha —
        // passar o array direto pelo reset() deixa esses ids fora de sincronia e
        // quebra o "key" de cada item na lista.
        anexoReplaceAutoridades(main.autoridades.map(a => ({ ...a, signature: '' })));
        anexoIdRef.current = undefined;
        setHasAnexo(true);
    };

    const handleRemoverAnexo = () => {
        setHasAnexo(false);
        anexoIdRef.current = undefined;
    };

    const handleSignatureSave = (base64: string) => {
        if (!signatureTarget) return;
        const m = signatureTarget.doc === 'main' ? methods : anexoMethods;
        if (signatureTarget.type === 'fiscal' && signatureTarget.index !== undefined) {
            const current = m.getValues('autoridades');
            current[signatureTarget.index].signature = base64;
            m.setValue('autoridades', [...current]);
        } else if (signatureTarget.type === 'responsavel') {
            m.setValue('signatureResponsavel', base64);
            m.setValue('dataRecebimento', new Date());
        } else if (signatureTarget.type === 'responsavelTecnico') {
            m.setValue('signatureResponsavelTecnico', base64);
            m.setValue('dataRecebimentoTecnico', new Date());
        } else if (signatureTarget.type === 'testemunha1') {
            m.setValue('signatureTestemunha1', base64);
        } else if (signatureTarget.type === 'testemunha2') {
            m.setValue('signatureTestemunha2', base64);
        }
        setSignatureTarget(null);
    };

    // Persiste o documento principal e, se houver, o Auto de Infração vinculado,
    // cruzando os ids dos dois (documentoOrigemId / autoInfracaoVinculadaId).
    // Usa mainIdRef (não a prop intimacaoId, fixa durante toda a sessão) para
    // que o 2º, 3º... salvamento sempre atualize o MESMO documento em vez de
    // criar duplicatas — essencial tanto para os cliques manuais quanto para
    // o autosave silencioso.
    const persistWithAnexo = async (status: 'rascunho' | 'finalizado') => {
        let anexoId = anexoIdRef.current;

        if (hasAnexo) {
            const anexoData = anexoMethods.getValues();
            const savedAnexo = await saveIntimacao({ ...anexoData, status, documentoOrigemId: mainIdRef.current || '' }, anexoId);
            anexoId = savedAnexo.id;
            anexoIdRef.current = anexoId;
        }

        const mainData = getValues();
        const savedMain = await saveIntimacao({ ...mainData, status, autoInfracaoVinculadaId: hasAnexo ? (anexoId || '') : '' }, mainIdRef.current);
        mainIdRef.current = savedMain.id;

        if (hasAnexo && anexoId && !anexoOrigemLinkedRef.current) {
            await saveIntimacao({ ...anexoMethods.getValues(), status, documentoOrigemId: savedMain.id }, anexoId);
            anexoOrigemLinkedRef.current = true;
        }

        return { mainId: savedMain.id, anexoId, mainCloudSaved: savedMain.cloudSaved as boolean };
    };

    // Autosave: alguns segundos depois que o fiscal para de digitar, salva
    // sozinho e em silêncio (sem toast de sucesso a cada letra) — para não
    // perder o relato em caso de imprevisto (queda de energia, aba fechada
    // sem querer, etc.) e para o rascunho já existir na nuvem antes mesmo de
    // um clique manual em "Salvar", garantindo o resgate por login.
    useEffect(() => {
        if (isFinalized) return;

        const subscription = methods.watch(() => {
            isDirtyRef.current = true;
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = setTimeout(async () => {
                if (isPersistingRef.current) return;
                const hasContent = !!(getValues('autor')?.trim() || getValues('teor')?.trim() || getValues('reu')?.trim());
                if (!hasContent) return;

                isPersistingRef.current = true;
                try {
                    const result = await persistWithAnexo('rascunho');
                    isDirtyRef.current = false;
                    setLastAutoSavedAt(new Date());
                    if (!result.mainCloudSaved && !cloudWarningShownRef.current) {
                        cloudWarningShownRef.current = true;
                        toast({ variant: "destructive", title: "Sem conexão com a nuvem", description: "O rascunho está sendo salvo só neste aparelho. Conecte à internet assim que possível para não correr o risco de perder o que já foi digitado." });
                    }
                } catch (e) {
                    // Silencioso de propósito: um erro de autosave não deve interromper a digitação.
                } finally {
                    isPersistingRef.current = false;
                }
            }, 4000);
        });

        return () => {
            subscription.unsubscribe();
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFinalized]);

    // Avisa o navegador para confirmar antes de fechar/recarregar a aba se
    // houver alteração ainda não salva (rede da autosave nem sempre alcança
    // os últimos segundos de digitação antes de um fechamento repentino).
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirtyRef.current && !isFinalized) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isFinalized]);

    const handleSaveDraft = async () => {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        if (isPersistingRef.current) return;
        isPersistingRef.current = true;
        setIsSavingDraft(true);
        try {
            const result = await persistWithAnexo('rascunho');
            isDirtyRef.current = false;
            setLastAutoSavedAt(new Date());
            if (result.mainCloudSaved) {
                toast({ title: "Rascunho Salvo" });
            } else {
                toast({ variant: "destructive", title: "Salvo só neste aparelho", description: "Sem conexão com a nuvem no momento — vai sincronizar assim que a internet voltar. Não feche este aparelho sem confirmar a sincronização." });
            }
        } catch (e) {
            toast({ variant: "destructive", title: "Erro ao Salvar" });
        } finally {
            setIsSavingDraft(false);
            isPersistingRef.current = false;
        }
    };

    const handleFinalize = async () => {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        if (isPersistingRef.current) return;
        isPersistingRef.current = true;
        setIsSaving(true);
        try {
            const result = await persistWithAnexo('finalizado');
            isDirtyRef.current = false;
            setValue('status', 'finalizado');
            if (hasAnexo) anexoMethods.setValue('status', 'finalizado');
            if (result.mainCloudSaved) {
                toast({ title: "Documento Finalizado", description: "Use \"Baixar PDF\" ou \"Compartilhar\" para exportar o documento." });
            } else {
                toast({ variant: "destructive", title: "Finalizado só neste aparelho", description: "Sem conexão com a nuvem — assim que a internet voltar, abra este documento de novo para confirmar a sincronização." });
            }
        } catch (e) {
            toast({ variant: "destructive", title: "Falha na Finalização" });
        } finally {
            setIsSaving(false);
            isPersistingRef.current = false;
        }
    };

    // Gera o PDF página a página, repetindo o cabeçalho em cada uma (em vez de
    // cortar um único screenshot longo em pedaços de altura fixa). Quando há um
    // Auto de Infração vinculado, suas páginas são anexadas ao MESMO PDF, sem
    // chamar pdf.save() entre os dois documentos. Usado tanto por "Baixar PDF"
    // quanto por "Compartilhar" — cada um decide o que fazer com o PDF pronto.
    const buildPdf = async (): Promise<{ pdf: any; filename: string } | null> => {
      if (!mainDocumentRef.current) return null;
      setIsGeneratingPdf(true);
      // Dá tempo do React remover os controles de edição (botões, linhas de quebra)
      // antes de clonarmos o DOM para captura.
      await new Promise(resolve => setTimeout(resolve, 50));

      let stagingEl: HTMLDivElement | null = null;

      try {
        const { jsPDF } = await import("jspdf");

        stagingEl = document.createElement('div');
        stagingEl.style.position = 'fixed';
        stagingEl.style.left = '-99999px';
        stagingEl.style.top = '0';
        document.body.appendChild(stagingEl);

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfState = { isFirstPage: true };

        await renderDocumentIntoPdf(pdf, mainDocumentRef.current, stagingEl, pdfState);
        if (hasAnexo && anexoDocumentRef.current) {
          await renderDocumentIntoPdf(pdf, anexoDocumentRef.current, stagingEl, pdfState);
        }

        const tipo = getValues('tipoTermo');
        const numero = getValues('numeroProcesso');
        const filename = hasAnexo
          ? `${tipo} + ${anexoMethods.getValues('tipoTermo')} - ${numero}.pdf`
          : `${tipo} - ${numero}.pdf`;
        return { pdf, filename };
      } catch (e) {
          toast({ variant: "destructive", title: "Erro na geração do PDF." });
          return null;
      } finally {
          if (stagingEl) document.body.removeChild(stagingEl);
          setIsGeneratingPdf(false);
      }
    };

    const handleDownloadPdf = async () => {
      const result = await buildPdf();
      if (!result) return;
      result.pdf.save(result.filename);
    };

    // Compartilhamento direto (WhatsApp, e-mail, etc.) só é possível de verdade
    // com o arquivo anexado via Web Share API — links tipo wa.me/mailto: só
    // pré-preenchem texto, nunca conseguem anexar um PDF. Onde o navegador não
    // suportar (comum em desktop), cai pro download normal com um aviso.
    const handleSharePdf = async () => {
      setIsSharingPdf(true);
      try {
        const result = await buildPdf();
        if (!result) return;
        const blob = result.pdf.output('blob') as Blob;
        const file = new File([blob], result.filename, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: result.filename });
            return;
          } catch (e: any) {
            if (e?.name === 'AbortError') return; // Usuário cancelou a folha de compartilhamento.
          }
        }

        result.pdf.save(result.filename);
        toast({ title: "PDF baixado", description: "Seu navegador não suporta compartilhamento direto de arquivo — anexe o PDF baixado manualmente." });
      } finally {
        setIsSharingPdf(false);
      }
    };

    const handleCnpjLookup = async () => {
        const cnpj = getValues("cnpj")?.replace(/\D/g, "");
        if (cnpj?.length !== 14) return;
        setIsSearchingCnpj(true);
        try {
            const idToken = await firebaseAuth?.currentUser?.getIdToken();
            const res = await fetch(`/api/cnpj/${cnpj}`, {
                headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
            });
            if (res.ok) {
                const data = await res.json();
                setValue("autor", data.razao_social);
                setValue("endereco", `${data.logradouro}, ${data.numero}`);
                setValue("bairro", data.bairro);
                setValue("reu", data.responsavel_legal);
                setValue("telefone", data.telefone || "");
                setValue("cnae", data.cnae || "");
            } else {
                const errData = await res.json().catch(() => null);
                toast({ variant: "destructive", title: "CNPJ não localizado", description: errData?.message });
            }
        } catch (err) {
            toast({ variant: "destructive", title: "Erro ao consultar CNPJ", description: "Verifique sua conexão e tente novamente." });
        } finally { setIsSearchingCnpj(false); }
    };

    const scaleFactor = fitToScreen ? Math.min((windowWidth - 32) / 794, 1) : 1;
    const paperStyle = fitToScreen ? { transform: `scale(${scaleFactor})`, margin: '0 auto', transformOrigin: 'top center' } : {};
    // Preview e geração de PDF usam o mesmo truque de renderização (campos
    // viram texto estático, controles de edição somem) — ver isReadOnlyRender.
    const isReadOnlyRender = isGeneratingPdf || isPreviewMode;
    const mostraCardAutoInfracao = !isReadOnlyRender && (hasAnexo || TIPOS_QUE_GERAM_AUTO_INFRACAO.includes(tipoTermoAtual) || tipoTermoAtual === TIPO_QUE_GERA_INTERDICAO_OU_APREENSAO);
    const tipoAnexoAtual = anexoMethods.watch('tipoTermo');

    return (
        <FormProvider {...methods}>
            <div className="document-container font-serif pb-60">
                <div className="document-paper-wrapper custom-scrollbar">
                    <div
                      ref={mainDocumentRef}
                      className="document-paper h-auto bg-white transition-transform duration-300"
                      style={paperStyle}
                    >
                        <DocumentoOficialBody
                            control={control}
                            watch={watch}
                            setValue={setValue}
                            getValues={getValues}
                            fields={fields}
                            onAppendAutoridade={(a) => append({ ...a, municipioId: a.municipioId || '', signature: a.signature || '' })}
                            onRemoveAutoridade={(i) => remove(i)}
                            onEditAutoridade={(i, data) => setEditingFiscal({ doc: 'main', index: i, data })}
                            isFinalized={isFinalized}
                            isGeneratingPdf={isReadOnlyRender}
                            config={config}
                            formRef={mainFormRef}
                            headerRef={mainHeaderRef}
                            onRequestSignature={(target) => setSignatureTarget({ doc: 'main', ...target })}
                            onTipoTermoChange={handleTipoTermoChange}
                            onPrazoChange={() => { prazoEditadoManualmenteRef.current = true; }}
                            onCnpjLookup={handleCnpjLookup}
                            isSearchingCnpj={isSearchingCnpj}
                            livePageBreaks={livePageBreaksMain}
                        />
                    </div>

                    {mostraCardAutoInfracao && (
                        <div className="no-print max-w-[210mm] mx-auto my-8 p-6 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                            {!hasAnexo ? (
                                tipoTermoAtual === TIPO_QUE_GERA_INTERDICAO_OU_APREENSAO ? (
                                    <>
                                        <div>
                                            <p className="font-serif text-base text-primary">Termo Vinculado</p>
                                            <p className="text-xs text-[#6B6659] mt-1">Gera uma Interdição ou Apreensão com os mesmos dados do estabelecimento, autoridades e fundamentação, para assinatura própria e exportação em um único PDF.</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                            <Button type="button" onClick={() => handleGerarAnexo('TERMO DE INTERDIÇÃO')} disabled={isFinalized} className="rounded-xl font-black uppercase text-xs tracking-widest gap-2 h-12 px-5 bg-primary text-white">
                                                <Lock className="h-4 w-4" /> Gerar Interdição
                                            </Button>
                                            <Button type="button" onClick={() => handleGerarAnexo('TERMO DE APREENSÃO')} disabled={isFinalized} className="rounded-xl font-black uppercase text-xs tracking-widest gap-2 h-12 px-5 bg-primary text-white">
                                                <PackageX className="h-4 w-4" /> Gerar Apreensão
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <p className="font-serif text-base text-primary">Auto de Infração Vinculado</p>
                                            <p className="text-xs text-[#6B6659] mt-1">Gera um Auto de Infração com os mesmos dados do estabelecimento, autoridades e fundamentação, para assinatura própria e exportação em um único PDF.</p>
                                        </div>
                                        <Button type="button" onClick={() => handleGerarAnexo('AUTO DE INFRAÇÃO')} disabled={isFinalized} className="rounded-xl font-black uppercase text-xs tracking-widest gap-2 h-12 px-6 bg-primary text-white shrink-0">
                                            <FileText className="h-4 w-4" /> Gerar Auto de Infração Vinculado
                                        </Button>
                                    </>
                                )
                            ) : (
                                <>
                                    <p className="font-serif text-base text-primary">{tipoAnexoAtual} Vinculado Nº {anexoMethods.watch('numeroProcesso')}</p>
                                    {!anexoIsFinalized && !isFinalized && (
                                        <Button type="button" variant="outline" onClick={handleRemoverAnexo} className="rounded-xl font-black uppercase text-xs tracking-widest gap-2 h-10 px-4 text-rose-600 border-rose-300 shrink-0">
                                            <Trash2 className="h-4 w-4" /> Remover
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {hasAnexo && (
                        <FormProvider {...anexoMethods}>
                            <div
                              ref={anexoDocumentRef}
                              className="document-paper h-auto bg-white transition-transform duration-300"
                              style={paperStyle}
                            >
                                <DocumentoOficialBody
                                    control={anexoMethods.control}
                                    watch={anexoMethods.watch}
                                    setValue={anexoMethods.setValue}
                                    getValues={anexoMethods.getValues}
                                    fields={anexoFields}
                                    onAppendAutoridade={(a) => anexoAppend({ ...a, municipioId: a.municipioId || '', signature: a.signature || '' })}
                                    onRemoveAutoridade={(i) => anexoRemove(i)}
                                    onEditAutoridade={(i, data) => setEditingFiscal({ doc: 'anexo', index: i, data })}
                                    isFinalized={anexoIsFinalized}
                                    isGeneratingPdf={isReadOnlyRender}
                                    config={config}
                                    formRef={anexoFormRef}
                                    headerRef={anexoHeaderRef}
                                    onRequestSignature={(target) => setSignatureTarget({ doc: 'anexo', ...target })}
                                    showCnpjLookup={false}
                                    livePageBreaks={livePageBreaksAnexo}
                                />
                            </div>
                        </FormProvider>
                    )}
                </div>

                {!isFinalized ? (
                    <div className="fixed bottom-3 right-3 z-[100] no-print flex items-center gap-2">
                        {!isPreviewMode && lastAutoSavedAt && (
                            <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest text-[#6B6659] bg-white/90 px-3 py-1.5 rounded-full border border-[#E4DFD1] shadow-sm">
                                Salvo automaticamente às {format(lastAutoSavedAt, "HH:mm")}
                            </span>
                        )}
                        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-xl border border-[#E4DFD1] rounded-2xl shadow-lg p-2">
                            {isPreviewMode ? (
                                <Button type="button" onClick={() => setIsPreviewMode(false)} size="sm" className="h-10 px-4 bg-primary hover:bg-primary/90 text-white gap-2 rounded-xl font-black uppercase text-[10px] tracking-widest">
                                    <Pencil className="h-4 w-4" /> Voltar a Editar
                                </Button>
                            ) : (
                                <>
                                    <Button type="button" onClick={() => setIsPreviewMode(true)} variant="outline" size="icon" title="Visualizar" className="h-10 w-10 rounded-xl border-[#E4DFD1] text-[#6B6659]">
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button type="button" onClick={() => handleSaveDraft()} disabled={isSavingDraft || isSaving} variant="outline" size="sm" className="h-10 px-4 rounded-xl border-[#E4DFD1] text-[#6B6659] font-black uppercase text-[10px] tracking-widest gap-2">
                                        {isSavingDraft ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />} Salvar Rascunho
                                    </Button>
                                    <Button type="button" onClick={() => setShowFinalizeConfirm(true)} disabled={isSaving || isSavingDraft} size="sm" className="h-10 px-4 bg-primary hover:bg-primary/90 text-white gap-2 rounded-xl font-black uppercase text-[10px] tracking-widest">
                                        {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />} Finalizar
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="fixed bottom-3 right-3 z-[100] no-print flex items-center gap-2 bg-white/95 backdrop-blur-xl border border-[#E4DFD1] rounded-2xl shadow-lg p-2">
                        <Button type="button" onClick={handleDownloadPdf} disabled={isGeneratingPdf || isSharingPdf} variant="outline" size="sm" className="h-10 px-4 rounded-xl border-[#E4DFD1] text-[#6B6659] font-black uppercase text-[10px] tracking-widest gap-2">
                            {isGeneratingPdf && !isSharingPdf ? <Loader2 className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />} Baixar PDF
                        </Button>
                        <Button type="button" onClick={handleSharePdf} disabled={isGeneratingPdf || isSharingPdf} size="sm" className="h-10 px-4 bg-primary hover:bg-primary/90 text-white gap-2 rounded-xl font-black uppercase text-[10px] tracking-widest">
                            {isSharingPdf ? <Loader2 className="animate-spin h-4 w-4" /> : <Share2 className="h-4 w-4" />} Compartilhar
                        </Button>
                    </div>
                )}
            </div>

            <AlertDialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
                <AlertDialogContent className="rounded-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-serif text-xl text-[#262420]">Finalizar Documento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {hasAnexo
                                ? `Isso trava a edição do Termo e do ${tipoAnexoAtual} vinculado e sincroniza os dois na nuvem. Depois de finalizar, use "Baixar PDF" ou "Compartilhar" para exportar. Não será possível editar depois.`
                                : "Isso trava a edição do documento e sincroniza na nuvem. Depois de finalizar, use \"Baixar PDF\" ou \"Compartilhar\" para exportar. Não será possível editar depois."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setShowFinalizeConfirm(false); handleSubmit(handleFinalize)(); }} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-primary hover:bg-primary/90">Finalizar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <SignaturePad isOpen={!!signatureTarget} onOpenChange={(o) => !o && setSignatureTarget(null)} onSave={handleSignatureSave} title="Assinatura Digital Oficial" />

            <Dialog open={!!editingFiscal} onOpenChange={(o) => !o && setEditingFiscal(null)}>
                <DialogContent className="rounded-lg sm:max-w-md"><DialogHeader><DialogTitle className="font-serif text-xl text-[#262420]">Editar Autoridade</DialogTitle></DialogHeader>{editingFiscal && (<div className="space-y-5 py-4"><div className="space-y-1.5"><Label className="text-[9px] font-black uppercase text-[#A39D8C] ml-1">Nome Completo</Label><Input value={editingFiscal.data.nome} onChange={(e) => setEditingFiscal({...editingFiscal, data: {...editingFiscal.data, nome: e.target.value.toUpperCase()}})} className="h-12 rounded-lg bg-[#FAF8F3] border-none font-bold text-xs uppercase" /></div><div className="space-y-1.5"><Label className="text-[9px] font-black uppercase text-[#A39D8C] ml-1">Cargo</Label><Input value={editingFiscal.data.cargo} onChange={(e) => setEditingFiscal({...editingFiscal, data: {...editingFiscal.data, cargo: e.target.value.toUpperCase()}})} className="h-12 rounded-lg bg-[#FAF8F3] border-none font-bold text-xs uppercase" /></div><div className="space-y-1.5"><Label className="text-[9px] font-black uppercase text-[#A39D8C] ml-1">Identidade</Label><Input value={editingFiscal.data.rg} onChange={(e) => setEditingFiscal({...editingFiscal, data: {...editingFiscal.data, rg: e.target.value.toUpperCase()}})} className="h-12 rounded-lg bg-[#FAF8F3] border-none font-bold text-xs" /></div></div>)}<DialogFooter><Button onClick={() => { if (editingFiscal) { const upd = editingFiscal.doc === 'main' ? update : anexoUpdate; upd(editingFiscal.index, { ...editingFiscal.data, municipioId: editingFiscal.data.municipioId || '', signature: editingFiscal.data.signature || '' }); setEditingFiscal(null); toast({ title: "Dados Atualizados" }); } }} className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg">Salvar Alterações</Button></DialogFooter></DialogContent>
            </Dialog>
        </FormProvider>
    );
}

export function IntimacaoForm(props: { defaultValues?: Partial<Intimacao>, intimacaoId?: string }) {
    return (<Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#F5F2EA]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}><FormContent {...props} /></Suspense>)
}

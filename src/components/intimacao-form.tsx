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
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { CompartilharEdicaoDialog, type ColegaCompartilhado } from "@/components/compartilhar-edicao-dialog"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useAppConfig } from "@/hooks/use-app-config"
import { useAuth } from "@/hooks/use-auth"
import { addBusinessDays } from "@/lib/prazo"
import { FolhaEscalada } from "@/components/folha-escalada"
import { estruturaDoTipo } from "@/lib/autuacao-estrutura"
import { montarEnderecoCnpj } from "@/lib/endereco-cnpj"
import { criarLembretePrazo } from "@/lib/prazo-lembrete"
import { auth as firebaseAuth } from "@/lib/firebase"
import { intimacaoSchema, prazoTextoDoTipo, atoTextoDoTipo } from "@/lib/schema"
import { Intimacao, Autoridade } from "@/lib/types"
import { Label } from "@/components/ui/label"
import { SignaturePad } from "./signature-pad"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "./ui/alert-dialog"
import { DocumentoOficialBody, type IntimacaoFormValues, type SignatureTargetType } from "./documento-oficial-body"
import { renderDocumentIntoPdf, computePageGroups, alturaUtilDaFolha } from "@/lib/generate-intimacao-pdf"

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


    const recalculate = () => {
      const sourceForm = el.querySelector('form') as HTMLElement | null;
      const bodyContainer = sourceForm?.querySelector('tbody > tr > td') as HTMLElement | null;
      const footer = sourceForm?.querySelector('footer') as HTMLElement | null;
      if (!bodyContainer) { setLivePageBreaks(prev => prev.length ? [] : prev); return; }

      // Mesma medida da geração do PDF (desconta as margens do papel e a
      // linha de numeração) — se divergir, a prévia mostra a quebra num
      // lugar e o PDF sai com ela em outro.
      const { pxPerMm, alturaUtilPx } = alturaUtilDaFolha(el);
      const headerHeightPx = headerRef.current?.offsetHeight || 0;
      const footerHeightPx = footer?.offsetHeight || 0;
      const liveHeaderHeightPx = LIVE_HEADER_HEIGHT_PT * PT_TO_MM * pxPerMm;

      const firstPageWindowPx = Math.max(alturaUtilPx - headerHeightPx - footerHeightPx, 1);
      const continuationWindowPx = Math.max(alturaUtilPx - liveHeaderHeightPx - footerHeightPx, 1);

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
    const { generateNewNumeroProcesso, saveIntimacao, updateIntimacaoMeta, compartilharIntimacao, intimacoes, loading: loadingIntimacoes } = useIntimacoes();
    const [compartilharAberto, setCompartilharAberto] = useState(false);
    const [abrindoCompartilhar, setAbrindoCompartilhar] = useState(false);
    // Alteração de um colega chegada pelo snapshot enquanto esta tela está
    // aberta. Enquanto houver uma, o salvamento automático fica parado: ele
    // dispara 4 segundos depois da última tecla e mandaria o texto antigo por
    // cima do que o colega acabou de gravar, sem ninguém perceber.
    const [alteracaoDoColega, setAlteracaoDoColega] = useState<{ nome: string; quando: string } | null>(null);
    const bloqueiaAutosaveRef = useRef(false);
    const { saveInspecao } = useInspecoes();
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
    const [showClearDraftConfirm, setShowClearDraftConfirm] = useState(false);

    const methods = useForm<IntimacaoFormValues>({
        resolver: zodResolver(intimacaoSchema),
        defaultValues: {
            ...defaultValues,
            status: defaultValues?.status || 'rascunho',
            tipoTermo: defaultValues?.tipoTermo || "TERMO DE INTIMAÇÃO",
            comarca: defaultValues?.comarca || config.municipioNome || "PRUDENTÓPOLIS",
            autoridades: Array.isArray(defaultValues?.autoridades) ? defaultValues.autoridades : [],
            // Termos sem prazo (interdição, apreensão…) já abrem com o texto do
            // ato no campo de objeto — quem entra pelo card do tipo nunca passa
            // por handleTipoTermoChange, e o documento abriria em branco.
            teor: defaultValues?.teor || atoTextoDoTipo(defaultValues?.tipoTermo || "TERMO DE INTIMAÇÃO", config.autuacaoTextos, profile?.municipioId),
            legislacaoBase: defaultValues?.legislacaoBase || "",
            recusouAssinar: defaultValues?.recusouAssinar || false,
            // O texto tem que nascer conforme o tipo: quem chega pelo card de
            // "Termo de Intimação" já entra com o tipo definido e nunca dispara
            // handleTipoTermoChange, então antes o documento abria com o texto
            // de defesa prévia do auto de infração.
            prazo: defaultValues?.prazo || prazoTextoDoTipo(defaultValues?.tipoTermo || "TERMO DE INTIMAÇÃO", config.autuacaoTextos, profile?.municipioId),
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

    // A folha A4 (794px) não cabe em tela estreita. Quem resolve o encaixe é
    // o <FolhaEscalada>, que mede o espaço, reduz a folha E encolhe a caixa
    // que ela ocupa — antes daqui saía só um `transform: scale()`, que deixa
    // largura fantasma de 794px e obrigava o fiscal a arrastar a tela de lado.
    //
    // Este booleano continua existindo só para a paginação: com a folha
    // reduzida, os pontos de quebra precisam ser recalculados.
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

    // Cada tipo escreve num campo diferente: quem abre prazo (auto de infração,
    // intimação, penalidade) recebe o texto no campo de prazo; os demais
    // (interdição, desinterdição, apreensão, inutilização) não têm bloco de
    // prazo, e o conteúdo do ato vai no campo de objeto — ver
    // src/lib/autuacao-estrutura.ts. Só preenche o objeto se ainda estiver
    // vazio, pra nunca apagar o que o fiscal escreveu.
    const handleTipoTermoChange = (value: string) => {
        if (!prazoEditadoManualmenteRef.current) setValue('prazo', prazoTextoDoTipo(value, config.autuacaoTextos, profile?.municipioId));
        const textoDoAto = atoTextoDoTipo(value, config.autuacaoTextos, profile?.municipioId);
        const objetoAtual = (getValues('teor') || '').replace(/<br\s*\/?>/gi, '').trim();
        if (textoDoAto && !objetoAtual) setValue('teor', textoDoAto);
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
        const prazoAnexo = prazoTextoDoTipo(tipoAnexo, config.autuacaoTextos, profile?.municipioId);
        // O anexo nasce com o texto do ato já preenchido quando é um termo sem
        // prazo (interdição/apreensão gerados a partir do Auto de Infração).
        const objetoAnexo = atoTextoDoTipo(tipoAnexo, config.autuacaoTextos, profile?.municipioId);
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
            // Auto de Infração herda o relato dos fatos do documento de origem;
            // um termo sem prazo (interdição/apreensão) não — nele esse campo é
            // o texto do próprio ato, não a descrição da infração.
            teor: objetoAnexo || main.teor,
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
                // Um colega gravou algo enquanto esta tela estava aberta: salvar
                // agora publicaria o estado anterior por cima do dele. Fica
                // parado até a pessoa decidir (recarregar ou manter o que digitou).
                if (bloqueiaAutosaveRef.current) return;
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

    /**
     * BLOQUEIO: documento que abre prazo não se finaliza sem prazo escrito.
     *
     * O Termo de Intimação existe para conceder prazo — o Art. 25, §1º, III da
     * Lei 2.276/2017 e o Art. 66, §1º da Lei 13.331/2001 exigem que ele traga
     * "o prazo para serem executadas" as determinações. Sem esse campo o termo
     * é defeituoso: não dá para cobrar descumprimento de prazo que nunca foi
     * fixado, e o auto de infração lavrado depois fica sem base.
     *
     * Vale para todo tipo que tem bloco de prazo (ver estruturaDoTipo): a
     * intimação e o auto de infração, cujo prazo de defesa é requisito do
     * Art. 555, VI do Decreto 5.711/2002.
     */
    /**
     * Quem ainda não assinou.
     *
     * Assinatura em falta não impede finalizar: há caso legítimo de recusa do
     * autuado (a lei prevê a consignação por duas testemunhas) e de documento
     * impresso para assinar à mão. Mas finalizar trava a edição, e descobrir
     * a falta depois obriga a refazer o documento inteiro — por isso o aviso
     * é nominal, dizendo exatamente quem ficou de fora.
     */
    const assinaturasFaltando = (): string[] => {
        const faltam: string[] = [];
        const autoridades = watch('autoridades') || [];
        const semAssinatura = autoridades.filter((a: any) => !a?.signature);
        if (autoridades.length === 0) {
            faltam.push('nenhuma autoridade sanitária foi incluída');
        } else if (semAssinatura.length > 0) {
            faltam.push(
                semAssinatura.length === autoridades.length
                    ? 'a assinatura do fiscal'
                    : `a assinatura de ${semAssinatura.map((a: any) => a.nome).filter(Boolean).join(', ')}`
            );
        }
        if (!watch('signatureResponsavel')) faltam.push('a ciência do autuado');
        return faltam;
    };

    /**
     * Este tipo costuma andar acompanhado e ainda não tem o par.
     *
     * O card que gera o documento vinculado fica depois da folha, e a barra
     * de finalizar é fixa na tela: dá para finalizar sem nunca ter rolado até
     * lá. Só que finalizar trava a edição — quem descobre depois precisa
     * refazer. O aviso aparece no único momento em que ainda dá tempo.
     */
    const vinculoFaltando = (): string | null => {
        if (hasAnexo) return null;
        if (TIPOS_QUE_GERAM_AUTO_INFRACAO.includes(tipoTermoAtual)) {
            return 'o Auto de Infração que costuma acompanhar este termo';
        }
        if (tipoTermoAtual === TIPO_QUE_GERA_INTERDICAO_OU_APREENSAO) {
            return 'um Termo de Interdição ou de Apreensão vinculado';
        }
        return null;
    };

    const prazoObrigatorioFaltando = () => {
        if (!estruturaDoTipo(tipoTermoAtual).prazo) return false;
        const texto = (watch('prazo') || '').replace(/<[^>]*>/g, '').trim();
        return texto.length === 0;
    };

    const handleFinalize = async () => {
        if (prazoObrigatorioFaltando()) {
            toast({
                variant: 'destructive',
                title: 'Falta o prazo',
                description: 'Este documento concede prazo e a lei exige que ele conste do termo. Preencha o bloco de prazo antes de finalizar.',
            });
            setShowFinalizeConfirm(false);
            return;
        }
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

            // Cria o lembrete de prazo na Agenda (2 dias antes do vencimento) —
            // handleFinalize só roda uma vez por documento (o formulário trava
            // e o botão vira "Baixar PDF" depois disso), então não precisa
            // proteger contra lembrete duplicado aqui.
            //
            // Não depende de mainCloudSaved: mesmo offline, a autuação já foi
            // gravada na fila do próprio Firestore (attemptFirestoreWrite em
            // use-intimacoes.ts) e vai sincronizar sozinha — o lembrete usa a
            // mesma proteção (saveInspecao já lida com offline por conta
            // própria, ver use-inspecoes.ts). Antes disso, finalizar offline
            // fazia o lembrete de prazo nunca ser criado, silenciosamente,
            // mesmo depois de a autuação sincronizar de verdade.
            const mainValues = getValues();
            if (mainValues.prazoDias && profile?.municipioId) {
                try {
                    const prazoData = addBusinessDays(mainValues.dataIntimacao, mainValues.prazoDias);
                    const lembreteId = await criarLembretePrazo(saveInspecao, {
                        titulo: `Prazo vence em breve — ${mainValues.autor || 'Autuação'} (${mainValues.tipoTermo || ''} nº ${mainValues.numeroProcesso})`,
                        prazoISO: prazoData.toISOString(),
                        fiscalId: profile.uid,
                        fiscalNome: profile.displayName || 'Fiscal',
                        municipioId: profile.municipioId,
                    });
                    await updateIntimacaoMeta(result.mainId, { agendaLembreteId: lembreteId });
                } catch (e) {
                    // Falha ao criar o lembrete não deve impedir a finalização do documento.
                    console.warn('Falha ao criar lembrete de prazo na Agenda:', e);
                }
            }
        } catch (e) {
            toast({ variant: "destructive", title: "Falha na Finalização" });
        } finally {
            setIsSaving(false);
            isPersistingRef.current = false;
        }
    };

    const handleClearDraft = async () => {
        setShowClearDraftConfirm(false);
        const now = new Date();
        const novoNumero = await generateNewNumeroProcesso();
        const base = intimacaoSchema.parse({});
        const autoridadesAtuais = methods.getValues('autoridades') || [];

        methods.reset({
            ...base,
            numeroProcesso: novoNumero,
            status: 'rascunho',
            tipoTermo: 'TERMO DE INTIMAÇÃO',
            comarca: config.municipioNome || 'PRUDENTÓPOLIS',
            dataIntimacao: now,
            dataDocumento: format(now, 'dd/MM/yyyy'),
            horaDocumento: format(now, 'HH:mm'),
            prazo: prazoTextoDoTipo('TERMO DE INTIMAÇÃO', config.autuacaoTextos, profile?.municipioId),
            teor: atoTextoDoTipo('TERMO DE INTIMAÇÃO', config.autuacaoTextos, profile?.municipioId),
            autoridades: autoridadesAtuais,
        });

        if (hasAnexo) {
            const autoridadesAnexoAtual = anexoMethods.getValues('autoridades') || [];
            anexoMethods.reset({
                ...base,
                numeroProcesso: await generateNewNumeroProcesso(),
                status: 'rascunho',
                tipoTermo: 'AUTO DE INFRAÇÃO',
                comarca: config.municipioNome || 'PRUDENTÓPOLIS',
                dataIntimacao: now,
                dataDocumento: format(now, 'dd/MM/yyyy'),
                horaDocumento: format(now, 'HH:mm'),
                prazo: prazoTextoDoTipo('AUTO DE INFRAÇÃO', config.autuacaoTextos, profile?.municipioId),
                teor: atoTextoDoTipo('AUTO DE INFRAÇÃO', config.autuacaoTextos, profile?.municipioId),
                autoridades: autoridadesAnexoAtual,
            });
        }

        anexoIdRef.current = undefined;
        setHasAnexo(false);
        isDirtyRef.current = false;
        setLastAutoSavedAt(null);
        toast({ title: "Rascunho Limpo", description: "O formulário foi reiniciado em branco." });
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
                setValue("endereco", montarEnderecoCnpj(data));
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


    // Preview e geração de PDF usam o mesmo truque de renderização (campos
    // viram texto estático, controles de edição somem) — ver isReadOnlyRender.
    const isReadOnlyRender = isGeneratingPdf || isPreviewMode;
    const mostraCardAutoInfracao = !isReadOnlyRender && (hasAnexo || TIPOS_QUE_GERAM_AUTO_INFRACAO.includes(tipoTermoAtual) || tipoTermoAtual === TIPO_QUE_GERA_INTERDICAO_OU_APREENSAO);
    const tipoAnexoAtual = anexoMethods.watch('tipoTermo');

    // O documento como está gravado, não o que o formulário tem em mãos: o
    // compartilhamento não passa pelo formulário (ver saveIntimacao), então é
    // da lista que vem a resposta de "com quem isto está compartilhado".
    const gravada = intimacoes.find(i => String(i.id) === String(mainIdRef.current));
    const compartilhadoCom: ColegaCompartilhado[] = gravada?.compartilhadoComNomes
      ?? (gravada?.compartilhadoCom || []).map(uid => ({ uid, nome: 'Fiscal' }));
    const souOAutor = !gravada?.createdBy || gravada.createdBy === profile?.uid;

    // Vigia de edição simultânea. O snapshot do Firestore chega sozinho; se o
    // último salvamento foi de outra pessoa, quem está aqui precisa saber
    // ANTES de continuar digitando — do contrário os dois textos se alternam
    // a cada salvamento e ninguém entende o que aconteceu.
    const carimboDoColega = gravada?.updatedBy && gravada.updatedBy !== profile?.uid ? String(gravada.updatedAt || '') : '';
    useEffect(() => {
        if (!carimboDoColega || isFinalized) return;
        const quando = (() => {
            const d = new Date(carimboDoColega);
            return isNaN(d.getTime()) ? 'agora há pouco' : `às ${format(d, "HH:mm")}`;
        })();
        bloqueiaAutosaveRef.current = true;
        setAlteracaoDoColega({ nome: gravada?.updatedByName || 'Um colega', quando });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carimboDoColega, isFinalized]);

    // Compartilhar exige um documento gravado — é o id que vai no acesso do
    // colega. Num rascunho que nunca foi salvo, salva antes de abrir a caixa
    // em vez de mandar o fiscal fazer isso sozinho.
    const abrirCompartilhar = async () => {
        if (mainIdRef.current) { setCompartilharAberto(true); return; }
        setAbrindoCompartilhar(true);
        try {
            await handleSaveDraft();
            if (mainIdRef.current) setCompartilharAberto(true);
            else toast({ variant: "destructive", title: "Salve o rascunho antes de compartilhar" });
        } finally {
            setAbrindoCompartilhar(false);
        }
    };

    return (
        <FormProvider {...methods}>
            <div className="document-container font-serif pb-60">
                <div className="document-paper-wrapper custom-scrollbar">
                    <FolhaEscalada
                      ref={mainDocumentRef}
                      ativo={!isGeneratingPdf}
                      deps={[tipoTermoAtual, hasAnexo, livePageBreaksMain]}
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
                    </FolhaEscalada>

                    {alteracaoDoColega && (
                        <div className="no-print max-w-[210mm] mx-auto my-8 px-5 py-4 rounded-2xl border-2 border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-serif text-base text-amber-900">{alteracaoDoColega.nome} alterou esta autuação {alteracaoDoColega.quando}</p>
                                <p className="text-xs text-amber-800 mt-1">
                                    O salvamento automático está parado para não apagar o que ele escreveu. Recarregue para ver a versão dele — o que você digitou e ainda não salvou será perdido — ou mantenha a sua e salve por cima.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { bloqueiaAutosaveRef.current = false; setAlteracaoDoColega(null); }}
                                    className="rounded-xl font-black uppercase text-[10px] tracking-widest h-11 px-4 border-amber-300 text-amber-900 hover:bg-amber-100"
                                >
                                    Manter a minha
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="rounded-xl font-black uppercase text-[10px] tracking-widest h-11 px-4 bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    Recarregar
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Edição a quatro mãos: o fiscal que começa o auto em campo
                        e o colega que termina no escritório. Fica logo abaixo do
                        documento, não escondido num menu — a vinculação do auto
                        já tinha esse problema e foi trazida para cá pelo mesmo
                        motivo. */}
                    {!isReadOnlyRender && (
                        <div className={cn(
                            "no-print max-w-[210mm] mx-auto my-8 px-5 py-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors",
                            // Roxo, e não o verde do sistema: o cartão de
                            // vinculação logo abaixo já usa o verde em destaque, e
                            // dois blocos gritando na mesma cor deixam de ser
                            // destaque. O roxo é o mesmo da pasta "Compartilhadas
                            // Comigo", então a cor já quer dizer "colega".
                            compartilhadoCom.length > 0
                                ? "border-2 border-[#7A4F9C]/50 bg-[#F6F1FB] ring-4 ring-[#7A4F9C]/10"
                                : "border-2 border-[#7A4F9C]/35 bg-white ring-4 ring-[#7A4F9C]/5"
                        )}>
                            <div className="min-w-0 flex items-start gap-3">
                                <div className="h-10 w-10 shrink-0 rounded-xl bg-[#F0E9F7] text-[#7A4F9C] flex items-center justify-center">
                                    <Users className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-serif text-base text-[#5B3A75]">Edição compartilhada</p>
                                    <p className="text-xs text-[#6B6659] mt-1">
                                        {compartilhadoCom.length === 0
                                            ? 'Só você edita esta autuação. Compartilhe para um colega fiscal preencher e finalizar junto.'
                                            : `Editando com ${compartilhadoCom.map(c => c.nome).join(', ')}.`}
                                    </p>
                                    {!souOAutor && (
                                        <p className="text-[11px] text-[#9C7A3C] mt-1 font-medium">
                                            Compartilhada com você por {gravada?.createdByName || 'um colega'} — você edita e finaliza, mas quem apaga é o autor.
                                        </p>
                                    )}
                                </div>
                            </div>
                            {souOAutor && (
                                <Button
                                    type="button"
                                    onClick={abrirCompartilhar}
                                    disabled={abrindoCompartilhar || isFinalized}
                                    className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2 h-12 px-6 shrink-0 bg-[#7A4F9C] text-white shadow-md hover:bg-[#693F8A]"
                                >
                                    {abrindoCompartilhar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                                    {compartilhadoCom.length === 0 ? 'Compartilhar' : 'Gerenciar'}
                                </Button>
                            )}
                        </div>
                    )}

                    {mostraCardAutoInfracao && (
                        <div className="no-print max-w-[210mm] mx-auto my-8 p-6 rounded-2xl border-2 border-primary/50 bg-white shadow-[0_10px_28px_-16px_rgba(38,36,32,0.45)] ring-4 ring-primary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
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
                                    <p className="font-serif text-base text-primary">{tipoAnexoAtual} Vinculado <span className="whitespace-nowrap">Nº {anexoMethods.watch('numeroProcesso')}</span></p>
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
                            <FolhaEscalada
                              ref={anexoDocumentRef}
                              ativo={!isGeneratingPdf}
                              deps={[tipoAnexoAtual, livePageBreaksAnexo]}
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
                            </FolhaEscalada>
                        </FormProvider>
                    )}
                </div>

                {!isFinalized ? (
                    /* QUATRO AÇÕES, MESMA LARGURA — mesmo desenho da barra do
                       roteiro. Antes era uma pílula flutuante no canto, com
                       "Apagar Rascunho" e "Salvar Rascunho" por extenso e a
                       visualização escondida num botão só de ícone: em tela de
                       celular os rótulos longos espremiam tudo e a lupa não
                       dizia o que fazia. Ícone em cima do rótulo cabe sem
                       abreviar. */
                    <div className="fixed bottom-0 left-0 right-0 z-[100] no-print border-t border-[#E4DFD1] bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-6">
                        {!isPreviewMode && lastAutoSavedAt && (
                            <p className="mx-auto mb-2 max-w-4xl text-center text-[9px] font-bold uppercase tracking-widest text-[#A39D8C]">
                                Salvo automaticamente às {format(lastAutoSavedAt, "HH:mm")}
                            </p>
                        )}

                        {isPreviewMode ? (
                            <div className="mx-auto max-w-4xl">
                                <Button type="button" onClick={() => setIsPreviewMode(false)} className="h-14 w-full gap-2 rounded-2xl bg-primary text-[11px] font-black uppercase tracking-widest text-white shadow-lg hover:bg-primary/90">
                                    <Pencil className="h-5 w-5" /> Voltar a Editar
                                </Button>
                            </div>
                        ) : (
                            <div className="mx-auto grid max-w-4xl grid-cols-4 items-stretch gap-2 sm:gap-3">
                                <Button
                                    type="button"
                                    onClick={() => setIsPreviewMode(true)}
                                    variant="outline"
                                    className="h-16 flex-col gap-1 rounded-2xl border-[#E4DFD1] text-[#6B6659] font-black uppercase text-[10px] sm:text-[11px] tracking-widest shadow-md"
                                >
                                    <Eye className="h-5 w-5" />
                                    Visualizar
                                </Button>

                                <Button
                                    type="button"
                                    onClick={() => setShowClearDraftConfirm(true)}
                                    variant="outline"
                                    className="h-16 flex-col gap-1 rounded-2xl border-rose-200 text-rose-600 font-black uppercase text-[10px] sm:text-[11px] tracking-widest shadow-md hover:bg-rose-50 hover:text-rose-700"
                                >
                                    <Trash2 className="h-5 w-5" />
                                    Apagar
                                </Button>

                                <Button
                                    type="button"
                                    onClick={() => handleSaveDraft()}
                                    disabled={isSavingDraft || isSaving}
                                    variant="outline"
                                    className="h-16 flex-col gap-1 rounded-2xl border-[#E4DFD1] text-[#6B6659] font-black uppercase text-[10px] sm:text-[11px] tracking-widest shadow-md"
                                >
                                    {isSavingDraft ? <Loader2 className="animate-spin h-5 w-5" /> : <Save className="h-5 w-5" />}
                                    Salvar
                                </Button>

                                <Button
                                    type="button"
                                    onClick={() => setShowFinalizeConfirm(true)}
                                    disabled={isSaving || isSavingDraft}
                                    className="h-16 flex-col gap-1 rounded-2xl bg-primary text-white font-black uppercase text-[10px] sm:text-[11px] tracking-widest shadow-2xl transition-all hover:bg-primary/90 active:scale-95"
                                >
                                    {isSaving ? <Loader2 className="animate-spin h-5 w-5" /> : <FileCheck2 className="h-5 w-5" />}
                                    Finalizar
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Documento travado: só resta exportar. Mesma barra larga
                       do modo de edição, para a tela não trocar de desenho ao
                       finalizar. */
                    <div className="fixed bottom-0 left-0 right-0 z-[100] no-print border-t border-[#E4DFD1] bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-6">
                        <div className="mx-auto grid max-w-4xl grid-cols-2 items-stretch gap-2 sm:gap-3">
                            <Button
                                type="button"
                                onClick={handleDownloadPdf}
                                disabled={isGeneratingPdf || isSharingPdf}
                                variant="outline"
                                className="h-16 flex-col gap-1 rounded-2xl border-[#E4DFD1] text-[#6B6659] font-black uppercase text-[10px] sm:text-[11px] tracking-widest shadow-md"
                            >
                                {isGeneratingPdf && !isSharingPdf ? <Loader2 className="animate-spin h-5 w-5" /> : <Download className="h-5 w-5" />}
                                Baixar PDF
                            </Button>

                            <Button
                                type="button"
                                onClick={handleSharePdf}
                                disabled={isGeneratingPdf || isSharingPdf}
                                className="h-16 flex-col gap-1 rounded-2xl bg-primary text-white font-black uppercase text-[10px] sm:text-[11px] tracking-widest shadow-2xl transition-all hover:bg-primary/90 active:scale-95"
                            >
                                {isSharingPdf ? <Loader2 className="animate-spin h-5 w-5" /> : <Share2 className="h-5 w-5" />}
                                Compartilhar
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <CompartilharEdicaoDialog
                open={compartilharAberto}
                onOpenChange={setCompartilharAberto}
                compartilhadoCom={compartilhadoCom}
                onConfirmar={async (colegas) => {
                    if (!mainIdRef.current) return;
                    const { synced } = await compartilharIntimacao(mainIdRef.current, colegas);
                    // Offline o acesso fica na fila do Firestore e só vale quando
                    // a conexão voltar — dizer "compartilhado" agora faria o fiscal
                    // contar com um colega que ainda não recebeu nada.
                    toast(
                        !synced
                            ? { title: "Compartilhamento na fila", description: "Sem conexão agora — o colega recebe o acesso assim que o aparelho sincronizar." }
                            : colegas.length === 0
                                ? { title: "Acesso removido", description: "Esta autuação voltou a ser só sua." }
                                : { title: "Autuação compartilhada", description: `${colegas.map(c => c.nome).join(', ')} já pode editar e finalizar com você.` }
                    );
                }}
            />

            <AlertDialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
                <AlertDialogContent className="rounded-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-serif text-xl text-[#262420]">Finalizar Documento?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                            {hasAnexo
                                ? `Isso trava a edição do Termo e do ${tipoAnexoAtual} vinculado e sincroniza os dois na nuvem. Depois de finalizar, use "Baixar PDF" ou "Compartilhar" para exportar. Não será possível editar depois.`
                                : "Isso trava a edição do documento e sincroniza na nuvem. Depois de finalizar, use \"Baixar PDF\" ou \"Compartilhar\" para exportar. Não será possível editar depois."}
                            </p>
                            {vinculoFaltando() && (
                              <div className="rounded-xl border border-[#9C7A3C]/30 bg-[#FBF7EE] p-3.5 text-left">
                                <p className="text-[13px] font-bold text-[#7A5D2A]">
                                  Este documento ainda não tem {vinculoFaltando()}.
                                </p>
                                <p className="mt-1 text-[12px] leading-snug text-[#4A463D]">
                                  O botão para gerar fica logo abaixo do documento. Depois de finalizar não é mais possível vincular —
                                  seria preciso lavrar os dois separadamente.
                                </p>
                              </div>
                            )}
                            {assinaturasFaltando().length > 0 && (
                              <div className="rounded-xl border border-[#A15437]/25 bg-[#A15437]/[0.06] p-3.5 text-left">
                                <p className="text-[13px] font-bold text-[#8A4429]">
                                  Tem certeza que deseja finalizar sem {assinaturasFaltando().join(" e ")}?
                                </p>
                                <p className="mt-1 text-[12px] leading-snug text-[#4A463D]">
                                  Depois de finalizar não dá para assinar dentro do sistema — seria preciso refazer o documento.
                                  Se o autuado se recusou a assinar, registre a recusa no corpo do documento com duas testemunhas.
                                </p>
                              </div>
                            )}
                          </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setShowFinalizeConfirm(false); handleSubmit(handleFinalize)(); }} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-primary hover:bg-primary/90">Finalizar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showClearDraftConfirm} onOpenChange={setShowClearDraftConfirm}>
                <AlertDialogContent className="rounded-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-serif text-xl text-[#262420]">Apagar rascunho?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Isso reinicia o formulário em branco. O conteúdo atual será perdido e o documento precisará ser preenchido novamente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClearDraft} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700">Apagar</AlertDialogAction>
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

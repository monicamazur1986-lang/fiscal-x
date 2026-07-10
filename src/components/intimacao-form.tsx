"use client"

import React, { useEffect, useState, useRef, Suspense } from "react"
import { useForm, useFieldArray, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { 
  Loader2, 
  ArrowLeft, 
  Download, 
  Search, 
  Maximize2, 
  Minimize2, 
  X, 
  Pencil, 
  Check, 
  Trash2, 
  Smartphone, 
  Save, 
  FileCheck2, 
  FileText, 
  Sparkles,
  RotateCcw
} from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useAppConfig } from "@/hooks/use-app-config"
import { useAuth } from "@/hooks/use-auth"
import { intimacaoSchema, DEFAULT_PRAZO_TEXT } from "@/lib/schema"
import { Intimacao, Autoridade } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { SelecionarAutoridadeParaFormulario } from "./selecionar-autoridade-dialog"
import { RichTextEditor } from "./rich-text-editor"
import { SignaturePad } from "./signature-pad"
import { AssistenteIAFormDialog } from "./assistente-ia-form-dialog"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog"
import { Textarea } from "./ui/textarea"

const termoOptions = ["TERMO DE INTIMAÇÃO", "AUTO DE INFRAÇÃO", "TERMO DE APREENSÃO", "TERMO DE INTERDIÇÃO", "TERMO DE INUTILIZAÇÃO"];
const DEFAULT_SYMBOL = "https://firebasestorage.googleapis.com/v0/b/firebasestudio-1937074168.appspot.com/o/user-uploads%2F67b6653d9e6e872d80ef618e%2Flogo_horizontal_preto_transparente.jpg?alt=media";

function FormContent({ defaultValues, intimacaoId }: { defaultValues?: Partial<Intimacao>, intimacaoId?: string }) {
    const { generateNewNumeroProcesso, saveIntimacao, loading: loadingIntimacoes } = useIntimacoes();
    const { config } = useAppConfig();
    const { profile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    const documentRef = useRef<HTMLDivElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [signatureTarget, setSignatureTarget] = useState<{ type: 'fiscal' | 'responsavel' | 'testemunha1' | 'testemunha2', index?: number } | null>(null);
    const [editingFiscal, setEditingFiscal] = useState<{ index: number, data: Autoridade } | null>(null);
    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
    const [fitToScreen, setFitToScreen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

    const methods = useForm<z.infer<typeof intimacaoSchema>>({
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
            responsavelTecnico: defaultValues?.responsavelTecnico || "",
            responsavelTecnicoConselho: defaultValues?.responsavelTecnicoConselho || "",
            testemunha1Nome: defaultValues?.testemunha1Nome || "",
            testemunha2Nome: defaultValues?.testemunha2Nome || "",
        },
    });
    
    const { control, handleSubmit, watch, setValue, getValues } = methods;
    const { fields, append, remove, update } = useFieldArray({ control, name: "autoridades" });
    const isFinalized = watch("status") === 'finalizado';
    const recusouAssinar = watch("recusouAssinar");
    const signatureResponsavel = watch("signatureResponsavel");
    const dataRecebimento = watch("dataRecebimento");

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (profile && !getValues('numeroProcesso') && !loadingIntimacoes) {
            generateNewNumeroProcesso(profile.fiscalCode).then(num => {
                setValue('numeroProcesso', num);
            });
        }
    }, [profile, loadingIntimacoes, getValues, setValue, generateNewNumeroProcesso]);

    const handleSignatureSave = (base64: string) => {
        if (!signatureTarget) return;
        if (signatureTarget.type === 'fiscal' && signatureTarget.index !== undefined) {
            const current = getValues('autoridades');
            current[signatureTarget.index].signature = base64;
            setValue('autoridades', [...current]);
        } else if (signatureTarget.type === 'responsavel') {
            setValue('signatureResponsavel', base64);
            setValue('dataRecebimento', new Date()); 
        } else if (signatureTarget.type === 'testemunha1') {
            setValue('signatureTestemunha1', base64);
        } else if (signatureTarget.type === 'testemunha2') {
            setValue('signatureTestemunha2', base64);
        }
        setSignatureTarget(null);
    };

    const handleSaveDraft = async () => {
        setIsSavingDraft(true);
        try {
            const data = getValues();
            await saveIntimacao({ ...data, status: 'rascunho' }, intimacaoId);
            toast({ title: "Rascunho Salvo" });
        } catch (e) {
            toast({ variant: "destructive", title: "Erro ao Salvar" });
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleFinalize = async (data: z.infer<typeof intimacaoSchema>) => {
        setIsSaving(true);
        try {
            await saveIntimacao({ ...data, status: 'finalizado' }, intimacaoId);
            toast({ title: "Documento Finalizado" });
            setTimeout(() => generateAndDownloadPdf(), 1000);
        } catch (e) {
            toast({ variant: "destructive", title: "Falha na Finalização" });
        } finally { 
            setIsSaving(false); 
        }
    };

    const generateAndDownloadPdf = async () => {
      if (!documentRef.current) return;
      setIsGeneratingPdf(true);
      try {
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");
        
        const canvas = await html2canvas(documentRef.current, { 
          scale: 3.0, 
          useCORS: true, 
          backgroundColor: "#ffffff", 
          windowWidth: 794, 
          logging: false 
        });

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(`${getValues('tipoTermo')} - ${getValues('numeroProcesso')}.pdf`);
      } catch (e) {
          toast({ variant: "destructive", title: "Erro na geração do PDF." });
      } finally { setIsGeneratingPdf(false); }
    };

    const handleCnpjLookup = async () => {
        const cnpj = getValues("cnpj")?.replace(/\D/g, "");
        if (cnpj?.length !== 14) return;
        setIsSearchingCnpj(true);
        try {
            const res = await fetch(`/api/cnpj/${cnpj}`);
            if (res.ok) {
                const data = await res.json();
                setValue("autor", data.razao_social);
                setValue("endereco", `${data.logradouro}, ${data.numero}`);
                setValue("bairro", data.bairro);
                setValue("reu", data.responsavel_legal);
                setValue("telefone", data.telefone || "");
                setValue("cnae", data.cnae || "");
            }
        } finally { setIsSearchingCnpj(false); }
    };

    const scaleFactor = fitToScreen ? Math.min((windowWidth - 32) / 794, 1) : 1;
    const logoSource = config.logoUrl || DEFAULT_SYMBOL;
    const isDataUrl = logoSource.startsWith('data:');
    const displayLogoUrl = isDataUrl ? logoSource : `/api/proxy-image?url=${encodeURIComponent(logoSource)}`;

    return (
        <FormProvider {...methods}>
            <div className="document-container font-serif pb-60">
                <div className="no-print w-full max-w-[210mm] flex flex-wrap justify-between items-center mb-8 px-4 gap-4">
                    <div className="flex gap-3 flex-wrap">
                        <Button asChild variant="outline" className="bg-white border-zinc-200 rounded-xl font-black text-[9px] uppercase tracking-widest h-11 px-6 shadow-sm">
                            <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
                        </Button>
                        <Button 
                            onClick={() => setFitToScreen(!fitToScreen)} 
                            className={cn(
                                "rounded-xl font-black text-[10px] uppercase tracking-widest gap-2 transition-all shadow-xl h-11 px-8 border-2",
                                fitToScreen ? "bg-primary text-white border-primary" : "bg-white border-primary text-primary"
                            )}
                        >
                            {fitToScreen ? <Maximize2 className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />} 
                            {fitToScreen ? "Ver em A4 Real" : "Ajustar à Tela"}
                        </Button>
                    </div>
                </div>

                <div className="document-paper-wrapper custom-scrollbar">
                    <div 
                      ref={documentRef}
                      className="document-paper h-auto bg-white transition-transform duration-300" 
                      style={fitToScreen ? { transform: `scale(${scaleFactor})`, margin: '0 auto', transformOrigin: 'top center' } : {}}
                    >
                        <form onSubmit={handleSubmit(handleFinalize)}>
                            <header className="flex flex-row items-center justify-between gap-6 md:gap-10 mb-4 pb-4">
                                <div className="w-[140px] h-[100px] md:w-[180px] md:h-[100px] flex items-center justify-start overflow-hidden">
                                    <img src={displayLogoUrl} className="max-w-full max-h-full object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} />
                                </div>
                                <div className="flex-1 text-center">
                                    {config.headerRichText ? (
                                        <div style={{ fontFamily: "'Times New Roman', Times, serif" }} dangerouslySetInnerHTML={{ __html: config.headerRichText }} />
                                    ) : (
                                        <>
                                            <p className="text-[9pt] md:text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "PRUDENTÓPOLIS"}</p>
                                            <h2 className="text-[10pt] md:text-[12pt] font-black uppercase text-black leading-tight mt-1">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2>
                                            <h3 className="text-[8.5pt] md:text-[9.5pt] font-bold text-black uppercase mt-0.5">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3>
                                        </>
                                    )}
                                </div>
                            </header>

                            <div className="section-box flex flex-row overflow-visible min-h-[30pt] mb-4" style={{ border: '1pt solid #171717' }}>
                                <div className="flex-1 border-r border-[#171717] p-2 flex items-center justify-center text-center">
                                    <FormField control={control} name="tipoTermo" render={({ field }) => (
                                        isGeneratingPdf ? <h1 className="font-black text-[12pt] md:text-[14pt] uppercase text-black">{field.value}</h1> : (
                                            <Select onValueChange={field.onChange} value={field.value} disabled={isFinalized}>
                                                <SelectTrigger className="border-none font-black text-[12pt] md:text-[14pt] uppercase bg-transparent shadow-none ring-0 h-auto w-full justify-center text-black">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>{termoOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                            </Select>
                                        )
                                    )} />
                                </div>
                                <div className="flex-1 p-2 flex items-center justify-center">
                                    <FormField control={control} name="numeroProcesso" render={({ field }) => (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12pt] md:text-[14pt] font-black uppercase text-black">Nº</span>
                                            <input value={field.value || ""} onChange={(e) => field.onChange(e.target.value.toUpperCase())} disabled={isFinalized} className="bg-transparent border-none text-[12pt] md:text-[14pt] font-black uppercase outline-none w-full text-black" />
                                        </div>
                                    )} />
                                </div>
                            </div>

                            <div className="section-box">
                                <div className="sub-header-row">1. IDENTIFICAÇÃO DO ESTABELECIMENTO</div>
                                <div className="data-row">
                                    <div className="data-cell">
                                        <span className="data-label">RAZÃO SOCIAL / NOME FANTASIA:</span>
                                        <FormField control={control} name="autor" render={({ field }) => (
                                            <RichTextEditor value={field.value || ""} onChange={field.onChange} disabled={isFinalized} fontSize="10.5pt" minHeight="1.1em" />
                                        )} />
                                    </div>
                                </div>
                                <div className="data-row">
                                    <div className="data-cell">
                                        <span className="data-label">CNPJ / CPF:</span>
                                        <div className="flex items-center justify-start gap-4">
                                            <FormField control={control} name="cnpj" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input !w-[150pt]" />)} />
                                            {!isFinalized && !isGeneratingPdf && (
                                                <Button onClick={handleCnpjLookup} type="button" disabled={isSearchingCnpj} size="sm" variant="ghost" className="h-7 gap-1.5 px-3 rounded-lg font-black text-[8px] uppercase tracking-widest text-primary border border-primary/20 bg-white no-print">{isSearchingCnpj ? <Loader2 className="animate-spin h-3 w-3" /> : <Search className="h-3 w-3" />} Consultar</Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="data-row">
                                    <div className="data-cell">
                                        <span className="data-label">ENDEREÇO COMPLETO:</span>
                                        <FormField control={control} name="endereco" render={({ field }) => (<Textarea value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input min-h-[1.5em] resize-none border-none p-0 bg-transparent shadow-none" />)} />
                                    </div>
                                </div>
                                <div className="data-row">
                                    <div className="data-cell" style={{ flex: '0 0 60%' }}>
                                        <span className="data-label">BAIRRO:</span>
                                        <FormField control={control} name="bairro" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
                                    </div>
                                    <div className="data-cell">
                                        <span className="data-label">TELEFONE:</span>
                                        <FormField control={control} name="telefone" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
                                    </div>
                                </div>
                                <div className="data-row">
                                    <div className="data-cell" style={{ flex: '0 0 60%' }}>
                                        <span className="data-label">RESPONSÁVEL NO LOCAL:</span>
                                        <FormField control={control} name="reu" render={({ field }) => (<Textarea value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input min-h-[1.5em] resize-none border-none p-0 bg-transparent shadow-none" />)} />
                                    </div>
                                    <div className="data-cell">
                                        <span className="data-label">RG / CPF Nº:</span>
                                        <FormField control={control} name="responsavelLegalIdentidade" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
                                    </div>
                                </div>
                                <div className="data-row border-none">
                                    <div className="data-cell">
                                        <span className="data-label">ATIVIDADES (CNAE):</span>
                                        <FormField control={control} name="cnae" render={({ field }) => (<Textarea value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input min-h-[1.5em] resize-none border-none p-0 bg-transparent shadow-none uppercase" />)} />
                                    </div>
                                </div>
                            </div>

                            <div className="section-box" style={{ borderTop: 'none' }}>
                                <div className="sub-header-row flex items-center justify-between no-print">
                                    <span>2. AUTORIDADES SANITÁRIAS</span>
                                    {!isFinalized && !isGeneratingPdf && <SelecionarAutoridadeParaFormulario onSelect={(a) => append(a)} />}
                                </div>
                                <div className="flex flex-col">
                                    {fields.length > 0 ? fields.map((f, i) => (
                                        <div key={f.id} className="flex flex-row border-b border-black/10 last:border-b-0 group">
                                            <div style={{ flex: '0 0 34%' }} className="p-2 border-r border-black/10 text-center flex items-center justify-center"><span className="text-[9.5pt] text-black uppercase font-black">{(f as any).nome}</span></div>
                                            <div style={{ flex: '0 0 33%' }} className="p-2 border-r border-black/10 text-center flex items-center justify-center"><span className="text-[9pt] text-black uppercase font-bold">{(f as any).cargo}</span></div>
                                            <div style={{ flex: '0 0 33%' }} className="p-2 text-center flex items-center justify-center relative"><span className="text-[9pt] text-black uppercase font-bold">{(f as any).rg}</span>
                                                {!isFinalized && !isGeneratingPdf && (
                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1 no-print opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 p-0.5 rounded shadow-sm">
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => setEditingFiscal({ index: i, data: f as any })} className="h-5 w-5"><Pencil className="h-2.5 w-2.5" /></Button>
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} className="h-5 w-5 text-rose-500"><Trash2 className="h-2.5 w-2.5" /></Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )) : <div className="text-center opacity-30 py-6 font-black uppercase text-[8pt] italic">Selecione as autoridades sanitárias</div>}
                                </div>
                            </div>

                            <div className="section-box" style={{ borderTop: 'none' }}>
                                <div className="sub-header-row flex items-center justify-between">
                                    <span>3. FUNDAMENTAÇÃO E RELATO TÉCNICO</span>
                                    {!isFinalized && !isGeneratingPdf && <AssistenteIAFormDialog onApply={(t, f) => { const ct = getValues('teor') || ""; setValue('teor', (ct && ct !== '<br>' ? ct + '<br>' : "") + t); if (f) { const cb = getValues('legislacaoBase') || ""; setValue('legislacaoBase', (cb && cb !== '<br>' ? cb + '; ' : "") + f); } }} />}
                                </div>
                                <div className="flex flex-col">
                                    <div className="p-3 border-b border-black/10"><span className="data-label">BASE LEGAL PARA AUTUAÇÃO:</span><RichTextEditor value={watch('legislacaoBase') || ""} onChange={(v) => setValue('legislacaoBase', v)} disabled={isFinalized} fontSize="10pt" minHeight="2em" /></div>
                                    <div className="p-3"><span className="data-label">RELATO DOS FATOS CONSTATADOS:</span><RichTextEditor value={watch('teor') || ""} onChange={(v) => setValue('teor', v)} disabled={isFinalized} fontSize="10.5pt" minHeight="12em" /></div>
                                </div>
                            </div>

                            <div className="section-box" style={{ borderTop: 'none' }}>
                                <div className="sub-header-row">4. NOTIFICAÇÃO E PRAZO PARA DEFESA</div>
                                <div className="p-4 bg-zinc-50/20"><RichTextEditor value={watch('prazo')} onChange={(v) => setValue('prazo', v)} disabled={isFinalized} fontSize="9.5pt" minHeight="4em" /></div>
                            </div>

                            <div className="section-box" style={{ borderTop: 'none' }}>
                                <div className="sub-header-row">5. CIÊNCIA DIGITAL</div>
                                <div className="p-6">
                                    <div className="grid grid-cols-2 gap-12">
                                        <div className="space-y-12">
                                            {fields.map((f, i) => (
                                                <div className="flex flex-col items-center">
                                                    <div className="min-h-[50pt] flex flex-col items-center justify-end">
                                                        {(f as any).signature && <img src={(f as any).signature} className="h-10 object-contain mb-0" alt="S" />}
                                                        {!isFinalized && !isGeneratingPdf && <button type="button" onClick={() => setSignatureTarget({ type: 'fiscal', index: i })} className="no-print text-primary text-[6pt] font-black tracking-widest uppercase underline">[Assinar Fiscal]</button>}
                                                    </div>
                                                    <div className="signature-block w-full"><p className="signature-name">{(f as any).nome}</p><p className="signature-title">{(f as any).cargo} — RG/CPF: {(f as any).rg || "---"}</p></div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="space-y-12">
                                            {!recusouAssinar ? (
                                                <div className="flex flex-col items-center">
                                                    <div className="min-h-[50pt] flex flex-col items-center justify-end">
                                                        {signatureResponsavel && <img src={signatureResponsavel} className="h-10 object-contain mb-0" alt="S" />}
                                                        {!isFinalized && !isGeneratingPdf && <button type="button" onClick={() => setSignatureTarget({ type: 'responsavel' })} className="no-print text-primary text-[6pt] font-black tracking-widest uppercase underline">[Assinar Autuado]</button>}
                                                    </div>
                                                    <div className="signature-block w-full"><p className="signature-name">{watch("reu") || "RESPONSÁVEL NO LOCAL"}</p><p className="signature-title">CIÊNCIA DO AUTUADO</p><p className="text-[7pt] italic mt-1 opacity-70">Ciente em {(signatureResponsavel && dataRecebimento) ? format(new Date(dataRecebimento), "dd/MM/yyyy") : "____/____/____"} às {(signatureResponsavel && dataRecebimento) ? format(new Date(dataRecebimento), "HH:mm") : "____:____"}h</p></div>
                                                </div>
                                            ) : (
                                                <div className="text-center p-6 border-2 border-dashed border-rose-600 rounded-2xl bg-rose-50 flex flex-col items-center justify-center"><p className="font-black text-[10pt] uppercase text-rose-700 italic">RECUSA DE ASSINATURA REGISTRADA</p></div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {!isFinalized && (
                    <div className="fixed bottom-0 left-0 right-0 z-[100] no-print px-4 pb-8 pt-4 bg-white/90 backdrop-blur-xl border-t border-zinc-200 shadow-[0_-25px_50px_rgba(0,0,0,0.15)]">
                        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
                            <Button type="button" onClick={() => handleSaveDraft()} disabled={isSavingDraft || isSaving} variant="outline" className="w-full sm:w-auto h-16 px-10 rounded-2xl border-zinc-300 text-zinc-600 font-black uppercase text-[11px] tracking-widest gap-3 shadow-md">
                                {isSavingDraft ? <Loader2 className="animate-spin h-5 w-5" /> : <Save className="h-5 w-5" />} Salvar Rascunho
                            </Button>
                            <Button type="button" onClick={handleSubmit(handleFinalize)} disabled={isSaving || isSavingDraft} className="flex-1 w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white gap-4 rounded-2xl shadow-2xl shadow-emerald-600/30">
                                {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : <FileCheck2 className="h-6 w-6" />}
                                <div className="flex flex-col items-start leading-none text-left"><span className="text-lg font-black uppercase tracking-tighter italic">FINALIZAR DOCUMENTO</span><span className="text-[8px] font-bold opacity-70 uppercase tracking-widest mt-0.5">Sincronizar e baixar PDF oficial</span></div>
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <SignaturePad isOpen={!!signatureTarget} onOpenChange={(o) => !o && setSignatureTarget(null)} onSave={handleSignatureSave} title="Assinatura Digital Oficial" />
            
            <Dialog open={!!editingFiscal} onOpenChange={(o) => !o && setEditingFiscal(null)}>
                <DialogContent className="rounded-[2.5rem] sm:max-w-md"><DialogHeader><DialogTitle className="font-black uppercase tracking-tighter text-xl italic">Editar Autoridade</DialogTitle></DialogHeader>{editingFiscal && (<div className="space-y-5 py-4"><div className="space-y-1.5"><Label className="text-[9px] font-black uppercase text-zinc-400 ml-1">Nome Completo</Label><Input value={editingFiscal.data.nome} onChange={(e) => setEditingFiscal({...editingFiscal, data: {...editingFiscal.data, nome: e.target.value.toUpperCase()}})} className="h-12 rounded-xl bg-zinc-50 border-none font-bold text-xs uppercase" /></div><div className="space-y-1.5"><Label className="text-[9px] font-black uppercase text-zinc-400 ml-1">Cargo</Label><Input value={editingFiscal.data.cargo} onChange={(e) => setEditingFiscal({...editingFiscal, data: {...editingFiscal.data, cargo: e.target.value.toUpperCase()}})} className="h-12 rounded-xl bg-zinc-50 border-none font-bold text-xs uppercase" /></div><div className="space-y-1.5"><Label className="text-[9px] font-black uppercase text-zinc-400 ml-1">Identidade</Label><Input value={editingFiscal.data.rg} onChange={(e) => setEditingFiscal({...editingFiscal, data: {...editingFiscal.data, rg: e.target.value.toUpperCase()}})} className="h-12 rounded-xl bg-zinc-50 border-none font-bold text-xs" /></div></div>)}<DialogFooter><Button onClick={() => { if (editingFiscal) { update(editingFiscal.index, editingFiscal.data); setEditingFiscal(null); toast({ title: "Dados Atualizados" }); } }} className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg">Salvar Alterações</Button></DialogFooter></DialogContent>
            </Dialog>
        </FormProvider>
    );
}

export function IntimacaoForm(props: { defaultValues?: Partial<Intimacao>, intimacaoId?: string }) {
    return (<Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}><FormContent {...props} /></Suspense>)
}

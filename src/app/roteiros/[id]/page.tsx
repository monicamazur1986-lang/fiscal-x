
"use client"

import { use, useState, useMemo, useRef, useEffect, useCallback } from "react"
import { 
  ArrowLeft, 
  Building2, 
  FileSearch, 
  Loader2, 
  Camera, 
  Download, 
  PenTool, 
  Check, 
  X, 
  Trash2, 
  Maximize2, 
  Minimize2, 
  FileText, 
  Save, 
  MessageSquare, 
  Plus, 
  ClipboardList, 
  Mic, 
  MicOff, 
  Sparkles, 
  Smartphone, 
  Search, 
  CheckCircle2,
  Scale,
  ListFilter,
  CheckSquare,
  Square,
  Cloud,
  History,
  Eraser
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { useStorage } from "@/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { useAppConfig } from "@/hooks/use-app-config"
import { useAuth } from "@/hooks/use-auth"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { SelecionarAutoridadeParaFormulario } from "@/components/selecionar-autoridade-dialog"
import { SignaturePad } from "@/components/signature-pad"
import type { Autoridade, Inspecao } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { Textarea } from "@/components/ui/textarea"
import { polishObservation } from "@/ai/flows/polish-observation"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"

type Criticality = 'I' | 'N' | 'R'
const OFFICIAL_SYMBOL_URL = "https://firebasestorage.googleapis.com/v0/b/firebasestudio-1937074168.appspot.com/o/user-uploads%2F67b6653d9e6e872d80ef618e%2Flogo_horizontal_preto_transparente.jpg?alt=media";

interface PhotoEvidence {
  url: string;
  timestamp: string;
  location: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  crit: Criticality;
}

interface ChecklistSection {
  id: string;
  titulo: string;
  itens: ChecklistItem[];
}

interface ChecklistData {
  titulo: string;
  subtitulo: string;
  categoria: string;
  lei: string;
  secoes: ChecklistSection[];
}

const odontoChecklist: ChecklistData = {
  titulo: 'Roteiro Serviços de Odontologia',
  subtitulo: '(Resolução SESA nº 442/2012)',
  categoria: 'SAÚDE',
  lei: 'Resolução SESA nº 442/2012',
  secoes: [
    {
        id: 'sec4',
        titulo: '4. DO PRONTUÁRIO DO PACIENTE',
        itens: [
          { id: '4.1.1', crit: 'I', text: 'Guarda segura, confidencialidade e integridade dos prontuários.' },
          { id: '4.1.2', crit: 'I', text: 'Registros de procedimentos legíveis, datados e assinados.' },
        ]
      },
      {
        id: 'sec5',
        titulo: '5. DA SEGURANÇA E SAÚDE NO TRABALHO',
        itens: [
          { id: '5.1.1', crit: 'I', text: 'Documento-base do PPRA/PGR implementado.' },
          { id: '5.1.4', crit: 'I', text: 'PCMSO implementado e atualizado.' },
          { id: '5.1.6', crit: 'I', text: 'Vacinação dos trabalhadores atualizada.' },
          { id: '5.1.7', crit: 'I', text: 'Protocolo de fluxo para acidentes com material biológico.' },
          { id: '5.2.1', crit: 'I', text: 'Disponibilidade e uso correto de EPIs e EPCs.' },
        ]
      }
  ]
}

const pharmacyChecklist: ChecklistData = {
    titulo: 'Roteiro Farmácias e Drogarias',
    subtitulo: '(RDC ANVISA nº 44/2009)',
    categoria: 'SAÚDE',
    lei: 'RDC ANVISA nº 44/2009',
    secoes: [
      {
        id: 'p1',
        titulo: '1. LICENCIAMENTO E RESPONSABILIDADE TÉCNICA',
        itens: [
          { id: '1.1', crit: 'I', text: 'Licença Sanitária atualizada e afixada em local visível.' },
          { id: '1.2', crit: 'I', text: 'Certidão de Regularidade Técnica (CRF) válida.' },
          { id: '1.3', crit: 'I', text: 'Assistência efetiva do Responsável Técnico (RT) no horário de funcionamento.' },
        ]
      }
    ]
}

export default function DynamicChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Resolve a Promise para obter o id
  const checklist = id === '3' ? pharmacyChecklist : odontoChecklist; // Usa o id resolvido
  const { toast } = useToast()
  const storage = useStorage()
  const { profile } = useAuth()
  const { config } = useAppConfig()
  const router = useRouter()
  const { saveInspecao, deleteInspecao, inspecoes, loading: loadingInspecoes } = useInspecoes()
  const reportRef = useRef<HTMLDivElement>(null)
  
  const [idData, setIdData] = useState({
    fantasia: '',
    cnpj: '',
    endereco: '',
    bairro: '',
    telefone: '',
    cnae: '',
    responsavel: '',
    responsavelCpf: '',
    signatureResponsavel: '',
    prazoDias: '15',
    conclusaoTexto: 'Diante das não conformidades apontadas, fica o estabelecimento notificado a proceder as adequações técnicas conforme criticidade identificada.'
  })

  const [currentInspecaoId, setCurrentInspecaoId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, 'SIM' | 'NAO' | 'ND'>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [showObsInput, setShowObsInput] = useState<Record<string, boolean>>({})
  const [itemPhotos, setItemPhotos] = useState<Record<string, PhotoEvidence[]>>({})
  const [uploadingItem, setUploadingItem] = useState<string | null>(null)
  const [view, setView] = useState<'checklist' | 'report'>('checklist')
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false)
  const [fiscais, setFiscais] = useState<Autoridade[]>([])
  const [signingFiscalIndex, setSigningFiscalIndex] = useState<number | null>(null)
  const [signingResponsavel, setSigningResponsavel] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isDeletingDraft, setIsDeletingDraft] = useState(false)
  const [foundCnaes, setFoundCnaes] = useState<string[]>([]);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [draftToResume, setDraftToResume] = useState<Inspecao | null>(null);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);

  // Auto-save em tempo real (Heartbeat a cada 15 segundos)
  useEffect(() => {
    if (view === 'report' || !profile) return;
    const timer = setInterval(() => {
        if (Object.keys(answers).length > 0 || idData.fantasia) {
            handleSaveDraft(false);
            setLastAutoSave(new Date());
        }
    }, 15000); 
    return () => clearInterval(timer);
  }, [profile, answers, idData, view]);

  // Carregar rascunho vinculado ao Login e Roteiro
  useEffect(() => {
    if (!loadingInspecoes && profile && !currentInspecaoId) {
      const draft = inspecoes.find(i => i.status === 'rascunho' && i.checklistData?.roteiroId === id && i.fiscalId === profile.uid);
      if (draft && draft.checklistData) {
        setDraftToResume(draft);
        setIsResumeDialogOpen(true);
      }
    }
  }, [loadingInspecoes, inspecoes, id, profile, currentInspecaoId]);

  const handleResumeDraft = () => {
    if (draftToResume && draftToResume.checklistData) {
        setAnswers(draftToResume.checklistData.answers || {});
        setObservations(draftToResume.checklistData.observations || {});
        setItemPhotos(draftToResume.checklistData.itemPhotos || {});
        setIdData(draftToResume.checklistData.idData || {});
        setCurrentInspecaoId(draftToResume.id);
        toast({ title: "Vistoria Retomada" });
    }
    setIsResumeDialogOpen(false);
  };

  const handleStartFresh = async () => {
    if (draftToResume?.id) {
        await deleteInspecao(draftToResume.id);
    }
    setIsResumeDialogOpen(false);
    toast({ title: "Nova Vistoria", description: "Iniciando do zero." });
  };

  const handleSaveDraft = useCallback(async (showToast = true) => {
    if (!profile) return;
    setIsSavingDraft(true);
    try {
      const data: Partial<Inspecao> = {
        titulo: idData.fantasia || "INSPEÇÃO EM CURSO",
        status: 'rascunho',
        data: new Date(),
        fiscalId: profile.uid,
        fiscalNome: profile.displayName || "Fiscal",
        checklistData: { answers, observations, itemPhotos, idData, roteiroId: id }
      };
      const res = await saveInspecao(data, currentInspecaoId || undefined);
      if (res?.id) setCurrentInspecaoId(res.id);
      if (showToast) toast({ title: "Sincronizado" });
    } catch (e) {
      if (showToast) toast({ variant: "destructive", title: "Erro na Nuvem" });
    } finally {
      setIsSavingDraft(false);
    }
  }, [profile, idData, answers, observations, itemPhotos, id, saveInspecao, currentInspecaoId, toast]);

  const [polishingItem, setPolishingItem] = useState<string | null>(null)

  const handlePolishText = async (itemId: string) => {
    const currentText = observations[itemId];
    if (!currentText?.trim()) return;
    setPolishingItem(itemId);
    try {
      const result = await polishObservation({ text: currentText, uid: profile?.uid || '' });
      if (result.polishedText) { 
        setObservations(prev => ({ ...prev, [itemId]: result.polishedText.toUpperCase() }));
        handleSaveDraft(false);
      }
    } finally { setPolishingItem(null); }
  }

  const handleDeleteDraft = async () => {
    if (!currentInspecaoId) {
        setAnswers({}); setObservations({}); setItemPhotos({}); setIdData(prev => ({...prev, fantasia: '', cnpj: '', cnae: ''}));
        return;
    }
    if (!window.confirm("CONFIRMAR EXCLUSÃO DESTE RASCUNHO?")) return;
    setIsDeletingDraft(true);
    try {
        await deleteInspecao(currentInspecaoId);
        toast({ title: "Rascunho Excluído" });
        router.push("/roteiros");
    } catch (e) { toast({ variant: "destructive", title: "Erro ao excluir" }); } finally { setIsDeletingDraft(false); }
  };

  const handleCnpjLookup = async () => {
    const val = idData.cnpj.replace(/\D/g, "");
    if (val.length !== 14) return;
    setIsSearchingCnpj(true);
    try {
      const res = await fetch(`/api/cnpj/${val}`);
      if (res.ok) {
        const data = await res.json();
        const updated = { ...idData, fantasia: data.razao_social, endereco: `${data.logradouro}, ${data.numero}`, bairro: data.bairro, responsavel: data.responsavel_legal, telefone: data.telefone || "", cnae: data.cnae || "" };
        setIdData(updated);
        setFoundCnaes(data.cnaes_list || []);
        toast({ title: "Empresa Localizada" });
        // Trigger save with new data
        setIsSavingDraft(true);
        const resSave = await saveInspecao({
            titulo: data.razao_social,
            status: 'rascunho',
            data: new Date(),
            fiscalId: profile!.uid,
            fiscalNome: profile!.displayName || "Fiscal",
            checklistData: { answers, observations, itemPhotos, idData: updated, roteiroId: id }
        }, currentInspecaoId || undefined);
        if (resSave?.id) setCurrentInspecaoId(resSave.id);
        setIsSavingDraft(false);
      }
    } finally { setIsSearchingCnpj(false); }
  }

  const handlePhotoUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !storage || !profile) return;
    setUploadingItem(itemId);
    try {
      const storageRef = ref(storage, `inspecoes/${profile.uid}/${itemId}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const newPhoto: PhotoEvidence = { url, timestamp: format(new Date(), "dd/MM/yyyy HH:mm"), location: idData.fantasia || "Local da Inspeção" };
      setItemPhotos(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), newPhoto] }));
      toast({ title: "Foto Sincronizada" });
      handleSaveDraft(false); 
    } catch (err) { toast({ variant: "destructive", title: "Erro no Upload" }); } finally { setUploadingItem(null); }
  };

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPdf(true);
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
      pdf.save(`RELATÓRIO - ${idData.fantasia || 'INSPEÇÃO'}.pdf`);
    } finally { setIsGeneratingPdf(false); }
  };

  const nonConformities = useMemo(() => {
    const all = checklist.secoes.flatMap(s => s.itens);
    const filtered = all.filter(i => answers[i.id] === 'NAO');
    return { I: filtered.filter(i => i.crit === 'I'), N: filtered.filter(i => i.crit === 'N'), R: filtered.filter(i => i.crit === 'R') };
  }, [answers, checklist]);

  const logoSource = config.logoUrl || OFFICIAL_SYMBOL_URL;
  const isDataUrl = logoSource.startsWith('data:');
  const displayLogoUrl = isDataUrl ? logoSource : `/api/proxy-image?url=${encodeURIComponent(logoSource)}`;

  if (view === 'report') {
    return (
      <div className="document-container font-serif pb-40">
        <header className="flex flex-wrap items-center justify-between no-print mb-10 gap-4 w-full max-w-[210mm] px-4">
            <Button onClick={() => setView('checklist')} variant="outline" className="rounded-xl h-11 font-black uppercase text-[10px] bg-white shadow-sm"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Edição</Button>
            <Button onClick={downloadPdf} disabled={isGeneratingPdf} className="bg-primary text-white rounded-xl h-11 px-8 font-black uppercase text-[10px] shadow-xl">{isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Baixar PDF Oficial</Button>
        </header>

        <div className="document-paper-wrapper custom-scrollbar">
          <div ref={reportRef} className="document-paper h-auto bg-white">
              <div className="flex flex-row items-center justify-between gap-6 mb-1 pb-2 border-none">
                  <div className="w-[140px] h-[100px] md:w-[180px] md:h-[100px] flex items-center justify-start overflow-hidden"><img src={displayLogoUrl} className="max-w-full max-h-full object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} /></div>
                  <div className="flex-1 text-center">
                    {config.headerRichText ? (<div style={{ fontFamily: "'Times New Roman', Times, serif" }} dangerouslySetInnerHTML={{ __html: config.headerRichText }} />) : (<><p className="text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "PRUDENTÓPOLIS"}</p><h2 className="text-[12pt] font-black uppercase leading-tight">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2><h3 className="text-[10pt] font-bold uppercase text-zinc-700">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3></>)}
                    <p className="text-[14pt] font-black uppercase italic tracking-tighter mt-2 border-y border-zinc-200 py-1">RELATÓRIO DE INSPEÇÃO SANITÁRIA</p>
                  </div>
              </div>

              <div className="mb-6">
                  <div className="sub-header-row">1. IDENTIFICAÇÃO DO ESTABELECIMENTO</div>
                  <table className="form-table-clean border-black">
                      <tbody>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">RAZÃO SOCIAL / NOME FANTASIA:</span><div className="font-black text-[11pt]">{idData.fantasia || "---"}</div></td></tr>
                          <tr><td style={{ padding: '6pt 10pt' }}><span className="data-label">CNPJ / CPF:</span><div className="font-bold text-[10pt]">{idData.cnpj || "---"}</div></td><td style={{ padding: '6pt 10pt' }}><span className="data-label">TELEFONE:</span><div className="font-bold text-[10pt]">{idData.telefone || "---"}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">ATIVIDADES (CNAE):</span><div className="font-bold text-[9pt] leading-tight text-zinc-800 uppercase">{idData.cnae || "---"}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">ENDEREÇO:</span><div className="font-bold text-[10pt]">{idData.endereco} - {idData.bairro}</div></td></tr>
                      </tbody>
                  </table>
              </div>

              <div className="mb-6">
                  <div className="sub-header-row">2. NÃO CONFORMIDADES DETECTADAS</div>
                  {Object.keys(nonConformities).some(k => nonConformities[k as Criticality].length > 0) ? (
                      (['I', 'N', 'R'] as Criticality[]).map(crit => (
                          nonConformities[crit].length > 0 && (
                              <div key={crit} className="mt-4 first:mt-0 space-y-2">
                                  <div className={cn("px-4 py-1.5 border-l-4 font-black text-[9.5pt] uppercase flex items-center gap-2", crit === 'I' ? "bg-red-50 border-red-600 text-red-700" : crit === 'N' ? "bg-amber-50 border-amber-500 text-amber-700" : "bg-blue-50 border-blue-600 text-blue-700")}>CRITICIDADE: {crit === 'I' ? "IMPRESCINDÍVEL" : crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</div>
                                  {nonConformities[crit].map(item => (
                                      <div key={item.id} className="pl-4 pb-4 border-b border-zinc-100 break-inside-avoid">
                                          <div className="flex items-start gap-3 mb-2"><span className="font-black text-[9pt] text-zinc-900 bg-zinc-50 h-6 w-6 flex items-center justify-center rounded">{item.id}</span><p className="text-[9.5pt] leading-relaxed text-zinc-800 font-bold flex-1 uppercase">{item.text}</p></div>
                                          {observations[item.id] && (<div className="ml-8 mb-2 p-3 bg-zinc-50 border-l-2 border-zinc-300 rounded-r-lg"><p className="text-[7pt] font-black uppercase text-zinc-400 mb-0.5">Relato do Fiscal:</p><p className="text-[9.5pt] text-zinc-700 leading-relaxed italic whitespace-pre-wrap uppercase">{observations[item.id]}</p></div>)}
                                      </div>
                                  ))}
                              </div>
                          )
                      ))
                  ) : <div className="py-12 text-center border-2 border-dashed border-zinc-100 rounded-2xl mx-2"><CheckCircle2 className="h-10 w-10 text-emerald-100 mx-auto mb-2" /><p className="font-black text-zinc-300 uppercase text-[10pt] tracking-widest italic">Nenhuma irregularidade detectada.</p></div>}
              </div>

              <div className="mb-8">
                  <div className="sub-header-row">3. CONCLUSÃO E PRAZO LEGAL</div>
                  <div className="border border-[#171717] p-4 bg-zinc-50/50"><p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">{idData.conclusaoTexto}</p><div className="mt-4 pt-4 border-t border-zinc-200 text-center"><p className="font-black text-[12pt] uppercase underline">PRAZO PARA REGULARIZAÇÃO: {idData.prazoDias} DIAS ÚTEIS.</p></div></div>
              </div>

              <div className="mt-12 grid grid-cols-2 gap-8 text-center">
                  <div className="space-y-10 flex flex-col items-center">
                      {fiscais.map((f, i) => (
                          <div key={i} className="w-full max-w-[220px]"><div className="min-h-[40pt] flex flex-col items-center justify-end">{(f as any).signature && <img src={(f as any).signature} className="h-10 object-contain mb-0" alt="S" />}<div className="signature-block w-full"><p className="signature-name">{(f as any).nome}</p><p className="signature-title">{(f as any).cargo}</p></div></div></div>
                      ))}
                  </div>
                  <div className="space-y-10 flex flex-col items-center">
                      <div className="w-full max-w-[220px]"><div className="min-h-[40pt] flex flex-col items-center justify-end">{idData.signatureResponsavel && <img src={idData.signatureResponsavel} className="h-10 object-contain mb-0" alt="S" />}<div className="signature-block w-full"><p className="signature-name">{idData.responsavel || "INSPECIONADO"}</p><p className="signature-title">CIÊNCIA DO AUTUADO</p></div></div></div>
                  </div>
              </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto w-full p-4 md:p-8 space-y-6 md:space-y-8 pb-40 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-xl no-print">
        <div className="flex items-center gap-4">
          <div className={cn("p-4 rounded-2xl bg-opacity-10", id === '3' ? "bg-blue-500 text-blue-600" : "bg-emerald-500 text-emerald-600")}><ClipboardList className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{checklist.titulo}</h1>
            <p className="text-[8px] md:text-[9px] text-zinc-400 font-black uppercase tracking-[0.2em] mt-1">{checklist.subtitulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
            {lastAutoSave && (<div className="hidden sm:flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100"><Cloud className="h-3 w-3" /><span className="text-[8px] font-black uppercase">Salvo às {format(lastAutoSave, "HH:mm")}</span></div>)}
            <button onClick={handleDeleteDraft} className="h-12 w-12 rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all">{isDeletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-5 w-5" />}</button>
            <Button onClick={() => handleSaveDraft()} disabled={isSavingDraft} variant="outline" className="h-12 rounded-xl font-black uppercase text-[10px] tracking-widest gap-2 border-zinc-200 shadow-sm">{isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
        </div>
      </header>

      <div className="space-y-8 no-print">
          <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 flex items-center gap-3"><Building2 className="h-4 w-4 text-primary" /> Identificação do Local</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2"><Label className="text-[9px] font-black uppercase text-zinc-500">CNPJ do Estabelecimento</Label><div className="flex gap-2"><Input value={idData.cnpj} onChange={e => setIdData({...idData, cnpj: e.target.value})} placeholder="00.000.000/0000-00" className="h-12 rounded-xl bg-slate-50 border-none font-bold" /><Button onClick={handleCnpjLookup} disabled={isSearchingCnpj} variant="secondary" className="h-12 w-12 rounded-xl">{isSearchingCnpj ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}</Button></div></div>
                   <div className="space-y-2"><Label className="text-[9px] font-black uppercase text-zinc-500">Razão Social</Label><Textarea value={idData.fantasia} onChange={e => setIdData({...idData, fantasia: e.target.value.toUpperCase()})} className="min-h-[48px] rounded-xl bg-slate-50 border-none font-bold uppercase resize-none" /></div>
                </div>

                {foundCnaes.length > 0 && (<div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl space-y-4"><div className="flex items-center justify-between px-1"><Label className="text-[9px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-2"><ListFilter className="h-3 w-3" /> Selecionar Atividades (CNAE)</Label></div><div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">{foundCnaes.map((c, i) => { const isSelected = (idData.cnae || "").includes(c); return (<button key={i} type="button" onClick={() => { const current = idData.cnae || ""; const items = current.split(';').map(s => s.trim()).filter(Boolean); let newCnae = items.includes(c) ? items.filter(i => i !== c).join('; ') : [...items, c].join('; '); setIdData({...idData, cnae: newCnae.toUpperCase()}); }} className={cn("w-full text-left p-4 rounded-2xl text-[9px] font-bold uppercase transition-all border flex items-center gap-4", isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-blue-100 text-blue-500")}>{isSelected ? <Check className="h-4 w-4" /> : <div className="h-4 w-4 rounded border border-blue-200" />}<span className="flex-1 leading-tight">{c}</span></button>)})}</div></div>)}
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-10">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 flex items-center gap-3"><FileSearch className="h-4 w-4 text-primary" /> Avaliação Técnica (SESA)</h2>
              {checklist.secoes.map((secao) => (
                <div key={secao.id} className="space-y-6">
                  <h3 className="text-xs font-black text-slate-900 border-l-4 border-primary pl-4 uppercase">{secao.titulo}</h3>
                  <div className="space-y-4">
                    {secao.itens.map((item) => (
                      <div key={item.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-5 group transition-all hover:bg-white hover:shadow-xl">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                          <div className="flex-1 space-y-2"><div className="flex items-center gap-3"><Badge className={cn("text-[7px] font-black uppercase px-2", item.crit === 'I' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}>{item.crit === 'I' ? "IMPRESCINDÍVEL" : "NECESSÁRIO"}</Badge><span className="text-[9px] font-black text-slate-400">ITEM {item.id}</span></div><p className="text-sm font-bold text-slate-800 leading-relaxed uppercase">{item.text}</p></div>
                          <RadioGroup value={answers[item.id]} onValueChange={(v: any) => { setAnswers(prev => ({ ...prev, [item.id]: v })); handleSaveDraft(false); }} className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200">{['SIM', 'NAO', 'ND'].map(opt => (<label key={opt} className={cn("flex items-center justify-center h-10 px-5 rounded-xl text-[9px] font-black cursor-pointer transition-all", answers[item.id] === opt ? "bg-primary text-white" : "text-slate-400 hover:bg-slate-100")}><RadioGroupItem value={opt} className="sr-only" /> {opt}</label>))}</RadioGroup>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200/50"><button type="button" onClick={() => setShowObsInput(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all", (observations[item.id] || showObsInput[item.id]) ? "bg-primary/10 text-primary" : "text-slate-400")}><MessageSquare className="h-3.5 w-3.5" /> {observations[item.id] ? "Ver Nota" : "Observação"}</button></div>
                        {(showObsInput[item.id] || observations[item.id]) && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><div className="flex items-center justify-between"><Label className="text-[8px] font-black text-primary uppercase">Relato de Irregularidade</Label><div className="flex gap-2"><Button onClick={() => handlePolishText(item.id)} disabled={polishingItem === item.id} variant="ghost" size="sm" className="h-7 px-3 bg-violet-50 text-violet-600 rounded-lg font-black text-[8px] uppercase">{polishingItem === item.id ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Sparkles className="h-3 w-3 mr-1.5" />} IA</Button></div></div><Textarea value={observations[item.id] || ""} onChange={e => { setObservations(prev => ({ ...prev, [item.id]: e.target.value.toUpperCase() })); handleSaveDraft(false); }} placeholder="Descreva a situação..." className="min-h-[100px] rounded-2xl bg-white border-slate-200 text-sm font-medium uppercase" /></div>)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-10 pt-4">
                <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl space-y-8">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-2xl bg-primary/20"><ClipboardList className="h-5 w-5 text-primary" /></div><div><h3 className="text-xl font-black uppercase italic tracking-tighter">Resumo da Vistoria</h3></div></div><Badge className="bg-primary text-white border-none text-[10px] font-black px-4 h-8">{Object.keys(answers).length} ITENS</Badge></div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1"><p className="text-[10px] font-black uppercase text-white/60">Assinaturas</p><SelecionarAutoridadeParaFormulario onSelect={(f) => { setFiscais(prev => [...prev, f]); handleSaveDraft(false); }} /></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {fiscais.map((f, i) => (<Button key={i} onClick={() => setSigningFiscalIndex(i)} variant="outline" className={cn("h-14 rounded-2xl justify-between px-5 font-bold text-[10px] uppercase border-white/10 bg-white/5 text-white", f.signature && "border-emerald-500/50 bg-emerald-500/10")}><span className="truncate">{(f as any).nome}</span>{f.signature ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <PenTool className="h-4 w-4 text-white/20" />}</Button>))}
                            <Button onClick={() => setSigningResponsavel(true)} variant="outline" className={cn("h-14 rounded-2xl justify-between px-5 font-bold text-[10px] uppercase border-white/10 bg-white/5 text-white", idData.signatureResponsavel && "border-emerald-500/50 bg-emerald-500/10")}><span className="truncate">{idData.responsavel || "ASSINAR RESPONSÁVEL"}</span>{idData.signatureResponsavel ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <PenTool className="h-4 w-4 text-white/20" />}</Button>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[100] no-print px-4 pb-8 pt-4 bg-white/90 backdrop-blur-xl border-t border-zinc-200 shadow-[0_-25px_50px_rgba(0,0,0,0.15)]">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
              <Button type="button" onClick={() => handleSaveDraft()} disabled={isSavingDraft} variant="outline" className="w-full sm:w-auto h-16 px-10 rounded-2xl border-zinc-300 text-zinc-600 font-black uppercase text-[11px] tracking-widest gap-3 shadow-md">{isSavingDraft ? <Loader2 className="animate-spin h-5 w-5" /> : <Save className="h-5 w-5" />} Salvar Rascunho</Button>
              <Button type="button" onClick={async () => { await handleSaveDraft(false); setView('report'); window.scrollTo(0,0); }} disabled={Object.keys(answers).length === 0} className="flex-1 w-full h-16 bg-primary hover:bg-primary/90 text-white gap-4 rounded-2xl shadow-2xl transition-all active:scale-95"><FileText className="h-6 w-6" /><div className="flex flex-col items-start leading-none text-left"><span className="text-lg font-black uppercase tracking-tighter italic">VISUALIZAR RELATÓRIO</span><span className="text-[8px] font-bold opacity-70 uppercase tracking-widest mt-0.5">Sincronizar e gerar PDF</span></div></Button>
          </div>
      </div>

      <Dialog open={isResumeDialogOpen} onOpenChange={setIsResumeDialogOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl bg-white overflow-hidden p-0">
            <DialogHeader className="p-8 bg-zinc-900 text-white border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-primary/20 text-primary"><History className="h-6 w-6" /></div>
                    <div>
                        <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Retomar Vistoria?</DialogTitle>
                        <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Existe um roteiro em andamento seu</DialogDescription>
                    </div>
                </div>
            </DialogHeader>
            <div className="p-8 space-y-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                     <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">Estabelecimento:</p>
                     <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-slate-800 uppercase truncate">{draftToResume?.titulo || "VISTORIA SEM NOME"}</span>
                     </div>
                     <p className="text-[10px] font-medium text-slate-500 italic">Preenchido até às {draftToResume?.updatedAt ? format(new Date(draftToResume.
                      
                     updatedAt), "HH:mm") : "..."}</p>
                </div>
                <p className="text-[11px] font-bold text-slate-500 text-center leading-relaxed">Deseja continuar exatamente de onde parou ou iniciar um novo formulário?</p>
            </div>
            <DialogFooter className="p-8 bg-zinc-50 border-t border-zinc-100 flex gap-3">
                <Button variant="ghost" onClick={handleStartFresh} className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] text-rose-500 hover:bg-rose-50 gap-2"><Eraser className="h-3.5 w-3.5" /> Novo Zero</Button>
                <Button onClick={handleResumeDraft} className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-[10px] uppercase tracking-widest shadow-xl">Retomar Agora</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignaturePad isOpen={signingFiscalIndex !== null} onOpenChange={(open) => !open && setSigningFiscalIndex(null)} onSave={(sig) => { if (signingFiscalIndex !== null) { const updated = [...fiscais]; updated[signingFiscalIndex] = { ...updated[signingFiscalIndex], signature: sig }; setFiscais(updated); handleSaveDraft(false); } }} title="Assinatura Fiscal" />
      <SignaturePad isOpen={signingResponsavel} onOpenChange={setSigningResponsavel} onSave={(sig) => { setIdData({...idData, signatureResponsavel: sig}); handleSaveDraft(false); }} title="Ciência Inspecionado" />
    </div>
  )
}

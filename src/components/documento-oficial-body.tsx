"use client"

import React, { useState } from "react"
import { Loader2, Search, Pencil, Trash2, Plus, X } from "lucide-react"
import { format } from "date-fns"
import type { Control, UseFormWatch, UseFormSetValue, UseFormGetValues, FieldArrayWithId } from "react-hook-form"
import type { z } from "zod"

import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form"
import { intimacaoSchema } from "@/lib/schema"
import { Autoridade } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SelecionarAutoridadeParaFormulario } from "./selecionar-autoridade-dialog"
import { RichTextEditor } from "./rich-text-editor"
import { AssistenteIAFormDialog } from "./assistente-ia-form-dialog"
import { Textarea } from "./ui/textarea"
import type { MunicipalityConfig } from "@/hooks/use-app-config"

export type IntimacaoFormValues = z.infer<typeof intimacaoSchema>
export type SignatureTargetType = 'fiscal' | 'responsavel' | 'responsavelTecnico' | 'testemunha1' | 'testemunha2'

const termoOptions = ["TERMO DE INTIMAÇÃO", "AUTO DE INFRAÇÃO", "TERMO DE APREENSÃO", "TERMO DE INTERDIÇÃO", "TERMO DE INUTILIZAÇÃO"];
const DEFAULT_SYMBOL = "https://firebasestorage.googleapis.com/v0/b/firebasestudio-1937074168.appspot.com/o/user-uploads%2F67b6653d9e6e872d80ef618e%2Flogo_horizontal_preto_transparente.jpg?alt=media";

interface DocumentoOficialBodyProps {
  control: Control<IntimacaoFormValues>;
  watch: UseFormWatch<IntimacaoFormValues>;
  setValue: UseFormSetValue<IntimacaoFormValues>;
  getValues: UseFormGetValues<IntimacaoFormValues>;
  fields: FieldArrayWithId<IntimacaoFormValues, "autoridades", "id">[];
  onAppendAutoridade: (a: Autoridade) => void;
  onRemoveAutoridade: (index: number) => void;
  onEditAutoridade: (index: number, data: Autoridade) => void;
  isFinalized: boolean;
  isGeneratingPdf: boolean;
  config: MunicipalityConfig;
  formRef?: React.Ref<HTMLFormElement>;
  headerRef?: React.Ref<HTMLElement>;
  onRequestSignature: (target: { type: SignatureTargetType, index?: number }) => void;
  onTipoTermoChange?: (value: string) => void;
  onPrazoChange?: (value: string) => void;
  showCnpjLookup?: boolean;
  onCnpjLookup?: () => void;
  isSearchingCnpj?: boolean;
  onSubmit?: (e: React.FormEvent) => void;
}

export function DocumentoOficialBody({
  control, watch, setValue, getValues,
  fields, onAppendAutoridade, onRemoveAutoridade, onEditAutoridade,
  isFinalized, isGeneratingPdf, config,
  formRef, headerRef, onRequestSignature, onTipoTermoChange, onPrazoChange,
  showCnpjLookup = true, onCnpjLookup, isSearchingCnpj = false,
  onSubmit,
}: DocumentoOficialBodyProps) {
  // Nome curto: os 3 campos (nome, cargo/conselho, documento) cabem numa linha
  // só, já que RG/CPF e conselho são sempre curtos. Nome muito longo: cargo e
  // documento descem para a linha seguinte, para não espremer o nome.
  const LONG_NAME_THRESHOLD = 45;
  const reuNome = watch('reu') || '';
  const tecnicoNome = watch('responsavelTecnico') || '';
  const isReuNomeLonga = reuNome.length > LONG_NAME_THRESHOLD;
  const isTecnicoNomeLonga = tecnicoNome.length > LONG_NAME_THRESHOLD;

  const recusouAssinar = watch("recusouAssinar");
  const signatureResponsavel = watch("signatureResponsavel");
  const dataRecebimento = watch("dataRecebimento");
  const responsavelTecnicoNome = tecnicoNome;
  const signatureResponsavelTecnico = watch("signatureResponsavelTecnico");
  const dataRecebimentoTecnico = watch("dataRecebimentoTecnico");

  // Responsável técnico é opcional — some do formulário até o fiscal clicar
  // para adicionar, igual ao botão "+ Fiscal". Se o documento já tiver algum
  // dado técnico preenchido (ex.: ao editar um rascunho), começa expandido.
  const [mostrarResponsavelTecnico, setMostrarResponsavelTecnico] = useState(
    () => !!(watch('responsavelTecnico') || watch('responsavelTecnicoIdentidade') || watch('responsavelTecnicoConselho'))
  );

  const handleRemoverResponsavelTecnico = () => {
    setValue('responsavelTecnico', '');
    setValue('responsavelTecnicoIdentidade', '');
    setValue('responsavelTecnicoConselho', '');
    setValue('signatureResponsavelTecnico', '');
    setMostrarResponsavelTecnico(false);
  };

  const logoSource = config.logoUrl || DEFAULT_SYMBOL;
  const isDataUrl = logoSource.startsWith('data:');
  const displayLogoUrl = isDataUrl ? logoSource : `/api/proxy-image?url=${encodeURIComponent(logoSource)}`;

  return (
    <form ref={formRef} onSubmit={onSubmit ?? ((e) => e.preventDefault())}>
      <header ref={headerRef} className="flex flex-row items-center justify-between gap-6 md:gap-8 mb-3 pb-3">
        <div className="flex items-center justify-start shrink-0">
          <img src={displayLogoUrl} className="max-w-[140px] md:max-w-[180px] max-h-[80px] md:max-h-[100px] w-auto h-auto object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} />
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

      <div className="section-box flex flex-row overflow-visible min-h-[30pt] mb-4" style={{ border: '1pt solid #94a3b8' }}>
        <div className="flex-1 border-r border-[#94a3b8] p-2 flex items-center justify-center text-center">
          <FormField control={control} name="tipoTermo" render={({ field }) => (
            isGeneratingPdf ? <h1 className="font-black text-[12pt] md:text-[14pt] uppercase text-black">{field.value}</h1> : (
              <Select onValueChange={(v) => { field.onChange(v); onTipoTermoChange?.(v); }} value={field.value} disabled={isFinalized}>
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
              {showCnpjLookup && !isFinalized && !isGeneratingPdf && (
                <Button onClick={onCnpjLookup} type="button" disabled={isSearchingCnpj} size="sm" variant="ghost" className="h-7 gap-1.5 px-3 rounded-lg font-black text-[8px] uppercase tracking-widest text-primary border border-primary/20 bg-white no-print">{isSearchingCnpj ? <Loader2 className="animate-spin h-3 w-3" /> : <Search className="h-3 w-3" />} Consultar</Button>
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
        {!isReuNomeLonga ? (
          <div className="data-row border-none">
            <div className="data-cell" style={{ flex: '1 1 0%' }}>
              <span className="data-label">RESPONSÁVEL LEGAL / RESPONSÁVEL NO LOCAL:</span>
              <FormField control={control} name="reu" render={({ field }) => (<Textarea value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input min-h-[1.5em] resize-none border-none p-0 bg-transparent shadow-none" />)} />
            </div>
            <div className="data-cell" style={{ flex: '0 0 110pt' }}>
              <span className="data-label">CARGO / FUNÇÃO:</span>
              <FormField control={control} name="reuCargo" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
            </div>
            <div className="data-cell" style={{ flex: '0 0 110pt' }}>
              <span className="data-label">RG / CPF Nº:</span>
              <FormField control={control} name="responsavelLegalIdentidade" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
            </div>
          </div>
        ) : (
          <>
            <div className="data-row">
              <div className="data-cell">
                <span className="data-label">RESPONSÁVEL LEGAL / RESPONSÁVEL NO LOCAL:</span>
                <FormField control={control} name="reu" render={({ field }) => (<Textarea value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input min-h-[1.5em] resize-none border-none p-0 bg-transparent shadow-none" />)} />
              </div>
            </div>
            <div className="data-row border-none">
              <div className="data-cell" style={{ flex: '0 0 50%' }}>
                <span className="data-label">CARGO / FUNÇÃO:</span>
                <FormField control={control} name="reuCargo" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
              </div>
              <div className="data-cell">
                <span className="data-label">RG / CPF Nº:</span>
                <FormField control={control} name="responsavelLegalIdentidade" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
              </div>
            </div>
          </>
        )}
      </div>

      {mostrarResponsavelTecnico ? (
        <div className="section-box relative" style={{ borderTop: 'none' }}>
          {!isFinalized && !isGeneratingPdf && (
            <button type="button" onClick={handleRemoverResponsavelTecnico} className="no-print absolute right-2 top-2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-white text-zinc-400 hover:text-rose-500 shadow-sm border border-zinc-100">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {!isTecnicoNomeLonga ? (
            <div className="data-row border-none">
              <div className="data-cell" style={{ flex: '1 1 0%' }}>
                <span className="data-label">RESPONSÁVEL TÉCNICO:</span>
                <FormField control={control} name="responsavelTecnico" render={({ field }) => (<Textarea value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input min-h-[1.5em] resize-none border-none p-0 bg-transparent shadow-none" placeholder="Opcional" />)} />
              </div>
              <div className="data-cell" style={{ flex: '0 0 110pt' }}>
                <span className="data-label">RG / CPF Nº:</span>
                <FormField control={control} name="responsavelTecnicoIdentidade" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
              </div>
              <div className="data-cell" style={{ flex: '0 0 110pt' }}>
                <span className="data-label">Nº CONSELHO:</span>
                <FormField control={control} name="responsavelTecnicoConselho" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
              </div>
            </div>
          ) : (
            <>
              <div className="data-row">
                <div className="data-cell">
                  <span className="data-label">RESPONSÁVEL TÉCNICO:</span>
                  <FormField control={control} name="responsavelTecnico" render={({ field }) => (<Textarea value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input min-h-[1.5em] resize-none border-none p-0 bg-transparent shadow-none" placeholder="Opcional" />)} />
                </div>
              </div>
              <div className="data-row border-none">
                <div className="data-cell" style={{ flex: '0 0 50%' }}>
                  <span className="data-label">RG / CPF Nº:</span>
                  <FormField control={control} name="responsavelTecnicoIdentidade" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
                </div>
                <div className="data-cell">
                  <span className="data-label">Nº CONSELHO:</span>
                  <FormField control={control} name="responsavelTecnicoConselho" render={({ field }) => (<input value={field.value || ""} onChange={field.onChange} disabled={isFinalized} className="data-field-input" />)} />
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        !isFinalized && !isGeneratingPdf && (
          <div className="no-print flex justify-center py-4">
            <Button type="button" onClick={() => setMostrarResponsavelTecnico(true)} variant="ghost" size="sm" className="h-9 gap-1.5 px-4 rounded-xl font-black text-[9px] uppercase tracking-widest menu-metallic-emerald text-white shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
              <Plus className="h-4 w-4" /> RESPONSÁVEL TÉCNICO
            </Button>
          </div>
        )
      )}

      <div className="section-box" style={{ borderTop: 'none' }}>
        <div className="sub-header-row flex items-center justify-between no-print">
          <span>2. AUTORIDADES SANITÁRIAS</span>
          {!isFinalized && !isGeneratingPdf && <SelecionarAutoridadeParaFormulario onSelect={(a) => onAppendAutoridade({ ...a, municipioId: a.municipioId || '', signature: a.signature || '' })} />}
        </div>
        <div className="flex flex-col">
          {fields.length > 0 ? fields.map((f, i) => (
            <div key={f.id} className="flex flex-row border-b border-black/10 last:border-b-0 group">
              <div style={{ flex: '0 0 34%' }} className="p-2 border-r border-black/10 text-center flex items-center justify-center"><span className="text-[9.5pt] text-black uppercase font-black">{(f as any).nome}</span></div>
              <div style={{ flex: '0 0 33%' }} className="p-2 border-r border-black/10 text-center flex items-center justify-center"><span className="text-[9pt] text-black uppercase font-bold">{(f as any).cargo}</span></div>
              <div style={{ flex: '0 0 33%' }} className="p-2 text-center flex items-center justify-center relative"><span className="text-[9pt] text-black uppercase font-bold">{(f as any).rg}</span>
                {!isFinalized && !isGeneratingPdf && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1 no-print opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 p-0.5 rounded shadow-sm">
                    <Button type="button" variant="ghost" size="icon" onClick={() => onEditAutoridade(i, f as any)} className="h-5 w-5"><Pencil className="h-2.5 w-2.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveAutoridade(i)} className="h-5 w-5 text-rose-500"><Trash2 className="h-2.5 w-2.5" /></Button>
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
        <div className="p-4 bg-zinc-50/20"><RichTextEditor value={watch('prazo')} onChange={(v) => { setValue('prazo', v); onPrazoChange?.(v); }} disabled={isFinalized} fontSize="9.5pt" minHeight="4em" /></div>
      </div>

      <div className="section-box" style={{ borderTop: 'none' }}>
        <div className="sub-header-row">5. CIÊNCIA DIGITAL</div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-12">
            <div className="space-y-12">
              {fields.map((f, i) => (
                <div key={f.id} className="flex flex-col items-center">
                  <div className="min-h-[50pt] flex flex-col items-center justify-end">
                    {(f as any).signature && <img src={(f as any).signature} className="h-10 object-contain mb-0" alt="S" />}
                    {!isFinalized && !isGeneratingPdf && <button type="button" onClick={() => onRequestSignature({ type: 'fiscal', index: i })} className="no-print text-primary text-[6pt] font-black tracking-widest uppercase underline">[Assinar Fiscal]</button>}
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
                    {!isFinalized && !isGeneratingPdf && <button type="button" onClick={() => onRequestSignature({ type: 'responsavel' })} className="no-print text-primary text-[6pt] font-black tracking-widest uppercase underline">[Assinar Autuado]</button>}
                  </div>
                  <div className="signature-block w-full"><p className="signature-name">{watch("reu") || "RESPONSÁVEL NO LOCAL"}</p><p className="signature-title">CIÊNCIA DO AUTUADO</p><p className="text-[7pt] italic mt-1 opacity-70">Ciente em {(signatureResponsavel && dataRecebimento) ? format(new Date(dataRecebimento), "dd/MM/yyyy") : "____/____/____"} às {(signatureResponsavel && dataRecebimento) ? format(new Date(dataRecebimento), "HH:mm") : "____:____"}h</p></div>
                </div>
              ) : (
                <div className="text-center p-6 border-2 border-dashed border-rose-600 rounded-2xl bg-rose-50 flex flex-col items-center justify-center"><p className="font-black text-[10pt] uppercase text-rose-700 italic">RECUSA DE ASSINATURA REGISTRADA</p></div>
              )}
            </div>
          </div>

          {responsavelTecnicoNome && (
            <div className="flex flex-col items-center mt-12 pt-8 border-t border-black/5">
              <div className="min-h-[50pt] flex flex-col items-center justify-end">
                {signatureResponsavelTecnico && <img src={signatureResponsavelTecnico} className="h-10 object-contain mb-0" alt="S" />}
                {!isFinalized && !isGeneratingPdf && <button type="button" onClick={() => onRequestSignature({ type: 'responsavelTecnico' })} className="no-print text-primary text-[6pt] font-black tracking-widest uppercase underline">[Assinar Responsável Técnico]</button>}
              </div>
              <div className="signature-block w-full max-w-[260pt] text-center">
                <p className="signature-name">{responsavelTecnicoNome}</p>
                <p className="signature-title">RESPONSÁVEL TÉCNICO{watch('responsavelTecnicoConselho') ? ` — CONSELHO: ${watch('responsavelTecnicoConselho')}` : ''}{watch('responsavelTecnicoIdentidade') ? ` — RG/CPF: ${watch('responsavelTecnicoIdentidade')}` : ''}</p>
                <p className="text-[7pt] italic mt-1 opacity-70">Ciente em {(signatureResponsavelTecnico && dataRecebimentoTecnico) ? format(new Date(dataRecebimentoTecnico), "dd/MM/yyyy") : "____/____/____"} às {(signatureResponsavelTecnico && dataRecebimentoTecnico) ? format(new Date(dataRecebimentoTecnico), "HH:mm") : "____:____"}h</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

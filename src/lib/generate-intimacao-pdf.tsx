'use client';

import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useForm, useFieldArray, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { intimacaoSchema } from '@/lib/schema';
import type { Intimacao } from '@/lib/types';
import type { MunicipalityConfig } from '@/hooks/use-app-config';
import { DocumentoOficialBody, type IntimacaoFormValues } from '@/components/documento-oficial-body';

/**
 * Renderiza as páginas de UM documento (já montado no DOM em `sourceEl`, com
 * um <form><header>...) dentro de um jsPDF já existente, via html2canvas.
 * Compartilhado entre o download individual (intimacao-form.tsx) e a geração
 * em lote para ZIP (gerarPdfBlobDeIntimacao, abaixo) — mesma lógica de
 * paginação, sem duplicar.
 */
export async function renderDocumentIntoPdf(
  pdf: any,
  sourceEl: HTMLElement,
  staging: HTMLDivElement,
  state: { isFirstPage: boolean }
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;

  const sourceForm = sourceEl.querySelector('form') as HTMLElement;
  const sourceHeader = sourceForm?.querySelector('header') as HTMLElement;
  if (!sourceForm || !sourceHeader) throw new Error('Estrutura do documento não encontrada.');

  const pxPerMm = sourceEl.offsetWidth / 210;
  const pageHeightPx = 297 * pxPerMm;
  const headerHeightPx = sourceHeader.offsetHeight;
  const contentWindowPx = Math.max(pageHeightPx - headerHeightPx, 1);

  const bodyChildren = Array.from(sourceForm.children).filter(c => c !== sourceHeader) as HTMLElement[];
  const pages: HTMLElement[][] = [[]];
  let usedHeight = 0;
  bodyChildren.forEach((child) => {
    const h = child.offsetHeight;
    if (usedHeight > 0 && usedHeight + h > contentWindowPx) {
      pages.push([]);
      usedHeight = 0;
    }
    pages[pages.length - 1].push(child);
    usedHeight += h;
  });

  for (let i = 0; i < pages.length; i++) {
    const pageEl = document.createElement('div');
    pageEl.className = sourceEl.className;
    pageEl.style.transform = 'none';
    pageEl.style.margin = '0';
    pageEl.style.boxShadow = 'none';
    pageEl.style.height = 'auto';

    const pageForm = document.createElement('form');
    pageForm.appendChild(sourceHeader.cloneNode(true));
    pages[i].forEach(child => pageForm.appendChild(child.cloneNode(true)));
    pageEl.appendChild(pageForm);

    staging.innerHTML = '';
    staging.appendChild(pageEl);

    const canvas = await html2canvas(pageEl, {
      scale: 3.0,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: 794,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const imgHeightMm = (canvas.height * 210) / canvas.width;
    if (!state.isFirstPage) {
      if (imgHeightMm > 297) pdf.addPage([210, imgHeightMm], 'p');
      else pdf.addPage();
    }
    state.isFirstPage = false;
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, imgHeightMm);
  }
}

function OffscreenDocumento({
  intimacao, config, documentRef, onReady,
}: {
  intimacao: Intimacao;
  config: MunicipalityConfig;
  documentRef: React.RefObject<HTMLDivElement>;
  onReady: () => void;
}) {
  const base = intimacaoSchema.parse({});
  const methods = useForm<IntimacaoFormValues>({
    resolver: zodResolver(intimacaoSchema),
    defaultValues: { ...base, ...intimacao } as any,
  });
  const { fields } = useFieldArray({ control: methods.control, name: 'autoridades' });

  useEffect(() => {
    // Dá tempo da logo/brasão (imagem remota) carregar antes da captura.
    const t = setTimeout(onReady, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormProvider {...methods}>
      <div ref={documentRef} className="document-paper h-auto bg-white">
        <DocumentoOficialBody
          control={methods.control}
          watch={methods.watch}
          setValue={methods.setValue}
          getValues={methods.getValues}
          fields={fields}
          onAppendAutoridade={() => {}}
          onRemoveAutoridade={() => {}}
          onEditAutoridade={() => {}}
          isFinalized={true}
          isGeneratingPdf={true}
          config={config}
          onRequestSignature={() => {}}
          showCnpjLookup={false}
        />
      </div>
    </FormProvider>
  );
}

/**
 * Gera o PDF de uma intimação específica sem precisar abrir a tela de edição
 * — monta o documento fora da área visível, captura e desmonta. Usado pelo
 * download em lote (ZIP) de src/app/intimacoes/page.tsx.
 */
export async function gerarPdfBlobDeIntimacao(intimacao: Intimacao, config: MunicipalityConfig): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '210mm';
  document.body.appendChild(container);

  const staging = document.createElement('div');
  staging.style.position = 'fixed';
  staging.style.left = '-99999px';
  staging.style.top = '0';
  document.body.appendChild(staging);

  const root = createRoot(container);
  const documentRef = React.createRef<HTMLDivElement>();

  try {
    await new Promise<void>((resolve) => {
      root.render(
        React.createElement(OffscreenDocumento, { intimacao, config, documentRef, onReady: resolve })
      );
    });

    if (!documentRef.current) throw new Error('Falha ao renderizar documento para PDF.');

    const pdf = new jsPDF('p', 'mm', 'a4');
    await renderDocumentIntoPdf(pdf, documentRef.current, staging, { isFirstPage: true });
    return pdf.output('blob');
  } finally {
    root.unmount();
    document.body.removeChild(container);
    document.body.removeChild(staging);
  }
}

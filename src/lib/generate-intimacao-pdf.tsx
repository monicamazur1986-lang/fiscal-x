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
 * Agrupa os filhos do corpo do documento (as `section-box` de cada seção,
 * filhos diretos de `tbody > tr > td` — ver documento-oficial-body.tsx) em
 * páginas, respeitando o limite de altura de cada uma. Nunca corta uma seção
 * ao meio: só empurra a seção inteira pra próxima página se não couber na
 * atual. A 1ª página tem uma janela de conteúdo diferente da 2ª em diante
 * (cabeçalho cheio vs. condensado ocupam alturas diferentes).
 *
 * Compartilhada entre a geração real do PDF (renderDocumentIntoPdf, abaixo) e
 * a prévia de quebra de página na tela (useDocPageBreaks, intimacao-form.tsx)
 * — sem isso, as duas podiam divergir sobre onde o documento realmente quebra.
 */
export function computePageGroups(
  children: HTMLElement[],
  firstPageWindowPx: number,
  continuationWindowPx: number
): HTMLElement[][] {
  const pages: HTMLElement[][] = [[]];
  let usedHeight = 0;
  children.forEach((child) => {
    const h = child.offsetHeight;
    const windowPx = pages.length === 1 ? firstPageWindowPx : continuationWindowPx;
    if (usedHeight > 0 && usedHeight + h > windowPx) {
      pages.push([]);
      usedHeight = 0;
    }
    pages[pages.length - 1].push(child);
    usedHeight += h;
  });
  return pages;
}

/**
 * html2canvas tem um bug conhecido: não recalcula `object-fit`/`object-contain`
 * corretamente durante a captura — o brasão podia sair do tamanho combinado
 * (bem maior, espremendo o texto ao lado) mesmo a tela mostrando certo,
 * porque a captura simplesmente ignorava a contenção calculada pelo
 * navegador. Por isso, ao clonar um cabeçalho pra captura, a largura/altura
 * que o navegador JÁ calculou pro brasão (`getBoundingClientRect`, medida
 * enquanto o elemento fonte está visível) é fixada como estilo inline na
 * imagem clonada — sem precisar do html2canvas recalcular `object-fit`.
 */
function applyFixedLogoSize(clone: HTMLElement, rect: { width: number; height: number } | null) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  const cloneLogo = clone.querySelector('[data-header-logo]') as HTMLImageElement | null;
  if (!cloneLogo) return;
  cloneLogo.style.width = `${rect.width}px`;
  cloneLogo.style.height = `${rect.height}px`;
  cloneLogo.style.maxWidth = 'none';
  cloneLogo.style.maxHeight = 'none';
  cloneLogo.style.objectFit = 'fill';
}

function measureLogoRect(headerEl: HTMLElement): { width: number; height: number } | null {
  const logo = headerEl.querySelector('[data-header-logo]') as HTMLImageElement | null;
  if (!logo) return null;
  const rect = logo.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
}

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
  // Cabeçalho repetido nas páginas 2+ — mesmo brasão/identificação
  // institucional do topo, mais a identificação do documento (tipo + nº
  // processo + "continuação"). Fica oculto (`hidden`) no documento normal,
  // só é exibido na cópia clonada aqui embaixo, momentos antes da captura.
  const sourceContinuationHeader = sourceForm?.querySelector('[data-continuation-header]') as HTMLElement | null;
  // Rodapé é opcional (só existe se o gestor configurou um texto de rodapé
  // em Identidade Municipal) — ver documento-oficial-body.tsx / <tfoot>.
  const sourceFooter = sourceForm?.querySelector('footer') as HTMLElement | null;
  // O corpo do documento agora fica dentro de <table><tbody><tr><td> (pra o
  // cabeçalho em <thead> repetir na impressão nativa a cada quebra de página
  // — ver documento-oficial-body.tsx) — os filhos que entram na paginação do
  // PDF são os do <td> do tbody, não mais filhos diretos do <form>.
  const bodyContainer = sourceForm?.querySelector('tbody > tr > td') as HTMLElement;
  if (!sourceForm || !sourceHeader || !bodyContainer) throw new Error('Estrutura do documento não encontrada.');

  const pxPerMm = sourceEl.offsetWidth / 210;
  const pageHeightPx = 297 * pxPerMm;
  const headerHeightPx = sourceHeader.offsetHeight;
  const footerHeightPx = sourceFooter?.offsetHeight || 0;
  const mainLogoRect = measureLogoRect(sourceHeader);

  // Mede a altura real do cabeçalho condensado (e o tamanho do brasão dentro
  // dele) desescondendo-o brevemente (fora da tela, ninguém vê) — só assim dá
  // pra saber quanto espaço ele ocupa antes de decidir onde a 2ª página
  // quebra, e pra fixar o tamanho do brasão nas cópias mais abaixo (ver
  // applyFixedLogoSize).
  let continuationHeaderHeightPx = 0;
  let continuationLogoRect: { width: number; height: number } | null = null;
  if (sourceContinuationHeader) {
    sourceContinuationHeader.classList.remove('hidden');
    continuationHeaderHeightPx = sourceContinuationHeader.offsetHeight;
    continuationLogoRect = measureLogoRect(sourceContinuationHeader);
    sourceContinuationHeader.classList.add('hidden');
  }

  const firstPageWindowPx = Math.max(pageHeightPx - headerHeightPx - footerHeightPx, 1);
  const continuationWindowPx = Math.max(pageHeightPx - continuationHeaderHeightPx - footerHeightPx, 1);

  // Exclui os cabeçalhos de página "só tela" (LivePageHeader, documento-oficial-body.tsx)
  // — eles existem só pra prévia ao vivo do preenchimento e não devem contar
  // como conteúdo real na paginação nem aparecer no PDF gerado.
  const bodyChildren = Array.from(bodyContainer.children).filter(
    (el) => !el.hasAttribute('data-live-page-header')
  ) as HTMLElement[];
  const pages = computePageGroups(bodyChildren, firstPageWindowPx, continuationWindowPx);

  for (let i = 0; i < pages.length; i++) {
    const pageEl = document.createElement('div');
    pageEl.className = sourceEl.className;
    pageEl.style.transform = 'none';
    pageEl.style.margin = '0';
    pageEl.style.boxShadow = 'none';
    pageEl.style.height = 'auto';

    const pageForm = document.createElement('form');
    if (i === 0 || !sourceContinuationHeader) {
      const headerClone = sourceHeader.cloneNode(true) as HTMLElement;
      applyFixedLogoSize(headerClone, mainLogoRect);
      pageForm.appendChild(headerClone);
    } else {
      const continuationClone = sourceContinuationHeader.cloneNode(true) as HTMLElement;
      continuationClone.classList.remove('hidden');
      applyFixedLogoSize(continuationClone, continuationLogoRect);
      pageForm.appendChild(continuationClone);
    }
    pages[i].forEach(child => pageForm.appendChild(child.cloneNode(true)));
    if (sourceFooter) pageForm.appendChild(sourceFooter.cloneNode(true));

    // Numeração de página — sempre presente, mesmo sem rodapé configurado
    // pelo gestor (o rodapé em si é opcional; a paginação, não).
    const pageNumberEl = document.createElement('p');
    pageNumberEl.textContent = `Página ${i + 1} de ${pages.length}`;
    pageNumberEl.style.textAlign = 'center';
    pageNumberEl.style.fontFamily = "'Times New Roman', Times, serif";
    pageNumberEl.style.fontSize = '7.5pt';
    pageNumberEl.style.color = '#000000';
    pageNumberEl.style.marginTop = sourceFooter ? '2pt' : '10pt';
    pageNumberEl.style.paddingTop = '4pt';
    if (!sourceFooter) pageNumberEl.style.borderTop = '0.5pt solid rgba(0,0,0,0.2)';
    pageForm.appendChild(pageNumberEl);

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
    const precisaPaginaAlta = imgHeightMm > 297;
    if (state.isFirstPage) {
      // A primeira página do PDF já é criada pelo chamador em tamanho A4 fixo,
      // antes desta função rodar. Se o conteúdo dela for mais alto que 297mm
      // (ex.: um relato/fundamentação técnica longo), desenhar a imagem nesse
      // tamanho fixo corta silenciosamente tudo que passar da borda da página
      // — o texto some do PDF sem nenhum aviso. Por isso, quando necessário,
      // criamos uma página nova já no tamanho certo e removemos a original
      // (mesmo recurso já usado abaixo para as páginas seguintes).
      if (precisaPaginaAlta) {
        pdf.addPage([210, imgHeightMm], 'p');
        pdf.deletePage(1);
      }
    } else {
      if (precisaPaginaAlta) pdf.addPage([210, imgHeightMm], 'p');
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

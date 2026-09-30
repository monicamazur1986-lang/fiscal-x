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
/**
 * Espaço que a numeração de página ocupa no pé da folha ("Página 1 de 2").
 * Ela é montada só na hora de desenhar, mas precisa ser descontada ANTES de
 * decidir as quebras — senão cada página recebe conteúdo demais pela altura
 * dessa linha.
 */
const ALTURA_NUMERO_PAGINA_PT = 18;
const PT_PARA_MM = 25.4 / 72;

/**
 * Altura que sobra dentro da folha A4 para cabeçalho, conteúdo e rodapé.
 *
 * O detalhe que estava faltando: `.document-paper` tem 20mm de margem em
 * cima e embaixo (padding do papel). A conta antiga usava os 297mm cheios e
 * distribuía 40mm que não existem — cerca de 150px de conteúdo a mais por
 * página. O resultado aparecia no PDF como página maior que A4 (o gerador
 * detecta o estouro e cria uma folha sob medida, mais alta), então o
 * documento saía com páginas de tamanhos diferentes.
 *
 * A margem é lida do CSS, e não fixada em 20mm, para acompanhar qualquer
 * mudança em globals.css sem quebrar a paginação de novo.
 */
import { garantirEstiloDaFolha, zerarEspacamentoInline, CLASSE_FOLHA_PDF } from '@/lib/pdf-letter-spacing';

export function alturaUtilDaFolha(paperEl: HTMLElement): { pxPerMm: number; alturaUtilPx: number } {
  const pxPerMm = paperEl.offsetWidth / 210;
  const estilo = window.getComputedStyle(paperEl);
  const margemVerticalPx =
    parseFloat(estilo.paddingTop || '0') + parseFloat(estilo.paddingBottom || '0');
  const numeroPaginaPx = ALTURA_NUMERO_PAGINA_PT * PT_PARA_MM * pxPerMm;
  return {
    pxPerMm,
    alturaUtilPx: Math.max(297 * pxPerMm - margemVerticalPx - numeroPaginaPx, 1),
  };
}

/**
 * Altura que o bloco REALMENTE ocupa na folha.
 *
 * `offsetHeight` é conteúdo + padding + borda, e deixa a MARGEM de fora. Os
 * blocos do documento são espaçados por margem (mb-4, mt-16 no bloco de
 * assinatura), então medir por offsetHeight subestimava cada um: a conta dizia
 * que cabiam mais blocos do que cabem, a folha transbordava, e a quebra saía
 * no lugar errado — na tela e no PDF, que usam esta mesma função.
 *
 * A margem de cima não conta quando o bloco ABRE a folha: ali não há nada
 * acima de que se afastar, e ela viraria uma faixa em branco no topo. Quem
 * desenha a folha zera essa margem de verdade (ver renderDocumentIntoPdf),
 * então medida e desenho continuam batendo.
 *
 * MARGENS QUE COLAPSAM. Entre dois blocos irmãos, o espaço final não é a
 * soma da margem de baixo do primeiro com a de cima do segundo: o CSS deixa
 * valer a MAIOR das duas. Somar superestimaria cada par e provocaria quebra
 * de página antes da hora — mais folhas, mais espaço vazio, exatamente o que
 * esta correção existe para evitar. Por isso a margem de cima entra só pelo
 * que ela excede a margem de baixo do bloco anterior.
 *
 * Devolve também a margem de baixo, para o bloco seguinte saber contra o
 * que colapsar.
 */
function alturaOcupada(
  el: HTMLElement,
  abreAFolha: boolean,
  margemBaseAnterior: number
): { altura: number; margemBase: number } {
  const estilo = getComputedStyle(el);
  const margemTopo = parseFloat(estilo.marginTop) || 0;
  const margemBase = parseFloat(estilo.marginBottom) || 0;
  const topoEfetivo = abreAFolha ? 0 : Math.max(0, margemTopo - margemBaseAnterior);
  return { altura: el.offsetHeight + topoEfetivo + margemBase, margemBase };
}

export function computePageGroups(
  children: HTMLElement[],
  firstPageWindowPx: number,
  continuationWindowPx: number
): HTMLElement[][] {
  const pages: HTMLElement[][] = [[]];
  let usedHeight = 0;
  let margemBaseAnterior = 0;
  children.forEach((child) => {
    const windowPx = pages.length === 1 ? firstPageWindowPx : continuationWindowPx;
    let medida = alturaOcupada(child, pages[pages.length - 1].length === 0, margemBaseAnterior);
    if (usedHeight > 0 && usedHeight + medida.altura > windowPx) {
      pages.push([]);
      usedHeight = 0;
      // Passou a abrir a folha: a margem de cima deixa de contar, e não há
      // bloco anterior contra o qual colapsar.
      medida = alturaOcupada(child, true, 0);
    }
    pages[pages.length - 1].push(child);
    usedHeight += medida.altura;
    margemBaseAnterior = medida.margemBase;
  });
  return pages;
}

/**
 * Acha a posição real de texto (nó + deslocamento) sob uma coordenada Y da
 * tela — a mesma consulta que o navegador faz para saber onde cai o cursor
 * ao clicar num texto. Evita reimplementar quebra de linha à mão: pergunta
 * ao próprio motor de renderização, então funciona com qualquer marcação
 * aninhada (negrito, itálico, parágrafos) sem conhecer a estrutura por
 * dentro.
 */
function posicaoNoPontoY(el: HTMLElement, y: number): { node: Node; offset: number } | null {
  const rect = el.getBoundingClientRect();
  const x = rect.left + Math.min(4, rect.width / 2);
  const doc = document as any;
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  return null;
}

/**
 * A coordenada de corte raramente cai exatamente na borda entre duas linhas
 * — cai em algum ponto da linha que ocupa aquele pixel, que pode estar no
 * meio de uma palavra. Caminha pra trás dentro do MESMO nó de texto até o
 * espaço anterior, garantindo que o corte sempre separe palavras inteiras.
 * No raro caso de não achar espaço nenhum (uma "palavra" maior que a janela
 * inteira), desiste de mover o ponto — dividirBlocoPorLinha vai descartar
 * esse corte se ele não separar nada de verdade.
 */
function snapParaLimiteDePalavra(ponto: { node: Node; offset: number }): { node: Node; offset: number } {
  const { node, offset } = ponto;
  if (node.nodeType !== Node.TEXT_NODE) return ponto;
  const texto = node.textContent || '';
  if (offset <= 0 || /\s/.test(texto[offset - 1])) return ponto;
  let i = offset;
  while (i > 0 && !/\s/.test(texto[i - 1])) i--;
  return { node, offset: i };
}

/**
 * Divide o CONTEÚDO de `el` em duas metades de HTML, cortando exatamente na
 * borda de uma linha visual — nunca no meio de uma palavra ou de uma letra.
 * Usa a posição real do texto sob a coordenada de corte (ver posicaoNoPontoY)
 * em vez de contar linhas "no chute", então continua correta mesmo com
 * fontes, parágrafos e formatação variados dentro do mesmo bloco.
 */
function dividirBlocoPorLinha(el: HTMLElement, alturaDisponivelPx: number): { antes: string; depois: string } | null {
  const rect = el.getBoundingClientRect();
  const yCorte = rect.top + alturaDisponivelPx;
  if (yCorte <= rect.top + 4 || yCorte >= rect.bottom - 4) return null;

  let ponto = posicaoNoPontoY(el, yCorte);
  if (!ponto) return null;
  ponto = snapParaLimiteDePalavra(ponto);

  try {
    const tudo = document.createRange();
    tudo.selectNodeContents(el);

    const antesRange = document.createRange();
    antesRange.setStart(tudo.startContainer, tudo.startOffset);
    antesRange.setEnd(ponto.node, ponto.offset);
    if (antesRange.collapsed) return null;

    const depoisRange = document.createRange();
    depoisRange.setStart(ponto.node, ponto.offset);
    depoisRange.setEnd(tudo.endContainer, tudo.endOffset);
    if (depoisRange.collapsed) return null;

    const wrapAntes = document.createElement('div');
    wrapAntes.appendChild(antesRange.cloneContents());
    const wrapDepois = document.createElement('div');
    wrapDepois.appendChild(depoisRange.cloneContents());

    return { antes: wrapAntes.innerHTML, depois: wrapDepois.innerHTML };
  } catch {
    return null; // Ponto fora da árvore de `el` — melhor não dividir do que dividir errado.
  }
}

/**
 * Corta UM bloco (seção inteira) em pedaços pequenos o bastante para caber
 * em qualquer página, cortando sempre numa borda de linha. Trabalha numa
 * cópia isolada, fora da tela — nunca no documento real, que continua
 * editável por trás da geração do PDF.
 */
function dividirBlocoEmPaginas(original: HTMLElement, larguraReferenciaPx: number, janelaDeCortePx: number): HTMLElement[] | null {
  const bancada = document.createElement('div');
  bancada.style.position = 'fixed';
  // PRECISA estar dentro da janela visível (não em left:-99999px como o
  // resto da geração de PDF usa) — caretRangeFromPoint só encontra posição
  // de texto sob coordenadas de tela REALMENTE visíveis; fora da janela ele
  // simplesmente não acha nada, e a divisão falha silenciosamente. Opacidade
  // quase zero mantém isto imperceptível; z-index alto evita que outro
  // elemento da própria página "tampe" o ponto que estamos testando.
  bancada.style.top = '0';
  bancada.style.left = '0';
  bancada.style.zIndex = '999999';
  bancada.style.opacity = '0.0001';
  bancada.style.width = `${larguraReferenciaPx}px`;
  document.body.appendChild(bancada);

  try {
    const restante = original.cloneNode(true) as HTMLElement;
    restante.style.marginTop = '0';
    bancada.appendChild(restante);

    const pedacos: HTMLElement[] = [];
    let guarda = 0;
    // Limite de segurança: um bloco sem nenhuma linha detectável (ex.: uma
    // imagem isolada maior que a página) nunca converge — sem o guarda, o
    // laço rodaria para sempre em vez de desistir e manter o comportamento
    // antigo (folha sob medida, ver "precisaPaginaAlta" em renderDocumentIntoPdf).
    while (restante.offsetHeight > janelaDeCortePx && guarda < 60) {
      guarda++;
      const corte = dividirBlocoPorLinha(restante, janelaDeCortePx);
      if (!corte) break;

      const parte = restante.cloneNode(false) as HTMLElement;
      parte.innerHTML = corte.antes;
      pedacos.push(parte);

      restante.innerHTML = corte.depois;
    }
    pedacos.push(restante.cloneNode(true) as HTMLElement);

    return pedacos.length > 1 ? pedacos : null;
  } finally {
    bancada.remove();
  }
}

/**
 * QUEBRA DE PÁGINA POR LINHA.
 *
 * `computePageGroups` só decide para qual página um bloco INTEIRO vai — nunca
 * olha pra dentro dele. Um relato de fatos mais longo que uma página cheia
 * (comum em autos de infração com narrativa extensa) não tinha pra onde ir:
 * ficava sozinho na própria página e, mesmo assim, estourava — daí a folha
 * "sob medida" (ver `precisaPaginaAlta`), que evita cortar texto às custas de
 * gerar uma página fora do tamanho A4 padrão.
 *
 * Aqui, ANTES de agrupar, qualquer bloco maior que a maior janela disponível
 * é dividido em pedaços do tamanho da MENOR janela (a da 1ª página, mais
 * apertada) — pequenos o bastante pra caber em qualquer página — sempre numa
 * borda de linha. Os pedaços voltam a ser filhos comuns: o agrupador normal
 * decide onde cada um entra, inclusive juntando mais de um pedaço pequeno na
 * mesma página quando sobra espaço.
 */
function expandirBlocosAltosDemais(
  filhos: HTMLElement[],
  larguraReferenciaPx: number,
  firstPageWindowPx: number,
  continuationWindowPx: number
): HTMLElement[] {
  const janelaMaiorPx = Math.max(firstPageWindowPx, continuationWindowPx);
  const janelaMenorPx = Math.min(firstPageWindowPx, continuationWindowPx);
  const resultado: HTMLElement[] = [];
  for (const filho of filhos) {
    if (filho.offsetHeight <= janelaMaiorPx) { resultado.push(filho); continue; }
    const pedacos = dividirBlocoEmPaginas(filho, larguraReferenciaPx, janelaMenorPx);
    resultado.push(...(pedacos ?? [filho]));
  }
  return resultado;
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

  const { pxPerMm, alturaUtilPx } = alturaUtilDaFolha(sourceEl);
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

  const firstPageWindowPx = Math.max(alturaUtilPx - headerHeightPx - footerHeightPx, 1);
  const continuationWindowPx = Math.max(alturaUtilPx - continuationHeaderHeightPx - footerHeightPx, 1);

  // Exclui os cabeçalhos de página "só tela" (LivePageHeader, documento-oficial-body.tsx)
  // — eles existem só pra prévia ao vivo do preenchimento e não devem contar
  // como conteúdo real na paginação nem aparecer no PDF gerado.
  const bodyChildren = Array.from(bodyContainer.children).filter(
    (el) => !el.hasAttribute('data-live-page-header')
  ) as HTMLElement[];
  const bodyChildrenDivididos = expandirBlocosAltosDemais(bodyChildren, bodyContainer.offsetWidth, firstPageWindowPx, continuationWindowPx);
  const pages = computePageGroups(bodyChildrenDivididos, firstPageWindowPx, continuationWindowPx);

  for (let i = 0; i < pages.length; i++) {
    const pageEl = document.createElement('div');
    pageEl.className = sourceEl.className;
    pageEl.style.transform = 'none';
    pageEl.style.margin = '0';
    pageEl.style.boxShadow = 'none';
    // Altura A4 como MÍNIMO (não como teto): a folha curta fica do tamanho
    // certo, com o rodapé no pé, e a folha que ainda assim estourar continua
    // crescendo para a saída sob medida mais abaixo — nunca cortando texto.
    pageEl.style.height = 'auto';
    pageEl.style.minHeight = `${pageHeightPx}px`;
    pageEl.style.display = 'flex';
    pageEl.style.flexDirection = 'column';

    const pageForm = document.createElement('form');
    pageForm.style.flex = '1';
    pageForm.style.display = 'flex';
    pageForm.style.flexDirection = 'column';
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
    const corpoEl = document.createElement('div');
    corpoEl.style.flex = '1';
    // Zera a margem de cima do primeiro bloco da folha — a medição já a
     // descontou (ver alturaOcupada). Sem isto a folha ganharia de volta uma
     // faixa em branco no topo e voltaria a transbordar embaixo.
    pages[i].forEach((child, indice) => {
      const clone = child.cloneNode(true) as HTMLElement;
      if (indice === 0) clone.style.marginTop = "0";
      corpoEl.appendChild(clone);
    });
    pageForm.appendChild(corpoEl);
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
    // A regra vai no staging a cada volta porque o innerHTML acima a apaga,
    // e precisa existir ANTES da captura para o espaçamento já estar
    // neutralizado quando o html2canvas medir o texto.
    garantirEstiloDaFolha(staging);
    pageEl.classList.add(CLASSE_FOLHA_PDF);
    staging.appendChild(pageEl);
    zerarEspacamentoInline(pageEl);

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

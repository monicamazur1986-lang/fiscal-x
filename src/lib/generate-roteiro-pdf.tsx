/**
 * Paginação do relatório de vistoria (roteiro) — mesma ideia de
 * src/lib/generate-intimacao-pdf.tsx (mede a altura de cada bloco, reserva o
 * espaço do cabeçalho, empacota blocos inteiros por página, nunca corta um no
 * meio, clona o cabeçalho a cada página), mas adaptada à estrutura do
 * relatório (uma <div> com blocos soltos, não um <form>) e escrita à parte
 * pra não arriscar nenhuma regressão na geração de PDF da autuação.
 *
 * O elemento de origem precisa ter exatamente um `[data-pdf-header]` (o
 * timbre, repetido em toda página) e um ou mais `[data-pdf-block]` em
 * qualquer profundidade (cada um tratado como uma unidade que nunca é
 * dividida entre duas páginas).
 */
export async function renderReportIntoPdf(pdf: any, sourceEl: HTMLElement, staging: HTMLDivElement): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;

  const headerEl = sourceEl.querySelector('[data-pdf-header]') as HTMLElement | null;
  // Rodapé é opcional (só existe se o gestor configurou um texto de rodapé
  // em Identidade Municipal).
  const footerEl = sourceEl.querySelector('[data-pdf-footer]') as HTMLElement | null;
  const blocks = Array.from(sourceEl.querySelectorAll('[data-pdf-block]')) as HTMLElement[];
  if (!headerEl || blocks.length === 0) throw new Error('Estrutura do relatório não encontrada.');

  const pxPerMm = sourceEl.offsetWidth / 210;
  const pageHeightPx = 297 * pxPerMm;
  const headerHeightPx = headerEl.offsetHeight;
  const footerHeightPx = footerEl?.offsetHeight || 0;
  const contentWindowPx = Math.max(pageHeightPx - headerHeightPx - footerHeightPx, 1);

  const pages: HTMLElement[][] = [[]];
  let usedHeight = 0;
  blocks.forEach((block) => {
    const h = block.offsetHeight;
    if (usedHeight > 0 && usedHeight + h > contentWindowPx) {
      pages.push([]);
      usedHeight = 0;
    }
    pages[pages.length - 1].push(block);
    usedHeight += h;
  });

  for (let i = 0; i < pages.length; i++) {
    const pageEl = document.createElement('div');
    pageEl.className = sourceEl.className;
    pageEl.style.transform = 'none';
    pageEl.style.margin = '0';
    pageEl.style.boxShadow = 'none';
    pageEl.style.height = 'auto';

    pageEl.appendChild(headerEl.cloneNode(true));
    pages[i].forEach((block) => pageEl.appendChild(block.cloneNode(true)));
    if (footerEl) pageEl.appendChild(footerEl.cloneNode(true));

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
    if (i === 0) {
      // A primeira página já é criada pelo chamador em tamanho A4 fixo. Se o
      // conteúdo dela for mais alto que 297mm, desenhar a imagem nesse
      // tamanho fixo corta silenciosamente tudo que passar da borda da
      // página — mesmo problema já corrigido em generate-intimacao-pdf.tsx.
      if (precisaPaginaAlta) {
        pdf.addPage([210, imgHeightMm], 'p');
        pdf.deletePage(1);
      }
    } else {
      if (precisaPaginaAlta) pdf.addPage([210, imgHeightMm], 'p');
      else pdf.addPage();
    }
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, imgHeightMm);
  }
}

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

  const sourceWidthPx = sourceEl.offsetWidth;
  const pxPerMm = sourceWidthPx / 210;
  const pageHeightPx = 297 * pxPerMm;
  const headerHeightPx = headerEl.offsetHeight;
  const footerHeightPx = footerEl?.offsetHeight || 0;
  const contentWindowPx = Math.max(pageHeightPx - headerHeightPx - footerHeightPx, 1);

  /**
   * Altura real do bloco na folha.
   *
   * `offsetHeight` é conteúdo + padding + borda e deixa a MARGEM de fora. Os
   * blocos do relatório são espaçados por margem, então medir só por
   * offsetHeight subestimava cada um: a conta dizia que cabiam mais blocos do
   * que cabem e a folha transbordava, empurrando texto para fora da área útil.
   *
   * A margem de cima não conta quando o bloco abre a folha — não há nada acima
   * de que se afastar, e ela viraria faixa em branco no topo. O desenho zera
   * essa margem de verdade, logo abaixo, para medida e folha continuarem
   * batendo.
   */
  // Margens de irmãos adjacentes COLAPSAM: entre dois blocos vale a maior
  // das duas, não a soma. Somar superestimaria cada par e quebraria a página
  // antes da hora — mais folhas e mais espaço vazio, o oposto do objetivo.
  const alturaOcupada = (el: HTMLElement, abreAFolha: boolean, margemBaseAnterior: number) => {
    const estilo = getComputedStyle(el);
    const margemTopo = parseFloat(estilo.marginTop) || 0;
    const margemBase = parseFloat(estilo.marginBottom) || 0;
    const topoEfetivo = abreAFolha ? 0 : Math.max(0, margemTopo - margemBaseAnterior);
    return { altura: el.offsetHeight + topoEfetivo + margemBase, margemBase };
  };

  const pages: HTMLElement[][] = [[]];
  let usedHeight = 0;
  let margemBaseAnterior = 0;
  blocks.forEach((block) => {
    let medida = alturaOcupada(block, pages[pages.length - 1].length === 0, margemBaseAnterior);
    if (usedHeight > 0 && usedHeight + medida.altura > contentWindowPx) {
      pages.push([]);
      usedHeight = 0;
      medida = alturaOcupada(block, true, 0);
    }
    pages[pages.length - 1].push(block);
    usedHeight += medida.altura;
    margemBaseAnterior = medida.margemBase;
  });

  for (let i = 0; i < pages.length; i++) {
    const pageEl = document.createElement('div');
    pageEl.className = sourceEl.className;
    pageEl.style.transform = 'none';
    pageEl.style.margin = '0';
    pageEl.style.boxShadow = 'none';
    pageEl.style.height = 'auto';

    pageEl.appendChild(headerEl.cloneNode(true));
    pages[i].forEach((block, indice) => {
      const clone = block.cloneNode(true) as HTMLElement;
      // A medição descontou esta margem; zerar aqui evita a faixa em branco
      // no topo e o transbordo embaixo.
      if (indice === 0) clone.style.marginTop = "0";
      pageEl.appendChild(clone);
    });
    if (footerEl) {
      const footerClone = footerEl.cloneNode(true) as HTMLElement;
      const pageNumEl = footerClone.querySelector('[data-pdf-pagenum]');
      if (pageNumEl) pageNumEl.textContent = `Página ${i + 1} de ${pages.length}`;
      pageEl.appendChild(footerClone);
    }

    staging.innerHTML = '';
    staging.appendChild(pageEl);

    // windowWidth precisa bater exatamente com a largura usada para medir a
    // altura dos blocos acima (pxPerMm/contentWindowPx) — um valor fixo
    // (794) que não coincidisse com sourceEl.offsetWidth de verdade já foi
    // uma causa real de conteúdo cortado nas bordas/rodapé da página.
    const canvas = await html2canvas(pageEl, {
      scale: 3.0,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: sourceWidthPx,
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

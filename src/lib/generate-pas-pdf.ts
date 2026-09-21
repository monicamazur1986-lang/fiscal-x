/**
 * GERAÇÃO DO PDF DOS AUTOS DO PAS
 *
 * Substitui, só no módulo PAS, o `renderReportIntoPdf` (relatório de
 * roteiro). O algoritmo antigo tinha três defeitos que deixavam os autos
 * impressos errados:
 *
 *  1. ignorava o padding vertical da folha (`.document-paper` tem 20mm em
 *     cima e embaixo), então quase toda página "estourava" a altura útil;
 *  2. quando estourava, ele criava uma página com altura customizada
 *     (`addPage([210, alturaReal])`) — o PDF saía com folhas mais compridas
 *     que A4, e na impressão tudo era reduzido pra caber: os documentos não
 *     saíam no tamanho real;
 *  3. as peças eram empacotadas em sequência, uma emendando na outra no meio
 *     da folha, e a numeração de página era recalculada por bloco.
 *
 * Aqui cada folha é montada como uma folha A4 de verdade (210x297mm fixos):
 * timbre no topo, uma fatia do conteúdo no meio, rodapé embaixo, tudo
 * desenhado em posições absolutas em mm. Cada documento (`[data-pdf-doc]`)
 * começa numa folha nova, e a numeração é contínua do primeiro ao último
 * documento — a capa é a folha 1.
 *
 * Contrato do HTML de origem:
 *  - exatamente um `[data-pdf-header]` (timbre, repetido em toda folha);
 *  - opcionalmente um `[data-pdf-footer]`, com um `[data-pdf-pagenum]` dentro
 *    (o texto dele é reescrito folha a folha);
 *  - um ou mais `[data-pdf-doc]` — cada um é um documento dos autos e sempre
 *    começa numa folha nova. Sem nenhum, a folha inteira vira um documento só
 *    (é o caso da etiqueta de capa);
 *  - dentro de cada documento, `[data-pdf-block]` marca as unidades que não
 *    devem ser cortadas no meio. Um bloco maior que a altura útil é quebrado
 *    pelos próprios filhos (parágrafos), preservando o estilo do container.
 *  - `data-pdf-anexo-url` num `[data-pdf-doc]` faz o arquivo anexo (PDF
 *    escaneado ou imagem) ser juntado logo depois daquele documento, cada
 *    página no tamanho real dela.
 */

import { CLASSE_FOLHA_PDF, garantirEstiloDaFolha, zerarEspacamentoInline } from './pdf-letter-spacing';

const A4_LARGURA_MM = 210;
const A4_ALTURA_MM = 297;
/** 3x sobre ~794px de largura ≈ 288 DPI — mesma nitidez do gerador antigo. */
const ESCALA_CANVAS = 3;
/** Resolução usada pra rasterizar as páginas de um PDF anexado. */
const DPI_ANEXO = 200;
// A correção de letter-spacing (ver pdf-letter-spacing.ts) nasceu aqui e foi
// extraída pra ser compartilhada com a autuação e o relatório de roteiro,
// que tinham o mesmo defeito. CLASSE_FOLHA só precisa ser a MESMA usada nas
// duas metades da correção — reaproveita a constante do módulo em vez de
// manter um nome local à parte.
const CLASSE_FOLHA = CLASSE_FOLHA_PDF;

type PaginaHtml = { tipo: 'html'; folha: HTMLElement };
type PaginaAnexoPdf = { tipo: 'anexo-pdf'; doc: any; pagina: number };
type PaginaAnexoImg = { tipo: 'anexo-img'; dataUrl: string; largura: number; altura: number };
type PaginaAviso = { tipo: 'aviso'; texto: string };
type Pagina = PaginaHtml | PaginaAnexoPdf | PaginaAnexoImg | PaginaAviso;

export type RenderPasOpts = {
  /** Chamado antes de desenhar cada folha — serve pra mostrar progresso. */
  onProgress?: (folha: number, total: number) => void;
};

/**
 * Só divide um elemento pelos filhos quando não há texto solto direto nele —
 * senão a quebra perderia esse texto (só elementos são reposicionados).
 */
function filhosDivisiveis(el: HTMLElement): HTMLElement[] {
  const temTextoSolto = Array.from(el.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim() !== ''
  );
  if (temTextoSolto) return [];
  return Array.from(el.children) as HTMLElement[];
}

/**
 * O corpo das peças (ver pas-textos-padrao.ts) é texto corrido separado por
 * `<br>`, sem nenhum elemento de bloco — do ponto de vista do DOM é um bloco
 * único e indivisível, mesmo tendo três páginas de texto. Aqui cada trecho
 * entre `<br>` vira uma `<div>`, o que dá ao paginador pontos de quebra sem
 * mudar nada na aparência: uma linha em branco (`<br><br>`) vira uma `<div>`
 * com um `<br>` dentro, que ocupa exatamente a mesma altura de uma linha.
 * Devolve true quando conseguiu repartir em mais de um pedaço.
 */
function quebrarPorBr(el: HTMLElement): boolean {
  const nos = Array.from(el.childNodes);
  if (!nos.some((n) => (n as HTMLElement).tagName === 'BR')) return false;

  const linhas: HTMLElement[] = [];
  let linha = document.createElement('div');
  const fecharLinha = () => {
    if (linha.childNodes.length === 0) linha.appendChild(document.createElement('br'));
    linhas.push(linha);
    linha = document.createElement('div');
  };
  nos.forEach((no) => {
    if ((no as HTMLElement).tagName === 'BR') fecharLinha();
    else linha.appendChild(no);
  });
  if (linha.childNodes.length > 0) linhas.push(linha);
  if (linhas.length < 2) return false;

  el.innerHTML = '';
  linhas.forEach((l) => el.appendChild(l));
  return true;
}

/**
 * O html2canvas carrega cada `<img>` por conta própria e, quando uma delas
 * falha, ele rejeita uma promise interna passando o próprio `Event` de erro
 * (ver `img.onerror = reject` no Cache dele). Como essa promise fica no cache
 * interno e ninguém a aguarda, o erro escapa como "unhandled rejection" e
 * aparece no app como um `Runtime Error: [object Event]` sem stack nenhum —
 * mesmo quando a geração do PDF em si deu certo.
 *
 * Aqui cada imagem da folha é pré-carregada antes: as de fora da origem passam
 * pelo proxy interno (mesmo caminho já usado pelo brasão, que resolve o CORS
 * do Storage) e as que não carregam de jeito nenhum são removidas do clone —
 * o PDF sai sem aquela imagem em vez de derrubar o download inteiro.
 */
async function prepararImagens(folha: HTMLElement): Promise<void> {
  const imagens = Array.from(folha.querySelectorAll('img'));
  await Promise.all(
    imagens.map(
      (img) =>
        new Promise<void>((resolve) => {
          const src = img.getAttribute('src') || '';
          if (!src) {
            img.remove();
            resolve();
            return;
          }
          const externa = /^https?:/i.test(src) && !src.startsWith(window.location.origin);
          const alvo = externa ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;

          const teste = new Image();
          teste.onload = () => {
            // Já vem do nosso domínio: o crossOrigin do template deixa de ser
            // necessário e só atrapalharia a releitura do cache.
            img.setAttribute('src', alvo);
            img.removeAttribute('crossorigin');
            resolve();
          };
          teste.onerror = () => {
            img.remove();
            resolve();
          };
          teste.src = alvo;
        })
    )
  );
}

export async function renderPasIntoPdf(
  pdf: any,
  sourceEl: HTMLElement,
  staging: HTMLDivElement,
  opts: RenderPasOpts = {}
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;

  const headerEl = sourceEl.querySelector('[data-pdf-header]') as HTMLElement | null;
  const footerEl = sourceEl.querySelector('[data-pdf-footer]') as HTMLElement | null;
  if (!headerEl) throw new Error('Timbre do documento não encontrado.');

  const docsEncontrados = Array.from(sourceEl.querySelectorAll('[data-pdf-doc]')) as HTMLElement[];
  const docs = docsEncontrados.length > 0 ? docsEncontrados : [sourceEl];

  const larguraPx = sourceEl.offsetWidth;
  if (!larguraPx) throw new Error('Modelo de impressão sem largura — não é possível medir a folha.');
  const pxPorMm = larguraPx / A4_LARGURA_MM;
  const estilo = getComputedStyle(sourceEl);
  const margemTopoMm = (parseFloat(estilo.paddingTop) || 0) / pxPorMm;
  const margemBaseMm = (parseFloat(estilo.paddingBottom) || 0) / pxPorMm;

  /** Folha de medição/captura: mesma largura e mesmas margens laterais da
   *  folha real, mas sem o padding vertical — o espaço de cima e de baixo é
   *  reservado no PDF pelo timbre e pelo rodapé, desenhados à parte. */
  garantirEstiloDaFolha(staging);
  const criarFolha = () => {
    const folha = document.createElement('div');
    folha.className = `${sourceEl.className} ${CLASSE_FOLHA}`;
    folha.style.transform = 'none';
    folha.style.margin = '0';
    folha.style.boxShadow = 'none';
    folha.style.height = 'auto';
    folha.style.paddingTop = '0';
    folha.style.paddingBottom = '0';
    folha.style.backgroundColor = '#ffffff';
    staging.appendChild(folha);
    return folha;
  };

  const capturar = async (el: HTMLElement) => {
    await prepararImagens(el);
    // Cinto e suspensório do `letter-spacing: normal` acima: o html2canvas lê
    // os estilos num clone que ele monta num iframe à parte, então o valor vai
    // também inline, elemento por elemento (ver pdf-letter-spacing.ts). Como o
    // computado já é `normal` por causa da regra, isso não muda nenhuma altura
    // já medida.
    zerarEspacamentoInline(el);
    // windowWidth precisa bater exatamente com a largura usada pra medir as
    // alturas — um valor fixo que não coincida com a largura real da folha já
    // foi causa de conteúdo cortado nas bordas.
    const canvas = await html2canvas(el, {
      scale: ESCALA_CANVAS,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: larguraPx,
      logging: false,
    });
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 1.0),
      alturaMm: (canvas.height * A4_LARGURA_MM) / canvas.width,
    };
  };

  // --- Timbre e rodapé: altura real (medida na imagem gerada, não no
  // offsetHeight) define quanto sobra de área útil pro conteúdo.
  const folhaTimbre = criarFolha();
  folhaTimbre.appendChild(headerEl.cloneNode(true));
  const timbre = await capturar(folhaTimbre);
  staging.removeChild(folhaTimbre);

  let rodapeAlturaMm = 0;
  if (footerEl) {
    const folhaRodape = criarFolha();
    folhaRodape.appendChild(footerEl.cloneNode(true));
    rodapeAlturaMm = (await capturar(folhaRodape)).alturaMm;
    staging.removeChild(folhaRodape);
  }

  const conteudoTopoMm = margemTopoMm + timbre.alturaMm;
  const alturaUtilMm = A4_ALTURA_MM - conteudoTopoMm - margemBaseMm - rodapeAlturaMm;
  if (alturaUtilMm < 20) throw new Error('Timbre e rodapé não deixam espaço útil na folha A4.');
  const alturaUtilPx = alturaUtilMm * pxPorMm;

  // --- 1ª passada: monta todas as folhas (e conta as páginas dos anexos)
  // antes de desenhar qualquer coisa, pra que o "de N" da numeração já saia
  // certo na folha 1.
  const paginas: Pagina[] = [];

  for (const docEl of docs) {
    let atual = criarFolha();
    // Folha pronta sai do staging na hora — com dezenas de folhas empilhadas
    // ali dentro o container passaria de dez metros de altura, e o
    // html2canvas fica pouco confiável tão longe da viewport. Ela volta
    // sozinha, e só ela, na hora da captura (2ª passada).
    const fecharFolha = () => {
      if (atual.childElementCount > 0) {
        paginas.push({ tipo: 'html', folha: atual });
        staging.removeChild(atual);
        atual = criarFolha();
      }
    };

    /** Coloca um clone na folha corrente, abrindo folha nova quando não cabe.
     *  Se não couber nem sozinho numa folha vazia, quebra pelos filhos
     *  mantendo uma "casca" do container em cada folha (preserva fonte,
     *  alinhamento e recuo do bloco original). */
    /** Margem de cima não vale quando o bloco abre a folha.
     *
     *  No meio do texto ela é o respiro que separa do bloco anterior; no
     *  alto de uma folha nova não há nada acima para se afastar, e ela vira
     *  uma faixa em branco no topo. O bloco de assinatura, por exemplo,
     *  carrega 64px de margem: empurrados para a folha seguinte, viravam
     *  uma tarja vazia antes da data.
     *
     *  Isso também faz o bloco caber mais vezes na folha que já está aberta,
     *  que é o que evita a folha extra quase vazia. */
    const semMargemNoTopo = (el: HTMLElement) => {
      if (atual.childElementCount === 0) el.style.marginTop = "0";
    };

    const colocar = (el: HTMLElement) => {
      semMargemNoTopo(el);
      atual.appendChild(el);
      if (atual.offsetHeight <= alturaUtilPx) return;
      atual.removeChild(el);

      if (atual.childElementCount > 0) {
        fecharFolha();
        semMargemNoTopo(el);
        atual.appendChild(el);
        if (atual.offsetHeight <= alturaUtilPx) return;
        atual.removeChild(el);
      }

      let filhos = filhosDivisiveis(el);
      if (filhos.length === 0 && quebrarPorBr(el)) filhos = Array.from(el.children) as HTMLElement[];
      if (filhos.length === 0) {
        // Indivisível e maior que a folha (uma foto enorme, por exemplo):
        // vai sozinho numa folha e é reduzido proporcionalmente na hora de
        // desenhar — nunca cortado.
        atual.appendChild(el);
        fecharFolha();
        return;
      }

      // A casca repete o container em cada folha. Herdar a margem de topo do
      // original faria o vao aparecer de novo no alto de cada continuacao —
      // mesmo motivo do padding vertical, ja evitado na marcacao.
      const novaCasca = () => {
        const c = el.cloneNode(false) as HTMLElement;
        c.style.marginTop = "0";
        return c;
      };

      let casca = novaCasca();
      atual.appendChild(casca);
      for (const filho of filhos) {
        casca.appendChild(filho);
        if (atual.offsetHeight <= alturaUtilPx) continue;
        casca.removeChild(filho);

        if (casca.childElementCount === 0) {
          atual.removeChild(casca);
          colocar(filho);
          casca = novaCasca();
          atual.appendChild(casca);
          continue;
        }

        fecharFolha();
        casca = novaCasca();
        atual.appendChild(casca);
        casca.appendChild(filho);
        if (atual.offsetHeight > alturaUtilPx) {
          casca.removeChild(filho);
          atual.removeChild(casca);
          colocar(filho);
          casca = novaCasca();
          atual.appendChild(casca);
        }
      }
      if (casca.childElementCount === 0) atual.removeChild(casca);
    };

    const blocos = Array.from(docEl.querySelectorAll('[data-pdf-block]')) as HTMLElement[];
    const alvos = blocos.length > 0
      ? blocos
      : (Array.from(docEl.children) as HTMLElement[]).filter(
          (c) => !c.hasAttribute('data-pdf-header') && !c.hasAttribute('data-pdf-footer')
        );

    alvos.forEach((bloco) => colocar(bloco.cloneNode(true) as HTMLElement));

    fecharFolha();
    staging.removeChild(atual);

    const anexoUrl = docEl.getAttribute('data-pdf-anexo-url');
    if (anexoUrl) {
      const nome = docEl.getAttribute('data-pdf-anexo-nome') || 'documento anexo';
      paginas.push(...(await carregarAnexo(anexoUrl, nome)));
    }
  }

  const total = paginas.length;
  if (total === 0) throw new Error('Nenhum conteúdo pra gerar o PDF.');

  // --- 2ª passada: desenha folha por folha.
  let primeiraFolha = true;
  const abrirPagina = (larguraMm: number, alturaMm: number) => {
    const orientacao = larguraMm > alturaMm ? 'landscape' : 'portrait';
    if (primeiraFolha) {
      primeiraFolha = false;
      const ehA4 = Math.abs(larguraMm - A4_LARGURA_MM) < 0.5 && Math.abs(alturaMm - A4_ALTURA_MM) < 0.5;
      // A folha 1 já vem criada em A4 pelo `new jsPDF(...)`; só precisa ser
      // trocada quando o anexo tem outro tamanho.
      if (!ehA4) {
        pdf.addPage([larguraMm, alturaMm], orientacao);
        pdf.deletePage(1);
      }
      return;
    }
    pdf.addPage([larguraMm, alturaMm], orientacao);
  };

  /** Numeração carimbada direto no PDF — usada nas folhas que não têm o
   *  rodapé institucional (anexos escaneados e avisos). */
  const carimbarNumero = (n: number, larguraMm: number, alturaMm: number) => {
    pdf.setFont('times', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Página ${n} de ${total}`, larguraMm / 2, alturaMm - 8, { align: 'center' });
  };

  for (let i = 0; i < paginas.length; i++) {
    const pagina = paginas[i];
    const numero = i + 1;
    opts.onProgress?.(numero, total);

    if (pagina.tipo === 'html') {
      abrirPagina(A4_LARGURA_MM, A4_ALTURA_MM);
      pdf.addImage(timbre.dataUrl, 'JPEG', 0, margemTopoMm, A4_LARGURA_MM, timbre.alturaMm);

      staging.appendChild(pagina.folha);
      const conteudo = await capturar(pagina.folha);
      let larguraMm = A4_LARGURA_MM;
      let alturaMm = conteudo.alturaMm;
      if (alturaMm > alturaUtilMm) {
        // Só acontece com um elemento indivisível maior que a folha inteira:
        // reduz proporcionalmente em vez de cortar ou esticar a página.
        larguraMm = (A4_LARGURA_MM * alturaUtilMm) / alturaMm;
        alturaMm = alturaUtilMm;
      }
      pdf.addImage(conteudo.dataUrl, 'JPEG', (A4_LARGURA_MM - larguraMm) / 2, conteudoTopoMm, larguraMm, alturaMm);
      staging.removeChild(pagina.folha);

      if (footerEl) {
        const folhaRodape = criarFolha();
        const clone = footerEl.cloneNode(true) as HTMLElement;
        const numEl = clone.querySelector('[data-pdf-pagenum]');
        if (numEl) numEl.textContent = `Página ${numero} de ${total}`;
        folhaRodape.appendChild(clone);
        const rodape = await capturar(folhaRodape);
        staging.removeChild(folhaRodape);
        pdf.addImage(rodape.dataUrl, 'JPEG', 0, A4_ALTURA_MM - margemBaseMm - rodape.alturaMm, A4_LARGURA_MM, rodape.alturaMm);
      } else {
        carimbarNumero(numero, A4_LARGURA_MM, A4_ALTURA_MM);
      }
      continue;
    }

    if (pagina.tipo === 'anexo-pdf') {
      const paginaPdf = await pagina.doc.getPage(pagina.pagina);
      const viewport = paginaPdf.getViewport({ scale: 1 });
      const larguraMm = (viewport.width * 25.4) / 72;
      const alturaMm = (viewport.height * 25.4) / 72;
      const render = paginaPdf.getViewport({ scale: DPI_ANEXO / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(render.width);
      canvas.height = Math.round(render.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await paginaPdf.render({ canvasContext: ctx, viewport: render }).promise;
      abrirPagina(larguraMm, alturaMm);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, larguraMm, alturaMm);
      carimbarNumero(numero, larguraMm, alturaMm);
      paginaPdf.cleanup?.();
      continue;
    }

    if (pagina.tipo === 'anexo-img') {
      // Foto/imagem não tem tamanho físico próprio: entra numa folha A4,
      // centralizada e no maior tamanho que couber sem deformar.
      abrirPagina(A4_LARGURA_MM, A4_ALTURA_MM);
      const disponivelW = A4_LARGURA_MM - 2 * margemTopoMm;
      const disponivelH = A4_ALTURA_MM - 2 * margemTopoMm;
      const fator = Math.min(disponivelW / pagina.largura, disponivelH / pagina.altura);
      const larguraMm = pagina.largura * fator;
      const alturaMm = pagina.altura * fator;
      pdf.addImage(
        pagina.dataUrl,
        'JPEG',
        (A4_LARGURA_MM - larguraMm) / 2,
        (A4_ALTURA_MM - alturaMm) / 2,
        larguraMm,
        alturaMm
      );
      carimbarNumero(numero, A4_LARGURA_MM, A4_ALTURA_MM);
      continue;
    }

    abrirPagina(A4_LARGURA_MM, A4_ALTURA_MM);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(pdf.splitTextToSize(pagina.texto, A4_LARGURA_MM - 40), A4_LARGURA_MM / 2, 80, { align: 'center' });
    carimbarNumero(numero, A4_LARGURA_MM, A4_ALTURA_MM);
  }
}

/**
 * Baixa o anexo de uma peça e devolve as páginas que ele ocupa nos autos.
 * Falha de rede/arquivo corrompido nunca derruba o download inteiro: entra
 * uma folha avisando que o documento não pôde ser juntado, e o processo
 * continua.
 */
async function carregarAnexo(url: string, nome: string): Promise<Pagina[]> {
  const aviso = (motivo: string): Pagina[] => [
    { tipo: 'aviso', texto: `O documento anexo "${nome}" não pôde ser incluído neste PDF (${motivo}). Baixe-o pela tela do processo.` },
  ];
  try {
    const { bytes, mime } = await baixarAnexo(url);
    const ehPdf = mime.includes('pdf') || (bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF');

    if (ehPdf) {
      const pdfjsLib: any = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      return Array.from({ length: doc.numPages }, (_, i) => ({ tipo: 'anexo-pdf', doc, pagina: i + 1 } as Pagina));
    }

    if (!mime.startsWith('image/')) return aviso('formato não suportado');

    const imagem = await normalizarImagem(await bytesParaDataUrl(bytes, mime));
    return [{ tipo: 'anexo-img', dataUrl: imagem.dataUrl, largura: imagem.width, altura: imagem.height }];
  } catch (e) {
    console.error('Falha ao juntar anexo no PDF do PAS:', nome, e);
    return aviso('arquivo indisponível');
  }
}

async function baixarAnexo(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (url.startsWith('data:')) {
    const mime = url.slice(5, url.indexOf(';')) || 'application/octet-stream';
    const base64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  // O Storage não devolve CORS liberado pra fetch — o proxy interno (o mesmo
  // já usado pelo brasão no timbre) resolve isso.
  const resp = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  return { bytes: new Uint8Array(buffer), mime: resp.headers.get('Content-Type') || '' };
}

function bytesParaDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes.buffer as ArrayBuffer], { type: mime }));
  });
}

/**
 * Mede a imagem e a reescreve como JPEG — o jsPDF só embute JPEG/PNG com
 * segurança, e o anexo pode ter vindo em qualquer formato que o navegador
 * saiba decodificar (webp, por exemplo).
 */
function normalizarImagem(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('Imagem inválida.'));
    img.src = dataUrl;
  });
}

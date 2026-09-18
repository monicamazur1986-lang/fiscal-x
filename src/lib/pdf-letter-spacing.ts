/**
 * LETRAS ESMAGADAS NO PDF
 *
 * O html2canvas, sempre que encontra `letter-spacing` diferente de zero, para
 * de desenhar o texto por palavras e passa a desenhar **letra por letra**,
 * avançando só a largura de cada glifo e ignorando o espaçamento configurado
 * (ver `renderTextWithLetterSpacing` no dist dele). O resultado são caracteres
 * colados e sobrepostos, sem kerning.
 *
 * Isso atinge em cheio os títulos em versalete dos documentos oficiais, que
 * usam as classes `tracking-tighter` e `tracking-tight` — espaçamento
 * NEGATIVO, o pior caso. Na tela sai correto; no PDF, esmagado.
 *
 * A correção tem duas metades, e as duas são necessárias:
 *
 *   1. Uma regra CSS no staging, aplicada ANTES de qualquer medição — assim a
 *      altura medida e a imagem capturada continuam batendo. Sem isso, zerar o
 *      espaçamento só na hora da captura mudaria a largura do texto depois de
 *      a paginação já estar decidida.
 *
 *   2. O valor inline, elemento por elemento, antes de capturar. O html2canvas
 *      lê os estilos num clone que monta num iframe à parte, onde a regra do
 *      staging pode não alcançar — o cabeçalho rico que cada município
 *      configura por conta própria é o caso típico, porque ali não dá para
 *      mexer classe por classe.
 *
 * Extraído de generate-pas-pdf.ts, onde nasceu: a autuação e o relatório de
 * roteiro tinham o mesmo defeito e nenhuma das duas metades.
 */

/** Marca as folhas que a regra de espaçamento deve alcançar. */
export const CLASSE_FOLHA_PDF = 'pdf-folha-sem-tracking';

/** Metade 1 — a regra CSS no container de staging. Idempotente. */
export function garantirEstiloDaFolha(staging: HTMLElement, classeFolha = CLASSE_FOLHA_PDF) {
  if (staging.querySelector(`style[data-pdf-estilo="${classeFolha}"]`)) return;
  const estilo = document.createElement('style');
  estilo.setAttribute('data-pdf-estilo', classeFolha);
  estilo.textContent = `.${classeFolha}, .${classeFolha} * { letter-spacing: normal !important; }`;
  staging.appendChild(estilo);
}

/**
 * Metade 2 — o valor inline, logo antes de capturar.
 *
 * Como o computado já é `normal` por causa da regra acima, isto não altera
 * nenhuma altura que já tenha sido medida.
 */
export function zerarEspacamentoInline(el: HTMLElement) {
  el.style.letterSpacing = 'normal';
  el.querySelectorAll<HTMLElement>('*').forEach((filho) => {
    filho.style.letterSpacing = 'normal';
  });
}

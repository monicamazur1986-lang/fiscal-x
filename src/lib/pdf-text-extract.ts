// Alguns PDFs (comuns em publicações de órgãos públicos) gravam cada letra
// como um "item" de texto separado, sem espaço nenhum no conteúdo — o join(' ')
// ingênuo colocava um espaço ENTRE CADA LETRA ("G A B I N E T E"). A posição
// x/y de cada item é real, então em vez de sempre juntar com espaço (ou
// nunca), só inserimos um espaço quando o vão horizontal entre o fim de um
// item e o início do próximo é comparável à largura de um espaço de verdade —
// kerning entre letras da mesma palavra é bem menor que isso.
//
// Compartilhado entre o navegador (src/hooks/use-biblioteca.ts) e o script de
// indexação server-side (scripts/generate-legal-embeddings.ts) — ambos usam
// pdfjs-dist (build de navegador e build "legacy" para Node, respectivamente)
// e o formato de `item` retornado por `getTextContent()` é o mesmo nos dois.
export function extractPageText(items: any[]): string {
  let text = '';
  let last: any = null;
  for (const item of items) {
    if (!item?.str) {
      if (item?.hasEOL) { text += '\n'; last = null; }
      continue;
    }
    if (last) {
      const sameLine = Math.abs(item.transform[5] - last.transform[5]) < Math.abs(item.transform[0] || 10) * 0.5;
      if (!sameLine) {
        text += '\n';
      } else {
        const prevEndX = last.transform[4] + (last.width || 0);
        const gap = item.transform[4] - prevEndX;
        const fontSize = Math.abs(item.transform[0]) || 10;
        const alreadySpaced = text.endsWith(' ') || item.str.startsWith(' ');
        if (!alreadySpaced && gap > fontSize * 0.2) {
          text += ' ';
        }
      }
    }
    text += item.str;
    last = item;
    if (item.hasEOL) { text += '\n'; last = null; }
  }
  return text;
}

export type LegalParagraphType =
  | 'capitulo'
  | 'secao'
  | 'subsecao'
  | 'artigo'
  | 'paragrafo'
  | 'inciso'
  | 'alinea'
  | 'texto';

export interface LegalParagraph {
  type: LegalParagraphType;
  text: string;
}

interface Marker {
  type: LegalParagraphType;
  start: number;
  end: number;
}

// Ordem importa: os mais específicos (Subseção) precisam vir antes dos mais
// genéricos (Seção) para não haver sobreposição incorreta.
const MARKER_PATTERNS: { type: LegalParagraphType; re: RegExp }[] = [
  { type: 'subsecao', re: /\bSUBSE[ÇC][ÃA]O\s+[IVXLCDM]+\b\.?/gi },
  { type: 'secao', re: /\bSE[ÇC][ÃA]O\s+[IVXLCDM]+\b\.?/gi },
  { type: 'capitulo', re: /\bCAP[IÍ]TULO\s+[IVXLCDM]+\b\.?/gi },
  { type: 'artigo', re: /\bArt\.?\s*\d+[ºo°]?[\-A-Z]?\.?/g },
  { type: 'paragrafo', re: /\bPar[áa]grafo\s+[úu]nico\.|§\s*\d+[ºo°]?\.?/gi },
  // Incisos ("I -", "II.") e alíneas ("a)", "b)") só contam quando aparecem
  // logo após um ponto/quebra e são seguidos de letra minúscula — reduz
  // falsos positivos com siglas maiúsculas soltas no meio do texto.
  { type: 'inciso', re: /(?<=\s|^)[IVXLCDM]{1,7}\s*[-.]\s+(?=[a-zA-Zà-ÿÀ-Ÿ])/g },
  { type: 'alinea', re: /(?<=\s|^)[a-z]\)\s+(?=[a-zA-Zà-ÿÀ-Ÿ])/g },
];

/**
 * Descarta capa, ficha técnica, "colaboradores", prefácio e o sumário
 * original (que vem ilegível do PDF, com linhas pontilhadas grudadas no
 * texto) — tudo que precede o primeiro "Capítulo" ou "Art. 1º" do
 * documento. Genérico: não é específico de nenhuma lei em particular.
 */
function trimFrontMatter(text: string): string {
  const capMatch = text.match(/\bCAP[IÍ]TULO\s+[IVXLCDM]+/i);
  const artMatch = text.match(/\bArt\.?\s*1[ºo°]?\./);
  const candidates = [capMatch, artMatch]
    .filter((m): m is RegExpMatchArray => m !== null && m.index !== undefined)
    .map((m) => m.index as number);
  if (candidates.length === 0) return text;
  return text.slice(Math.min(...candidates));
}

function collectMarkers(text: string): Marker[] {
  const markers: Marker[] = [];
  for (const { type, re } of MARKER_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      markers.push({ type, start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) re.lastIndex++;
    }
  }
  markers.sort((a, b) => a.start - b.start);

  // Remove marcadores que começam dentro de outro já aceito (evita, por
  // exemplo, um "inciso" detectado dentro do trecho de um "artigo").
  const filtered: Marker[] = [];
  let lastEnd = -1;
  for (const m of markers) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.start;
    }
  }
  return filtered;
}

/**
 * Quebra o texto corrido extraído do PDF em parágrafos tipados (capítulo,
 * seção, artigo, parágrafo, inciso, alínea) para permitir formatação e busca
 * mais legíveis, no lugar de um único bloco de texto contínuo.
 */
export function parseLegalText(rawText: string): LegalParagraph[] {
  const text = trimFrontMatter(rawText.replace(/\s+/g, ' ').trim());
  if (!text) return [];

  const markers = collectMarkers(text);
  const paragraphs: LegalParagraph[] = [];

  if (markers.length === 0) {
    return [{ type: 'texto', text }];
  }

  if (markers[0].start > 0) {
    const lead = text.slice(0, markers[0].start).trim();
    if (lead) paragraphs.push({ type: 'texto', text: lead });
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].start;
    const end = i + 1 < markers.length ? markers[i + 1].start : text.length;
    const segment = text.slice(start, end).trim();
    if (segment) paragraphs.push({ type: markers[i].type, text: segment });
  }

  return paragraphs;
}

export interface TableOfContentsEntry {
  id: string;
  label: string;
  level: 'capitulo' | 'secao';
}

/** Gera um sumário navegável a partir da estrutura real extraída
 * (Capítulos/Seções), no lugar do sumário impresso original (removido por
 * trimFrontMatter e, de qualquer forma, ilegível quando extraído do PDF). */
export function buildTableOfContents(paragraphs: LegalParagraph[]): TableOfContentsEntry[] {
  const entries: TableOfContentsEntry[] = [];
  paragraphs.forEach((p, i) => {
    if (p.type === 'capitulo' || p.type === 'secao') {
      entries.push({ id: `legal-heading-${i}`, label: p.text, level: p.type });
    }
  });
  return entries;
}

const LEAD_PATTERNS: Partial<Record<LegalParagraphType, RegExp>> = {
  artigo: /^Art\.?\s*\d+[ºo°]?[\-A-Z]?\.?/,
  paragrafo: /^(Par[áa]grafo\s+[úu]nico\.|§\s*\d+[ºo°]?\.?)/i,
  inciso: /^[IVXLCDM]{1,7}\s*[-.]\s*/,
  alinea: /^[a-z]\)\s*/,
};

/** Separa o marcador inicial (ex.: "Art. 5º.") do restante do parágrafo, para
 * permitir destacá-lo em negrito na renderização sem afetar o texto corrido. */
export function splitMarkerLead(paragraph: LegalParagraph): { lead: string; rest: string } {
  const pattern = LEAD_PATTERNS[paragraph.type];
  if (!pattern) return { lead: '', rest: paragraph.text };
  const match = paragraph.text.match(pattern);
  if (!match) return { lead: '', rest: paragraph.text };
  return { lead: match[0], rest: paragraph.text.slice(match[0].length) };
}

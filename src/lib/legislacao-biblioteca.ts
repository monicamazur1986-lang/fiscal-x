import legislacaoData from '@/lib/legislacao.json';
import type { LegislacaoDocumento } from '@/lib/types';

/**
 * Ponte entre o acervo de artigos usado na busca "+LEI"
 * (src/lib/legislacao.json → src/lib/legal-search.ts) e a Biblioteca
 * (src/hooks/use-biblioteca.ts), que até então só sabia exibir PDFs
 * declarados em public/documentos-biblioteca/manifest.json.
 *
 * Sem isso, uma lei cadastrada no legislacao.json aparecia na busca de
 * fundamentação legal mas ficava invisível na Biblioteca — que é onde o
 * fiscal procura o texto da norma pra ler.
 *
 * A inclusão é OPT-IN: só entra na Biblioteca a lei que declarar um bloco
 * `biblioteca` com esfera/categoria. É de propósito — a Lei Estadual
 * 13.331/2001 e o Código Municipal de Prudentópolis já estão na Biblioteca
 * como PDF (o texto integral e oficial, muito mais completo que a seleção de
 * artigos daqui), então marcá-las criaria uma entrada duplicada e pior.
 */

interface ArtigoJson {
  id: string;
  label: string;
  texto: string;
  pena?: string;
  keywords?: string;
}

interface LeiJson {
  titulo: string;
  descricao?: string;
  linkOficial?: string;
  municipioId?: string;
  artigos: ArtigoJson[];
  biblioteca?: {
    esfera: 'municipal' | 'estadual' | 'federal';
    /** Alimenta o agrupamento da Biblioteca — "RDC" e "Resolução" viram
     * grupos próprios; ver groupOf() em src/app/biblioteca/page.tsx. */
    categoria: string;
  };
}

/**
 * Encurta "Art. 5º da Resolução SESA nº 700/2013" para "Art. 5º".
 *
 * O label de cada artigo repete o nome da lei porque na busca "+LEI" ele é
 * exibido solto, fora de contexto. Dentro da Biblioteca a lei já é o título
 * da página, então repetir o nome em cada um dos artigos só polui a leitura.
 * Corta no primeiro " da "/" do " — labels sem essa construção (ex.: "RDC
 * ANVISA nº 502/2021") não casam e são devolvidos inteiros.
 */
function encurtarLabel(label: string): string {
  const [inicio] = label.split(/\s+d[ao]\s+/i);
  return inicio?.trim() || label;
}

/**
 * Monta o texto corrido que a Biblioteca renderiza. O formato ("Art. 5º" +
 * texto do artigo) é o mesmo que parseLegalText (src/lib/format-legal-text.ts)
 * já reconhece no texto extraído dos PDFs, então a segmentação em
 * artigos/parágrafos e o índice lateral funcionam sem tratamento especial.
 */
function montarConteudoIntegral(artigos: ArtigoJson[]): string {
  return artigos
    .map((art) => {
      const cabecalho = encurtarLabel(art.label);
      const corpo = art.pena ? `${art.texto}\nPena: ${art.pena}` : art.texto;
      return `${cabecalho} ${corpo}`;
    })
    .join('\n\n');
}

// Sem data real de publicação por lei no JSON, usa o momento da carga do
// módulo — constante durante toda a sessão, pra não recalcular a cada render.
const CARREGADO_EM = new Date().toISOString();

/**
 * Documentos da Biblioteca derivados do legislacao.json. Calculado uma vez
 * na carga do módulo: a fonte é um import estático, nunca muda em runtime.
 */
export const documentosDaLegislacao: LegislacaoDocumento[] = Object.entries(
  legislacaoData as Record<string, LeiJson>
)
  .filter(([, lei]) => !!lei.biblioteca)
  .map(([chave, lei]) => {
    const keywords = Array.from(
      new Set(
        lei.artigos
          .flatMap((art) => (art.keywords || '').split(/[\s,]+/))
          .filter(Boolean)
      )
    ).join(' ');

    return {
      // Prefixo evita colisão com os ids vindos dos manifests de PDF.
      id: `legislacao-${chave.toLowerCase().replace(/_/g, '-')}`,
      titulo: lei.titulo,
      categoria: lei.biblioteca!.categoria,
      esfera: lei.biblioteca!.esfera,
      municipioId: lei.municipioId,
      descricao: lei.descricao || '',
      conteudoIntegral: montarConteudoIntegral(lei.artigos),
      linkOficial: lei.linkOficial,
      // Sem pdfUrl de propósito: não existe arquivo pra baixar, e a Biblioteca
      // só mostra o botão de download quando pdfUrl está presente.
      keywords,
      updatedAt: CARREGADO_EM,
      chunks: [],
    };
  });

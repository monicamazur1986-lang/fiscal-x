/**
 * Estrutura de cada tipo de autuação sanitária.
 *
 * Os documentos NÃO têm todos o mesmo corpo. Antes o sistema montava a mesma
 * folha para todos — com relato dos fatos e prazo de defesa em qualquer termo
 * —, o que é juridicamente errado: relato da infração e prazo de defesa são
 * elementos do AUTO DE INFRAÇÃO, e os demais termos ou remetem a ele ou têm
 * objeto próprio (lista de bens, alcance da interdição etc.).
 *
 * Base legal (Lei Estadual nº 13.331/2001 e Decreto nº 5.711/2002 — PR):
 *
 * - Art. 555: o auto de infração deve conter "o dispositivo legal transgredido
 *   e a descrição da infração" (III) e "o prazo de interposição de defesa" (VI).
 * - Art. 555, §1º: não havendo perigo iminente, o infrator é intimado a
 *   regularizar "no prazo de até 90 dias" — prazo de REGULARIZAÇÃO, de
 *   natureza diferente do prazo de defesa.
 * - Art. 555, §3º: o termo de intimação "conterá dados suficientes para
 *   identificar o infrator e a infração, além de esclarecer a situação legal".
 * - Art. 59: a interdição cautelar "perdurará até que sejam sanadas as
 *   irregularidades" — por isso não tem prazo em dias.
 * - Art. 549: a apreensão recai sobre bens determinados, daí a lista de itens.
 */

export type TipoAutuacao =
  | 'AUTO DE INFRAÇÃO'
  | 'TERMO DE INTIMAÇÃO'
  | 'TERMO DE INTERDIÇÃO'
  | 'TERMO DE DESINTERDIÇÃO'
  | 'TERMO DE APREENSÃO'
  | 'TERMO DE APREENSÃO E INUTILIZAÇÃO'
  | 'TERMO DE INUTILIZAÇÃO'
  | 'TERMO DE IMPOSIÇÃO DE PENALIDADE';

export interface EstruturaAutuacao {
  /** Descrição circunstanciada da infração. Exclusiva do auto de infração. */
  relatoDosFatos: boolean;
  /** Relação dos bens alcançados pela medida (apreensão/inutilização). */
  listaDeItens: boolean;
  /**
   * Bloco de prazo. `false` quando o documento não abre prazo nenhum —
   * caso da interdição (vale até sanar), desinterdição (ato de liberação) e
   * dos termos de apreensão/inutilização, cujo prazo corre no auto vinculado.
   */
  prazo: false | { titulo: string; rotulo: string };
  /** Texto que descreve o objeto do documento, no lugar do relato. */
  objetoLabel?: string;
}

export const ESTRUTURA_POR_TIPO: Record<string, EstruturaAutuacao> = {
  'AUTO DE INFRAÇÃO': {
    relatoDosFatos: true,
    listaDeItens: false,
    prazo: { titulo: 'NOTIFICAÇÃO E PRAZO PARA DEFESA', rotulo: 'PRAZO PARA DEFESA PRÉVIA' },
  },
  'TERMO DE INTIMAÇÃO': {
    relatoDosFatos: false,
    listaDeItens: false,
    objetoLabel: 'EXIGÊNCIAS A REGULARIZAR',
    prazo: { titulo: 'PRAZO PARA REGULARIZAÇÃO', rotulo: 'PRAZO PARA REGULARIZAÇÃO' },
  },
  'TERMO DE INTERDIÇÃO': {
    relatoDosFatos: false,
    listaDeItens: false,
    objetoLabel: 'ALCANCE DA INTERDIÇÃO',
    prazo: false,
  },
  'TERMO DE DESINTERDIÇÃO': {
    relatoDosFatos: false,
    listaDeItens: false,
    objetoLabel: 'OBJETO DA DESINTERDIÇÃO',
    prazo: false,
  },
  'TERMO DE APREENSÃO': {
    relatoDosFatos: false,
    listaDeItens: true,
    objetoLabel: 'MOTIVO DA APREENSÃO',
    prazo: false,
  },
  'TERMO DE APREENSÃO E INUTILIZAÇÃO': {
    relatoDosFatos: false,
    listaDeItens: true,
    objetoLabel: 'MOTIVO DA APREENSÃO E INUTILIZAÇÃO',
    prazo: false,
  },
  'TERMO DE INUTILIZAÇÃO': {
    relatoDosFatos: false,
    listaDeItens: true,
    objetoLabel: 'MOTIVO DA INUTILIZAÇÃO',
    prazo: false,
  },
  'TERMO DE IMPOSIÇÃO DE PENALIDADE': {
    relatoDosFatos: false,
    listaDeItens: false,
    objetoLabel: 'PENALIDADE APLICADA',
    prazo: { titulo: 'PRAZO PARA RECURSO', rotulo: 'PRAZO PARA INTERPOSIÇÃO DE RECURSO' },
  },
};

/** Tipo desconhecido cai no auto de infração, o documento mais completo. */
export function estruturaDoTipo(tipo?: string): EstruturaAutuacao {
  return (tipo && ESTRUTURA_POR_TIPO[tipo]) || ESTRUTURA_POR_TIPO['AUTO DE INFRAÇÃO'];
}

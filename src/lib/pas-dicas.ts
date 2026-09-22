import { baseLegalDoMunicipio, porExtensoComUnidade } from '@/lib/base-legal-municipal';

/**
 * Conteúdo dos balões de ajuda da trilha do PAS — trechos/orientações do
 * Manual de Apoio Teórico-Prático da SESA-PR (Manual 012/2023), condensados
 * pra aparecer no contexto certo de cada ação. Conteúdo estático (sem IA,
 * sem busca) porque é sempre o mesmo texto legal, independente do processo —
 * EXCETO defesa/tip (abaixo), cujo prazo e citação variam por município (ver
 * base-legal-municipal.ts): antes essas duas diziam sempre "dias úteis" e
 * citavam só a Lei Estadual, mesmo num município com código sanitário
 * próprio contando em dias corridos por outro artigo — a dica cita a lei
 * errada e a contagem errada bem no meio do processo real.
 */
export const PAS_DICAS_ESTATICAS = {
  despachoInstrucao: {
    titulo: 'O que o despacho de instrução verifica',
    texto:
      'Antes de determinar a instrução, confira se o Auto de Infração não tem vício insanável: motivação genérica (sem indicar exatamente o que foi violado) pode tornar o auto nulo por cerceamento de defesa. Vícios de forma (ex.: faltou um dado, prazo mal contado) geralmente são sanáveis por ratificação; vícios de motivo ou de finalidade não são — nesses casos o processo não deve seguir sem antes corrigir a origem.',
  },
  relatorioInstrucao: {
    titulo: 'Relatório técnico ≠ roteiro de inspeção',
    texto:
      'O checklist/roteiro de inspeção não substitui o Relatório Técnico de Instrução — ele é insuficiente sozinho para fundamentar uma decisão, porque não detalha o risco sanitário nem a fundamentação jurídica. O relatório deve ir além: contexto da inspeção, o que foi constatado, por que isso configura risco, e quais normas foram violadas.',
  },
  provas: {
    titulo: 'Nem toda foto ajuda',
    texto:
      'Não é a quantidade de imagens que garante uma boa instrução — fotos que não evidenciam a irregularidade relatada no Auto de Infração são só "peso morto" no processo. Anexe apenas o que realmente comprova o fato descrito.',
  },
  termoJuntada: {
    titulo: 'Regra de ouro do Termo de Juntada',
    texto:
      'Um Termo de Juntada é sempre inserido nos autos ANTES do documento a que se refere (primeiro o termo, depois o relatório/prova/defesa). O sistema já cuida dessa ordem automaticamente sempre que você anexa algo.',
  },
  encerramentoInstrucao: {
    titulo: 'Antes de encaminhar para julgamento',
    texto:
      'Só encaminhe para julgamento depois de garantir que o prazo de defesa já se esgotou (não se antecipa o encerramento, mesmo que o autuado sinalize que não vai se manifestar) e que existe, nos autos, ou a defesa juntada ou um Termo de Informação registrando sua ausência.',
  },
  julgamento: {
    titulo: 'Fundamentação obrigatória, mesmo à revelia',
    texto:
      'O julgamento sempre exige avaliar a admissibilidade da defesa (tempestiva, intempestiva ou ausente/à revelia) e apresentar fundamentação de fato e de direito — mesmo quando o autuado não se manifestou. Decisão sem motivação suficiente é nula (Art. 50 da Lei Federal nº 9.784/99). Você pode ir escrevendo a fundamentação a qualquer momento; só a emissão de verdade exige que o relatório técnico e a defesa (ou o Termo de Informação) já estejam completos.',
  },
  retificacao: {
    titulo: 'Corrigir sem apagar',
    texto:
      'Uma peça já lavrada nunca é editada ou apagada — o processo real corrige por convalidação: um novo ato que ratifica (supre o que faltou), reforma (remove só a parte inválida) ou converte (substitui o trecho errado) o ato anterior, sempre mantido ao lado dele nos autos, de forma transparente (Título III, Cap.2 do manual). O Termo de Retificação segue esse mesmo princípio.',
  },
} as const;

/** defesa/tip: prazo, contagem (útil/corrido) e artigo mudam por município
 * (ver base-legal-municipal.ts) — por isso são calculadas, não um texto
 * fixo como as demais acima. */
function dicaDefesa(municipioId?: string | null) {
  const base = baseLegalDoMunicipio(municipioId);
  const prazo = porExtensoComUnidade(base.defesa.dias, base.contagemPrazo);
  return {
    titulo: 'Tempestiva ou intempestiva?',
    texto:
      `O prazo de defesa é de ${prazo} contados da ciência do Auto de Infração, nos termos do ${base.defesa.citacao}. O sistema classifica automaticamente comparando a data de recebimento da defesa com esse prazo — mas mesmo uma defesa intempestiva deve ser juntada aos autos; quem decide se ela ainda pode ser considerada é a autoridade julgadora, não quem recebe o documento.`,
  };
}

function dicaTip(municipioId?: string | null) {
  const base = baseLegalDoMunicipio(municipioId);
  const prazoRecursal = base.recurso.diasMulta
    ? `${porExtensoComUnidade(base.recurso.diasMulta, base.contagemPrazo)} na hipótese específica de aplicação de pena de multa, ou de ${porExtensoComUnidade(base.recurso.dias, base.contagemPrazo)} nos demais casos`
    : porExtensoComUnidade(base.recurso.dias, base.contagemPrazo);
  const prazoDefesa = porExtensoComUnidade(base.defesa.dias, base.contagemPrazo);
  return {
    titulo: 'TIP: ciência da decisão e prazo recursal',
    texto:
      `O Termo de Imposição de Penalidade é o instrumento que dá ciência ao autuado da decisão proferida — é a partir dele que corre o prazo de recurso, de ${prazoRecursal}, nos termos do ${base.recurso.citacao}, diferente dos ${prazoDefesa} da defesa inicial (${base.defesa.citacao}).`,
  };
}

export type PasDicaChave = keyof typeof PAS_DICAS_ESTATICAS | 'defesa' | 'tip';

/** Ponto único de leitura — resolve a estática ou calcula a que depende do
 * município, sem quem usa (PasDica) precisar saber qual é qual. */
export function dicaPas(chave: PasDicaChave, municipioId?: string | null): { titulo: string; texto: string } {
  if (chave === 'defesa') return dicaDefesa(municipioId);
  if (chave === 'tip') return dicaTip(municipioId);
  return PAS_DICAS_ESTATICAS[chave];
}

/**
 * Conteúdo dos balões de ajuda da trilha do PAS — trechos/orientações do
 * Manual de Apoio Teórico-Prático da SESA-PR (Manual 012/2023), condensados
 * pra aparecer no contexto certo de cada ação. Conteúdo estático (sem IA,
 * sem busca) porque é sempre o mesmo texto legal, independente do processo.
 */
export const PAS_DICAS = {
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
  defesa: {
    titulo: 'Tempestiva ou intempestiva?',
    texto:
      'O prazo de defesa é de 15 dias úteis contados da ciência do Auto de Infração (Art. 69, Lei Estadual nº 13.331/2001, c/c Art. 88, §2º, da Lei Estadual nº 20.656/2021 — é essa segunda lei que transforma a contagem em dias úteis). O sistema classifica automaticamente comparando a data de recebimento da defesa com esse prazo — mas mesmo uma defesa intempestiva deve ser juntada aos autos; quem decide se ela ainda pode ser considerada é a autoridade julgadora, não quem recebe o documento.',
  },
  encerramentoInstrucao: {
    titulo: 'Antes de encaminhar para julgamento',
    texto:
      'Só encaminhe para julgamento depois de garantir que o prazo de defesa já se esgotou (não se antecipa o encerramento, mesmo que o autuado sinalize que não vai se manifestar) e que existe, nos autos, ou a defesa juntada ou um Termo de Informação registrando sua ausência.',
  },
} as const;

export type PasDicaChave = keyof typeof PAS_DICAS;

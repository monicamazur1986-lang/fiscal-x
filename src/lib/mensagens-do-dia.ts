/**
 * Banco fixo de dicas/frases exibidas uma por dia na tela inicial ("Mensagem
 * do dia"). Fixo no código — sem tela de administração — porque o pedido foi
 * simples: uma frase diferente por dia, sobre vigilância sanitária e o
 * trabalho do fiscal, sem depender de alguém publicar nada.
 *
 * A escolha é pelo dia do ano (não aleatória): todo mundo vê a MESMA frase no
 * mesmo dia, e ela não muda se a pessoa recarregar a página.
 */
const MENSAGENS: string[] = [
  "Antes de lavrar o auto, confira se a base legal citada ainda está em vigor — normas revogadas invalidam a autuação.",
  "Fotografar o local antes de qualquer manuseio evita contestação posterior sobre o estado encontrado na inspeção.",
  "Prazo de defesa começa a contar da ciência do autuado, não da data do auto — confira a data de recebimento antes de calcular o vencimento.",
  "Recusa de assinatura não invalida o auto: registre a recusa com duas testemunhas, conforme previsto na legislação sanitária.",
  "Documentos com dados incompletos do estabelecimento (CNPJ, endereço) atrasam qualquer recurso ou julgamento posterior — vale o cuidado extra na hora do preenchimento.",
  "Relate os fatos de forma objetiva e cronológica: datas, locais e o que foi efetivamente constatado, sem juízo de valor.",
  "Bens apreendidos precisam de descrição individualizada (produto, marca/lote, quantidade) — uma relação genérica fragiliza o auto.",
  "Revisar o roteiro de inspeção antes de ir a campo evita esquecer itens críticos da checklist técnica.",
  "Cada conselho de classe tem exigências próprias para o responsável técnico — confirme o registro antes de lavrar o termo.",
  "Um prazo de regularização bem fundamentado (com a base legal correta) facilita a cobrança em caso de descumprimento.",
  "Compartilhar o documento com o colega que iniciou a inspeção evita retrabalho e mantém a mesma linha de raciocínio no relato.",
  "Conferir a numeração do processo logo na abertura do documento evita duplicidade no protocolo.",
  "Interdição e apreensão têm pressupostos distintos (risco iminente vs. bem determinado) — o instrumento errado pode ser anulado.",
  "Vistoria com fotos datadas e localizadas (GPS) fortalece a prova em caso de impugnação.",
  "Assinatura eletrônica salva no perfil poupa tempo: um clique já aplica a mesma assinatura em autos, roteiros e PAS.",
  "Ao criar uma cópia de autuação para outro estabelecimento, confira se a identificação foi realmente atualizada antes de finalizar.",
  "O relatório de inspeção é tão importante quanto o auto: ele é a base técnica que sustenta a autuação.",
  "Testemunhas da recusa de assinatura devem ser identificadas com nome completo e documento — não apenas citadas de memória.",
  "Antes de finalizar um documento, revise se todas as assinaturas necessárias foram colhidas — depois de finalizado não é mais possível assinar no sistema.",
  "Um bom controle de agenda evita que prazos de defesa vençam sem o devido acompanhamento.",
];

/** Dia do ano (1 a 366) na data local — mesma frase para todo mundo no
 *  mesmo dia, em qualquer fuso, desde que o relógio do aparelho esteja certo. */
function diaDoAno(data: Date): number {
  const inicioDoAno = new Date(data.getFullYear(), 0, 1);
  const diffMs = data.getTime() - inicioDoAno.getTime();
  return Math.floor(diffMs / 86400000);
}

export function mensagemDoDia(data: Date = new Date()): string {
  const indice = diaDoAno(data) % MENSAGENS.length;
  return MENSAGENS[indice];
}

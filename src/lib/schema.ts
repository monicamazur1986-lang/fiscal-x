import { z } from "zod";

export const autoridadeSchema = z.object({
  id: z.string().default(''),
  nome: z.string().default(''),
  cargo: z.string().default(''),
  rg: z.string().default(''),
  signature: z.string().optional().default(''),
  municipioId: z.string().optional().default(''),
});

export const inspecaoSchema = z.object({
  id: z.string().optional().default(''),
  titulo: z.string().min(1, "Título é obrigatório."),
  descricao: z.string().optional().default(''),
  data: z.date({
    required_error: "Data da inspeção é obrigatória.",
  }),
  local: z.string().optional().default(''),
  status: z.enum(['pendente', 'prazo', 'concluido', 'cancelada', 'arquivado', 'rascunho']).default('pendente'),
  fiscalId: z.string().min(1, "Fiscal é obrigatório."),
  fiscalNome: z.string().min(1, "Nome do fiscal é obrigatório."),
  municipioId: z.string().optional().default(''),
});

/**
 * TEXTO PADRÃO OFICIAL - PRUDENTÓPOLIS-PR
 * Este texto é blindado para se repetir em todos os documentos.
 */
export const DEFAULT_PRAZO_TEXT = `O autuado poderá apresentar defesa prévia por escrito, no prazo de 15 dias a contar da ciência do auto. A defesa deve ser dirigida à autoridade superior e protocolada eletronicamente pelo site da Prefeitura de Prudentópolis através do link: <a href="https://prudentopolisprscp.equiplano.com.br:5028/tramitacaoProcesso/#/abertura-processo/entidade/41dd0a3a-f16f-4e8f-9b2a-8832e9191835/28" target="_blank" style="color: #0000EE; text-decoration: underline; font-weight: bold;">https://prudentopolisprscp.equiplano.com.br:5028/tramitacaoProcesso/#/abertura-processo/entidade/41dd0a3a-f16f-4e8f-9b2a-8832e9191835/28</a> ou entregue presencialmente no Departamento de Vigilância Sanitária Municipal (Rua São Josafat, nº 835 – Centro).`;

/**
 * Termo de Interdição não abre prazo de defesa própria: a interdição vale até
 * regularização. O Auto de Infração vinculado (gerado à parte) é quem carrega
 * o prazo de defesa de fato.
 */
export const INTERDICAO_PRAZO_TEXT = `Fica INTERDITADO TOTALMENTE / PARCIALMENTE este estabelecimento e suspensa a sua atividade até a devida regularização e emissão do Termo de Desinterdição.`;

/**
 * Termo de Apreensão também não é quem conta o prazo de defesa: ele remete ao
 * Auto de Infração vinculado, gerado junto, que é o documento que efetivamente
 * abre o prazo de 15 dias.
 */
export const APREENSAO_PRAZO_TEXT = `O autuado dispõe do prazo de 15 (quinze) dias, descrito no Auto de Infração anexo, a contar do recebimento deste para apresentar defesa por escrito junto à Vigilância Sanitária.`;

export const intimacaoSchema = z.object({
  id: z.string().optional().default(''),
  numeroProcesso: z.string().default(''),
  vara: z.string().optional().default(''), 
  comarca: z.string().default('PRUDENTÓPOLIS'),
  autor: z.string().default(''),
  reu: z.string().default(''),
  reuCargo: z.string().optional().default(''),
  responsavelLegalConselho: z.string().optional().default(''),
  responsavelLegalIdentidade: z.string().optional().default(''),
  responsavelTecnico: z.string().optional().default(''),
  responsavelTecnicoConselho: z.string().optional().default(''),
  responsavelTecnicoIdentidade: z.string().optional().default(''),
  autoridades: z.array(autoridadeSchema).default([]),
  dataIntimacao: z.date().default(new Date()),
  dataRecebimento: z.date().optional(),
  dataRecebimentoTecnico: z.date().optional(),
  prazo: z.string().default(DEFAULT_PRAZO_TEXT),
  prazoDias: z.number().default(15),
  prazoJustificativa: z.string().optional().default(''),
  teor: z.string().default(''),
  tipoTermo: z.string().default("TERMO DE INTIMAÇÃO"),
  status: z.enum(['finalizado', 'rascunho']).default('rascunho'),
  cnpj: z.string().optional().default(''),
  endereco: z.string().optional().default(''),
  bairro: z.string().optional().default(''),
  legislacaoBase: z.string().optional().default(''),
  cnae: z.string().optional().default(''),
  telefone: z.string().optional().default(''),
  signatureResponsavel: z.string().optional().default(''),
  signatureResponsavelTecnico: z.string().optional().default(''),
  createdAt: z.string().optional().default(''),
  createdBy: z.string().optional().default(''),
  createdByName: z.string().optional().default(''),
  dataDocumento: z.string().optional().default(''),
  horaDocumento: z.string().optional().default(''),
  secretariaOficial: z.string().optional().default(''),
  departamentoOficial: z.string().optional().default(''),
  recusouAssinar: z.boolean().default(false),
  testemunha1Nome: z.string().optional().default(''),
  testemunha1Identidade: z.string().optional().default(''),
  testemunha2Nome: z.string().optional().default(''),
  testemunha2Identidade: z.string().optional().default(''),
  signatureTestemunha1: z.string().optional().default(''),
  signatureTestemunha2: z.string().optional().default(''),
  pdfUrl: z.string().optional().default(''),
  municipioId: z.string().optional().default(''),
  fotoDocumento: z.string().optional().default(''),
  documentoOrigemId: z.string().optional().default(''),
  autoInfracaoVinculadaId: z.string().optional().default(''),
});

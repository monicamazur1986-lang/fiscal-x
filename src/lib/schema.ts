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
 * TEXTOS DE PRAZO — só para os documentos que de fato abrem prazo.
 *
 * Auto de Infração abre prazo de DEFESA (Art. 555, VI, do Decreto nº
 * 5.711/2002); Termo de Intimação abre prazo de REGULARIZAÇÃO (Art. 555, §1º);
 * Termo de Imposição de Penalidade abre prazo de RECURSO. Os demais termos não
 * abrem prazo nenhum — o conteúdo do ato deles fica em ATO_TEXT_POR_TIPO,
 * mais abaixo.
 */
export const INTIMACAO_PRAZO_TEXT = `Fica o responsável INTIMADO a sanar as irregularidades acima apontadas no prazo de <strong>____ (__________) dias</strong>, contados do recebimento deste Termo.<br><br>Havendo motivo relevante e devidamente comprovado, poderá ser solicitada prorrogação do prazo antes do seu vencimento, a critério da autoridade sanitária (Art. 555, §2º, do Decreto Estadual nº 5.711/2002).<br><br>Vencido o prazo sem que as irregularidades tenham sido sanadas, terá prosseguimento o processo administrativo sanitário, com a lavratura do respectivo Auto de Infração e aplicação das penalidades cabíveis, nos termos da Lei Estadual nº 13.331/2001.`;

export const PENALIDADE_PRAZO_TEXT = `Fica o autuado CIENTIFICADO da penalidade acima imposta, decorrente do processo administrativo sanitário instaurado pelo Auto de Infração nº <strong>__________</strong>.<br><br>Cabe RECURSO à autoridade superior no prazo de <strong>15 (quinze) dias</strong>, contados da ciência deste Termo. O recurso deve ser protocolado eletronicamente pelo site da Prefeitura de Prudentópolis através do link: <a href="https://prudentopolisprscp.equiplano.com.br:5028/tramitacaoProcesso/#/abertura-processo/entidade/41dd0a3a-f16f-4e8f-9b2a-8832e9191835/28" target="_blank" style="color: #0000EE; text-decoration: underline; font-weight: bold;">protocolo eletrônico</a> ou entregue presencialmente no Departamento de Vigilância Sanitária Municipal (Rua São Josafat, nº 835 – Centro).<br><br>Não havendo recurso no prazo, a penalidade torna-se definitiva na esfera administrativa.`;

/**
 * TEXTOS DO ATO — para os termos que NÃO abrem prazo. Aqui o texto padrão vai
 * para o campo de objeto do documento (o mesmo lugar que, no auto de infração,
 * recebe o relato dos fatos), porque é ali que se descreve o que o termo faz.
 * Servem de ponto de partida: o fiscal completa as lacunas e ajusta.
 */
export const INTERDICAO_ATO_TEXT = `Fica <strong>INTERDITADO(A)</strong> — total (  ) / parcialmente (  ) — o estabelecimento / equipamento / produto abaixo identificado, com a imediata suspensão da respectiva atividade, nos termos do Art. 55, VII, e do Art. 59 da Lei Estadual nº 13.331/2001.<br><br>Objeto da interdição: ______________________________________________<br><br>A interdição <strong>perdurará até que sejam sanadas as irregularidades</strong> apontadas no Auto de Infração lavrado em conjunto, mediante nova inspeção e lavratura do respectivo Termo de Desinterdição.<br><br>O descumprimento desta medida sujeita o responsável às penalidades previstas na legislação sanitária, sem prejuízo das providências cíveis e criminais cabíveis.`;

export const DESINTERDICAO_ATO_TEXT = `Fica <strong>DESINTERDITADO(A)</strong> o estabelecimento / equipamento / produto interditado pelo Termo de Interdição nº <strong>__________</strong>, de ____/____/______.<br><br>Verificou-se, em inspeção realizada nesta data, o saneamento das irregularidades que motivaram a medida, ficando <strong>autorizado o reinício das atividades</strong> a partir da ciência deste Termo.`;

export const APREENSAO_ATO_TEXT = `Ficam <strong>APREENDIDOS</strong> os bens relacionados neste Termo, nos termos do Art. 55, III, da Lei Estadual nº 13.331/2001.<br><br>Motivo da apreensão: ______________________________________________<br><br>Os bens permanecerão sob guarda ______________________ até a decisão final do processo administrativo sanitário, sendo vedada sua comercialização, uso ou remoção.<br><br>As irregularidades que motivaram esta medida constam do Auto de Infração lavrado em conjunto, documento em que corre o prazo de defesa.`;

export const APREENSAO_INUTILIZACAO_ATO_TEXT = `Ficam <strong>APREENDIDOS e INUTILIZADOS</strong> os bens relacionados neste Termo, por se encontrarem impróprios para o consumo ou uso, nos termos do Art. 55, III e IV, e do Art. 58 da Lei Estadual nº 13.331/2001.<br><br>Motivo: ______________________________________________<br><br>A inutilização foi realizada por meio de ______________________, na presença do responsável pelo estabelecimento e das testemunhas abaixo assinadas.<br><br>As irregularidades que motivaram esta medida constam do Auto de Infração lavrado em conjunto, documento em que corre o prazo de defesa.`;

export const INUTILIZACAO_ATO_TEXT = `Ficam <strong>INUTILIZADOS</strong> os bens relacionados neste Termo, por se encontrarem impróprios para o consumo ou uso, nos termos do Art. 55, IV, e do Art. 58 da Lei Estadual nº 13.331/2001.<br><br>Motivo: ______________________________________________<br><br>A inutilização foi realizada por meio de ______________________, na presença do responsável pelo estabelecimento e das testemunhas abaixo assinadas.`;

/**
 * Texto de prazo de cada tipo. Tipo ausente aqui não abre prazo (interdição,
 * desinterdição, apreensão, inutilização) ou usa a defesa prévia padrão
 * (auto de infração).
 *
 * Tabela em vez de encadear ifs: a escolha acontece em mais de um ponto do
 * formulário — ao abrir o documento e ao trocar o tipo — e cada tipo novo
 * obrigava a lembrar de todos eles.
 */
const PRAZO_TEXT_POR_TIPO: Record<string, string> = {
  'TERMO DE INTIMAÇÃO': INTIMACAO_PRAZO_TEXT,
  'TERMO DE IMPOSIÇÃO DE PENALIDADE': PENALIDADE_PRAZO_TEXT,
};

/** Texto padrão do ATO, para os termos sem prazo. */
const ATO_TEXT_POR_TIPO: Record<string, string> = {
  'TERMO DE INTERDIÇÃO': INTERDICAO_ATO_TEXT,
  'TERMO DE DESINTERDIÇÃO': DESINTERDICAO_ATO_TEXT,
  'TERMO DE APREENSÃO': APREENSAO_ATO_TEXT,
  'TERMO DE APREENSÃO E INUTILIZAÇÃO': APREENSAO_INUTILIZACAO_ATO_TEXT,
  'TERMO DE INUTILIZAÇÃO': INUTILIZACAO_ATO_TEXT,
};

export function prazoTextoDoTipo(tipo?: string): string {
  return (tipo && PRAZO_TEXT_POR_TIPO[tipo]) || DEFAULT_PRAZO_TEXT;
}

/** Texto inicial do campo de objeto/relato. Vazio para os tipos cujo corpo é
 *  escrito pelo fiscal do zero (auto de infração e termo de intimação). */
export function atoTextoDoTipo(tipo?: string): string {
  return (tipo && ATO_TEXT_POR_TIPO[tipo]) || '';
}

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
  /**
   * Bens alcançados pela medida — só nos termos de apreensão e/ou inutilização
   * (ver listaDeItens em src/lib/autuacao-estrutura.ts). A apreensão recai
   * sobre bens determinados (Art. 549), então a relação deles é o próprio
   * objeto do documento, no lugar do relato da infração.
   */
  itensApreendidos: z.array(z.object({
    produto: z.string().default(''),
    marcaLote: z.string().default(''),
    quantidade: z.string().default(''),
    unidade: z.string().default(''),
  })).default([]),
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

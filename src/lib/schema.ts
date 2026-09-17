import { z } from "zod";
import { textosLegaisDoMunicipio } from "@/lib/base-legal-municipal";

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
 * TEXTO PADRÃO DA DEFESA — ESFERA ESTADUAL (Paraná)
 *
 * Conferido contra o Código de Saúde do Paraná (Lei nº 13.331/2001 e
 * Decreto nº 5.711/2002), que está no acervo da Biblioteca. Vale para todo
 * município sem código sanitário próprio; onde há código próprio, o texto
 * municipal tem precedência (ver base-legal-municipal.ts).
 */
export const DEFAULT_PRAZO_TEXT = `O infrator poderá oferecer <strong>defesa ou impugnação</strong> a este Auto de Infração no prazo de <strong>15 (quinze) dias</strong>, contados da notificação, nos termos do Art. 69 da Lei Estadual nº 13.331/2001 e do Art. 561 do Decreto Estadual nº 5.711/2002.<br><br>A defesa deve ser dirigida à autoridade sanitária competente e protocolada no órgão de vigilância sanitária do município.<br><br>Decorrido o prazo, e após ouvir o autuante e examinar as provas colhidas, a autoridade competente decidirá fundamentadamente (Art. 70 da Lei Estadual nº 13.331/2001; Art. 561, §1º, do Decreto Estadual nº 5.711/2002).`;

/**
 * TEXTOS DE PRAZO — só para os documentos que de fato abrem prazo.
 *
 * Auto de Infração abre prazo de DEFESA: 15 dias (Art. 69 da Lei nº
 * 13.331/2001; Art. 561 do Decreto nº 5.711/2002 — e o Art. 555, VI, do
 * Decreto exige que o auto informe esse prazo). Termo de Intimação abre prazo
 * de REGULARIZAÇÃO: até 90 dias, prorrogáveis excepcionalmente até 180 no
 * total (Art. 66, §1º, da Lei; Art. 555, §§1º e 2º, do Decreto). Termo de
 * Imposição de Penalidade abre prazo de RECURSO: 10 dias (Art. 73 da Lei;
 * Art. 561, §2º, do Decreto) — não 15, que é o da defesa.
 *
 * Os demais termos não abrem prazo nenhum — o conteúdo do ato deles fica em
 * ATO_TEXT_POR_TIPO, mais abaixo.
 */
export const INTIMACAO_PRAZO_TEXT = `Fica o responsável <strong>INTIMADO</strong> a proceder a regularização das irregularidades acima apontadas no prazo de <strong><mark>[Nº DE DIAS]</mark> (<mark>[POR EXTENSO]</mark>) dias</strong>, contados do recebimento deste Termo, por não constituir a irregularidade perigo iminente para a saúde, a critério da autoridade sanitária (Art. 66, §1º, da Lei Estadual nº 13.331/2001 e Art. 555, §1º, do Decreto Estadual nº 5.711/2002).<br><br>O prazo fixado pela autoridade sanitária <strong>não pode ultrapassar 90 (noventa) dias</strong>. Alegando motivos relevantes devidamente comprovados, o interessado poderá pleitear prorrogação, que é <strong>excepcional</strong> e, somada ao prazo inicial, <strong>não pode ultrapassar 180 (cento e oitenta) dias no total</strong> (Art. 555, §2º, do Decreto Estadual nº 5.711/2002).<br><br>Persistindo a irregularidade ou infração, terá prosseguimento o processo administrativo sanitário, com a lavratura do respectivo Auto de Infração e aplicação das penalidades do Art. 55 da Lei Estadual nº 13.331/2001 (Art. 66, §3º, da mesma Lei; Art. 555, §4º, do Decreto).<br><br>A expedição deste Termo interrompe a prescrição (Art. 64, §1º, da Lei Estadual nº 13.331/2001).`;

export const PENALIDADE_PRAZO_TEXT = `Fica o autuado <strong>CIENTIFICADO</strong> da penalidade acima imposta, decorrente do processo administrativo sanitário instaurado pelo Auto de Infração nº <strong><mark>[NÚMERO]</mark></strong>.<br><br>Cabe <strong>RECURSO</strong> à autoridade imediatamente superior àquela que proferiu a decisão, no prazo de <strong>10 (dez) dias</strong> contados da ciência desta decisão (Art. 71 e Art. 73 da Lei Estadual nº 13.331/2001; Art. 561, §2º, do Decreto Estadual nº 5.711/2002). Da decisão dessa autoridade cabe recurso em segunda e última instância ao Secretário Municipal ou Estadual da Saúde, conforme a jurisdição (Art. 72 da Lei; Art. 561, §3º, do Decreto).<br><br>Os recursos <strong>não têm efeito suspensivo</strong>, podendo a autoridade a quem forem dirigidos, em cognição sumária e revogável a qualquer tempo, determinar a suspensão da aplicação da penalidade (Art. 74 da Lei; Art. 562 do Decreto).<br><br>Aplicada pena de multa, o recolhimento deve ser feito à conta do respectivo Fundo de Saúde no prazo de <strong>30 (trinta) dias</strong> contados desta ciência; o não recolhimento implica inscrição em dívida ativa e cobrança judicial (Art. 563 e §2º do Decreto Estadual nº 5.711/2002).`;

/**
 * TEXTOS DO ATO — para os termos que NÃO abrem prazo. Aqui o texto padrão vai
 * para o campo de objeto do documento (o mesmo lugar que, no auto de infração,
 * recebe o relato dos fatos), porque é ali que se descreve o que o termo faz.
 * Servem de ponto de partida: o fiscal completa as lacunas e ajusta.
 */
export const INTERDICAO_ATO_TEXT = `Fica <strong>INTERDITADO(A)</strong>, em caráter <strong>CAUTELAR</strong> — total (&nbsp;&nbsp;) / parcialmente (&nbsp;&nbsp;) —, o estabelecimento / obra / produto / equipamento abaixo identificado, com a imediata suspensão da respectiva atividade, nos termos do <strong>Art. 55, VII</strong>, e do <strong>Art. 59</strong> da Lei Estadual nº 13.331/2001 e do <strong>Art. 547</strong> do Decreto Estadual nº 5.711/2002.<br><br>A medida foi adotada por haver indício de infração sanitária com risco ou dano à saúde, instaurando-se o competente <strong>processo administrativo cautelar</strong> (Art. 547, caput e §1º, do Decreto).<br><br>A interdição <strong>perdurará até que sejam sanadas as irregularidades</strong>, mediante nova inspeção e lavratura do respectivo Termo de Desinterdição, podendo, justificadamente, tornar-se definitiva (Art. 59, §1º, da Lei). A extensão da interdição é decidida por ato fundamentado da autoridade sanitária (Art. 59, §2º).<br><br>Havendo no local pessoas hospedadas, abrigadas ou internadas, sua transferência fica sob responsabilidade dos representantes legais do estabelecimento, no prazo determinado por esta autoridade, devendo o destino ser comunicado à autoridade sanitária (Art. 551 do Decreto).<br><br>O descumprimento desta medida sujeita o responsável às penalidades da legislação sanitária, sem prejuízo das providências cíveis e criminais cabíveis.`;

export const DESINTERDICAO_ATO_TEXT = `Fica <strong>DESINTERDITADO(A)</strong> o estabelecimento / obra / produto / equipamento interditado cautelarmente pelo Termo de Interdição nº <strong><mark>[NÚMERO]</mark></strong>, de <mark>[DATA]</mark>.<br><br>Verificou-se, em inspeção realizada nesta data, o saneamento das irregularidades que motivaram a medida, cessando o risco ou dano à saúde que a fundamentou (Art. 59 da Lei Estadual nº 13.331/2001).<br><br>Fica <strong>autorizado o reinício das atividades</strong> a partir da ciência deste Termo.`;

export const APREENSAO_ATO_TEXT = `Ficam <strong>APREENDIDOS</strong> os bens relacionados neste Termo, nos termos do <strong>Art. 55, III</strong>, e do <strong>Art. 58</strong> da Lei Estadual nº 13.331/2001 e do <strong>Art. 547</strong> do Decreto Estadual nº 5.711/2002, por se mostrar a medida necessária para evitar risco ou dano à saúde.<br><br>Os bens permanecerão sob guarda de <mark>[FIEL DEPOSITÁRIO]</mark>, em local apropriado, sendo vedada sua comercialização, uso ou remoção, e <strong>somente serão liberados mediante autorização da autoridade sanitária</strong> (Art. 547, §5º, e Art. 564, §1º, do Decreto).<br><br>Os testes, provas, análises ou demais providências serão executados no prazo máximo de <strong>180 (cento e oitenta) dias</strong>, dilatável mediante justificativa nos autos quando a análise exigir prazo superior; tratando-se de produto alimentício perecível, o prazo máximo é de <strong>48 (quarenta e oito) horas</strong> (Art. 547, §5º, alíneas "a" e "b", do Decreto).<br><br>As irregularidades que motivaram esta medida constam do Auto de Infração lavrado em conjunto, documento em que corre o prazo de defesa.`;

export const APREENSAO_INUTILIZACAO_ATO_TEXT = `Ficam <strong>APREENDIDOS e INUTILIZADOS</strong> os bens relacionados neste Termo, por se encontrarem impróprios para o uso ou consumo, nos termos do <strong>Art. 55, III e IV</strong>, e do <strong>Art. 58</strong> da Lei Estadual nº 13.331/2001 e do <strong>Art. 564</strong> do Decreto Estadual nº 5.711/2002.<br><br>A medida decorre de <mark>[LAUDO PERICIAL EMITIDO NO LOCAL, demonstrando características organolépticas visivelmente alteradas, ou AUTORIZAÇÃO ESCRITA DO RESPONSÁVEL, que dispensa o laudo]</mark>, na forma do Art. 547, §5º, alíneas "c" e "d", do Decreto.<br><br>A inutilização foi realizada por meio de <mark>[MÉTODO UTILIZADO]</mark>, ficando o responsável intimado do local, data e hora em que se procedeu ao ato (Art. 564, §2º, do Decreto), na presença das testemunhas abaixo assinadas.<br><br>As irregularidades que motivaram esta medida constam do Auto de Infração lavrado em conjunto, documento em que corre o prazo de defesa.`;

export const INUTILIZACAO_ATO_TEXT = `Ficam <strong>INUTILIZADOS</strong> os bens relacionados neste Termo, por se encontrarem impróprios para o uso ou consumo, nos termos do <strong>Art. 55, IV</strong>, e do <strong>Art. 58</strong> da Lei Estadual nº 13.331/2001 e do <strong>Art. 564</strong> do Decreto Estadual nº 5.711/2002.<br><br>A medida decorre de <mark>[LAUDO PERICIAL EMITIDO NO LOCAL ou AUTORIZAÇÃO ESCRITA DO RESPONSÁVEL, que dispensa o laudo]</mark>, na forma do Art. 547, §5º, alíneas "c" e "d", do Decreto.<br><br>A inutilização foi realizada por meio de <mark>[MÉTODO UTILIZADO]</mark>, ficando o responsável intimado do local, data e hora em que se procedeu ao ato (Art. 564, §2º, do Decreto), na presença das testemunhas abaixo assinadas.`;

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

/**
 * TEXTOS DO ATO POR MUNICÍPIO
 *
 * Os textos padrão acima citam a Lei Estadual nº 13.331/2001 e o Decreto nº
 * 5.711/2002 — correto para a maioria dos municípios do Paraná, que se apoiam
 * na lei estadual. Mas município com código sanitário PRÓPRIO (Prudentópolis,
 * Lei 2.276/2017) aplica a medida com base na lei dele: um termo de interdição
 * citando o artigo estadual, quando existe o municipal, é fundamentação errada.
 *
 * Como os artigos de competência variam de lei para lei (e não estão na base de
 * legislação, que só carrega os artigos de infração), o texto certo não pode
 * ser deduzido — quem o informa é o gestor, em Identidade Municipal. Sem nada
 * preenchido, valem os textos estaduais de sempre.
 *
 * Chave: o tipo do termo exatamente como aparece em ATO_TEXT_POR_TIPO
 * (ex.: 'TERMO DE APREENSÃO').
 */
export type AutuacaoTextos = Record<string, { atoHtml?: string; prazoHtml?: string }>;

export function prazoTextoDoTipo(
  tipo?: string,
  textosDoMunicipio?: AutuacaoTextos,
  municipioId?: string | null
): string {
  const legais = textosLegaisDoMunicipio(municipioId);
  return (
    (tipo && textosDoMunicipio?.[tipo]?.prazoHtml) ||
    (tipo && legais[tipo]?.prazoHtml) ||
    (tipo && PRAZO_TEXT_POR_TIPO[tipo]) ||
    legais['AUTO DE INFRAÇÃO']?.prazoHtml ||
    DEFAULT_PRAZO_TEXT
  );
}

/** Texto inicial do campo de objeto/relato. Vazio para os tipos cujo corpo é
 *  escrito pelo fiscal do zero (auto de infração e termo de intimação). */
export function atoTextoDoTipo(
  tipo?: string,
  textosDoMunicipio?: AutuacaoTextos,
  municipioId?: string | null
): string {
  return (
    (tipo && textosDoMunicipio?.[tipo]?.atoHtml) ||
    (tipo && textosLegaisDoMunicipio(municipioId)[tipo]?.atoHtml) ||
    (tipo && ATO_TEXT_POR_TIPO[tipo]) ||
    ''
  );
}

/** Tipos cujo texto de ato/prazo o gestor pode personalizar. */
export const TIPOS_COM_TEXTO_EDITAVEL = [
  'AUTO DE INFRAÇÃO',
  'TERMO DE INTIMAÇÃO',
  'TERMO DE INTERDIÇÃO',
  'TERMO DE DESINTERDIÇÃO',
  'TERMO DE APREENSÃO',
  'TERMO DE APREENSÃO E INUTILIZAÇÃO',
  'TERMO DE INUTILIZAÇÃO',
  'TERMO DE IMPOSIÇÃO DE PENALIDADE',
] as const;

/** Texto padrão (estadual) de um tipo — usado na tela de edição como ponto de
 *  partida e para o botão "restaurar padrão". */
export function textosPadraoDoTipo(
  tipo: string,
  municipioId?: string | null
): { atoHtml: string; prazoHtml: string } {
  const legais = textosLegaisDoMunicipio(municipioId);
  return {
    atoHtml: legais[tipo]?.atoHtml || ATO_TEXT_POR_TIPO[tipo] || '',
    prazoHtml:
      legais[tipo]?.prazoHtml ||
      PRAZO_TEXT_POR_TIPO[tipo] ||
      legais['AUTO DE INFRAÇÃO']?.prazoHtml ||
      DEFAULT_PRAZO_TEXT,
  };
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
    // Colunas extras que o fiscal adiciona na hora (ex.: "Validade", "Nº
    // Lote") — o nome de cada uma fica em itensApreendidosColunas (mesmo
    // nível do array, abaixo), compartilhado entre todas as linhas; aqui só
    // o valor de cada linha pra cada coluna extra, indexado pelo nome dela.
    extras: z.record(z.string(), z.string()).optional().default({}),
  })).default([]),
  itensApreendidosColunas: z.array(z.string()).default([]),
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
  /**
   * Colegas fiscais com quem a edição foi compartilhada (uid do Auth, não o
   * id do cadastro de autoridades — são coisas diferentes). Quem criou NÃO
   * entra aqui; continua identificado por createdBy.
   *
   * saveIntimacao nunca grava estes campos num documento que já existe (ver
   * o comentário lá): o formulário não os carrega, e o default [] daqui
   * apagaria o compartilhamento a cada salvamento automático.
   */
  compartilhadoCom: z.array(z.string()).default([]),
  compartilhadoComNomes: z.array(z.object({ uid: z.string(), nome: z.string() })).default([]),
  /** Quem salvou por último — base do aviso de alteração simultânea. */
  updatedBy: z.string().optional().default(''),
  updatedByName: z.string().optional().default(''),
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

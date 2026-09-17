/**
 * BASE LEGAL POR MUNICÍPIO
 *
 * Todo documento que a vigilância lavra cita um artigo: o que autoriza a
 * interdição, o que abre o prazo de defesa, o que fixa o prazo recursal. Por
 * padrão esses artigos são os da Lei Estadual nº 13.331/2001 e do Decreto nº
 * 5.711/2002 — é a base sanitária do Paraná e vale nos municípios que não
 * legislaram sobre o tema.
 *
 * Município com CÓDIGO SANITÁRIO PRÓPRIO é outra história. Prudentópolis tem a
 * Lei nº 2.276/2017, que institui o Código de Vigilância em Saúde do município
 * e disciplina o mesmo rito de ponta a ponta: infrações (Art. 18), penalidades
 * (Art. 19), medidas preventivas (Art. 23), termos (Arts. 25 a 30), PAS
 * (Arts. 34 a 59). Nesses municípios, citar o artigo estadual é fundamentar no
 * dispositivo errado — a autoridade local age com base na lei que lhe deu o
 * poder de polícia, e o auto que cita a lei errada é atacável por isso.
 *
 * Duas diferenças aqui têm consequência prática e não são só de redação:
 *
 *   PRAZO EM DIAS CORRIDOS. O rito estadual conta em dias ÚTEIS (Art. 88, §2º,
 *   da Lei Estadual nº 20.656/2021). A Lei 2.276/2017 diz apenas "15 (quinze)
 *   dias" (Art. 38) e "10 (dez) dias" / "15 (quinze) dias" (Art. 30, VI) — sem
 *   a qualificação, contam-se corridos. Contar útil onde a lei diz corrido
 *   estende prazo de ofício e vicia a certidão de decurso.
 *
 *   PRAZO RECURSAL VARIÁVEL. No estadual o recurso é sempre de 10 dias úteis
 *   (Art. 73). No municipal são 10 dias para multa e 15 dias nos demais casos
 *   (Art. 30, VI).
 *
 * O gestor ainda pode sobrescrever os textos em Identidade Municipal (aba
 * Termos, ver AutuacaoTextos em schema.ts); o que está aqui é o padrão de
 * fábrica de cada município, não um limite.
 */

import { normalizeId } from '@/lib/utils';

/** Texto de ato/prazo por tipo de termo — mesmo formato de AutuacaoTextos. */
type TextosDeAutuacao = Record<string, { atoHtml?: string; prazoHtml?: string }>;

export interface BaseLegal {
  /** Como aparece na citação: "da Lei Municipal nº 2.276/2017". */
  refLei: string;
  /**
   * Contagem dos prazos processuais desta esfera — o único interruptor que
   * decide se addPrazo() pula fim de semana e feriado. Trocar aqui muda de
   * uma vez todas as datas calculadas e todas as frases geradas
   * (porExtensoComUnidade passa a escrever "dias" em vez de "dias úteis").
   */
  contagemPrazo: 'corridos' | 'uteis';
  /** Defesa/impugnação ao auto de infração. */
  defesa: { dias: number; citacao: string };
  /** Recurso da decisão de 1ª instância. `diasMulta` só existe onde a lei
   *  distingue o prazo da multa do dos demais casos. */
  recurso: { dias: number; diasMulta?: number; citacao: string };
  /**
   * Prazo de REGULARIZAÇÃO — o que o relatório de inspeção concede para o
   * estabelecimento se adequar, diferente do prazo de defesa do auto. `dias`
   * é o teto legal, não a sugestão: quem fixa o prazo de cada caso é a
   * autoridade sanitária, dentro desse limite.
   */
  prazoRegularizacao: { tetoDias: number; citacao: string };
  /** Artigo que manda instruir o processo (base do despacho de instrução). */
  citacaoInstrucao: string;
  /** Textos padrão dos termos nesta esfera. Tipo ausente cai no estadual. */
  textos: TextosDeAutuacao;
}

/** Frase "15 (quinze) dias" / "15 (quinze) dias úteis" conforme a esfera. */
export function porExtensoComUnidade(dias: number, contagem: 'corridos' | 'uteis'): string {
  const extenso: Record<number, string> = {
    5: 'cinco', 10: 'dez', 15: 'quinze', 20: 'vinte', 30: 'trinta', 60: 'sessenta', 90: 'noventa',
  };
  const nome = extenso[dias] || String(dias);
  return `${dias} (${nome}) dias${contagem === 'uteis' ? ' úteis' : ''}`;
}

// ---------------------------------------------------------------------------
// PRUDENTÓPOLIS — Lei Municipal nº 2.276/2017
// ---------------------------------------------------------------------------

const PROTOCOLO_PRUDENTOPOLIS =
  `protocolada eletronicamente pelo site da Prefeitura de Prudentópolis através do link: ` +
  `<a href="https://prudentopolisprscp.equiplano.com.br:5028/tramitacaoProcesso/#/abertura-processo/entidade/41dd0a3a-f16f-4e8f-9b2a-8832e9191835/28" target="_blank" style="color: #0000EE; text-decoration: underline; font-weight: bold;">protocolo eletrônico</a> ` +
  `ou entregue presencialmente no Departamento de Vigilância Sanitária Municipal (Rua São Josafat, nº 835 – Centro)`;

/** Defesa ao auto de infração — Art. 38 (15 dias da ciência), dirigida à
 *  autoridade imediatamente superior à autuante, que é quem julga (Art. 48). */
const PRUDENTOPOLIS_DEFESA_TEXT =
  `O autuado poderá oferecer <strong>defesa ou impugnação</strong> a este Auto de Infração no prazo de ` +
  `<strong>15 (quinze) dias</strong>, contados da ciência da irregularidade, nos termos do Art. 38 da Lei Municipal nº 2.276/2017.<br><br>` +
  `A defesa deve ser dirigida à autoridade imediatamente superior àquela que lavrou o auto — a quem compete a decisão, ` +
  `na forma do Art. 48 da mesma Lei — e ${PROTOCOLO_PRUDENTOPOLIS}.<br><br>` +
  `A não apresentação de defesa será certificada nos autos (Art. 39) e o julgamento se dará à revelia, sem prejuízo da análise integral do mérito.`;

/** Termo de Intimação — Art. 25 e seu §2º (teto de 90 dias, prorrogável por
 *  igual período se requerido até 10 dias antes do término). */
const PRUDENTOPOLIS_INTIMACAO_PRAZO =
  `Fica o responsável <strong>INTIMADO</strong> a sanar as irregularidades acima apontadas no prazo de ` +
  `<strong><mark>[Nº DE DIAS]</mark> (<mark>[POR EXTENSO]</mark>) dias</strong>, contados do recebimento deste Termo, ` +
  `nos termos do Art. 25 da Lei Municipal nº 2.276/2017.<br><br>` +
  `O prazo não pode ultrapassar <strong>90 (noventa) dias</strong> e poderá ser prorrogado por igual período, a critério da autoridade em ` +
  `Vigilância em Saúde, desde que requerido pelo interessado <strong>até 10 (dez) dias antes do seu término</strong> e devidamente ` +
  `fundamentado (Art. 25, §2º).<br><br>` +
  `Vencido o prazo com persistência da irregularidade, ou cumprida apenas em parte a determinação, será lavrado <strong>Auto de Infração</strong> ` +
  `e instaurado o competente Processo Administrativo Sanitário (Art. 35), sujeitando-se o responsável às penalidades do Art. 19 da mesma Lei, ` +
  `sem prejuízo do enquadramento no Art. 18, CXII (não cumprir com o teor de intimação expedida pela autoridade em Vigilância em Saúde).<br><br>` +
  `A expedição deste Termo interrompe a fluência do prazo prescricional (Art. 17, parágrafo único).`;


/**
 * Segunda modalidade da intimação em Prudentópolis: parar a atividade
 * irregular até a regularização.
 *
 * A ordem de cessar se apoia no Art. 25, §1º, III, que manda o termo descrever
 * as "determinações a serem cumpridas, bem como o prazo para serem
 * executadas" — e não em perigo iminente. Isso é deliberado: o caput do Art.
 * 25 diz que o termo de intimação é lavrado justamente "quando a irregularidade
 * NÃO constituir perigo iminente para a saúde". Havendo perigo iminente, o
 * instrumento é o Termo de Interdição (Art. 23 c/c Art. 19, V), não este.
 *
 * O prazo continua obrigatório mesmo aqui: é exigência do próprio §1º, III, e o
 * teto de 90 dias do §2º não deixa de valer por a atividade estar parada.
 */
const PRUDENTOPOLIS_INTIMACAO_CESSAR =
  `Fica o responsável <strong>INTIMADO</strong> a <strong>CESSAR IMEDIATAMENTE</strong> a atividade ` +
  `<mark>[ATIVIDADE/SETOR]</mark>, mantendo-a suspensa até a integral regularização das irregularidades acima ` +
  `apontadas, nos termos do <strong>Art. 25, §1º, III</strong>, da Lei Municipal nº 2.276/2017.<br><br>` +
  `A determinação de cessar é de <strong>cumprimento imediato</strong>, a contar do recebimento deste Termo. Para a ` +
  `regularização fica concedido o prazo de <strong><mark>[Nº DE DIAS]</mark> (<mark>[POR EXTENSO]</mark>) dias</strong>, ` +
  `findo o qual a atividade somente poderá ser retomada após nova verificação pela autoridade em Vigilância em Saúde.<br><br>` +
  `O prazo não pode ultrapassar <strong>90 (noventa) dias</strong> e poderá ser prorrogado por igual período, a critério da ` +
  `autoridade em Vigilância em Saúde, desde que requerido pelo interessado <strong>até 10 (dez) dias antes do seu término</strong> ` +
  `e devidamente fundamentado (Art. 25, §2º).<br><br>` +
  `Vencido o prazo com persistência da irregularidade, ou descumprida a determinação de cessar, será lavrado <strong>Auto de ` +
  `Infração</strong> e instaurado o competente Processo Administrativo Sanitário (Art. 35), sujeitando-se o responsável às ` +
  `penalidades do Art. 19 da mesma Lei, sem prejuízo do enquadramento no Art. 18, CXII (não cumprir com o teor de intimação ` +
  `expedida pela autoridade em Vigilância em Saúde) e da <strong>interdição</strong> do estabelecimento (Art. 19, V, c/c Art. 23).<br><br>` +
  `A expedição deste Termo interrompe a fluência do prazo prescricional (Art. 17, parágrafo único).`;

/** Interdição — penalidade do Art. 19, V, aplicada preventivamente na forma do
 *  Art. 23; o Art. 27, §3º é o que sustenta a advertência de desobediência. */
const PRUDENTOPOLIS_INTERDICAO_ATO =
  `Fica <strong>INTERDITADO(A)</strong> — total (&nbsp;&nbsp;) / parcialmente (&nbsp;&nbsp;) — o estabelecimento / obra / equipamento / máquina abaixo ` +
  `identificado, com a imediata suspensão da respectiva atividade, nos termos do <strong>Art. 19, V</strong>, e do <strong>Art. 23</strong> da ` +
  `Lei Municipal nº 2.276/2017.<br><br>` +
  `A medida tem caráter <strong>PREVENTIVO</strong>, adotada porque a ocorrência exige a imediata ação da autoridade em Vigilância em Saúde para a ` +
  `proteção da saúde pública (Art. 23, caput e §§ 1º e 3º), podendo converter-se em definitiva se resultar da penalidade imposta ao final do ` +
  `Processo Administrativo Sanitário (Art. 23, §4º).<br><br>` +
  `O levantamento da interdição somente poderá ocorrer <strong>após o saneamento das irregularidades e mediante expressa autorização da autoridade ` +
  `fiscalizadora</strong>, com a lavratura do respectivo Termo de Desinterdição, sob pena de o infrator responder pelo <strong>crime de desobediência ` +
  `tipificado no artigo 330 do Código Penal</strong> (Art. 27, §3º).<br><br>` +
  `Havendo no local pacientes, internos ou quaisquer pessoas abrigadas, sua remoção fica sob responsabilidade do infrator, no prazo determinado por ` +
  `esta autoridade, devendo a destinação ser comunicada de imediato (Art. 23, §§ 6º e 7º).<br><br>` +
  `As irregularidades que motivaram esta medida constam do <strong>Auto de Infração</strong> lavrado em conjunto (Art. 27, caput), documento em que ` +
  `corre o prazo de defesa.`;

const PRUDENTOPOLIS_DESINTERDICAO_ATO =
  `Fica <strong>DESINTERDITADO(A)</strong> o estabelecimento / obra / equipamento interditado pelo Termo de Interdição nº ` +
  `<strong><mark>[NÚMERO]</mark></strong>, de <mark>[DATA]</mark>, lavrado em conjunto com o Auto de Infração nº <strong><mark>[NÚMERO]</mark></strong>, ` +
  `nos termos do <strong>Art. 28</strong> da Lei Municipal nº 2.276/2017.<br><br>` +
  `Verificou-se, em inspeção realizada nesta data, que <mark>[RAZÕES QUE JUSTIFICAM A DESINTERDIÇÃO]</mark>, restando sanadas as irregularidades que ` +
  `motivaram a medida preventiva e deixando de existir o risco ou dano à saúde pública.<br><br>` +
  `Fica <strong>autorizado o reinício das atividades</strong> a partir da ciência deste Termo.`;

const PRUDENTOPOLIS_APREENSAO_ATO =
  `Ficam <strong>APREENDIDOS</strong>, em caráter <strong>PREVENTIVO</strong>, os bens relacionados neste Termo, nos termos do ` +
  `<strong>Art. 19, III</strong>, e do <strong>Art. 23</strong> da Lei Municipal nº 2.276/2017.<br><br>` +
  `Os bens ficam depositados sob a responsabilidade de <mark>[FIEL DEPOSITÁRIO]</mark>, com a devida colocação de lacres pela Vigilância Sanitária, ` +
  `até decisão final sobre sua destinação (Art. 23, §5º), sendo vedada sua comercialização, uso, remoção ou a violação dos lacres.<br><br>` +
  `O levantamento da apreensão somente poderá ocorrer após o saneamento das irregularidades e mediante expressa autorização da autoridade ` +
  `fiscalizadora, sob pena de o infrator responder pelo <strong>crime de desobediência tipificado no artigo 330 do Código Penal</strong> ` +
  `(Art. 27, §3º).<br><br>` +
  `As irregularidades que motivaram esta medida constam do <strong>Auto de Infração</strong> lavrado em conjunto (Art. 27, caput), documento em que ` +
  `corre o prazo de defesa.`;

/** Inutilização — Art. 19, IV, executada na forma do Art. 46 (verificação
 *  imediata por laudo pericial no local; o parágrafo único dispensa o laudo
 *  quando o detentor concorda por escrito). */
const PRUDENTOPOLIS_INUTILIZACAO_ATO =
  `Ficam <strong>INUTILIZADOS</strong> os bens relacionados neste Termo, por se encontrarem impróprios para uso ou consumo, nos termos do ` +
  `<strong>Art. 19, IV</strong>, e do <strong>Art. 46</strong> da Lei Municipal nº 2.276/2017.<br><br>` +
  `A medida decorre da verificação imediata, no local, de <mark>[FRAUDE / FALSIFICAÇÃO / ADULTERAÇÃO / CONTAMINAÇÃO / DETERIORAÇÃO / PRAZO DE ` +
  `VALIDADE EXPIRADO / AUSÊNCIA DE REGISTRO]</mark>, comprovada por <mark>[LAUDO PERICIAL EXPEDIDO NO LOCAL ou AUTORIZAÇÃO ESCRITA DO DETENTOR / ` +
  `RESPONSÁVEL LEGAL, na forma do Art. 46, parágrafo único]</mark>.<br><br>` +
  `A inutilização foi realizada por meio de <mark>[MÉTODO UTILIZADO]</mark>, na presença do responsável pelo estabelecimento e das testemunhas abaixo ` +
  `assinadas.<br><br>` +
  `Lavra-se em conjunto o respectivo <strong>Auto de Infração</strong> (Art. 27, caput, e Art. 46).`;

const PRUDENTOPOLIS_APREENSAO_INUTILIZACAO_ATO =
  `Ficam <strong>APREENDIDOS e INUTILIZADOS</strong> os bens relacionados neste Termo, por se encontrarem impróprios para uso ou consumo, nos termos ` +
  `dos <strong>Art. 19, III e IV</strong>, do <strong>Art. 23</strong> e do <strong>Art. 46</strong> da Lei Municipal nº 2.276/2017.<br><br>` +
  `A medida decorre da verificação imediata, no local, de <mark>[FRAUDE / FALSIFICAÇÃO / ADULTERAÇÃO / CONTAMINAÇÃO / DETERIORAÇÃO / PRAZO DE ` +
  `VALIDADE EXPIRADO / AUSÊNCIA DE REGISTRO]</mark>, comprovada por <mark>[LAUDO PERICIAL EXPEDIDO NO LOCAL ou AUTORIZAÇÃO ESCRITA DO DETENTOR / ` +
  `RESPONSÁVEL LEGAL, na forma do Art. 46, parágrafo único]</mark>.<br><br>` +
  `A inutilização foi realizada por meio de <mark>[MÉTODO UTILIZADO]</mark>, na presença do responsável pelo estabelecimento e das testemunhas abaixo ` +
  `assinadas.<br><br>` +
  `As irregularidades que motivaram esta medida constam do <strong>Auto de Infração</strong> lavrado em conjunto (Art. 27, caput), documento em que ` +
  `corre o prazo de defesa.`;

/** TIP — Art. 30, VI: 10 dias para multa, 15 nos demais casos. O Art. 57 é o
 *  que fixa os 15 dias de pagamento e a inscrição em dívida ativa. */
const PRUDENTOPOLIS_PENALIDADE_PRAZO =
  `Fica o autuado <strong>CIENTIFICADO</strong> da penalidade acima imposta, decorrente do Processo Administrativo Sanitário instaurado pelo ` +
  `Auto de Infração nº <strong><mark>[NÚMERO]</mark></strong>, nos termos dos Arts. 29 e 30 da Lei Municipal nº 2.276/2017.<br><br>` +
  `Cabe <strong>RECURSO</strong> à autoridade imediatamente superior àquela que proferiu a decisão, no prazo de <strong>10 (dez) dias</strong> na ` +
  `hipótese específica de aplicação de pena de multa, ou de <strong>15 (quinze) dias</strong> nos demais casos, contados da ciência deste Termo ` +
  `(Art. 30, VI, c/c Art. 58).<br><br>` +
  `O recurso deve ser ${PROTOCOLO_PRUDENTOPOLIS}.<br><br>` +
  `Aplicada pena de multa, o pagamento deve ser efetuado por guia específica, em conta própria do Setor de Vigilância em Saúde, no prazo de ` +
  `<strong>15 (quinze) dias</strong> contados desta ciência; o não recolhimento implica inscrição em dívida ativa e cobrança judicial (Art. 57).`;

const PRUDENTOPOLIS: BaseLegal = {
  refLei: 'da Lei Municipal nº 2.276/2017',
  contagemPrazo: 'corridos',
  defesa: { dias: 15, citacao: 'art. 38 da Lei Municipal nº 2.276/2017' },
  recurso: { dias: 15, diasMulta: 10, citacao: 'art. 30, VI, c/c art. 58 da Lei Municipal nº 2.276/2017' },
  prazoRegularizacao: {
    tetoDias: 90,
    citacao: 'Lei Municipal nº 2.276/2017, art. 25, §2º',
  },
  citacaoInstrucao: 'art. 37 da Lei Municipal nº 2.276/2017',
  textos: {
    'AUTO DE INFRAÇÃO': { prazoHtml: PRUDENTOPOLIS_DEFESA_TEXT },
    'TERMO DE INTIMAÇÃO': { prazoHtml: PRUDENTOPOLIS_INTIMACAO_PRAZO },
    'TERMO DE INTERDIÇÃO': { atoHtml: PRUDENTOPOLIS_INTERDICAO_ATO },
    'TERMO DE DESINTERDIÇÃO': { atoHtml: PRUDENTOPOLIS_DESINTERDICAO_ATO },
    'TERMO DE APREENSÃO': { atoHtml: PRUDENTOPOLIS_APREENSAO_ATO },
    'TERMO DE APREENSÃO E INUTILIZAÇÃO': { atoHtml: PRUDENTOPOLIS_APREENSAO_INUTILIZACAO_ATO },
    'TERMO DE INUTILIZAÇÃO': { atoHtml: PRUDENTOPOLIS_INUTILIZACAO_ATO },
    'TERMO DE IMPOSIÇÃO DE PENALIDADE': { prazoHtml: PRUDENTOPOLIS_PENALIDADE_PRAZO },
  },
};

// ---------------------------------------------------------------------------

/** Paraná — vale para todo município sem código sanitário próprio. */
export const BASE_LEGAL_ESTADUAL: BaseLegal = {
  refLei: 'da Lei Estadual nº 13.331/2001',
  // DIAS ÚTEIS por decisão da gestão, apoiada no art. 88, §2º, da Lei
  // Estadual nº 20.656/2021 (processo administrativo do Paraná). Vale
  // registrar que a Lei 13.331/2001 (arts. 69 e 73) e o Decreto 5.711/2002
  // (art. 561) falam apenas em "dias", sem a qualificação — se essa leitura
  // for revista, basta trocar esta linha para 'corridos'.
  contagemPrazo: 'uteis',
  defesa: {
    dias: 15,
    citacao: 'art. 69 da Lei Estadual nº 13.331/2001 c/c art. 88, §2º, da Lei Estadual nº 20.656/2021',
  },
  recurso: {
    dias: 10,
    citacao: 'art. 73 da Lei Estadual nº 13.331/2001 c/c art. 88, §2º, da Lei Estadual nº 20.656/2021',
  },
  prazoRegularizacao: {
    tetoDias: 90,
    citacao: 'Lei Estadual nº 13.331/2001, art. 66, §1º (Código de Saúde do Paraná)',
  },
  citacaoInstrucao: 'art. 560 do Decreto Estadual nº 5.711/2002',
  textos: {},
};

const BASE_LEGAL_POR_MUNICIPIO: Record<string, BaseLegal> = {
  prudentopolis: PRUDENTOPOLIS,
};

/** Base legal aplicável ao município — a dele, se tiver código próprio; a
 *  estadual, caso contrário. */
export function baseLegalDoMunicipio(municipioId?: string | null): BaseLegal {
  return BASE_LEGAL_POR_MUNICIPIO[normalizeId(municipioId || '')] || BASE_LEGAL_ESTADUAL;
}

/** Textos padrão dos termos no município — vazio onde vale o estadual. */
export function textosLegaisDoMunicipio(municipioId?: string | null): TextosDeAutuacao {
  return baseLegalDoMunicipio(municipioId).textos;
}

/**
 * Texto da modalidade "cessar atividade" do Termo de Intimação NO MUNICÍPIO,
 * quando ele tem código próprio. `undefined` = usar o estadual.
 *
 * Devolve só a parte municipal, de propósito: quem junta as duas modalidades
 * é schema.ts, que já importa este arquivo. Compor aqui exigiria importar o
 * texto estadual de lá e fecharia um ciclo entre os dois módulos.
 */
export function intimacaoCessarDoMunicipio(municipioId?: string | null): string | undefined {
  return baseLegalDoMunicipio(municipioId) === PRUDENTOPOLIS
    ? PRUDENTOPOLIS_INTIMACAO_CESSAR
    : undefined;
}

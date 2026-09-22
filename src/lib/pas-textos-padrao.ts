/**
 * Textos padrão das peças do PAS (Processo Administrativo Sanitário) —
 * mesmo espírito de src/lib/schema.ts (cláusulas fixas, citando os artigos
 * certos), mas para o rito do PAS em vez do corpo da autuação. Baseado no
 * Manual de Apoio Teórico-Prático da SESA-PR (Manual 012/2023) e nos
 * modelos de peça anexados pela usuária (despacho, despacho de instrução,
 * relatório, termo de juntada, despacho de encaminhamento).
 *
 * Cada função devolve HTML pronto pra virar o `conteudoHtml` de uma
 * `PasPeca` — cabe ao chamador (o hook/tela do PAS) preencher os dados
 * variáveis (nome do estabelecimento, número do AI, datas).
 */

/** Destinatário de quem recebe o despacho/termo — o modelo de referência
 * sempre endereça a um nome específico ("Ilma Senhora Fulana, Coordenadora
 * do DEVISAT"). No sistema isso não é um cargo fixo cadastrado em lugar
 * nenhum — é dinamicamente o gestor que já emitiu o despacho de instrução
 * deste mesmo processo (ver nomeGestorResponsavel em pas/[id]/page.tsx).
 * Antes disso existir (ainda na instauração), cai num endereçamento
 * genérico ao cargo, sem nome. */
import { baseLegalDoMunicipio, porExtensoComUnidade } from '@/lib/base-legal-municipal';
import type { PasFase, PasPecaTipo } from '@/lib/types';

/** Todo texto do rito cita artigo e prazo, e ambos mudam conforme o município
 *  tenha ou não código sanitário próprio (ver base-legal-municipal.ts). Por
 *  isso cada função recebe o município: sem ele cai no estadual, que é o
 *  comportamento de antes. */
type ComMunicipio = { municipioId?: string | null };

export interface Destinatario {
  nome?: string;
  cargo?: string;
}

function blocoDestinatario(dest?: Destinatario): string {
  if (dest?.nome) {
    return `Ilma. Senhora<br><strong>${dest.nome}</strong><br>${dest.cargo || 'Coordenação da Vigilância Sanitária Municipal'}<br><br>Prezada Senhora,<br><br>`;
  }
  return `À Coordenação da Vigilância Sanitária Municipal,<br><br>`;
}

export function textoDespachoInicial(params: {
  numeroAI: string;
  estabelecimento: string;
  destinatario?: Destinatario;
}): string {
  return `${blocoDestinatario(params.destinatario)}Informo que foi aberto Processo Administrativo Sanitário mediante Auto de Infração nº <strong>${params.numeroAI}</strong>, em desfavor de <strong>${params.estabelecimento.toUpperCase()}</strong>.<br><br>Para ciência e providências.`;
}

export function textoDespachoInstrucao(params: {
  numeroAI: string;
  prazoDefesaData: string; // já formatada (dd/MM/yyyy)
} & ComMunicipio): string {
  const base = baseLegalDoMunicipio(params.municipioId);
  return `Determino à equipe operacional da vigilância sanitária municipal, nos termos do ${base.citacaoInstrucao}, que:<br><br>` +
    `1) Manifeste-se mediante Relatório Técnico de Instrução quanto ao Auto de Infração nº <strong>${params.numeroAI}</strong> e demais fatos relevantes envolvidos na fiscalização, visando à adoção de providências;<br>` +
    `2) Junte aos autos as provas relacionadas às infrações apuradas;<br>` +
    `3) Forneça informações quanto aos antecedentes do infrator em relação às normas sanitárias.<br><br>` +
    `Determino também que se aguarde o prazo legal de <strong>${porExtensoComUnidade(base.defesa.dias, base.contagemPrazo)}</strong> para apresentação de defesa administrativa ou impugnação, nos termos do ${base.defesa.citacao}.<br><br>` +
    `Prazo de defesa: até <strong>${params.prazoDefesaData}</strong>.<br><br>` +
    `Retornem-se os autos conclusos após o cumprimento do determinado ou o decurso do prazo, o que ocorrer por último.`;
}

/** "Regra de ouro" do manual: o Termo de Juntada é sempre inserido ANTES do
 * documento a que se refere — o chamador cuida disso na ordem das peças, não
 * no texto em si. */
export function textoTermoJuntadaInstrucao(params?: { destinatario?: Destinatario }): string {
  return `${blocoDestinatario(params?.destinatario)}Junto aos presentes autos o Relatório Técnico de Instrução e as provas a ele relacionadas, em cumprimento à determinação do despacho de instrução, para os devidos fins.`;
}

/**
 * Frase final que o próprio Relatório de Instrução acrescenta quando provas
 * são entregues JUNTO com ele — não é um novo ato (Termo de Juntada), é o
 * mesmo relatório dizendo que os arquivos abaixo o acompanham. Substitui um
 * Termo de Juntada por arquivo (cada um com número próprio nos autos) por
 * uma única peça, um único número, cobrindo relatório + anexos — mesma fase
 * processual, uma entrega só (ver handleSalvarRelatorio, pas/[id]/page.tsx).
 */
export function textoAnexosDoRelatorio(nomesArquivos: string[]): string {
  if (nomesArquivos.length === 0) return '';
  const lista = nomesArquivos.map((n) => `"<strong>${n}</strong>"`).join(', ');
  return nomesArquivos.length === 1
    ? `<br><br>Segue anexo a este relatório o documento ${lista}, para instrução do feito.`
    : `<br><br>Seguem anexos a este relatório os documentos ${lista}, para instrução do feito.`;
}

/**
 * O PAS nasce de um Auto de Infração — e, quando o auto tiver um Termo de
 * Apreensão/Interdição vinculado (mesmo ato de fiscalização, ver
 * documentoOrigemId/autoInfracaoVinculadaId em lib/types.ts), esse termo
 * também precisa estar nos autos: sem ele, o processo administrativo corre
 * sem o documento que, por exemplo, decretou a interdição que está sendo
 * apurada. O documento entra ANEXADO de verdade (PDF oficial completo, ver
 * anexarDocumentosOrigemAoPas em use-pas.ts) — não como "Termo de Juntada":
 * juntada é trazer algo de fora pra dentro de um processo que já existe, e
 * são justamente esses dois documentos que dão origem ao PAS, o processo
 * nasce deles, não os recebe depois. Por isso a legenda é só o rótulo de
 * onde os autos nascem, sem assinatura (não é ato de ninguém).
 */
export function textoDocumentoOrigem(): string {
  return `Documento de origem deste Processo Administrativo Sanitário, anexado na íntegra.`;
}

export function textoTermoJuntadaDefesa(params: {
  tempestividade: 'tempestiva' | 'intempestiva';
  dataRecebimento: string; // formatada
  numeroProtocolo?: string;
  destinatario?: Destinatario;
} & ComMunicipio): string {
  const base = baseLegalDoMunicipio(params.municipioId);
  const prazoLegal = `${porExtensoComUnidade(base.defesa.dias, base.contagemPrazo)} previsto no ${base.defesa.citacao}`;
  const protocolo = params.numeroProtocolo ? `, sob protocolo nº <strong>${params.numeroProtocolo}</strong>,` : '';
  const abertura = `${blocoDestinatario(params.destinatario)}Junto aos autos a defesa administrativa apresentada pelo autuado${protocolo} recebida em <strong>${params.dataRecebimento}</strong>`;
  if (params.tempestividade === 'tempestiva') {
    return `${abertura}, dentro do prazo legal de ${prazoLegal}, para conhecimento e providências.`;
  }
  return `${abertura}, fora do prazo legal de ${prazoLegal}, para conhecimento e providências, sem prejuízo da análise de sua admissibilidade pela autoridade julgadora.`;
}

export function textoTermoInformacaoSemDefesa(params: { numeroAI: string; prazoDefesaData: string } & ComMunicipio): string {
  const base = baseLegalDoMunicipio(params.municipioId);
  return `Informo que, transcorrido o prazo de ${porExtensoComUnidade(base.defesa.dias, base.contagemPrazo)} previsto no ${base.defesa.citacao}, vencido em <strong>${params.prazoDefesaData}</strong>, contado da ciência do Auto de Infração nº <strong>${params.numeroAI}</strong>, <strong>não foi apresentada defesa administrativa</strong> pelo autuado até a presente data, ficando o fato certificado nos autos.`;
}

export function textoDespachoEncerramentoInstrucao(params?: { destinatario?: Destinatario }): string {
  return `${blocoDestinatario(params?.destinatario)}Cumpridas as determinações do despacho de instrução — juntada do Relatório Técnico de Instrução, das provas pertinentes e, conforme o caso, da defesa administrativa ou da informação sobre sua ausência —, encaminho os presentes autos para julgamento e decisão em 1ª instância do Processo Administrativo Sanitário.<br><br>Atenciosamente,`;
}

/** Só o parágrafo de admissibilidade da defesa — o corpo do julgamento em si
 * (síntese, fundamentação e decisão) é redigido livremente por quem julga
 * (ver bloco "Julgamento" em pas/[id]/page.tsx, mesmo padrão do Relatório
 * Técnico: campo de texto livre, sem modelo fixo pra fundamentação jurídica
 * do mérito). Admissibilidade sempre entra automática porque já é um dado
 * conhecido do processo (tempestividade calculada, ou revelia). */
export function textoAdmissibilidadeJulgamento(params: {
  temDefesa: boolean;
  tempestividade?: 'tempestiva' | 'intempestiva';
}): string {
  if (!params.temDefesa) {
    return 'Não tendo sido apresentada defesa administrativa no prazo legal, o julgamento se dá à revelia do autuado, sem prejuízo da análise integral do mérito.';
  }
  if (params.tempestividade === 'intempestiva') {
    return 'A defesa administrativa apresentada, conquanto intempestiva, é conhecida nesta instância para fins de análise de sua admissibilidade, sem prejuízo do prosseguimento do feito.';
  }
  return 'A defesa administrativa apresentada é tempestiva e, portanto, conhecida e admitida para julgamento do mérito.';
}

export function textoDespachoEncaminhamentoTip(params?: { destinatario?: Destinatario }): string {
  return `${blocoDestinatario(params?.destinatario)}Proferido o julgamento em 1ª instância do presente Processo Administrativo Sanitário, determino a lavratura do Termo de Imposição de Penalidade, dando-se ciência ao autuado da decisão proferida e do prazo para interposição de recurso.<br><br>Atenciosamente,`;
}

/** TIP — instrumento que dá ciência ao autuado da decisão e abre o prazo
 * recursal, que não é o mesmo da defesa inicial. No rito estadual são 10 dias
 * úteis (art. 73 da Lei 13.331/2001); em Prudentópolis são 10 dias para multa
 * e 15 nos demais casos (art. 30, VI, da Lei 2.276/2017) — por isso o prazo
 * sai da base legal do município e não de um número fixo. */
export function textoTermoImposicaoPenalidade(params: { numeroAI: string; prazoRecursalData: string; prazoRecursalMultaData?: string } & ComMunicipio): string {
  const base = baseLegalDoMunicipio(params.municipioId);
  const prazoRecursal = base.recurso.diasMulta
    ? `<strong>${porExtensoComUnidade(base.recurso.diasMulta, base.contagemPrazo)}</strong> na hipótese específica de aplicação de pena de multa, ou de <strong>${porExtensoComUnidade(base.recurso.dias, base.contagemPrazo)}</strong> nos demais casos`
    : `<strong>${porExtensoComUnidade(base.recurso.dias, base.contagemPrazo)}</strong>`;
  return `Fica o autuado, em razão do Auto de Infração nº <strong>${params.numeroAI}</strong>, cientificado da decisão proferida em julgamento de 1ª instância no presente Processo Administrativo Sanitário e da sanção nela imposta.<br><br>` +
    `Fica ainda cientificado de que poderá interpor recurso administrativo à autoridade imediatamente superior àquela que proferiu a decisão, no prazo de ${prazoRecursal}, contados desta ciência, nos termos do ${base.recurso.citacao}.<br><br>` +
    (base.recurso.diasMulta && params.prazoRecursalMultaData
      ? `Prazo recursal: até <strong>${params.prazoRecursalMultaData}</strong> em caso de multa; até <strong>${params.prazoRecursalData}</strong> nos demais casos.`
      : `Prazo recursal: até <strong>${params.prazoRecursalData}</strong>.`);
}

/** Só a frase de abertura — o corpo copia o texto da peça original (ver
 * handleRetificarPeca em pas/[id]/page.tsx), editado no que precisar ser
 * corrigido. Nunca substitui nem apaga a peça original (Título III, Cap.2,
 * §1.1–1.2 do manual: vício sanável vira um NOVO ato — ratificação, reforma
 * ou conversão —, sempre ao lado do ato original, "de forma absolutamente
 * transparente"). */
export function textoTermoRetificacao(params: { pecaOriginalTitulo: string; pecaOriginalNumero: number }): string {
  return `Fica retificada, no que segue, a peça nº ${params.pecaOriginalNumero} (${params.pecaOriginalTitulo}) constante destes autos, para fins de correção do quanto nela constou:<br><br>`;
}

export const PAS_PECA_TITULOS: Record<string, string> = {
  documento_origem: 'Documento de Origem',
  despacho_inicial: 'Despacho — Instauração do PAS',
  despacho_instrucao: 'Despacho de Instrução',
  relatorio_instrucao: 'Relatório Técnico de Instrução',
  termo_juntada: 'Termo de Juntada',
  termo_informacao: 'Termo de Informação',
  despacho_encerramento_instrucao: 'Despacho de Encerramento da Instrução',
  julgamento_primeira_instancia: 'Julgamento em 1ª Instância',
  despacho_encaminhamento_tip: 'Despacho — Encaminhamento para TIP',
  termo_imposicao_penalidade: 'Termo de Imposição de Penalidade (TIP)',
  termo_retificacao: 'Termo de Retificação',
};

export const PAS_FASE_LABEL: Record<string, string> = {
  instauracao: 'Instauração',
  instrucao: 'Instrução',
  aguardando_julgamento: 'Aguardando Julgamento',
  julgamento: 'Julgamento',
  recursal: 'Fase Recursal',
  arquivamento: 'Arquivamento',
};

/** Sequência linear das fases do rito — mesma ordem do roadmap da tela do
 * PAS. Serve pra "andar uma casa pra trás" (ver PAS_FASE_APOS_PECA abaixo e
 * o botão "Voltar etapa" em pas/[id]/page.tsx): sem essa lista, calcular "a
 * fase anterior" dependia de repetir a mesma sequência em mais de um lugar. */
export const PAS_FASE_ORDEM: PasFase[] = ['instauracao', 'instrucao', 'aguardando_julgamento', 'julgamento', 'recursal', 'arquivamento'];

/**
 * Peça cuja lavratura é o próprio ato que avança a fase do processo (ver os
 * handlers em pas/[id]/page.tsx — handleIniciarInstrucao, handleEncaminharJulgamento
 * etc.), mapeada pra fase que ela produz. Existe pra desfazer esse avanço
 * quando a peça é excluída por ter sido lavrada errada: sem isso, apagar a
 * peça (documento) e o processo continuar "preso" na fase que ela abriu era
 * exatamente o que deixava a tela sem o botão pra redigir de novo — a fase
 * não tem memória própria do que a colocou lá.
 */
export const PAS_FASE_APOS_PECA: Partial<Record<PasPecaTipo, PasFase>> = {
  despacho_inicial: 'instrucao',
  despacho_encerramento_instrucao: 'aguardando_julgamento',
  julgamento_primeira_instancia: 'julgamento',
  termo_imposicao_penalidade: 'recursal',
};

export const PAS_FASE_COR: Record<string, string> = {
  instauracao: 'bg-sky-50 text-sky-700',
  instrucao: 'bg-amber-50 text-amber-700',
  aguardando_julgamento: 'bg-violet-50 text-violet-700',
  julgamento: 'bg-violet-50 text-violet-700',
  recursal: 'bg-orange-50 text-orange-700',
  arquivamento: 'bg-zinc-100 text-zinc-600',
};

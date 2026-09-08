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
}): string {
  return `Determino à equipe operacional da vigilância sanitária municipal, nos termos do art. 37 da Lei Municipal nº 2.276/2017, que:<br><br>` +
    `1) Manifeste-se mediante Relatório Técnico de Instrução quanto ao Auto de Infração nº <strong>${params.numeroAI}</strong> e demais fatos relevantes envolvidos na fiscalização, visando à adoção de providências;<br>` +
    `2) Junte aos autos as provas relacionadas às infrações apuradas;<br>` +
    `3) Forneça informações quanto aos antecedentes do infrator em relação às normas sanitárias.<br><br>` +
    `Determino também que se aguarde o prazo legal de <strong>15 (quinze) dias úteis</strong> para apresentação de defesa administrativa ou impugnação, nos termos do art. 38 da Lei Municipal nº 2.276/2017 c/c art. 69 da Lei Estadual nº 13.331/2001 e art. 88, §2º, da Lei Estadual nº 20.656/2021.<br><br>` +
    `Prazo de defesa: até <strong>${params.prazoDefesaData}</strong>.<br><br>` +
    `Retornem-se os autos conclusos após o cumprimento do determinado ou o decurso do prazo, o que ocorrer por último.`;
}

/** "Regra de ouro" do manual: o Termo de Juntada é sempre inserido ANTES do
 * documento a que se refere — o chamador cuida disso na ordem das peças, não
 * no texto em si. */
export function textoTermoJuntadaInstrucao(params?: { destinatario?: Destinatario }): string {
  return `${blocoDestinatario(params?.destinatario)}Junto aos presentes autos o Relatório Técnico de Instrução e as provas a ele relacionadas, em cumprimento à determinação do despacho de instrução, para os devidos fins.`;
}

export function textoTermoJuntadaProva(nomeArquivo: string): string {
  return `Junto ao presente processo o documento "<strong>${nomeArquivo}</strong>", para instrução do feito.`;
}

export function textoTermoJuntadaDefesa(params: {
  tempestividade: 'tempestiva' | 'intempestiva';
  dataRecebimento: string; // formatada
  numeroProtocolo?: string;
  destinatario?: Destinatario;
}): string {
  const protocolo = params.numeroProtocolo ? `, sob protocolo nº <strong>${params.numeroProtocolo}</strong>,` : '';
  const base = `${blocoDestinatario(params.destinatario)}Junto aos autos a defesa administrativa apresentada pelo autuado${protocolo} recebida em <strong>${params.dataRecebimento}</strong>`;
  if (params.tempestividade === 'tempestiva') {
    return `${base}, dentro do prazo legal de 15 (quinze) dias úteis previsto no art. 69 da Lei Estadual nº 13.331/2001 c/c art. 88, §2º, da Lei Estadual nº 20.656/2021, para conhecimento e providências.`;
  }
  return `${base}, fora do prazo legal de 15 (quinze) dias úteis previsto no art. 69 da Lei Estadual nº 13.331/2001 c/c art. 88, §2º, da Lei Estadual nº 20.656/2021, para conhecimento e providências, sem prejuízo da análise de sua admissibilidade pela autoridade julgadora.`;
}

export function textoTermoInformacaoSemDefesa(params: { numeroAI: string; prazoDefesaData: string }): string {
  return `Informo que, transcorrido o prazo de 15 (quinze) dias úteis previsto no art. 69 da Lei Estadual nº 13.331/2001 c/c art. 88, §2º, da Lei Estadual nº 20.656/2021, vencido em <strong>${params.prazoDefesaData}</strong>, contado da ciência do Auto de Infração nº <strong>${params.numeroAI}</strong>, <strong>não foi apresentada defesa administrativa</strong> pelo autuado até a presente data.`;
}

export function textoDespachoEncerramentoInstrucao(params?: { destinatario?: Destinatario }): string {
  return `${blocoDestinatario(params?.destinatario)}Cumpridas as determinações do despacho de instrução — juntada do Relatório Técnico de Instrução, das provas pertinentes e, conforme o caso, da defesa administrativa ou da informação sobre sua ausência —, encaminho os presentes autos para julgamento e decisão em 1ª instância do Processo Administrativo Sanitário.<br><br>Atenciosamente,`;
}

export const PAS_PECA_TITULOS: Record<string, string> = {
  despacho_inicial: 'Despacho — Instauração do PAS',
  despacho_instrucao: 'Despacho de Instrução',
  relatorio_instrucao: 'Relatório Técnico de Instrução',
  termo_juntada: 'Termo de Juntada',
  termo_informacao: 'Termo de Informação',
  despacho_encerramento_instrucao: 'Despacho de Encerramento da Instrução',
};

export const PAS_FASE_LABEL: Record<string, string> = {
  instauracao: 'Instauração',
  instrucao: 'Instrução',
  aguardando_julgamento: 'Aguardando Julgamento',
  julgamento: 'Julgamento',
  recursal: 'Fase Recursal',
  arquivamento: 'Arquivamento',
};

export const PAS_FASE_COR: Record<string, string> = {
  instauracao: 'bg-sky-50 text-sky-700',
  instrucao: 'bg-amber-50 text-amber-700',
  aguardando_julgamento: 'bg-violet-50 text-violet-700',
  julgamento: 'bg-violet-50 text-violet-700',
  recursal: 'bg-orange-50 text-orange-700',
  arquivamento: 'bg-zinc-100 text-zinc-600',
};

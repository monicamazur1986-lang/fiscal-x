/**
 * Textos padrão de "Considerações Gerais" (introdução) e "Conclusão e Prazo
 * Legal" do relatório de roteiro, por id de roteiro — únicas fontes dessa
 * redação legal no app. Usados como valor inicial tanto na tela de
 * preenchimento (src/app/roteiros/[id]/page.tsx) quanto na tela de
 * configuração municipal (src/app/admin/configuracoes/page.tsx), em ambos os
 * casos editáveis a partir daqui via RichTextEditor — por isso já nascem como
 * HTML (parágrafo com margem inline, pra sobreviver independente de classes
 * Tailwind depois de editados).
 *
 * Os tokens {{DATA}}/{{ESTABELECIMENTO}}/{{CNPJ}}/{{PRAZO_DIAS}}/
 * {{BASE_LEGAL_PRAZO}} são trocados pelos dados já preenchidos da inspeção
 * (fillRoteiroTextoTokens) no momento em que o texto padrão é carregado pela
 * primeira vez — depois disso é texto livre, editável sem mais substituição.
 *
 * Chave "default" cobre qualquer roteiro sem entrada própria (hoje:
 * odontologia e odontologia-prudentopolis).
 */

import { format } from 'date-fns';

const p = (text: string) => `<p style="margin:0 0 10px 0">${text}</p>`;

// Modelo de referência (nem todo estabelecimento é de alto risco, nem todo
// exige licença sanitária, nem toda inspeção decorre de protocolo aberto —
// por isso o parágrafo de abertura não presume nenhuma dessas coisas, e o
// fechamento fala em "documento sanitário correspondente" em vez de
// "licença", cobrindo também parecer, auto de vistoria etc.):
//
// "No dia ___, a equipe de fiscalização da Vigilância Sanitária Municipal
// realizou inspeção no estabelecimento ___, inscrito sob CNPJ/CPF ___, com a
// finalidade de verificar as condições sanitárias do local.
//
// A inspeção foi conduzida de acordo com os critérios legais e técnicos
// estabelecidos pela ___ (RDC/legislação aplicável), além das demais normas
// sanitárias e protocolos de biossegurança pertinentes.
//
// Durante a vistoria, foram identificadas inconformidades que necessitam de
// correção, a fim de garantir o cumprimento da legislação vigente e
// assegurar a proteção da saúde de usuários e profissionais.
//
// Para que seja possível a emissão do documento sanitário correspondente, o
// estabelecimento deverá promover a regularização integral das
// recomendações e ajustes apontados, conforme os itens descritos a seguir."
export const DEFAULT_INTRO_HTML: Record<string, string> = {
  alimentacao: [
    p('No dia {{DATA}}, a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, inscrito sob CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias do local.'),
    p('A inspeção foi conduzida de acordo com os critérios legais e técnicos estabelecidos pela RDC nº 216/2004 e pela RDC nº 275/2002 da Anvisa, além das demais normas sanitárias e protocolos de biossegurança pertinentes.'),
    p('Durante a vistoria, foram identificadas inconformidades que necessitam de correção, a fim de garantir o cumprimento da legislação vigente e assegurar a proteção da saúde de usuários e profissionais.'),
    p('Para que seja possível a emissão do documento sanitário correspondente, o estabelecimento deverá promover a regularização integral das recomendações e ajustes apontados, conforme os itens descritos a seguir.'),
  ].join(''),
  farmacia: [
    p('No dia {{DATA}}, a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, inscrito sob CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias do local.'),
    p('A inspeção foi conduzida de acordo com os critérios legais e técnicos estabelecidos pela RDC nº 44/2009 da Anvisa e, quando aplicável, pela Portaria nº 344/1998, além da Lei Federal nº 5.991/1973 e das demais normas sanitárias e protocolos de biossegurança pertinentes.'),
    p('Durante a vistoria, foram identificadas inconformidades que necessitam de correção, a fim de garantir o cumprimento da legislação vigente e assegurar a proteção da saúde de usuários e profissionais.'),
    p('Para que seja possível a emissão do documento sanitário correspondente, o estabelecimento deverá promover a regularização integral das recomendações e ajustes apontados, conforme os itens descritos a seguir.'),
  ].join(''),
  'clinica-estetica-prudentopolis': [
    p('No dia {{DATA}}, a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, inscrito sob CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias do local.'),
    p('A inspeção foi conduzida de acordo com os critérios legais e técnicos estabelecidos pela RDC nº 63/2011, pela RDC nº 15/2012 e pela RDC nº 222/2018 da Anvisa, além das demais normas sanitárias e protocolos de biossegurança pertinentes a procedimentos invasivos.'),
    p('Durante a vistoria, foram identificadas inconformidades que necessitam de correção, a fim de garantir o cumprimento da legislação vigente e assegurar a proteção da saúde de usuários, profissionais e pacientes.'),
    p('Para que seja possível a emissão do documento sanitário correspondente, o estabelecimento deverá promover a regularização integral das recomendações e ajustes apontados, conforme os itens descritos a seguir.'),
  ].join(''),
  default: [
    p('No dia {{DATA}}, a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, inscrito sob CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias do local.'),
    p('A inspeção foi conduzida de acordo com os critérios legais e técnicos estabelecidos na legislação sanitária aplicável às atividades do estabelecimento, além das demais normas e protocolos de biossegurança pertinentes.'),
    p('Durante a vistoria, foram identificadas inconformidades que necessitam de correção, a fim de garantir o cumprimento da legislação vigente e assegurar a proteção da saúde de usuários e profissionais.'),
    p('Para que seja possível a emissão do documento sanitário correspondente, o estabelecimento deverá promover a regularização integral das recomendações e ajustes apontados, conforme os itens descritos a seguir.'),
  ].join(''),
};

export const DEFAULT_CONCLUSAO_HTML: Record<string, string> = {
  farmacia: [
    p('O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {{PRAZO_DIAS}} dias, contados do recebimento deste documento{{BASE_LEGAL_PRAZO}}, mantendo permanentemente as condições exigidas pela Lei Federal nº 5.991/1973 e pela RDC nº 44/2009 da Anvisa.'),
    p('O não cumprimento do prazo, sem pedido de prorrogação, resultará em Termo de Intimação ou de Infração, podendo levar à interdição do estabelecimento e/ou à apreensão de produtos nos casos mais graves.'),
    p('A Vigilância Sanitária Municipal acompanhará a regularização e permanece à disposição para orientações.'),
  ].join(''),
  'clinica-estetica-prudentopolis': [
    p('O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {{PRAZO_DIAS}} dias, contados do recebimento deste documento{{BASE_LEGAL_PRAZO}}, mantendo permanentemente as condições de biossegurança, esterilização e infraestrutura exigidas pela RDC nº 63/2011, pela RDC nº 15/2012 e pela RDC nº 222/2018 da Anvisa.'),
    p('O não cumprimento do prazo, sem pedido de prorrogação, resultará em Termo de Intimação ou de Infração, podendo levar à interdição do estabelecimento nos casos de risco à saúde do paciente ou do trabalhador.'),
    p('A Vigilância Sanitária Municipal acompanhará a regularização e permanece à disposição para orientações.'),
  ].join(''),
  default: [
    p('O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {{PRAZO_DIAS}} dias, contados do recebimento deste documento{{BASE_LEGAL_PRAZO}}.'),
    p('O não cumprimento do prazo, sem pedido de prorrogação devidamente justificado, resultará em Termo de Intimação ou de Infração, conforme a legislação vigente.'),
    p('A Vigilância Sanitária Municipal acompanhará a regularização e permanece à disposição para orientações.'),
  ].join(''),
};

interface IdDataParaTexto {
  fantasia?: string;
  cnpj?: string;
  dataHorario?: string;
  prazoDias?: string;
  baseLegalPrazo?: string;
}

/**
 * Substitui os tokens {{...}} pelos dados já preenchidos da inspeção — só
 * roda uma vez, no momento em que o texto padrão (município ou fixo) é
 * carregado pela primeira vez no formulário. Depois disso o texto vira
 * conteúdo livre editado pelo fiscal, sem mais substituição.
 */
export function fillRoteiroTextoTokens(html: string, idData: IdDataParaTexto): string {
  const data = idData.dataHorario ? format(new Date(idData.dataHorario), 'dd/MM/yyyy') : '____/____/____';
  const baseLegalPrazo = idData.baseLegalPrazo ? `, conforme previsto na ${idData.baseLegalPrazo}` : '';
  return html
    .replaceAll('{{DATA}}', data)
    .replaceAll('{{ESTABELECIMENTO}}', idData.fantasia || '---')
    .replaceAll('{{CNPJ}}', idData.cnpj || '---')
    .replaceAll('{{PRAZO_DIAS}}', idData.prazoDias || '15')
    .replaceAll('{{BASE_LEGAL_PRAZO}}', baseLegalPrazo);
}

/** Roteiros sem entrada própria caem na chave "default". */
export function getDefaultIntroHtml(roteiroId: string): string {
  return DEFAULT_INTRO_HTML[roteiroId] || DEFAULT_INTRO_HTML.default;
}

export function getDefaultConclusaoHtml(roteiroId: string): string {
  return DEFAULT_CONCLUSAO_HTML[roteiroId] || DEFAULT_CONCLUSAO_HTML.default;
}

/** Textos padrão por id de roteiro — mesmo formato no perfil do fiscal e na
 *  configuração do município. */
export type RoteiroTextos = Record<string, { introducaoHtml?: string; conclusaoHtml?: string }>;

/**
 * Resolve qual texto vale para um roteiro, na ordem: padrão pessoal do fiscal,
 * padrão do município e, por fim, o fixo do código.
 *
 * O do fiscal vem primeiro porque é a personalização mais específica — quem
 * assina o relatório é ele. O do município continua valendo para todo mundo
 * que não definiu o próprio.
 *
 * Centralizado aqui porque a mesma decisão é tomada em três pontos de
 * roteiros/[id]/page.tsx (os dois efeitos de sincronização e o carregamento de
 * uma inspeção salva) — duplicar a cadeia era garantir que uma delas ficasse
 * para trás numa mudança futura.
 */
export function resolverIntroHtml(
  roteiroId: string,
  textosDoFiscal?: RoteiroTextos,
  textosDoMunicipio?: RoteiroTextos
): string {
  return (
    textosDoFiscal?.[roteiroId]?.introducaoHtml ||
    textosDoMunicipio?.[roteiroId]?.introducaoHtml ||
    getDefaultIntroHtml(roteiroId)
  );
}

export function resolverConclusaoHtml(
  roteiroId: string,
  textosDoFiscal?: RoteiroTextos,
  textosDoMunicipio?: RoteiroTextos
): string {
  return (
    textosDoFiscal?.[roteiroId]?.conclusaoHtml ||
    textosDoMunicipio?.[roteiroId]?.conclusaoHtml ||
    getDefaultConclusaoHtml(roteiroId)
  );
}

/** Metadados dos roteiros existentes — usado no seletor da tela de
 * configuração municipal (src/app/admin/configuracoes/page.tsx), sem
 * precisar importar a lista completa (com ícones) de src/app/roteiros/page.tsx. */
export const ROTEIRO_TEXTO_OPTIONS: { id: string; label: string }[] = [
  { id: 'odontologia', label: 'Odontologia' },
  { id: 'odontologia-prudentopolis', label: 'Odontologia (Prudentópolis)' },
  { id: 'clinica-estetica-prudentopolis', label: 'Clínica de Estética (Prudentópolis)' },
  { id: 'alimentacao', label: 'Serviços de Alimentação' },
  { id: 'farmacia', label: 'Farmácias e Drogarias' },
  // Os roteiros ROI da ANVISA não entram aqui de propósito: não têm
  // "Considerações Gerais" nem "Conclusão e Prazo Legal" (ver checklist.roi
  // em roteiros/[id]/page.tsx), então não há texto padrão a configurar.
];

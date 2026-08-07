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

export const DEFAULT_INTRO_HTML: Record<string, string> = {
  alimentacao: [
    p('No dia {{DATA}} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias e proceder à renovação da licença sanitária, conforme protocolo.'),
    p('O funcionamento do estabelecimento está condicionado à posse de licença sanitária válida, nos termos do Código de Saúde do Estado do Paraná (Lei Estadual nº 13.331/2001), com renovação anual.'),
    p('A inspeção observou os critérios estabelecidos pela RDC nº 216/2004 da Anvisa (Boas Práticas para Serviços de Alimentação) e pela RDC nº 275/2002 da Anvisa (Procedimentos Operacionais Padronizados), além das demais normas sanitárias aplicáveis.'),
    p('Durante a vistoria, foram identificadas inconformidades que necessitam de correção para garantir o cumprimento da legislação e a proteção da saúde de usuários e profissionais.'),
    p('Para a emissão da licença sanitária, o estabelecimento deverá regularizar integralmente as recomendações apontadas, conforme os itens a seguir.'),
  ].join(''),
  farmacia: [
    p('No dia {{DATA}} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias e proceder à renovação da licença sanitária, conforme protocolo.'),
    p('O funcionamento de farmácias e drogarias está condicionado à posse de licença sanitária válida, nos termos do Código de Saúde do Estado do Paraná (Lei Estadual nº 13.331/2001) e da Lei Federal nº 5.991/1973, com renovação anual.'),
    p('A inspeção foi conduzida com base na RDC nº 44/2009 da Anvisa (Boas Práticas Farmacêuticas) e, quando aplicável ao estabelecimento, na Portaria nº 344/1998 (medicamentos sujeitos a controle especial) e na RDC nº 22/2014, além das demais normas sanitárias aplicáveis ao setor.'),
    p('Durante a vistoria, foram identificadas inconformidades que necessitam de correção para garantir o cumprimento da legislação e a proteção da saúde de usuários e profissionais.'),
    p('Para a emissão da licença sanitária, o estabelecimento deverá regularizar integralmente as recomendações apontadas, conforme os itens a seguir.'),
  ].join(''),
  'clinica-estetica-prudentopolis': [
    p('No dia {{DATA}} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias e proceder à renovação da licença sanitária, conforme protocolo.'),
    p('Considerando que se trata de clínica de estética que realiza procedimentos invasivos, atividade classificada como de risco sanitário, o funcionamento está condicionado à posse de licença sanitária válida, nos termos do Código de Saúde do Estado do Paraná (Lei Estadual nº 13.331/2001) e do Decreto Estadual nº 5.711/2002, com renovação anual.'),
    p('A inspeção foi conduzida com base na RDC nº 63/2011 da Anvisa (Boas Práticas de Funcionamento de Serviços de Saúde), na RDC nº 15/2012 (processamento de produtos para saúde) e na RDC nº 222/2018 (gerenciamento de resíduos de serviços de saúde), além das demais normas de biossegurança aplicáveis a procedimentos invasivos.'),
    p('Durante a vistoria, foram identificadas inconformidades que necessitam de correção para garantir o cumprimento da legislação e a proteção da saúde de usuários, profissionais e pacientes.'),
    p('Para a emissão da licença sanitária, o estabelecimento deverá regularizar integralmente as recomendações apontadas, conforme os itens a seguir.'),
  ].join(''),
  default: [
    p('No dia {{DATA}} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {{ESTABELECIMENTO}}, CNPJ/CPF {{CNPJ}}, com a finalidade de verificar as condições sanitárias do estabelecimento e proceder à renovação da licença sanitária, conforme protocolo.'),
    p('Considerando que se trata de atividade classificada como de alto risco sanitário, nos termos da Resolução SESA nº 1024/2020, o funcionamento está condicionado à posse de licença sanitária válida, cuja renovação deve ser realizada anualmente.'),
    p('A inspeção foi conduzida de acordo com os critérios legais e técnicos estabelecidos pela RDC 1002/25 da Anvisa, além das demais normas sanitárias e protocolos de biossegurança aplicáveis aos serviços de saúde.'),
    p('Durante a vistoria realizada, foram identificadas algumas inconformidades que necessitam de correção, a fim de garantir o cumprimento da legislação vigente e assegurar a proteção da saúde de usuários e profissionais.'),
    p('Dessa forma, para que seja possível a emissão da licença sanitária, o estabelecimento deverá promover a regularização integral das recomendações e ajustes apontados, conforme os itens descritos a seguir.'),
  ].join(''),
};

export const DEFAULT_CONCLUSAO_HTML: Record<string, string> = {
  farmacia: [
    p('O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {{PRAZO_DIAS}} dias, contados a partir do recebimento do documento{{BASE_LEGAL_PRAZO}}.'),
    p('O fato de determinada exigência não constar neste roteiro não exime o estabelecimento de observar as demais obrigações previstas na legislação sanitária vigente, em especial a Lei Federal nº 5.991/1973 e a RDC nº 44/2009 da Anvisa.'),
    p('Para a concessão ou renovação da licença sanitária, o estabelecimento deve manter, de forma permanente, condições higiênico-sanitárias e estruturais em conformidade com a legislação vigente, além de toda a documentação pertinente ao desenvolvimento de suas atividades.'),
    p('Caso o estabelecimento não cumpra o prazo estipulado ou não formalize pedido de prorrogação, será lavrado um Termo de Intimação ou de Infração, fundamentado na legislação vigente, determinando a regularização das situações de não conformidade, podendo, nos casos de maior gravidade, resultar em interdição total ou parcial do estabelecimento e/ou apreensão de produtos.'),
    p('A Vigilância Sanitária Municipal acompanhará a implementação das medidas corretivas e permanecerá disponível para prestar orientações técnicas. Em caso de dúvidas, estamos à disposição.'),
  ].join(''),
  'clinica-estetica-prudentopolis': [
    p('O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {{PRAZO_DIAS}} dias, contados a partir do recebimento do documento{{BASE_LEGAL_PRAZO}}.'),
    p('O fato de determinada exigência não constar neste roteiro não exime o estabelecimento de observar as demais obrigações previstas na legislação sanitária vigente, em especial a RDC nº 63/2011, a RDC nº 15/2012 e a RDC nº 222/2018 da Anvisa.'),
    p('Para a concessão ou renovação da licença sanitária, o estabelecimento deve manter, de forma permanente, condições de biossegurança, esterilização e infraestrutura compatíveis com os procedimentos invasivos realizados, além de toda a documentação técnica exigida.'),
    p('Caso o estabelecimento não cumpra o prazo estipulado ou não formalize pedido de prorrogação, será lavrado um Termo de Intimação ou de Infração, fundamentado na legislação vigente, determinando a regularização das situações de não conformidade, podendo, nos casos de risco à saúde do paciente ou do trabalhador, resultar em interdição total ou parcial do estabelecimento.'),
    p('A Vigilância Sanitária Municipal acompanhará a implementação das medidas corretivas e permanecerá disponível para prestar orientações técnicas. Em caso de dúvidas, estamos à disposição.'),
  ].join(''),
  default: [
    p('O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {{PRAZO_DIAS}} dias, contados a partir do recebimento do documento{{BASE_LEGAL_PRAZO}}.'),
    p('Caso o estabelecimento não cumpra o prazo estipulado ou não formalize pedido de prorrogação, será lavrado um Termo de Intimação ou de Infração, fundamentado na legislação vigente, determinando a regularização das situações de não conformidade.'),
    p('A Vigilância Sanitária Municipal acompanhará a implementação das medidas corretivas e permanecerá disponível para prestar orientações técnicas. Havendo necessidade devidamente justificada, o estabelecimento poderá solicitar prorrogação dos prazos, a qual será analisada e deliberada conforme a legislação aplicável.'),
    p('Em caso de dúvidas, estamos à disposição.'),
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

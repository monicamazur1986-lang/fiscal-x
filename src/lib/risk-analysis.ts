/**
 * Motor de classificação de risco sanitário por CNAE — portado do AgilizaVISA
 * (riscosanitariopr.com.br, mesmo projeto da Monica, Firebase separado).
 * Resolução SESA nº 1034/2020 | Decreto Estadual nº 10.590/2025 | Deliberação CIB nº 85/2021.
 */

import riskDataRaw from './cnae-risk.json';

export interface Cnae {
  code: string;
  description: string;
}

export type RiskLevel = 'ALTO' | 'MEDIO' | 'BAIXO' | 'CONDICIONADO' | 'NÃO ENCONTRADO';

export interface RiskAnalysisResult {
  level: RiskLevel;
  message: string;
  unresolved: any[];
  requiresPba: boolean;
  pbaNotes: string[];
  specialProjectNotes: string[];
  porte?: string;
  porteNotes: string[];
  baixoRiscoNotes: string[];
}

const riskData = Object.freeze(riskDataRaw as any) || { risks: {} };

function normalizeCnae(code: string): string {
  if (!code) return '';
  return String(code).replace(/\D/g, '').padStart(7, '0');
}

function getPorteInfo(code: string, answer?: string): { porte: string; porteNote?: string } {
  const normalized = normalizeCnae(code);
  const exceptions: Record<string, string> = {
    "2099199": "Porte III",
    "0892403": "Porte III",
    "1032501": "Porte III",
    "1041400": "Porte II e III",
    "1042200": "Porte II e III",
    "1053800": "Porte III",
    "1065102": "Porte II e III",
    "1065103": "Porte II e III",
    "1072401": "Porte II e III",
    "1082100": "Porte II e III",
    "1099602": "Porte III",
    "1099603": "Porte III",
    "1099606": "Porte III",
    "1099607": "Porte III",
    "1121600": "Porte III",
    "1122404": "Porte III",
    "1122499": "Porte III",
    "1742701": "Porte III",
    "1742702": "Porte III",
    "2052500": "Porte III",
    "2061400": "Porte III",
    "2062200": "Porte III",
    "2063100": "Porte III",
    "2110600": "Porte III",
    "2121101": "Porte III",
    "2121102": "Porte III",
    "2121103": "Porte III",
    "2123800": "Porte III",
    "2660400": "Porte III",
    "3250701": "Porte III",
    "3250702": "Porte III",
    "3250703": "Porte III",
    "3250704": "Porte III",
    "3250705": "Porte III",
    "4645101": "Porte II e III",
    "4645102": "Porte II e III",
    "4645103": "Porte II e III",
    "4646001": "Porte II e III",
    "4646002": "Porte II e III",
    "4649408": "Porte II e III",
    "4649409": "Porte II e III",
    "4771702": "Porte II e III",
    "5620101": "Porte II e III",
    "8610101": "Porte III",
    "8610102": "Porte III",
    "8621601": "Porte III",
    "8630507": "Porte III",
    "8640201": "Porte II e III",
    "8640203": "Porte III",
    "8640204": "Porte II e III",
    "8640206": "Porte II e III",
    "8640207": "Porte II e III",
    "8640209": "Porte III",
    "8640210": "Porte III",
    "8640211": "Porte III",
    "8640212": "Porte III",
    "8640214": "Porte III",
    "8650007": "Porte III",
    "8690902": "Porte II e III",
    "8712300": "Porte II e III",
    "9603305": "Porte II e III",
    // Deliberação CIB nº 85/2021, Anexo I
    "1072402": "Porte II e III",
    "1099699": "Porte III",
    "4644301": "Porte III",
    "8621602": "Porte II e III",
    "8630501": "Porte II e III",
    "8640202": "Porte II e III",
    "8640205": "Porte II e III",
    "8640213": "Porte II e III",
    "8640299": "Porte II e III",
    "8711501": "Porte II e III",
    "8711502": "Porte II e III",
    "1032599": "Porte II e III",
    "1043100": "Porte III",
    "1122403": "Porte II e III",
    "1731100": "Porte II e III",
    "1732000": "Porte II e III",
    "1733800": "Porte II e III",
    "2014200": "Porte III",
    "2019399": "Porte III",
    "2029100": "Porte III",
    "2071100": "Porte III",
    "2091600": "Porte II e III",
    "2093200": "Porte III",
    "2219600": "Porte III",
    "2222600": "Porte III",
    "2312500": "Porte II e III",
    "2341900": "Porte II e III",
    "2349499": "Porte II e III",
    "2591800": "Porte III",
    "2829199": "Porte III",
    "3092000": "Porte III",
    "3104700": "Porte III",
    "3250707": "Porte III",
    "3291400": "Porte III",
    "3292202": "Porte III",
    "3299006": "Porte III",
    "4623199": "Porte II e III",
    "4635403": "Porte II e III",
    "4664800": "Porte II e III",
    "4930201": "Porte II e III",
    "4930202": "Porte II e III",
    "5211701": "Porte II e III",
    "5211799": "Porte II e III",
    "6203100": "Porte III",
    "7120100": "Porte II e III",
    "7500100": "Porte II e III",
    "8129000": "Porte III",
    "8292000": "Porte III",
    "8423000": "Porte II e III",
    "9601701": "Porte II e III",
    "9601702": "Porte II e III",
    "9601703": "Porte II e III"
  };

  // Notas explicativas para CNAEs cuja responsabilidade de porte varia conforme circunstância
  // específica da atividade (Deliberação CIB nº 85/2021, Anexo I).
  const porteNotes: Record<string, string> = {
    "8621601": "Quando prestado por concessionárias de rodovias, a responsabilidade é exclusiva do Estado, não de nenhum porte municipal.",
    "1072402": "Se o produto for artesanal, a fiscalização é atribuição de qualquer porte municipal (I, II ou III); caso contrário, apenas municípios de Porte II e III são responsáveis.",
    "1099699": "A responsabilidade varia conforme o produto: doces (qualquer porte); demais alimentos dispensados de registro na ANVISA, exceto doces (Porte II e III); alimentos sujeitos a registro na ANVISA (somente Porte III).",
    "4644301": "Distribuidoras e exportadoras de medicamentos e insumos farmacêuticos: Porte II e III. Distribuidoras de insumos com fracionamento e importadoras de insumos ou medicamentos: somente Porte III.",
    "8621602": "Quando prestado por concessionárias de rodovias, a responsabilidade é exclusiva do Estado, não de nenhum porte municipal.",
    "8640202": "Postos de coleta: qualquer porte municipal. Laboratórios de análises clínicas: apenas Porte II e III.",
    "8640205": "Radiologia odontológica periapical/intra-oral: qualquer porte. Radiologia médica/odontológica extra-oral, densitometria óssea, mamografia e fluoroscopia: Porte II e III. Hemodinâmica e medicina nuclear: somente Porte III.",
    "8640299": "Serviços de função pulmonar, exceto câmara hiperbárica: Porte II e III. Serviços de câmara hiperbárica: somente Porte III.",
    "8711501": "Atendimento a idosos com dependência grau 1 e 2 (RDC ANVISA nº 502/2021): qualquer porte municipal. Grau 3: apenas Porte II e III.",
    "8711502": "Atendimento a idosos com dependência grau 1 e 2 (RDC ANVISA nº 502/2021): qualquer porte municipal. Grau 3: apenas Porte II e III.",
    "1032599": "Se o produto for artesanal, a fiscalização é atribuição de qualquer porte municipal; caso contrário, apenas Porte II e III.",
    "1043100": "Restrição aplica-se apenas quando o produto fabricado for comestível.",
    "1122403": "Se o produto for artesanal, a fiscalização é atribuição de qualquer porte municipal; caso contrário, apenas Porte II e III.",
    "1731100": "Restrição aplica-se apenas quando o produto se destinar a entrar em contato com alimento ou for usado para embalar produto a ser esterilizado.",
    "1732000": "Restrição aplica-se apenas quando o produto se destinar a entrar em contato com alimento ou produto para saúde.",
    "1733800": "Restrição aplica-se apenas quando o produto se destinar a entrar em contato com alimento ou produto para saúde.",
    "2014200": "Restrição aplica-se apenas quando o gás fabricado for usado para fim terapêutico (gás medicinal).",
    "2019399": "Restrição aplica-se apenas quando o produto for de uso ou aplicação como aditivo de alimentos.",
    "2029100": "Restrição aplica-se apenas quando o produto for de uso ou aplicação como aditivo de alimentos.",
    "2071100": "Restrição aplica-se apenas quando se tratar de tintas, vernizes, esmaltes, lacas, pigmentos e/ou corantes que utilizam precursores sujeitos a controle especial.",
    "2091600": "Restrição aplica-se apenas quando usado para revestimento interno de embalagens em contato com alimentos, ou quando se tratar de adesivos, colas, decalques e selantes que utilizam precursores sujeitos a controle especial.",
    "2093200": "Restrição aplica-se apenas quando o produto for aditivo alimentar ou insumo farmacêutico.",
    "2219600": "Restrição aplica-se apenas quando houver fabricação de produtos para saúde (como preservativos e luvas para procedimentos médicos, odontológicos ou hospitalares) ou embalagem que entra em contato com alimentos.",
    "2222600": "Restrição aplica-se apenas quando houver fabricação de produto para saúde ou de embalagem de material plástico que entra em contato com alimento.",
    "2312500": "Restrição aplica-se apenas quando houver fabricação de embalagens de vidro que entram em contato com alimento.",
    "2341900": "Restrição aplica-se apenas quando houver fabricação de produtos utilizados como embalagem que entram em contato com alimento.",
    "2349499": "Restrição aplica-se apenas quando houver fabricação de produtos utilizados como embalagem que entram em contato com alimento.",
    "2591800": "Restrição aplica-se apenas quando houver fabricação de embalagens metálicas que entram em contato com alimento.",
    "2829199": "Restrição aplica-se apenas quando houver fabricação de produto para saúde.",
    "3092000": "Restrição aplica-se apenas quando houver fabricação de produto para saúde.",
    "3104700": "Restrição aplica-se apenas quando houver fabricação de produto para saúde.",
    "3250707": "Restrição aplica-se apenas quando houver fabricação de produto para saúde.",
    "3291400": "Restrição aplica-se apenas quando houver fabricação de escova dental.",
    "3292202": "Restrição aplica-se apenas quando houver fabricação de artefatos de tecido não tecido para uso odonto-médico-hospitalar.",
    "3299006": "Restrição aplica-se apenas quando houver fabricação de velas, sebo e/ou estearina utilizadas como cosmético ou saneante.",
    "4623199": "Restrição aplica-se apenas quando houver comércio atacadista de ervas medicinais.",
    "4635403": "Restrição de Porte II e III aplica-se quando houver engarrafamento e/ou rotulagem consideradas etapas do processo produtivo de água mineral; nos demais casos de fracionamento e acondicionamento, qualquer porte é responsável.",
    "4664800": "Restrição aplica-se apenas quando houver comercialização de produtos para a saúde.",
    "4930201": "Transporte de alimentos: qualquer porte municipal. Transporte de medicamento, cosmético, perfume, produto de higiene, saneante, produto para saúde e/ou materiais biológicos: apenas Porte II e III.",
    "4930202": "Transporte de alimentos: qualquer porte municipal. Transporte de medicamento, cosmético, perfume, produto de higiene, saneante, produto para saúde e/ou materiais biológicos: apenas Porte II e III.",
    "5211701": "Armazenamento de alimentos: qualquer porte municipal. Armazenamento de medicamento, cosmético, perfume, produto de higiene, saneante, produto para saúde e/ou materiais biológicos: apenas Porte II e III.",
    "5211799": "Armazenamento de alimentos: qualquer porte municipal. Armazenamento de medicamento, cosmético, perfume, produto de higiene, saneante, produto para saúde e/ou materiais biológicos: apenas Porte II e III.",
    "6203100": "Restrição aplica-se apenas quando houver desenvolvimento de softwares que realizam ou influenciam diretamente no diagnóstico, monitoramento ou terapia (tratamento) para a saúde.",
    "7120100": "Restrição aplica-se apenas quando houver, no exercício da atividade, análise de produto sujeito à Vigilância Sanitária.",
    "7500100": "Uso de medicamentos controlados (Portaria 344/98 ou norma sucessora): qualquer porte municipal. Uso de equipamento de raio-x: apenas Porte II e III.",
    "8129000": "Restrição aplica-se apenas a serviços de processamento e esterilização de materiais médico-hospitalares, ou irradiação de alimentos.",
    "8292000": "Fracionamento e/ou embalagem de alimentos: qualquer porte municipal. Fracionamento e/ou embalagem de medicamento, cosmético, perfume, produto de higiene, saneante e/ou produto para saúde: somente Porte III.",
    "8423000": "Restrição aplica-se apenas quando houver prestação de serviços relacionados à administração de penitenciárias e ao fornecimento de serviços correcionais, inclusive de reabilitação, com ou sem prestação de assistência à saúde envolvendo procedimentos invasivos e/ou odontológicos.",
    "9601701": "Se não houver processamento de roupa hospitalar, qualquer porte municipal é responsável; lavanderias autônomas e independentes que processam roupa hospitalar: apenas Porte II e III.",
    "9601702": "Se não houver processamento de roupa hospitalar, qualquer porte municipal é responsável; havendo processamento de roupa hospitalar: apenas Porte II e III.",
    "9601703": "Se não houver processamento de roupa hospitalar, qualquer porte municipal é responsável; havendo processamento de roupa hospitalar: apenas Porte II e III."
  };

  // Códigos cujo Porte de Fiscalização depende da MESMA pergunta Sim/Não usada para classificar o
  // risco (ex.: 8292-0/00 — se a resposta for "Não", trata-se de fracionamento de alimento, e a
  // fiscalização volta a ser de qualquer porte municipal; se "Sim", aplica-se a restrição acima).
  // Sem essa correção, o porte ficava travado no valor mais restritivo mesmo quando a resposta
  // já esclarecia se a circunstância restritiva realmente se aplica.
  const conditionalPorteCodes = new Set([
    "1032599", "1043100", "1072402", "1122403", "1731100", "1732000", "1733800",
    "2014200", "2019399", "2029100", "2071100", "2091600", "2093200", "2219600",
    "2222600", "2312500", "2341900", "2349499", "2591800", "2829199", "3092000",
    "3104700", "3250707", "3291400", "3292202", "3299006", "4623199", "4635403",
    "4664800", "4930201", "4930202", "5211701", "5211799", "6203100", "7120100",
    "8129000", "8292000", "8423000", "9601701", "9601702", "9601703"
  ]);

  const basePorte = exceptions[normalized] || "Porte I, II e III";
  const porte = (conditionalPorteCodes.has(normalized) && answer === 'Não') ? "Porte I, II e III" : basePorte;

  return { porte, porteNote: porteNotes[normalized] };
}

function getPorteForCnae(code: string, answer?: string): string {
  return getPorteInfo(code, answer).porte;
}

export function resolveCnaeRisk(code: string, answers: Record<string, string>): {
  risk: RiskLevel;
  question?: string;
  path?: string;
  requiresPba?: boolean;
  pbaNote?: string;
  specialProjectNote?: string;
  porte?: string;
  porteNote?: string;
  baixoRiscoNote?: string;
} {
  if (!riskData || !riskData.risks) return { risk: 'NÃO ENCONTRADO' };

  const normalizedSearchCode = normalizeCnae(code);
  const { porte, porteNote } = getPorteInfo(code, answers[normalizedSearchCode]);

  const findIn = (level: RiskLevel) => {
    const list = riskData.risks[level]?.cnaes;
    if (!Array.isArray(list)) return undefined;
    return list.find((c: any) => normalizeCnae(c.code) === normalizedSearchCode);
  };

  // O Decreto Estadual nº 10.590/2025 é norma posterior e mais específica, que ampliou o rol de
  // Baixo Risco e prevalece sobre o enquadramento da Resolução SESA nº 1034/2020 (ALTO/CONDICIONADO/MEDIO).
  // Porém, quando a entrada de Baixo Risco é CONDICIONAL (tem "note", isto é, só vale em certa
  // circunstância) e o mesmo CNAE também consta na 1034, não podemos simplesmente prevalecer o Baixo:
  // isso ignoraria os casos em que a condição do Decreto 10.590 não se aplica (ex.: 8292-0/00 só é
  // Baixo Risco se for fracionamento de alimentos; se for medicamento, continua sendo Alto Risco com PBA,
  // conforme a pergunta já existente no Condicionado). Nesses casos, deixamos a classificação da 1034
  // prevalecer normalmente, e apenas anexamos a nota do Decreto 10.590 como informação complementar.
  const baixoFound = findIn('BAIXO');
  const existsInResolucao1034 = !!(findIn('ALTO') || findIn('CONDICIONADO') || findIn('MEDIO'));
  const baixoIsConditionalConflict = !!(baixoFound && baixoFound.note && existsInResolucao1034);
  const baixoRiscoNote: string | undefined = baixoFound?.note;

  const levels: RiskLevel[] = baixoIsConditionalConflict
    ? ['ALTO', 'CONDICIONADO', 'MEDIO']
    : ['BAIXO', 'ALTO', 'CONDICIONADO', 'MEDIO'];

  for (const level of levels) {
    const cnaesList = riskData.risks[level]?.cnaes;
    if (!Array.isArray(cnaesList)) continue;

    const found = cnaesList.find((c: any) => normalizeCnae(c.code) === normalizedSearchCode);

    if (found) {
      if (level !== 'CONDICIONADO') {
        return {
          risk: level as RiskLevel,
          requiresPba: !!found.requiresPba,
          pbaNote: found.pbaNote,
          porte,
          porteNote,
          baixoRiscoNote
        };
      }

      let node = found;
      let path = normalizedSearchCode;
      while (node && node.question) {
        const ans = answers[path];
        if (!ans) return { risk: 'CONDICIONADO', question: node.question, path, porte, porteNote, baixoRiscoNote };

        const outcome = node.outcomes?.[ans];
        if (!outcome) return { risk: 'NÃO ENCONTRADO', porte, porteNote, baixoRiscoNote };

        if (typeof outcome === 'object' && outcome.risk) {
          return {
            risk: outcome.risk as RiskLevel,
            requiresPba: !!outcome.requiresPba,
            pbaNote: outcome.pbaNote,
            specialProjectNote: outcome.specialProjectNote,
            porte,
            porteNote,
            baixoRiscoNote
          };
        }

        if (typeof outcome === 'string') {
          return { risk: outcome as RiskLevel, requiresPba: false, porte, porteNote, baixoRiscoNote };
        }

        node = outcome;
        path = `${path}:${ans}`;
      }
    }
  }
  return { risk: 'NÃO ENCONTRADO', porte, porteNote, baixoRiscoNote };
}

export function analyzeRisk(cnaes: Cnae[], answers: Record<string, string>): RiskAnalysisResult {
  let highest: RiskLevel = 'BAIXO';
  let pbaRequired = false;
  const unresolved: any[] = [];
  const pbaNotes: string[] = [];
  const specialProjectNotes: string[] = [];
  const porteNotes: string[] = [];
  const baixoRiscoNotes: string[] = [];

  const priority: Record<string, number> = { 'ALTO': 4, 'CONDICIONADO': 3, 'MEDIO': 2, 'BAIXO': 1, 'NÃO ENCONTRADO': 0 };

  if (!Array.isArray(cnaes) || cnaes.length === 0) {
    return {
      level: 'NÃO ENCONTRADO',
      message: "Atividade econômica não localizada no rol taxativo oficial da Resolução SESA nº 1034/2020.",
      unresolved: [],
      requiresPba: false,
      pbaNotes: [],
      specialProjectNotes: [],
      porteNotes: [],
      baixoRiscoNotes: []
    };
  }

  cnaes.forEach(c => {
    const res = resolveCnaeRisk(c.code, answers);
    if (res.risk === 'CONDICIONADO') unresolved.push({ ...c, ...res });
    if (res.requiresPba) {
      pbaRequired = true;
      if (res.pbaNote && !pbaNotes.includes(res.pbaNote)) pbaNotes.push(res.pbaNote);
    }
    if (res.specialProjectNote && !specialProjectNotes.includes(res.specialProjectNote)) {
      specialProjectNotes.push(res.specialProjectNote);
    }
    if (res.baixoRiscoNote && !baixoRiscoNotes.includes(res.baixoRiscoNote)) {
      baixoRiscoNotes.push(res.baixoRiscoNote);
    }
    if (res.porteNote && !porteNotes.includes(res.porteNote)) {
      porteNotes.push(res.porteNote);
    }

    const currentPriority = priority[res.risk] ?? 0;
    const highestPriority = priority[highest] ?? 0;
    if (currentPriority > highestPriority) highest = res.risk as RiskLevel;
  });

  const finalLevel = unresolved.length > 0 ? 'CONDICIONADO' : highest;

  const messages: Record<string, string> = {
    'ALTO': "Atividade econômica de Alto Risco (Nível III). Exige inspeção sanitária e/ou análise documental prévias pela autoridade sanitária competente antes do início das atividades. A emissão da Licença Sanitária está condicionada à conformidade verificada em vistoria local.",
    'BAIXO': "Atividade econômica de Baixo Risco (Nível I). Esta classificação dispensa o estabelecimento da exigência de licenciamento sanitário para o início das operações, devendo o responsável observar rigorosamente as normas sanitárias vigentes.",
    'MEDIO': "Atividade de Médio Risco (Nível II). Permite a emissão da Licença Sanitária de forma simplificada e o início imediato das operações após o licenciamento, sem prejuízo de fiscalização posterior para verificação das condições autodeclaradas.",
    'CONDICIONADO': "Classificação de Risco Condicionada. A definição final do nível de risco depende obrigatoriamente das respostas técnicas às perguntas de autodeclaração relacionadas à infraestrutura e processos de trabalho.",
    'NÃO ENCONTRADO': "Atividade econômica não localizada no rol taxativo oficial. Recomenda-se consulta direta à Vigilância Sanitária municipal para enquadramento individualizado conforme a complexidade das operações."
  };

  // Determinar porte global (mais restritivo)
  let globalPorte = "Porte I, II e III";
  const portes = cnaes.map(c => getPorteForCnae(c.code, answers[normalizeCnae(c.code)]));
  if (portes.some(p => p === "Porte III")) {
    globalPorte = "Porte III";
  } else if (portes.some(p => p === "Porte II e III") && globalPorte === "Porte I, II e III") {
    globalPorte = "Porte II e III";
  }

  return {
    level: finalLevel as RiskLevel,
    message: messages[finalLevel] || messages['NÃO ENCONTRADO'],
    unresolved,
    requiresPba: pbaRequired,
    pbaNotes,
    specialProjectNotes,
    porte: globalPorte,
    porteNotes,
    baixoRiscoNotes
  };
}

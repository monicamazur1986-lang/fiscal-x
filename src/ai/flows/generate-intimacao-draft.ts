'use server';

/**
 * @fileOverview Motor de Geração de Rascunho Oficial com Rigor Jurídico Máximo.
 * Implementa validação de densidade de informação e fundamentação legal obrigatória via RAG Local.
 * O texto é gerado em BLOCO ÚNICO, vinculando cada irregularidade a Artigos e Incisos exatos.
 */

import { ai, z, isAIReady } from '@/ai/genkit';
import { retry } from '@genkit-ai/middleware';
import legislacaoData from '@/lib/legislacao.json';

const ReportTypeSchema = z.enum(['intimação', 'infração', 'apreensão', 'interdição']);
const LawPreferenceSchema = z.enum(['todas', 'municipal', 'estadual']).default('todas');

const GenerateIntimacaoDraftInputSchema = z.object({
  caseDescription: z.string().describe('O relato informal do fiscal.'),
  reportType: ReportTypeSchema.default('intimação'),
  lawPreference: LawPreferenceSchema.optional(),
  useCloudAI: z.boolean().default(false),
  nonce: z.string().optional()
});
export type GenerateIntimacaoDraftInput = z.infer<typeof GenerateIntimacaoDraftInputSchema>;

const GenerateIntimacaoDraftOutputSchema = z.object({
  draftIntimacao: z.string().describe('O texto técnico jurídico em bloco único.'),
  fundamentacaoSugerida: z.string().optional().describe('Artigos infringidos no formato: LEI (ART, INCISO).'),
  artigosUtilizados: z.array(z.string()).optional(),
  engine: z.enum(['local', 'cloud']).optional(),
  error: z.string().optional(),
});
export type GenerateIntimacaoDraftOutput = z.infer<typeof GenerateIntimacaoDraftOutputSchema>;

/**
 * MOTOR DE INTELIGÊNCIA NATIVA (OFFLINE)
 * Realiza busca granular e valida se há dados suficientes para lavratura.
 */
function generateLocalHeuristicDraft(input: GenerateIntimacaoDraftInput): GenerateIntimacaoDraftOutput {
  const rawDesc = input.caseDescription.trim();
  const type = input.reportType;
  
  // 1. VALIDAÇÃO DE DENSIDADE (SEGURANÇA JURÍDICA)
  if (rawDesc.length < 12) {
    return {
      draftIntimacao: "",
      error: "RELATO INSUFICIENTE: Forneça mais detalhes sobre a irregularidade (ex: descreva o que está vencido ou qual a falha de higiene) para garantir o enquadramento legal correto."
    };
  }

  // 2. BUSCA GRANULAR DE LEGISLAÇÃO
  let matchedArticles: any[] = [];
  const pref = input.lawPreference || 'todas';
  const descLower = rawDesc.toLowerCase();

  Object.entries(legislacaoData).forEach(([lawKey, law]: [string, any]) => {
    if (pref === 'municipal' && !lawKey.includes('MUNICIPAL')) return;
    if (pref === 'estadual' && !lawKey.includes('ESTADUAL')) return;
    
    law.artigos.forEach((art: any) => {
      const keywords = art.keywords?.split(' ') || [];
      const hasMatch = keywords.some((k: string) => k.length > 3 && descLower.includes(k.toLowerCase()));
      if (hasMatch) matchedArticles.push({ ...art, lawTitle: law.titulo });
    });
  });

  // Se não encontrar nada no banco, interrompe para evitar nulidade
  if (matchedArticles.length === 0) {
    return {
      draftIntimacao: "",
      error: "ENQUADRAMENTO NÃO LOCALIZADO: Os termos digitados não correspondem a nenhuma infração salva no banco de dados. Especifique melhor o fato (ex: 'alvará', 'temperatura', 'limpeza')."
    };
  }

  // 3. FORMATAÇÃO DA FUNDAMENTAÇÃO
  const groupedByLaw: Record<string, string[]> = {};
  matchedArticles.forEach(art => {
    const lawName = art.lawTitle.split(' - ')[0]; 
    if (!groupedByLaw[lawName]) groupedByLaw[lawName] = [];
    groupedByLaw[lawName].push(art.label.toUpperCase());
  });

  const fundParts = Object.entries(groupedByLaw).map(([lawName, labels]) => {
    const uniqueLabels = Array.from(new Set(labels)).join(', ');
    return `${lawName.toUpperCase()} (${uniqueLabels})`;
  });
  const fundamentacao = fundParts.join('; ');

  // 4. REESCRITA TÉCNICA (HEURÍSTICA DE PORTUGUÊS PADRÃO)
  let factAnalysis = "";
  if (descLower.includes('vape') || descLower.includes('cigarro eletronico')) {
    factAnalysis = "a existência de cigarro eletrônico, produto cuja comercialização é proibida no Brasil por não possuir registro na ANVISA";
  } else if (descLower.includes('vencid') || descLower.includes('validade')) {
    factAnalysis = "a exposição de produtos com prazo de validade expirado para a entrega ao consumo";
  } else if (descLower.includes('higiene') || descLower.includes('sujeira') || descLower.includes('sujidade')) {
    factAnalysis = "que o estabelecimento apresenta condições higiênico-sanitárias insatisfatórias, com presença de sujidades acumuladas";
  } else if (descLower.includes('sem rt') || descLower.includes('responsavel')) {
    factAnalysis = "que o estabelecimento encontra-se em funcionamento sem a assistência de um responsável técnico (RT) habilitado";
  } else {
    factAnalysis = `que ${descLower.charAt(0).toLowerCase() + descLower.slice(1).replace(/\.$/, '')}`;
  }

  // 5. MONTAGEM DO BLOCO ÚNICO
  const opening = `Durante inspeção realizada no estabelecimento identificado, esta Autoridade Sanitária constatou ${factAnalysis}. `;
  const risk = `A situação configura risco sanitário aos consumidores e está em desacordo com as normas de saúde pública e biossegurança. `;
  const legal = `Tal conduta caracteriza irregularidade sanitária e a inobservância das exigências legais aplicáveis ao setor, em violação direta à ${fundamentacao}. `;
  
  let closing = "";
  if (type === 'interdição') {
    closing = `Diante do exposto, o estabelecimento foi interditado cautelarmente, até a regularização das condições apontadas, sob pena de sanções previstas na legislação vigente.`;
  } else if (type === 'apreensão') {
    closing = `Diante do exposto, o produto foi apreendido, lavrado auto de infração e instaurado processo administrativo sanitário, com observância dos prazos legais para defesa e contraditório.`;
  } else {
    closing = `Diante do exposto, fica o responsável legal notificado a proceder à imediata regularização das condições apontadas, sob pena de aplicação das sanções previstas na legislação sanitária em vigor.`;
  }

  return {
    draftIntimacao: `${opening}${risk}${legal}${closing}`.replace(/\s+/g, ' ').trim(),
    fundamentacaoSugerida: fundamentacao,
    artigosUtilizados: matchedArticles.map(a => a.id),
    engine: 'local'
  };
}

const draftPrompt = ai.definePrompt({
  name: 'generateIntimacaoDraftPrompt',
  input: { 
    schema: z.object({
      caseDescription: z.string(),
      reportType: z.string(),
      filteredContext: z.string()
    })
  },
  output: { schema: GenerateIntimacaoDraftOutputSchema },
  config: { temperature: 0.1 },
  prompt: `Você é um Auditor Jurídico Sênior da Vigilância Sanitária.
Sua missão é transformar notas de campo em um documento técnico de alto rigor, na NORMA CULTA e em BLOCO ÚNICO.

REGRAS CRÍTICAS DE FUNDAMENTAÇÃO:
1. BLOCO ÚNICO: Proibido usar quebras de linha ou parágrafos.
2. RIGOR LEGAL ABSOLUTO: Você deve apontar com exatidão a lei, o artigo e o inciso. Use EXCLUSIVAMENTE a legislação fornecida abaixo.
3. PROIBIDO GENERALIZAR: Nunca use "Normas Gerais" ou "Legislação Vigente". Escreva: NOME DA LEI (ARTIGO X, INCISO Y).
4. VÍNCULO FATO-NORMA: No texto, explique por que o fato viola o artigo (ex: "...o que contraria o Art. X da Lei Y, uma vez que proíbe o comércio de produtos sem registro").
5. VALIDAÇÃO: Se o relato for vago demais para ser enquadrado nas leis abaixo, retorne um erro no campo 'error' solicitando mais detalhes.

ESTRUTURA OBRIGATÓRIA:
- Abertura: "Durante inspeção realizada no estabelecimento identificado, esta Autoridade Sanitária constatou [FATO REESCRITO COM RIGOR TÉCNICO]..."
- Risco: "A situação configura risco sanitário aos consumidores e está em desacordo com as normas de saúde pública e biossegurança."
- Enquadramento: "Tal conduta caracteriza irregularidade sanitária e a inobservância das exigências legais, em violação à [CITAÇÃO ESPECÍFICA: LEI (ARTIGO, INCISO)]."
- Fechamento: Conforme o tipo (Apreensão: processo administrativo; Interdição: interdição cautelar; Outros: notificação).

CONTEXTO LEGAL DISPONÍVEL:
{{{filteredContext}}}

NOTAS DO FISCAL: "{{{caseDescription}}}"
TIPO: {{{reportType}}}`
});

export const generateIntimacaoDraftFlow = ai.defineFlow(
  {
    name: 'generateIntimacaoDraftFlow',
    inputSchema: GenerateIntimacaoDraftInputSchema,
    outputSchema: GenerateIntimacaoDraftOutputSchema,
  },
  async (input) => {
    // Validação inicial de comprimento
    if (input.caseDescription.trim().length < 12) {
      return { draftIntimacao: "", error: "RELATO MUITO CURTO: Por favor, descreva com mais detalhes o que aconteceu para que o sistema possa localizar a lei correspondente." };
    }

    if (!input.useCloudAI || !isAIReady) {
      return generateLocalHeuristicDraft(input);
    }

    try {
      const descLower = input.caseDescription.toLowerCase();
      let selectedArticles: any[] = [];
      const pref = input.lawPreference || 'todas';
      
      Object.entries(legislacaoData).forEach(([lawKey, law]: [string, any]) => {
        if (pref === 'municipal' && !lawKey.includes('MUNICIPAL')) return;
        if (pref === 'estadual' && !lawKey.includes('ESTADUAL')) return;
        law.artigos.forEach((art: any) => {
          const keywords = art.keywords?.split(' ') || [];
          if (keywords.some((k: string) => k.length > 3 && descLower.includes(k.toLowerCase()))) {
            selectedArticles.push({ ...art, lawTitle: law.titulo });
          }
        });
      });

      if (selectedArticles.length === 0) {
        return generateLocalHeuristicDraft(input);
      }

      const filteredList = selectedArticles.slice(0, 10); 
      let finalContext = filteredList.map(a => `LEI: ${a.lawTitle} | ARTIGO/INCISO: ${a.label} | TEXTO LEGAL: ${a.texto}`).join('\n');

      const response = await draftPrompt(
        {
          caseDescription: input.caseDescription,
          reportType: input.reportType,
          filteredContext: finalContext
        },
        { use: [retry({ maxRetries: 0 })] }
      );

      if (!response || !response.output) throw new Error("IA_OFFLINE");
      if (response.output.error) return response.output;
      
      const cleanDraft = response.output.draftIntimacao.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      return { ...response.output, draftIntimacao: cleanDraft, engine: 'cloud' };

    } catch (e: any) {
      return generateLocalHeuristicDraft(input);
    }
  }
);

export async function generateIntimacaoDraft(
  input: GenerateIntimacaoDraftInput
): Promise<GenerateIntimacaoDraftOutput> {
  return generateIntimacaoDraftFlow({ 
    ...input, 
    nonce: Math.random().toString(36).substring(7) 
  });
}

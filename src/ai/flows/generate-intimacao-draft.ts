'use server';

/**
 * @fileOverview Motor de Geração de Rascunho Oficial com Rigor Jurídico Máximo.
 * Implementa validação de densidade de informação e fundamentação legal obrigatória via RAG Local.
 * O texto é gerado em BLOCO ÚNICO, vinculando cada irregularidade a Artigos e Incisos exatos.
 */

import { ai, z } from '@/ai/genkit';
import { z as z4 } from 'zod/v4';
import { claude, isClaudeReady, CLAUDE_MODEL } from '@/ai/claude';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { searchLegislacao } from '@/lib/legal-search';
import { checkAndConsumeAiQuota, MONTHLY_AI_LIMIT } from '@/ai/usage-limit';
import { buscarMelhorExemplo, resolverMunicipioId } from '@/lib/draft-examples-search';
import { normalizeText } from '@/lib/text-normalize';

// zodOutputFormat exige um schema construído com 'zod/v4' — a instância `z`
// re-exportada pelo Genkit é do zod v3 e não é estruturalmente compatível.
const ClaudeDraftOutputSchema = z4.object({
  draftIntimacao: z4.string(),
  fundamentacaoSugerida: z4.string().optional(),
  artigosUtilizados: z4.array(z4.string()).optional(),
  error: z4.string().optional(),
});

const ReportTypeSchema = z.enum(['intimação', 'infração', 'apreensão', 'interdição']);
const LawPreferenceSchema = z.enum(['todas', 'municipal', 'estadual']).default('todas');

// Origem/contexto da ação — define como o texto abre (não é sempre "durante
// inspeção no estabelecimento": pode ser denúncia, monitoramento de
// propaganda, retorno de notificação anterior, etc.). Não é escolhida pelo
// fiscal em tela nenhuma — é inferida automaticamente do próprio relato (ver
// inferOrigem/prompt da Claude mais abaixo), pra não empilhar mais um menu.
export type Origem = 'rotina' | 'denuncia' | 'monitoramento' | 'reincidencia';

const GenerateIntimacaoDraftInputSchema = z.object({
  caseDescription: z.string().describe('O relato informal do fiscal.'),
  reportType: ReportTypeSchema.default('intimação'),
  lawPreference: LawPreferenceSchema.optional(),
  useCloudAI: z.boolean().default(false),
  uid: z.string().optional().default(''),
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

// Abertura do texto conforme a origem da ação — o motor local escolhe direto
// daqui; o prompt da nuvem (mais abaixo) recebe a mesma lista como exemplo,
// pra manter os dois motores consistentes entre si.
const ORIGEM_ABERTURA: Record<Origem, string> = {
  rotina: 'Durante inspeção realizada no estabelecimento identificado, esta Autoridade Sanitária constatou',
  denuncia: 'Em decorrência de denúncia recebida por esta Vigilância Sanitária, foi constatado que',
  monitoramento: 'Em ação de monitoramento de propaganda e publicidade, esta Autoridade Sanitária constatou que',
  reincidencia: 'Em verificação de cumprimento de notificação sanitária anterior, esta Autoridade Sanitária constatou que',
};

// Detecta a origem a partir do próprio relato do fiscal (sem exigir seleção
// manual em tela) — usado só pelo motor local, que não tem compreensão de
// linguagem própria; a versão na nuvem (Claude) infere isso sozinha, direto
// das notas, sem precisar desta lista de palavras-chave.
function inferOrigem(descLower: string): Origem {
  if (/den[uú]ncia|reclama[cç][aã]o|denunciad/.test(descLower)) return 'denuncia';
  if (/r[aá]dio|propaganda|publicidade|an[uú]ncio|outdoor|\btv\b|comercial veiculad/.test(descLower)) return 'monitoramento';
  if (/reincid|j[aá] notificad|segunda visita|nova verifica[cç][aã]o|retorno d[ao] (fiscaliza|inspe)/.test(descLower)) return 'reincidencia';
  return 'rotina';
}

/**
 * MOTOR DE INTELIGÊNCIA NATIVA (OFFLINE)
 * Realiza busca granular e valida se há dados suficientes para lavratura.
 */
function generateLocalHeuristicDraft(input: GenerateIntimacaoDraftInput, municipioId?: string | null): GenerateIntimacaoDraftOutput {
  const rawDesc = input.caseDescription.trim();
  const type = input.reportType;

  // 1. VALIDAÇÃO DE DENSIDADE (SEGURANÇA JURÍDICA)
  if (rawDesc.length < 12) {
    return {
      draftIntimacao: "",
      error: "RELATO INSUFICIENTE: Forneça mais detalhes sobre a irregularidade (ex: descreva o que está vencido ou qual a falha de higiene) para garantir o enquadramento legal correto."
    };
  }

  // 2. BUSCA GRANULAR DE LEGISLAÇÃO (MiniSearch: ranking por relevância, prefixo e tolerância a erros de digitação)
  const pref = input.lawPreference || 'todas';
  const descLower = rawDesc.toLowerCase();
  // Só para as checagens de palavra-chave abaixo (passo 4) — sem acento,
  // porque "responsável"/"eletrônico" (grafia correta que qualquer fiscal
  // digita) nunca batiam com os gatilhos 'responsavel'/'eletronico' sem
  // acento. `descLower` (com acento) continua sendo o que entra no texto
  // final do documento — não pode virar "nao"/"esta" no rascunho gerado.
  const descNormalized = normalizeText(rawDesc);
  const matchedArticles = searchLegislacao(rawDesc, { pref, municipioId: municipioId || undefined });

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
  if (descNormalized.includes('vape') || descNormalized.includes('cigarro eletronico')) {
    factAnalysis = "a existência de cigarro eletrônico, produto cuja comercialização é proibida no Brasil por não possuir registro na ANVISA";
  } else if (descNormalized.includes('vencid') || descNormalized.includes('validade')) {
    factAnalysis = "a exposição de produtos com prazo de validade expirado para a entrega ao consumo";
  } else if (descNormalized.includes('higiene') || descNormalized.includes('sujeira') || descNormalized.includes('sujidade')) {
    factAnalysis = "que o estabelecimento apresenta condições higiênico-sanitárias insatisfatórias, com presença de sujidades acumuladas";
  } else if (descNormalized.includes('sem rt') || descNormalized.includes('responsavel')) {
    factAnalysis = "que o estabelecimento encontra-se em funcionamento sem a assistência de um responsável técnico (RT) habilitado";
  } else {
    factAnalysis = `que ${descLower.charAt(0).toLowerCase() + descLower.slice(1).replace(/\.$/, '')}`;
  }

  // 5. MONTAGEM DO BLOCO ÚNICO
  const abertura = ORIGEM_ABERTURA[inferOrigem(descLower)];
  const opening = `${abertura} ${factAnalysis}. `;
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

const CLAUDE_SYSTEM_PROMPT = `Você é um Auditor Jurídico Sênior da Vigilância Sanitária.
Sua missão é transformar notas de campo em um documento técnico de alto rigor, na NORMA CULTA e em BLOCO ÚNICO.

REGRAS CRÍTICAS DE FUNDAMENTAÇÃO:
1. BLOCO ÚNICO: Proibido usar quebras de linha ou parágrafos no campo draftIntimacao.
2. RIGOR LEGAL ABSOLUTO: Você deve apontar com exatidão a lei, o artigo e o inciso. Use EXCLUSIVAMENTE a legislação fornecida no contexto abaixo — nunca invente ou presuma artigos fora dele.
3. PROIBIDO GENERALIZAR: Nunca use "Normas Gerais" ou "Legislação Vigente". Escreva: NOME DA LEI (ARTIGO X, INCISO Y).
4. VÍNCULO FATO-NORMA: No texto, explique por que o fato viola o artigo (ex: "...o que contraria o Art. X da Lei Y, uma vez que proíbe o comércio de produtos sem registro").
5. VALIDAÇÃO: Se o relato for vago demais para ser enquadrado na legislação fornecida, retorne draftIntimacao como string vazia e preencha o campo error solicitando mais detalhes.

ESTRUTURA OBRIGATÓRIA DO draftIntimacao:
- Abertura: infira a origem da ação diretamente das NOTAS DO FISCAL (nenhuma tela pede isso ao fiscal — a origem não vem pronta, você deduz do próprio relato) e adapte a frase inicial de acordo, em vez de usar sempre a mesma frase de inspeção:
  - Relato descreve visita/inspeção comum ao local: "Durante inspeção realizada no estabelecimento identificado, esta Autoridade Sanitária constatou [FATO]..."
  - Relato menciona denúncia/reclamação recebida: "Em decorrência de denúncia recebida por esta Vigilância Sanitária, foi constatado que [FATO]..."
  - Relato é sobre propaganda/publicidade veiculada (rádio, TV, anúncio, outdoor): "Em ação de monitoramento de propaganda e publicidade, esta Autoridade Sanitária constatou que [FATO]..." — aqui o foco é a propaganda/veiculação em si, não "o estabelecimento".
  - Relato menciona retorno/reincidência de uma notificação anterior: "Em verificação de cumprimento de notificação sanitária anterior, esta Autoridade Sanitária constatou que [FATO]..."
  - Nenhum desses cenários bater: componha uma abertura equivalente e coerente com o contexto descrito, sem forçar a frase de inspeção padrão.
- Risco: "A situação configura risco sanitário aos consumidores e está em desacordo com as normas de saúde pública e biossegurança."
- Enquadramento: "Tal conduta caracteriza irregularidade sanitária e a inobservância das exigências legais, em violação à [CITAÇÃO ESPECÍFICA: LEI (ARTIGO, INCISO)]."
- Fechamento: Conforme o tipo (Apreensão: processo administrativo; Interdição: interdição cautelar; Outros: notificação).

Preencha fundamentacaoSugerida com a citação formatada (ex: "LEI ESTADUAL Nº 13.331/2001 (ART. 63, INCISO XI)") e artigosUtilizados com os IDs exatos dos artigos do contexto que você efetivamente citou.`;

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

    // Resolvido uma única vez e reaproveitado nas duas buscas (legislação
    // municipal e exemplo anterior) — nenhum artigo de outro município deve
    // aparecer na fundamentação de um fiscal que não pertence a ele.
    const municipioId = await resolverMunicipioId(input.uid);

    if (!input.useCloudAI || !isClaudeReady) {
      return generateLocalHeuristicDraft(input, municipioId);
    }

    const quota = await checkAndConsumeAiQuota(input.uid);
    if (!quota.ok) {
      return {
        draftIntimacao: "",
        error: `LIMITE MENSAL DE IA ATINGIDO (${MONTHLY_AI_LIMIT}/mês). Continue no modo local ou aguarde a virada do mês.`,
      };
    }

    try {
      const pref = input.lawPreference || 'todas';
      const selectedArticles = searchLegislacao(input.caseDescription, { pref, limit: 10, municipioId: municipioId || undefined });

      if (selectedArticles.length === 0) {
        return generateLocalHeuristicDraft(input, municipioId);
      }

      const finalContext = selectedArticles.map(a => `ID: ${a.id} | LEI: ${a.lawTitle} | ARTIGO/INCISO: ${a.label} | TEXTO LEGAL: ${a.texto}${a.pena ? ` | PENA APLICÁVEL: ${a.pena}` : ''}`).join('\n');

      // Aprendizado a partir do uso: busca o rascunho anterior mais parecido
      // que o próprio fiscal já exportou (aprovou) antes, pra usar como
      // referência de estilo — sem exemplos ainda cadastrados, isso não
      // muda em nada o comportamento atual.
      const melhorExemplo = await buscarMelhorExemplo(input.caseDescription, municipioId);
      const exemploBlock = melhorExemplo
        ? `\n\nEXEMPLO DE RASCUNHO ANTERIOR JÁ APROVADO PELO FISCAL (use só como referência de estilo, tom e nível de detalhe — NUNCA copie fatos, nomes ou números deste exemplo; gere um texto novo, específico pro caso atual):\n"${melhorExemplo.draftGerado}"`
        : '';

      const response = await claude.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `CONTEXTO LEGAL DISPONÍVEL:\n${finalContext}\n\nNOTAS DO FISCAL: "${input.caseDescription}"\nTIPO: ${input.reportType}${exemploBlock}`,
          },
        ],
        output_config: { format: zodOutputFormat(ClaudeDraftOutputSchema) },
      });

      const output = response.parsed_output;
      if (!output) throw new Error("CLAUDE_PARSE_FAILED");
      if (output.error) return output;

      const cleanDraft = output.draftIntimacao.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      // A Claude pode devolver draftIntimacao vazio sem preencher `error`
      // (contrariando a própria instrução do prompt) — sem essa checagem, o
      // fiscal via um card de "rascunho gerado" completamente em branco, sem
      // nenhuma explicação do que deu errado.
      if (!cleanDraft) {
        return {
          draftIntimacao: "",
          error: "RELATO INSUFICIENTE PARA A IA EM NUVEM: detalhe melhor a irregularidade e tente novamente.",
        };
      }
      return { ...output, draftIntimacao: cleanDraft, engine: 'cloud' as const };

    } catch (e: any) {
      // Sem log nenhum aqui, qualquer instabilidade real da Claude (rede,
      // parse, cota da própria Anthropic) ficava impossível de diagnosticar
      // depois — o fiscal só via o resultado local, sem pista de que a nuvem
      // tinha falhado por baixo.
      console.error("Falha na geração via Claude — usando motor local como fallback:", e);
      return generateLocalHeuristicDraft(input, municipioId);
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

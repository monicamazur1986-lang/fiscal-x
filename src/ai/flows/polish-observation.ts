'use server';

/**
 * @fileOverview Revisor de observações de campo focado em terminologia técnica da Vigilância Sanitária.
 * Usa Claude diretamente (mesmo padrão de generate-intimacao-draft.ts) — o
 * fluxo anterior usava Genkit+Gemini, cuja chave nunca foi configurada neste
 * projeto (só a do Claude está), então a revisão sempre falhava em silêncio.
 */

import { z as z4 } from 'zod/v4';
import { claude, isClaudeReady, CLAUDE_MODEL } from '@/ai/claude';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { checkAndConsumeAiQuota, MONTHLY_AI_LIMIT } from '@/ai/usage-limit';

export interface PolishObservationInput {
  text: string;
  uid?: string;
}

export interface PolishObservationOutput {
  polishedText: string;
  error?: string;
}

const PolishOutputSchema = z4.object({
  polishedText: z4.string(),
});

const POLISH_SYSTEM_PROMPT = `Você é um Revisor Sênior de Relatórios de Vigilância Sanitária.
Sua missão é realizar correções gramaticais e ajustes terminológicos sem alterar a essência do fato relatado.

INSTRUÇÕES CRÍTICAS:
1. TERMINOLOGIA TÉCNICA: Substitua termos coloquiais por equivalentes técnicos (ex: use "sujidade" em vez de "sujeira", "acondicionamento" em vez de "guardado", "presença de vetores" em vez de "ratos/baratas").
2. GRAMÁTICA: Corrija concordância, ortografia, pontuação e acentuação de forma rigorosa.
3. ESTILO: Mantenha um tom impessoal, formal e direto. Remova adjetivos emocionais (ex: "muito feio", "péssimo").
4. FLUIDEZ: Garanta que o texto possa ser lido como um relato oficial contínuo.
5. CAPITALIZAÇÃO: Escreva em letra normal (minúscula), com maiúscula apenas no início de frases, em nomes próprios e em siglas (ex.: CNPJ, ANVISA, RDC) — nunca em caixa alta.

Responda só com o texto revisado, sem comentários adicionais.`;

export async function polishObservation(input: PolishObservationInput): Promise<PolishObservationOutput> {
  const text = (input.text || '').trim();
  if (!text) return { polishedText: input.text };

  if (!isClaudeReady) {
    return { polishedText: input.text, error: 'IA não configurada. O texto original foi mantido.' };
  }

  const quota = await checkAndConsumeAiQuota(input.uid || '');
  if (!quota.ok) {
    return {
      polishedText: input.text,
      error: `LIMITE MENSAL DE IA ATINGIDO (${MONTHLY_AI_LIMIT}/mês). O texto original foi mantido.`,
    };
  }

  try {
    const response = await claude.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: POLISH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `TEXTO PARA REVISÃO: "${text}"` }],
      output_config: { format: zodOutputFormat(PolishOutputSchema) },
    });

    const output = response.parsed_output;
    if (!output) throw new Error('CLAUDE_PARSE_FAILED');

    const finalResult = output.polishedText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return { polishedText: finalResult };
  } catch (e: any) {
    console.error('Erro IA Polimento (Claude):', e);
    return {
      polishedText: input.text,
      error: 'Instabilidade na conexão com a IA. O texto original foi mantido.',
    };
  }
}

'use server';

/**
 * @fileOverview Revisor de observações de campo em lote — substitui o antigo
 * polish-observation.ts (1 chamada de IA por item, disparada a qualquer
 * momento durante a vistoria) por 1 única chamada que revisa TODAS as
 * observações do relatório de uma vez, disparada só na tela de revisão,
 * depois que o fiscal já terminou de preencher tudo. Reduz o número de
 * chamadas pagas de N (uma por item) pra 1 por vistoria.
 */

import { z as z4 } from 'zod/v4';
import { claude, isClaudeReady, CLAUDE_MODEL } from '@/ai/claude';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { checkAndConsumeAiQuota, MONTHLY_AI_LIMIT } from '@/ai/usage-limit';

export interface PolishObservationsBatchInput {
  items: { id: string; text: string }[];
  uid?: string;
}

export interface PolishObservationsBatchOutput {
  items: { id: string; polishedText: string }[];
  error?: string;
}

const PolishBatchOutputSchema = z4.object({
  items: z4.array(z4.object({
    id: z4.string(),
    polishedText: z4.string(),
  })),
});

const BATCH_POLISH_SYSTEM_PROMPT = `Você é um Revisor Sênior de Relatórios de Vigilância Sanitária.
Sua missão é realizar correções gramaticais e ajustes terminológicos em VÁRIAS observações de campo de uma só vez, sem alterar a essência do fato relatado em cada uma.

INSTRUÇÕES CRÍTICAS:
1. CADA OBSERVAÇÃO É INDEPENDENTE: revise cada item isoladamente, pelo seu próprio ID — nunca misture ou combine o conteúdo de uma observação com o de outra.
2. TERMINOLOGIA TÉCNICA: substitua termos coloquiais por equivalentes técnicos (ex: use "sujidade" em vez de "sujeira", "acondicionamento" em vez de "guardado", "presença de vetores" em vez de "ratos/baratas").
3. GRAMÁTICA: corrija concordância, ortografia, pontuação e acentuação de forma rigorosa.
4. ESTILO: mantenha um tom impessoal, formal e direto. Remova adjetivos emocionais (ex: "muito feio", "péssimo").
5. CAPITALIZAÇÃO: escreva em letra normal (minúscula), com maiúscula apenas no início de frases, em nomes próprios e em siglas (ex.: CNPJ, ANVISA, RDC) — nunca em caixa alta.
6. RESPOSTA COMPLETA: devolva exatamente os mesmos IDs recebidos, na mesma quantidade, cada um com seu texto revisado.

Responda só com a lista revisada, sem comentários adicionais.`;

export async function polishObservationsBatch(input: PolishObservationsBatchInput): Promise<PolishObservationsBatchOutput> {
  const items = (input.items || []).filter((i) => (i.text || '').trim());
  if (items.length === 0) return { items: [] };

  if (!isClaudeReady) {
    return { items: items.map((i) => ({ id: i.id, polishedText: i.text })), error: 'IA não configurada. Os textos originais foram mantidos.' };
  }

  const quota = await checkAndConsumeAiQuota(input.uid || '');
  if (!quota.ok) {
    return {
      items: items.map((i) => ({ id: i.id, polishedText: i.text })),
      error: `LIMITE MENSAL DE IA ATINGIDO (${MONTHLY_AI_LIMIT}/mês). Os textos originais foram mantidos.`,
    };
  }

  try {
    const listaFormatada = items.map((i) => `ID: ${i.id}\nTEXTO: "${i.text}"`).join('\n\n');
    const response = await claude.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: BATCH_POLISH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `OBSERVAÇÕES PARA REVISÃO (${items.length} no total):\n\n${listaFormatada}` }],
      output_config: { format: zodOutputFormat(PolishBatchOutputSchema) },
    });

    const output = response.parsed_output;
    if (!output) throw new Error('CLAUDE_PARSE_FAILED');

    // Se a Claude "esquecer" algum ID na resposta, mantém o texto original
    // daquele item em vez de simplesmente descartá-lo do relatório.
    const byId = new Map(output.items.map((i) => [i.id, i.polishedText]));
    return {
      items: items.map((i) => ({
        id: i.id,
        polishedText: (byId.get(i.id) ?? i.text).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(),
      })),
    };
  } catch (e: any) {
    console.error('Erro IA Revisão em Lote (Claude):', e);
    return {
      items: items.map((i) => ({ id: i.id, polishedText: i.text })),
      error: 'Instabilidade na conexão com a IA. Os textos originais foram mantidos.',
    };
  }
}

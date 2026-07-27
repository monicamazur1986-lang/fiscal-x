'use server';

/**
 * @fileOverview Revisor de texto para as correspondências oficiais do DOCFACIL
 * (ofício, memorando, circular) — mesmo padrão de polish-observation.ts, mas
 * focado em redação oficial formal em vez de terminologia de vistoria, e
 * preservando a formatação HTML já aplicada pelo fiscal no editor.
 */

import { z as z4 } from 'zod/v4';
import { claude, isClaudeReady, CLAUDE_MODEL } from '@/ai/claude';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { checkAndConsumeAiQuota, MONTHLY_AI_LIMIT } from '@/ai/usage-limit';

export interface PolishDocfacilTextInput {
  html: string;
  uid?: string;
}

export interface PolishDocfacilTextOutput {
  polishedHtml: string;
  error?: string;
}

const PolishOutputSchema = z4.object({
  polishedHtml: z4.string(),
});

const POLISH_SYSTEM_PROMPT = `Você é um Revisor Sênior de Redação Oficial da Administração Pública.
Sua missão é corrigir e aprimorar o texto de um ofício/memorando/circular sem alterar seu sentido, seus dados ou sua formatação.

INSTRUÇÕES CRÍTICAS:
1. FORMATAÇÃO HTML INTOCÁVEL: o texto vem em HTML. Nunca adicione, remova ou altere nenhuma tag (<p>, <strong>, <ul>, <li> etc.) — corrija só o texto que fica DENTRO das tags.
2. GRAMÁTICA E ORTOGRAFIA: corrija concordância, ortografia, pontuação e acentuação de forma rigorosa.
3. REDAÇÃO OFICIAL: ajuste o tom para o padrão formal/impessoal da correspondência oficial, sem inventar conteúdo novo.
4. NUNCA ALTERE DADOS: números de processo, datas, nomes, CNPJs, valores e prazos citados no texto devem permanecer exatamente como estão.
5. Se o texto já estiver correto, devolva-o sem alterações.

Responda só com o HTML revisado, sem comentários adicionais e sem blocos de código markdown.`;

export async function polishDocfacilText(input: PolishDocfacilTextInput): Promise<PolishDocfacilTextOutput> {
  const html = (input.html || '').trim();
  if (!html) return { polishedHtml: input.html };

  if (!isClaudeReady) {
    return { polishedHtml: input.html, error: 'IA não configurada. O texto original foi mantido.' };
  }

  const quota = await checkAndConsumeAiQuota(input.uid || '');
  if (!quota.ok) {
    return {
      polishedHtml: input.html,
      error: `LIMITE MENSAL DE IA ATINGIDO (${MONTHLY_AI_LIMIT}/mês). O texto original foi mantido.`,
    };
  }

  try {
    const response = await claude.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: POLISH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `HTML PARA REVISÃO:\n${html}` }],
      output_config: { format: zodOutputFormat(PolishOutputSchema) },
    });

    const output = response.parsed_output;
    if (!output) throw new Error('CLAUDE_PARSE_FAILED');

    return { polishedHtml: output.polishedHtml.trim() };
  } catch (e: any) {
    console.error('Erro IA Revisão Docfacil (Claude):', e);
    return {
      polishedHtml: input.html,
      error: 'Instabilidade na conexão com a IA. O texto original foi mantido.',
    };
  }
}

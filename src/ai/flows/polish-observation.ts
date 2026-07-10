'use server';

/**
 * @fileOverview Revisor de observações de campo focado em terminologia técnica da Vigilância Sanitária.
 */

import { ai, z, isAIReady } from '@/ai/genkit';
import { retry } from '@genkit-ai/middleware';

const PolishObservationInputSchema = z.object({
  text: z.string().describe('O texto original do fiscal.'),
});
export type PolishObservationInput = z.infer<typeof PolishObservationInputSchema>;

const PolishObservationOutputSchema = z.object({
  polishedText: z.string().describe('O texto refinado em linguagem técnica.'),
  error: z.string().optional(),
});
export type PolishObservationOutput = z.infer<typeof PolishObservationOutputSchema>;

const polishPrompt = ai.definePrompt({
  name: 'polishObservationPrompt',
  input: { schema: PolishObservationInputSchema },
  output: { schema: PolishObservationOutputSchema },
  config: {
    temperature: 0.1, // Baixa temperatura para manter a fidelidade aos fatos
  },
  prompt: `Você é um Revisor Sênior de Relatórios de Vigilância Sanitária.
Sua missão é realizar correções gramaticais e ajustes terminológicos sem alterar a essência do fato relatado.

INSTRUÇÕES CRÍTICAS:
1. TERMINOLOGIA TÉCNICA: Substitua termos coloquiais por equivalentes técnicos (ex: use "sujidade" em vez de "sujeira", "acondicionamento" em vez de "guardado", "presença de vetores" em vez de "ratos/baratas").
2. GRAMÁTICA: Corrija concordância, ortografia, pontuação e acentuação de forma rigorosa.
3. ESTILO: Mantenha um tom impessoal, formal e direto. Remova adjetivos emocionais (ex: "muito feio", "péssimo").
4. FLUIDEZ: Garanta que o texto possa ser lido como um relato oficial contínuo.
5. SAÍDA: O texto final deve estar preferencialmente em CAIXA ALTA se o input original estiver em caixa alta.

TEXTO PARA REVISÃO: "{{{text}}}"`,
});

const polishFlow = ai.defineFlow(
  {
    name: 'polishObservationFlow',
    inputSchema: PolishObservationInputSchema,
    outputSchema: PolishObservationOutputSchema,
  },
  async (input) => {
    if (!isAIReady) {
      return {
        polishedText: input.text, // Return original text as-is
        error: 'IA não configurada. O texto original foi mantido.'
      };
    }

    try {
      const response = await polishPrompt(input, {
        use: [retry({ maxRetries: 2, initialDelayMs: 2000 })]
      });

      if (!response || !response.output) throw new Error("IA_NO_RESPONSE");
      
      // Limpeza final para garantir que não haja quebras de linha indesejadas
      const finalResult = response.output.polishedText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      return { polishedText: finalResult };
      
    } catch (e: any) {
      console.error("Erro IA Polimento:", e);
      return { 
        polishedText: input.text, // Return original text as-is
        error: 'Instabilidade na conexão com a IA. O texto original foi mantido.'
      };
    }
  }
);

export async function polishObservation(
  input: PolishObservationInput
): Promise<PolishObservationOutput> {
  return polishFlow(input);
}

import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { retry } from '@genkit-ai/middleware';

/**
 * @fileOverview Configuração central do Genkit v1.x com resiliência otimizada.
 * Sistema preparado para lidar com picos de demanda do Tier Free.
 */

const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: apiKey,
    }),
    /**
     * Registro do middleware de retentativa.
     * Necessário para lidar com erros transientess como o 503 (High Demand).
     */
    retry.plugin(),
  ],
  /**
   * Utilizando o modelo flash estável para maior disponibilidade no plano gratuito.
   */
  model: googleAI.model('gemini-flash-latest'), 
});

/**
 * Detecta se a IA está pronta para processar requisições.
 */
export const isAIReady = Boolean(apiKey && apiKey.length > 5);

export { z };

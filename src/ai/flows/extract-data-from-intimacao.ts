'use server';

/**
 * @fileOverview Extração de dados com suporte a retentativas e detecção de cota excedida.
 */

import { ai, z, isAIReady } from '@/ai/genkit';
import { retry } from '@genkit-ai/middleware';
import { checkAndConsumeAiQuota, MONTHLY_AI_LIMIT } from '@/ai/usage-limit';

const ExtractDataFromIntimacaoInputSchema = z.object({
  intimacaoFormDataUri: z.string().describe(
    "Uma foto de um documento de fiscalização, como uma data URI (Base64)."
  ),
  uid: z.string().optional().default(''),
});
export type ExtractDataFromIntimacaoInput = z.infer<typeof ExtractDataFromIntimacaoInputSchema>;

const ExtractDataFromIntimacaoOutputSchema = z.object({
  extractedData: z.object({
    autor: z.string().optional().describe("Razão Social ou Nome Fantasia"),
    cnpj: z.string().optional().describe("CNPJ detectado"),
    municipio: z.string().optional().describe("Cidade citada"),
    teor: z.string().optional().describe("Relato das irregularidades"),
    endereco: z.string().optional().describe("Endereço completo"),
    bairro: z.string().optional().describe("Bairro detectado"),
    responsavel_legal: z.string().optional().describe("Nome do responsável"),
  }).describe("Dados extraídos com sucesso"),
  error: z.string().optional().describe("Mensagem de erro caso o processamento falhe"),
});
export type ExtractDataFromIntimacaoOutput = z.infer<typeof ExtractDataFromIntimacaoOutputSchema>;

const extractionPrompt = ai.definePrompt({
  name: 'extractDataFromIntimacaoPrompt',
  input: { schema: ExtractDataFromIntimacaoInputSchema },
  output: { schema: ExtractDataFromIntimacaoOutputSchema },
  config: {
    temperature: 0.1,
  },
  prompt: `Você é um Especialista em Digitalização da Vigilância Sanitária.
Sua tarefa é analisar a imagem de um documento oficial e extrair os dados solicitados.

INSTRUÇÕES:
- Se houver escrita manual, decifre o melhor possível.
- No campo 'teor', capture integralmente o relato dos fatos.
- Converta nomes de estabelecimentos para CAIXA ALTA.

Imagem do Documento: {{media url=intimacaoFormDataUri}}`,
});

const extractDataFromIntimacaoFlow = ai.defineFlow(
  {
    name: 'extractDataFromIntimacaoFlow',
    inputSchema: ExtractDataFromIntimacaoInputSchema,
    outputSchema: ExtractDataFromIntimacaoOutputSchema,
  },
  async (input) => {
    if (!isAIReady) {
      return {
        extractedData: {},
        error: "CONFIGURAÇÃO PENDENTE: Verifique a chave API no servidor."
      };
    }

    const quota = await checkAndConsumeAiQuota(input.uid);
    if (!quota.ok) {
      return {
        extractedData: {},
        error: `LIMITE MENSAL DE IA ATINGIDO (${MONTHLY_AI_LIMIT}/mês).`,
      };
    }

    try {
      const response = await extractionPrompt(input, {
        use: [retry({ maxRetries: 2, initialDelayMs: 3000 })]
      });
      if (!response || !response.output) throw new Error("Falha no processamento visual.");
      return response.output;
    } catch (e: any) {
      console.error("Erro Genkit Extração:", e);
      const errMsg = e?.message || "";
      
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        return {
          extractedData: {},
          error: "LIMITE DE VISÃO EXCEDIDO: O processamento de imagens é pesado para a cota gratuita. Aguarde 1 minuto para o próximo scanner."
        };
      }

      if (errMsg.includes('503') || errMsg.includes('high demand')) {
        return {
          extractedData: {},
          error: "SISTEMA SOBRECARREGADO: O Google está com alta demanda de processamento de imagens. Tente novamente em alguns segundos."
        };
      }
      
      return {
        extractedData: {},
        error: `FALHA NA EXTRAÇÃO: O serviço está instável ou a imagem está ilegível.`
      };
    }
  }
);

export async function extractDataFromIntimacao(
  input: ExtractDataFromIntimacaoInput
): Promise<ExtractDataFromIntimacaoOutput> {
  return extractDataFromIntimacaoFlow(input);
}

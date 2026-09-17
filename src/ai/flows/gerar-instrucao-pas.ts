'use server';

/**
 * @fileOverview Redação assistida das peças de conteúdo do Processo
 * Administrativo Sanitário: o Relatório Técnico de Instrução e o rascunho do
 * Julgamento em 1ª instância.
 *
 * O QUE ESTE FLOW LÊ — e o que deliberadamente não lê
 *
 * Ele compõe a partir dos dados ESTRUTURADOS que o sistema já tem: o Auto de
 * Infração, os itens não conformes do relatório de inspeção que o originou, o
 * enquadramento legal, as datas, a tempestividade da defesa e a lista de peças
 * já lavradas. Não abre os PDFs juntados aos autos.
 *
 * Isso é escolha, não limitação de pressa: um relatório que afirma o que consta
 * de um laudo que o modelo leu por cima é pior do que um relatório que não
 * menciona o laudo. Quando a leitura de anexos entrar, ela precisa vir com
 * extração de texto confiável — e ainda assim citando, nunca resumindo de
 * memória.
 *
 * NADA AQUI DECIDE NADA. A saída é rascunho para a autoridade revisar, editar
 * e assinar no DocfacilEditor da tela de revisão. O julgamento é ato da
 * autoridade sanitária; o modelo só adianta a redação.
 */

import { ai, z } from '@/ai/genkit';
import { z as z4 } from 'zod/v4';
import { claude, isClaudeReady, CLAUDE_MODEL } from '@/ai/claude';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { checkAndConsumeAiQuota, MONTHLY_AI_LIMIT } from '@/ai/usage-limit';

// zodOutputFormat exige schema de 'zod/v4' — o `z` do Genkit é v3 e não é
// estruturalmente compatível (mesma observação de generate-intimacao-draft).
const SaidaClaudeSchema = z4.object({
  relatorioInstrucaoHtml: z4.string(),
  julgamentoFundamentacaoHtml: z4.string().optional(),
  julgamentoDecisaoHtml: z4.string().optional(),
  error: z4.string().optional(),
});

const ItemNaoConformeSchema = z.object({
  requisito: z.string(),
  observacao: z.string().optional(),
  criticidade: z.string().optional(),
});

const GerarInstrucaoPasInputSchema = z.object({
  uid: z.string(),
  /** 'instrucao' = só o relatório técnico. 'julgamento' = relatório + rascunho
   *  da decisão, para quando a autoridade já vai julgar. */
  etapa: z.enum(['instrucao', 'julgamento']).default('instrucao'),
  numeroProcesso: z.string(),
  estabelecimento: z.string(),
  cnpj: z.string().optional(),
  endereco: z.string().optional(),
  /** Relato dos fatos do próprio Auto de Infração. */
  teorAutoInfracao: z.string().optional(),
  legislacaoBase: z.string().optional(),
  /**
   * Termo de Apreensão/Interdição lavrado junto com o auto. O relato do que
   * foi apreendido ou interditado costuma estar aqui, não no auto — sem
   * isto, o relatório descrevia a infração sem dizer o que foi recolhido.
   */
  termoVinculado: z.object({
    tipo: z.string(),
    numero: z.string().optional(),
    teor: z.string().optional(),
    itens: z.array(z.string()).default([]),
  }).optional(),
  /** Histórico de infrações do estabelecimento, digitado pelo fiscal. */
  antecedentes: z.string().optional(),
  /** Quantas fotos/provas acompanham o relatório — a IA cita a existência,
   *  nunca descreve o que não viu. */
  quantidadeProvas: z.number().default(0),
  dataCiencia: z.string().optional(),
  /** Itens reprovados no roteiro de inspeção que originou a autuação. */
  naoConformidades: z.array(ItemNaoConformeSchema).default([]),
  /** Conclusão que o fiscal escreveu no relatório de inspeção. */
  conclusaoInspecao: z.string().optional(),
  defesa: z.object({
    apresentada: z.boolean(),
    tempestividade: z.string().optional(),
    recebidaEm: z.string().optional(),
  }).optional(),
  /** Títulos das peças já nos autos, na ordem — dá ao modelo o histórico
   *  processual sem precisar abrir os documentos. */
  pecas: z.array(z.string()).default([]),
  /** Anotações que o fiscal digitou na tela, quando houver. */
  notasDoFiscal: z.string().optional(),
});

const GerarInstrucaoPasOutputSchema = z.object({
  relatorioInstrucaoHtml: z.string(),
  julgamentoFundamentacaoHtml: z.string().optional(),
  julgamentoDecisaoHtml: z.string().optional(),
  error: z.string().optional(),
});

export type GerarInstrucaoPasInput = z.input<typeof GerarInstrucaoPasInputSchema>;
export type GerarInstrucaoPasOutput = z.infer<typeof GerarInstrucaoPasOutputSchema>;

const SYSTEM_PROMPT = `Você redige peças de Processo Administrativo Sanitário para a Vigilância Sanitária municipal do Paraná, seguindo o Manual de Apoio Teórico-Prático da SESA-PR (PAS, Manual 012/2023).

REGRA QUE SE SOBREPÕE A TODAS AS OUTRAS: você só pode afirmar o que consta dos dados fornecidos. Não invente fato, data, número de documento, nome, laudo, resultado de análise nem artigo de lei. Se uma informação necessária não estiver no contexto, escreva a lacuna de forma explícita entre colchetes (ex.: "[indicar a data da reinspeção]") para a autoridade preencher. Um campo em branco sinalizado é correto; um dado inventado contamina o processo inteiro e pode anulá-lo.

SOBRE OS ARTIGOS DE LEI: cite apenas os que vierem escritos no contexto, exatamente como estiverem. Não complete número de artigo, inciso ou parágrafo por semelhança com o que você conhece da legislação sanitária.

RELATÓRIO TÉCNICO DE INSTRUÇÃO — estrutura fixa, em HTML simples (<p>, <strong>, <br>, <ul>, <li>; nada de <html>, <head>, <style> ou classes):
<p><strong>1. DOS FATOS</strong></p> — o que foi constatado na inspeção, de forma impessoal e cronológica.
<p><strong>2. DOS ANTECEDENTES</strong></p> — só se houver histórico no contexto; caso contrário, omita a seção inteira.
<p><strong>3. DAS PROVAS</strong></p> — o que instrui os autos, pelas peças listadas. Descreva o que cada peça é, sem afirmar o conteúdo de documentos que não estão no contexto.
<p><strong>4. DO ENQUADRAMENTO</strong></p> — a irregularidade e o dispositivo citado no contexto.
<p><strong>5. DA CONCLUSÃO</strong></p> — o que a instrução demonstrou, encaminhando à autoridade julgadora. NÃO julgue aqui: o relatório instrui, não decide.

RASCUNHO DO JULGAMENTO (só quando pedido):
julgamentoFundamentacaoHtml — análise dos fatos, das provas e do enquadramento, enfrentando a defesa se ela foi apresentada; se foi intempestiva, diga isso e o efeito.
julgamentoDecisaoHtml — procedência ou improcedência e a sanção, quando cabível. A dosimetria depende de circunstâncias que só a autoridade conhece: proponha a penalidade deixando entre colchetes o que exigir juízo dela (ex.: "[fixar o valor da multa entre os limites legais]"). Nunca arbitre valor de multa.

Português formal de peça processual, terceira pessoa, frases curtas. Sem saudação, sem cabeçalho, sem assinatura — a tela cuida disso.`;

function montarContexto(input: z.infer<typeof GerarInstrucaoPasInputSchema>): string {
  const linhas: string[] = [];
  linhas.push(`PROCESSO: Auto de Infração nº ${input.numeroProcesso}`);
  linhas.push(`ESTABELECIMENTO: ${input.estabelecimento}${input.cnpj ? ` — CNPJ ${input.cnpj}` : ''}`);
  if (input.endereco) linhas.push(`ENDEREÇO: ${input.endereco}`);
  if (input.dataCiencia) linhas.push(`CIÊNCIA DO AUTO DE INFRAÇÃO: ${input.dataCiencia}`);
  if (input.legislacaoBase) linhas.push(`ENQUADRAMENTO LEGAL INDICADO NO AUTO: ${input.legislacaoBase}`);

  if (input.teorAutoInfracao?.trim()) {
    linhas.push(`\nRELATO DO AUTO DE INFRAÇÃO:\n${input.teorAutoInfracao.trim()}`);
  }

  if (input.naoConformidades.length > 0) {
    linhas.push(`\nITENS NÃO CONFORMES NO RELATÓRIO DE INSPEÇÃO (${input.naoConformidades.length}):`);
    input.naoConformidades.forEach((item, i) => {
      const crit = item.criticidade ? ` [${item.criticidade}]` : '';
      const obs = item.observacao?.trim() ? ` — observação do fiscal: ${item.observacao.trim()}` : '';
      linhas.push(`${i + 1}.${crit} ${item.requisito}${obs}`);
    });
  } else {
    linhas.push('\nITENS NÃO CONFORMES: nenhum relatório de inspeção vinculado a esta autuação.');
  }

  if (input.termoVinculado) {
    const t = input.termoVinculado;
    linhas.push(`\nTERMO VINCULADO: ${t.tipo}${t.numero ? ` nº ${t.numero}` : ''}`);
    if (t.teor?.trim()) linhas.push(`TEOR DO TERMO:\n${t.teor.trim()}`);
    if (t.itens.length > 0) {
      linhas.push(`BENS ALCANÇADOS PELA MEDIDA (${t.itens.length}):`);
      t.itens.forEach((item, i) => linhas.push(`${i + 1}. ${item}`));
    }
  }

  if (input.antecedentes?.trim()) {
    linhas.push(`\nANTECEDENTES INFORMADOS PELO FISCAL:\n${input.antecedentes.trim()}`);
  } else {
    linhas.push('\nANTECEDENTES: o fiscal não informou histórico. Escreva a seção pedindo a verificação, entre colchetes, em vez de afirmar que nada consta.');
  }

  if (input.quantidadeProvas > 0) {
    linhas.push(`\nPROVAS ANEXADAS: ${input.quantidadeProvas} arquivo(s) juntado(s) com este relatório. Cite que as provas instruem os autos; NÃO descreva o que aparece nelas, você não as viu.`);
  }

  if (input.conclusaoInspecao?.trim()) {
    linhas.push(`\nCONCLUSÃO DO RELATÓRIO DE INSPEÇÃO:\n${input.conclusaoInspecao.trim()}`);
  }

  if (input.defesa) {
    linhas.push(
      input.defesa.apresentada
        ? `\nDEFESA: apresentada${input.defesa.recebidaEm ? ` em ${input.defesa.recebidaEm}` : ''}, considerada ${input.defesa.tempestividade || 'sem classificação'}. ATENÇÃO: o conteúdo da defesa NÃO está disponível aqui — refira-se a ela como peça dos autos, sem afirmar o que ela alega.`
        : '\nDEFESA: não apresentada até o momento.'
    );
  }

  if (input.pecas.length > 0) {
    linhas.push(`\nPEÇAS JÁ NOS AUTOS, EM ORDEM:\n${input.pecas.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
  }

  if (input.notasDoFiscal?.trim()) {
    linhas.push(`\nANOTAÇÕES DO FISCAL (use como base dos fatos):\n${input.notasDoFiscal.trim()}`);
  }

  return linhas.join('\n');
}

const gerarInstrucaoPasFlow = ai.defineFlow(
  {
    name: 'gerarInstrucaoPasFlow',
    inputSchema: GerarInstrucaoPasInputSchema,
    outputSchema: GerarInstrucaoPasOutputSchema,
  },
  async (input) => {
    if (!isClaudeReady) {
      return {
        relatorioInstrucaoHtml: '',
        error: 'A redação assistida do PAS precisa da IA na nuvem, que não está configurada neste ambiente.',
      };
    }

    // Sem nenhum substrato, o modelo só teria o cabeçalho para trabalhar — e é
    // exatamente aí que ele inventaria os fatos. Melhor recusar e dizer o que
    // falta.
    const temSubstrato =
      !!input.teorAutoInfracao?.trim() ||
      input.naoConformidades.length > 0 ||
      !!input.notasDoFiscal?.trim();
    if (!temSubstrato) {
      return {
        relatorioInstrucaoHtml: '',
        error: 'Não há o que relatar ainda: esta autuação não tem relato no Auto de Infração, não está vinculada a um relatório de inspeção, e nada foi digitado em "Dos Fatos". Escreva um resumo do que foi constatado e gere de novo.',
      };
    }

    const quota = await checkAndConsumeAiQuota(input.uid);
    if (!quota.ok) {
      return {
        relatorioInstrucaoHtml: '',
        error: `LIMITE MENSAL DE IA ATINGIDO (${MONTHLY_AI_LIMIT}/mês). Redija manualmente ou aguarde a virada do mês.`,
      };
    }

    try {
      const pedido = input.etapa === 'julgamento'
        ? 'Gere o RELATÓRIO TÉCNICO DE INSTRUÇÃO e também o rascunho do JULGAMENTO (fundamentação e decisão).'
        : 'Gere apenas o RELATÓRIO TÉCNICO DE INSTRUÇÃO. Deixe os campos de julgamento vazios.';

      const response = await claude.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 3072,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `${montarContexto(input)}\n\n---\n${pedido}` },
        ],
        output_config: { format: zodOutputFormat(SaidaClaudeSchema) },
      });

      const output = response.parsed_output;
      if (!output) throw new Error('CLAUDE_PARSE_FAILED');
      if (output.error) return { relatorioInstrucaoHtml: '', error: output.error };

      if (!output.relatorioInstrucaoHtml?.trim()) {
        return {
          relatorioInstrucaoHtml: '',
          error: 'A IA não conseguiu redigir o relatório com os dados disponíveis. Descreva os fatos em "Dos Fatos" e tente novamente.',
        };
      }

      return {
        relatorioInstrucaoHtml: output.relatorioInstrucaoHtml,
        julgamentoFundamentacaoHtml: output.julgamentoFundamentacaoHtml,
        julgamentoDecisaoHtml: output.julgamentoDecisaoHtml,
      };
    } catch (e: any) {
      console.error('Erro ao gerar a instrução do PAS:', e);
      return {
        relatorioInstrucaoHtml: '',
        error: 'Não foi possível gerar agora. Verifique a conexão e tente de novo.',
      };
    }
  }
);

/**
 * Porta de entrada chamada pela tela (Server Action).
 *
 * O `parse` aqui não é redundância: quem chama manda o tipo de ENTRADA, em
 * que os campos com valor padrão (etapa, naoConformidades, pecas) são
 * opcionais. O flow espera esses campos já resolvidos, e é o parse que aplica
 * os padrões antes de atravessar.
 */
export async function gerarInstrucaoPas(
  input: GerarInstrucaoPasInput
): Promise<GerarInstrucaoPasOutput> {
  return gerarInstrucaoPasFlow(GerarInstrucaoPasInputSchema.parse(input));
}

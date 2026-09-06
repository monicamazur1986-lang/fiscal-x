'use server';

/**
 * @fileOverview "Pergunte ao Fiscal-X" — chat de dúvidas rápidas de campo,
 * no mesmo espírito de perguntar num app de IA genérico, mas respondendo com
 * base estrita na legislação sanitária já indexada (mesma busca usada pra
 * fundamentar o Auto de Infração — ver legal-search.ts/legal-vector-search.ts).
 *
 * "Aprender com o uso": a API da Claude não permite treinar/ajustar o modelo
 * a partir de feedback, então isso aqui funciona por acúmulo — cada
 * pergunta/resposta é salva com um id, o fiscal avalia com 👍/👎, e a próxima
 * pergunta parecida busca a melhor resposta já bem avaliada (👍) como
 * referência de estilo no prompt (ver fiscal-x-feedback-search.ts). 👎 nunca
 * é reaproveitado — só marca "essa resposta não ajudou" pra quem for revisar
 * o uso depois.
 */

import { z as z4 } from 'zod/v4';
import { claude, isClaudeReady, CLAUDE_MODEL } from '@/ai/claude';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { searchLegislacao, normalizeLawPreferenceSelection, type LawPreferenceSelection } from '@/lib/legal-search';
import { isSemanticSearchReady, searchLegislacaoSemantic } from '@/lib/legal-vector-search';
import { checkAndConsumeAiQuota, MONTHLY_AI_LIMIT } from '@/ai/usage-limit';
import { resolverMunicipioId } from '@/lib/draft-examples-search';
import { buscarPerguntaSimilarBemAvaliada, salvarPerguntaFiscalX, registrarFeedbackFiscalX, type CitacaoFiscalX } from '@/lib/fiscal-x-feedback-search';

const FiscalXOutputSchema = z4.object({
  resposta: z4.string(),
  artigosUtilizados: z4.array(z4.string()).optional(),
  semEmbasamento: z4.boolean().optional(),
});

export interface AskFiscalXInput {
  uid: string;
  pergunta: string;
  /** Turnos anteriores da MESMA conversa, na ordem em que aconteceram —
   * dá contexto pra perguntas de acompanhamento ("e nesse caso, qual o prazo?"). */
  historico?: { role: 'user' | 'assistant'; texto: string }[];
  lawPreference?: LawPreferenceSelection;
}

export interface AskFiscalXOutput {
  resposta: string;
  citacoes: CitacaoFiscalX[];
  perguntaId: string | null;
  error?: string;
}

const SYSTEM_PROMPT = `Você é o Fiscal-X, um assistente de campo para fiscais sanitários do Paraná. Um fiscal descreve uma situação ou faz uma pergunta durante uma inspeção, e você responde de forma direta, prática e conversacional — como um colega experiente orientando no campo, não como um documento oficial.

REGRAS:
1. Baseie sua resposta ESTRITAMENTE nos trechos de legislação fornecidos no CONTEXTO LEGAL abaixo. Nunca invente lei, artigo ou norma que não esteja no contexto.
2. Se o contexto não tiver base suficiente pra responder com segurança, diga isso claramente ("não encontrei uma norma específica sobre isso na base disponível") em vez de arriscar um palpite — nesse caso preencha semEmbasamento como true.
3. Sempre que a orientação vier de uma norma específica, cite a lei e o artigo (ex.: "conforme o Art. 63, XI da Lei Estadual nº 13.331/2001") e preencha artigosUtilizados com os IDs exatos (campo ID) dos trechos do contexto que você efetivamente usou.
4. Tom conversacional e objetivo: frases diretas, parágrafos curtos, sem formalismo de documento oficial — isso é uma dúvida rápida de campo, não um auto de infração. Pode usar uma lista curta quando ajudar a clareza.
5. Se houver histórico de conversa, leve em conta o que já foi perguntado/respondido antes — pode ser uma pergunta de acompanhamento sobre o mesmo caso.`;

export async function askFiscalX(input: AskFiscalXInput): Promise<AskFiscalXOutput> {
  if (!isClaudeReady) {
    return { resposta: '', citacoes: [], perguntaId: null, error: 'O Fiscal-X (pergunta e resposta) precisa da IA em nuvem ativada — fale com o administrador do sistema.' };
  }
  if (!input.pergunta?.trim()) {
    return { resposta: '', citacoes: [], perguntaId: null, error: 'Digite uma pergunta ou descreva a situação.' };
  }

  const quota = await checkAndConsumeAiQuota(input.uid);
  if (!quota.ok) {
    return { resposta: '', citacoes: [], perguntaId: null, error: `LIMITE MENSAL DE IA ATINGIDO (${MONTHLY_AI_LIMIT}/mês). Aguarde a virada do mês.` };
  }

  const municipioId = await resolverMunicipioId(input.uid);
  const pref = normalizeLawPreferenceSelection(input.lawPreference || 'todas');

  try {
    let artigos = isSemanticSearchReady()
      ? await searchLegislacaoSemantic(input.pergunta, { pref, limit: 8, municipioId: municipioId || undefined }).catch(() => [])
      : [];
    if (artigos.length === 0) {
      artigos = searchLegislacao(input.pergunta, { pref, limit: 8, municipioId: municipioId || undefined });
    }

    if (artigos.length === 0) {
      return {
        resposta: 'Não encontrei nenhuma norma relacionada a isso na base de legislação disponível. Tente descrever a situação com outras palavras, ou consulte diretamente a Biblioteca.',
        citacoes: [],
        perguntaId: null,
      };
    }

    const finalContext = artigos.map(a => `ID: ${a.id} | LEI: ${a.lawTitle} | ARTIGO/INCISO: ${a.label} | TEXTO: ${a.texto}`).join('\n');

    const referencia = await buscarPerguntaSimilarBemAvaliada(input.pergunta, municipioId);
    const referenciaBlock = referencia
      ? `\n\nREFERÊNCIA DE TOM (uma pergunta parecida, já respondida e bem avaliada por outro fiscal — use só como referência de estilo, NÃO copie o conteúdo, a situação atual é diferente):\nPergunta anterior: "${referencia.pergunta}"\nResposta bem avaliada: "${referencia.resposta}"`
      : '';

    const historico = (input.historico || []).map((h) => ({ role: h.role, content: h.texto }));

    const response = await claude.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        ...historico,
        {
          role: 'user',
          content: `CONTEXTO LEGAL DISPONÍVEL:\n${finalContext}${referenciaBlock}\n\nPERGUNTA DO FISCAL: "${input.pergunta}"`,
        },
      ],
      output_config: { format: zodOutputFormat(FiscalXOutputSchema) },
    });

    const output = response.parsed_output;
    if (!output) throw new Error('CLAUDE_PARSE_FAILED');

    const citacoes: CitacaoFiscalX[] = (output.artigosUtilizados?.length
      ? artigos.filter((a) => output.artigosUtilizados!.includes(a.id))
      : artigos
    ).map((a) => ({ id: a.id, label: a.label, lawTitle: a.lawTitle, texto: a.texto }));

    const perguntaId = await salvarPerguntaFiscalX({
      uid: input.uid,
      municipioId,
      pergunta: input.pergunta,
      resposta: output.resposta,
      citacoes,
    });

    return { resposta: output.resposta, citacoes, perguntaId };
  } catch (err) {
    console.error('Erro no Fiscal-X:', err);
    return { resposta: '', citacoes: [], perguntaId: null, error: 'Não foi possível obter uma resposta agora. Tente novamente em instantes.' };
  }
}

export async function submitFiscalXFeedback(perguntaId: string, feedback: 'like' | 'dislike'): Promise<{ ok: boolean }> {
  const ok = await registrarFeedbackFiscalX(perguntaId, feedback);
  return { ok };
}

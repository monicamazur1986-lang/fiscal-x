import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeId } from '@/lib/utils';

/**
 * CONTADOR OFICIAL DA NUMERAÇÃO DAS AUTUAÇÕES
 *
 * Um contador por município e por ano, em municipios/{mid}/counters/{ano}.
 * `seq` é o último número EMITIDO — o próximo auto sai com `seq + 1`.
 *
 * O incremento é feito por transação (ver generateNewNumeroProcesso), para
 * dois fiscais lavrando ao mesmo tempo nunca receberem o mesmo número.
 */

const PREFIXO_CACHE = 'fiscal_x_contador';

function chaveCache(municipioId: string, ano: number) {
  return `${PREFIXO_CACHE}_${normalizeId(municipioId)}_${ano}`;
}

/**
 * O último valor que este aparelho viu. Existe por causa do modo offline: sem
 * ele, a estimativa local só podia olhar o maior número da lista de documentos
 * — o que ignora qualquer recalibração e ressuscita os números de testes
 * antigos que ainda estejam guardados.
 */
export function lerContadorLocal(municipioId: string, ano: number): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const bruto = window.localStorage.getItem(chaveCache(municipioId, ano));
    if (!bruto) return null;
    const valor = parseInt(bruto, 10);
    return Number.isFinite(valor) ? valor : null;
  } catch {
    return null;
  }
}

export function salvarContadorLocal(municipioId: string, ano: number, seq: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(chaveCache(municipioId, ano), String(seq));
  } catch {
    // Armazenamento cheio ou bloqueado: o contador da nuvem continua sendo a
    // fonte da verdade; o cache é só a rede de segurança do modo offline.
  }
}

/** Último número emitido segundo a nuvem. Zero = nenhum auto lavrado no ano. */
export async function lerContadorOficial(municipioId: string, ano: number): Promise<number> {
  if (!db) throw new Error('Sem conexão com o banco de dados.');
  const ref = doc(db, 'municipios', normalizeId(municipioId), 'counters', String(ano));
  const snap = await getDoc(ref);
  const seq = snap.exists() ? Number(snap.data().seq || 0) : 0;
  salvarContadorLocal(municipioId, ano, seq);
  return seq;
}

/**
 * Recalibra a numeração: faz o PRÓXIMO auto sair com `proximoNumero`.
 *
 * Grava `proximoNumero - 1`, porque o contador guarda o último emitido. Usa
 * transação pelo mesmo motivo do incremento: se um colega estiver lavrando
 * neste instante, as duas escritas se ordenam em vez de uma sumir.
 *
 * Devolve o valor anterior para a tela poder registrar de onde veio — uma
 * recalibração errada é difícil de perceber depois, e saber o número antigo é
 * o que permite desfazer.
 */
export async function definirProximoNumero(
  municipioId: string,
  ano: number,
  proximoNumero: number,
): Promise<{ seqAnterior: number; seqNovo: number }> {
  if (!db) throw new Error('Sem conexão com o banco de dados.');
  if (!Number.isInteger(proximoNumero) || proximoNumero < 1) {
    throw new Error('O próximo número precisa ser um inteiro maior que zero.');
  }

  const ref = doc(db, 'municipios', normalizeId(municipioId), 'counters', String(ano));
  const seqNovo = proximoNumero - 1;

  const seqAnterior = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const anterior = snap.exists() ? Number(snap.data().seq || 0) : 0;
    tx.set(ref, { seq: seqNovo, recalibradoEm: new Date().toISOString() }, { merge: true });
    return anterior;
  });

  salvarContadorLocal(municipioId, ano, seqNovo);
  return { seqAnterior, seqNovo };
}

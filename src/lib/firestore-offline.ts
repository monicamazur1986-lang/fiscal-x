/**
 * Evita que uma gravação no Firestore trave a tela pra sempre quando o
 * aparelho perde sinal no meio do uso.
 *
 * A Promise de um setDoc/addDoc/updateDoc/deleteDoc só resolve quando o
 * servidor confirma — offline, ela fica pendente indefinidamente (o SDK não
 * rejeita por falta de conexão, só quando reconecta e a confirmação chega).
 * Com a persistência do Firestore ligada (ver src/lib/firebase.ts), a
 * gravação já está seguramente guardada em IndexedDB no instante em que essa
 * função é chamada — sobrevive até fechar a aba — e o próprio SDK garante o
 * reenvio assim que a conexão voltar, sem precisar de fila caseira.
 *
 * Por isso "ainda sem resposta depois de alguns segundos" é tratado como
 * "gravação na fila" (synced: false), não como erro — um erro de verdade
 * (permissão negada, validação) sempre volta rápido, bem antes do timeout,
 * e continua rejeitando normalmente.
 */
export function attemptFirestoreWrite(
  writePromise: Promise<unknown>,
  timeoutMs = 4000
): Promise<{ synced: boolean }> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ synced: false });
    }, timeoutMs);

    writePromise
      .then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ synced: true });
      })
      .catch((err) => {
        if (settled) {
          // Erro chegou depois do timeout — a gravação já foi tratada como
          // "na fila" e devolvida pro chamador; o SDK cuida do reenvio (ou,
          // se realmente falhar depois, não há tela travada esperando por
          // isso pra saber).
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

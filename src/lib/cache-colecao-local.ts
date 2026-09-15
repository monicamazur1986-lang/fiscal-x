/**
 * CACHE LOCAL DE COLEÇÃO — partida rápida, não arquivo.
 *
 * Os hooks de coleção (intimações, inspeções) espelhavam a lista INTEIRA no
 * localStorage a cada snapshot do Firestore. Isso tinha dois problemas sérios
 * quando o município cresce:
 *
 *  1. O localStorage tem teto de ~5 MB por origem, compartilhado com todos os
 *     outros caches do app (biblioteca, chamados, docfacil, pastas, PAS...).
 *     Autuação guarda assinatura como data URL dentro do próprio documento,
 *     então cada uma pesa dezenas de KB: com 20 fiscais produzindo, o teto
 *     estourava em poucos dias. E o `setItem` de intimações não tinha
 *     try/catch, então o QuotaExceededError era lançado DENTRO do callback do
 *     onSnapshot — as linhas seguintes (setIntimacoes/setLoading) nunca
 *     rodavam e a tela ficava carregando pra sempre, exibindo dado velho.
 *
 *  2. `JSON.stringify` da coleção inteira roda na thread principal. Com o
 *     autosave de roteiro a cada 8s e vários fiscais em campo, isso acontecia
 *     várias vezes por segundo e travava a interface do gestor.
 *
 * O acervo de verdade não mora aqui: o Firestore roda com `persistentLocalCache`
 * (IndexedDB) — ver src/lib/firebase.ts — que guarda tudo, sem teto de 5 MB, e
 * serve as leituras offline sozinho. Este cache só existe pra pintar algo na
 * tela antes do primeiro snapshot chegar, e pra cobrir os casos em que a
 * persistência do Firestore não está disponível (iframe do acesso rápido, aba
 * anônima, navegador sem IndexedDB). Por isso ele é limitado aos mais recentes
 * e nunca lança exceção: falhar em gravar aqui não pode derrubar nada.
 */

/** Quantos registros a partida rápida guarda. O resto vem do Firestore. */
export const MAX_ITENS_CACHE = 40;

/** Acima disso nem tenta gravar — um punhado de documentos com assinatura
 *  embutida já chega perto do teto do localStorage sozinho. */
const MAX_BYTES_CACHE = 512 * 1024;

/**
 * Gravação avulsa que nunca lança — pra caches que não são lista de coleção e
 * não podem ser podados (a configuração do município, o acervo offline da
 * Biblioteca). Sem isso, um QuotaExceededError dentro de um callback de
 * onSnapshot impede as linhas seguintes de rodar e trava a tela carregando.
 */
export function salvarItemLocal(chave: string, valor: string): boolean {
  try {
    localStorage.setItem(chave, valor);
    return true;
  } catch {
    return false;
  }
}

export function lerCacheColecao<T = unknown>(chave: string): T[] | null {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    return Array.isArray(dados) ? (dados as T[]) : null;
  } catch {
    // Cache corrompido ou localStorage bloqueado: segue sem partida rápida.
    return null;
  }
}

/**
 * Grava só os mais recentes, e nunca lança.
 *
 * `manter` diz de que ponta da lista vêm os mais recentes: 'primeiros' para
 * coleções em ordem decrescente (intimações, ordenadas por createdAt desc),
 * 'ultimos' para as crescentes (inspeções, ordenadas por data asc).
 */
export function salvarCacheColecao<T>(
  chave: string,
  itens: T[],
  manter: 'primeiros' | 'ultimos' = 'primeiros'
): void {
  try {
    const recorte = (quantidade: number) =>
      manter === 'primeiros' ? itens.slice(0, quantidade) : itens.slice(-quantidade);

    let carga = JSON.stringify(recorte(MAX_ITENS_CACHE));
    if (carga.length > MAX_BYTES_CACHE) {
      // Documentos grandes (assinatura/foto embutida): guarda menos deles em
      // vez de desistir da partida rápida inteira.
      carga = JSON.stringify(recorte(Math.max(1, Math.floor(MAX_ITENS_CACHE / 4))));
      if (carga.length > MAX_BYTES_CACHE) {
        localStorage.removeItem(chave);
        return;
      }
    }
    localStorage.setItem(chave, carga);
  } catch {
    // Cota estourada (ou storage indisponível): descarta o cache desta coleção
    // pra liberar espaço e não insistir num valor velho que nunca atualiza.
    try { localStorage.removeItem(chave); } catch { /* nada a fazer */ }
  }
}

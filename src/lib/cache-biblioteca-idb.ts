/**
 * CACHE DO ACERVO DA BIBLIOTECA — em IndexedDB, não em localStorage.
 *
 * O acervo da Biblioteca é o texto extraído de 23 PDFs (~70 MB de arquivo,
 * um deles com 45 MB). Esse texto não cabe no localStorage, que tem teto de
 * ~5 MB por origem e ainda é dividido com todos os outros caches do app: a
 * gravação falhava, o cache nunca persistia, e a cada acesso à Biblioteca o
 * app baixava os 70 MB de novo e reprocessava tudo com o pdf.js. Era esse o
 * "carregando os arquivos a cada acesso".
 *
 * IndexedDB não tem esse teto (trabalha na casa das centenas de MB) e guarda
 * o objeto direto, por clone estruturado — sem o JSON.stringify/parse de
 * vários MB na thread principal que o localStorage exigia.
 *
 * Versão e documentos ficam no MESMO registro, de propósito. Antes eram duas
 * chaves separadas, e a versão (poucos bytes) era gravada com sucesso mesmo
 * quando os documentos (megabytes) falhavam — o app então achava que tinha
 * cache válido, não achava os dados e reprocessava tudo, silenciosamente, pra
 * sempre. Gravados juntos, ou entra tudo ou não entra nada.
 */

const NOME_BANCO = 'fiscal_x_biblioteca';
const VERSAO_BANCO = 1;
const DEPOSITO = 'acervo';

export type AcervoCache<T> = {
  /** Versão combinada dos manifests que gerou estes documentos. */
  versao: string;
  documentos: T[];
};

function abrirBanco(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const requisicao = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
      requisicao.onupgradeneeded = () => {
        const banco = requisicao.result;
        if (!banco.objectStoreNames.contains(DEPOSITO)) banco.createObjectStore(DEPOSITO);
      };
      requisicao.onsuccess = () => resolve(requisicao.result);
      // Aba anônima, navegador sem IndexedDB ou storage bloqueado: sem cache,
      // mas a Biblioteca continua funcionando (só reprocessa).
      requisicao.onerror = () => resolve(null);
      requisicao.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function lerAcervoCache<T>(chave: string): Promise<AcervoCache<T> | null> {
  const banco = await abrirBanco();
  if (!banco) return null;
  return new Promise((resolve) => {
    try {
      const transacao = banco.transaction(DEPOSITO, 'readonly');
      const requisicao = transacao.objectStore(DEPOSITO).get(chave);
      requisicao.onsuccess = () => {
        const valor = requisicao.result;
        resolve(valor && Array.isArray(valor.documentos) && typeof valor.versao === 'string' ? valor : null);
      };
      requisicao.onerror = () => resolve(null);
      transacao.oncomplete = () => banco.close();
    } catch {
      resolve(null);
    }
  });
}

export async function gravarAcervoCache<T>(chave: string, valor: AcervoCache<T>): Promise<boolean> {
  const banco = await abrirBanco();
  if (!banco) return false;
  return new Promise((resolve) => {
    try {
      const transacao = banco.transaction(DEPOSITO, 'readwrite');
      transacao.objectStore(DEPOSITO).put(valor, chave);
      transacao.oncomplete = () => { banco.close(); resolve(true); };
      transacao.onerror = () => { banco.close(); resolve(false); };
      transacao.onabort = () => { banco.close(); resolve(false); };
    } catch {
      resolve(false);
    }
  });
}

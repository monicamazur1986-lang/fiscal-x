import Papa from 'papaparse';
import { Readable } from 'stream';
import { Agent } from 'undici';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Bucket } from '@google-cloud/storage';
import type { AnvisaDataset } from './anvisa-datasets';
import { normalizeText, onlyDigits } from './text-normalize';

// dados.anvisa.gov.br não envia a cadeia de certificados intermediários
// corretamente (falha de configuração do lado deles — comum em domínios
// .gov.br), então o fetch padrão do Node rejeita com
// UNABLE_TO_VERIFY_LEAF_SIGNATURE mesmo o certificado sendo válido.
// Contorna SÓ pra esse download específico (CSV público, sem autenticação,
// sem dado sensível) — nenhuma outra chamada do app usa este agente.
const anvisaInsecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export interface AnvisaSyncStats {
  dataset: string;
  totalRows: number;
  written: number;
  skipped: number;
  durationMs: number;
  /** false quando a rodada parou no limite de gravações antes de terminar o
   * arquivo — a próxima chamada retoma sozinha (ver syncDataset). */
  completo: boolean;
}

// Cota diária gratuita do Firestore é 20.000 gravações — usar um teto abaixo
// disso (e não os 20.000 inteiros) deixa folga pro resto do app no mesmo dia.
// Na primeira sincronização de um dataset grande (ex.: Empresas, ~300MB),
// isso significa várias rodadas diárias até terminar, mas sem gerar custo de
// gravação: cada chamada nova pula automaticamente o que a anterior já
// gravou (o "retrato" parcial já fica salvo no Storage a cada corte).
export const DEFAULT_MAX_WRITES_PER_RUN = 15000;

// Campo que identifica cada linha de forma única por dataset — vira o ID do
// documento no Firestore. Mapeado explicitamente (em vez de adivinhado por
// regex) porque só existem 4 datasets fixos, todos já conhecidos.
const ID_FIELD: Record<string, string[]> = {
  empresas: ['NU_CNPJ'],
  'produtos-saude': ['NU_REGISTRO_PRODUTO', 'NUMERO_REGISTRO', 'REGISTRO', 'NU_REGISTRO'],
  medicamentos: ['NU_REGISTRO_PRODUTO', 'NUMERO_REGISTRO', 'REGISTRO', 'NU_REGISTRO'],
  saneantes: ['NUMERO_REGISTRO', 'NU_REGISTRO', 'REGISTRO'],
  alimentos: ['NUMERO_REGISTRO', 'NU_REGISTRO', 'REGISTRO', 'NU_CNPJ'],
  cosmeticos: ['NUMERO_REGISTRO', 'NU_REGISTRO', 'REGISTRO', 'NU_CNPJ'],
  'ensaios-clinicos': ['NU_REGISTRO', 'NUMERO_REGISTRO', 'REGISTRO'],
  cannabis: ['NUMERO_REGISTRO', 'NU_REGISTRO', 'REGISTRO', 'NU_CNPJ'],
  tabaco: ['NUMERO_REGISTRO', 'NU_REGISTRO', 'REGISTRO', 'NU_CNPJ'],
};

const CNPJ_FIELD: Record<string, string[]> = {
  empresas: ['NU_CNPJ'],
  'produtos-saude': ['NU_CNPJ_EMPRESA', 'CNPJ', 'NU_CNPJ'],
  medicamentos: ['NU_CNPJ_EMPRESA', 'CNPJ', 'NU_CNPJ'],
  saneantes: ['NU_CNPJ', 'CNPJ', 'CNPJ_EMPRESA'],
  alimentos: ['NU_CNPJ', 'CNPJ'],
  cosmeticos: ['NU_CNPJ', 'CNPJ'],
  'ensaios-clinicos': ['NU_CNPJ', 'CNPJ'],
  cannabis: ['NU_CNPJ', 'CNPJ'],
  tabaco: ['NU_CNPJ', 'CNPJ'],
};

const NAME_FIELD: Record<string, string[]> = {
  empresas: ['NO_RAZAO_SOCIAL', 'RAZAO_SOCIAL', 'NOME_EMPRESA', 'NO_FANTASIA'],
  'produtos-saude': ['NO_PRODUTO', 'NOME_PRODUTO', 'DESCRICAO_PRODUTO'],
  medicamentos: ['NO_PRODUTO', 'NOME_PRODUTO', 'DESCRICAO_PRODUTO'],
  saneantes: ['NOME_PRODUTO', 'NO_PRODUTO', 'DESCRICAO_PRODUTO'],
  alimentos: ['NOME_PRODUTO', 'NO_PRODUTO', 'DESCRICAO_PRODUTO', 'RAZAO_SOCIAL'],
  cosmeticos: ['NOME_PRODUTO', 'NO_PRODUTO', 'DESCRICAO_PRODUTO', 'RAZAO_SOCIAL'],
  'ensaios-clinicos': ['NO_PRODUTO', 'NOME_PRODUTO', 'DESCRICAO_PRODUTO', 'RAZAO_SOCIAL'],
  cannabis: ['NOME_PRODUTO', 'NO_PRODUTO', 'DESCRICAO_PRODUTO', 'RAZAO_SOCIAL'],
  tabaco: ['NOME_PRODUTO', 'NO_PRODUTO', 'DESCRICAO_PRODUTO', 'RAZAO_SOCIAL'],
};

function normalizeRowKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function pickFirstField(row: Record<string, string>, candidates: string[]): string {
  const map = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeRowKey(key), value || '']));
  for (const candidate of candidates) {
    const value = map[normalizeRowKey(candidate)];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function resolveDocId(dataset: AnvisaDataset, row: Record<string, string>): string | null {
  const raw = pickFirstField(row, ID_FIELD[dataset.key] ?? ['NU_REGISTRO', 'NUMERO_REGISTRO', 'REGISTRO', 'ID', 'NU_CNPJ']);
  if (!raw) return null;

  if (dataset.key === 'empresas') {
    const cnpj = onlyDigits(raw);
    return cnpj.length >= 11 ? cnpj : null;
  }

  const sanitized = raw.replace(/[\/\s]/g, '_').slice(0, 300);
  return sanitized || null;
}

function buildSearchFields(dataset: AnvisaDataset, row: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {
    searchName: normalizeText(pickFirstField(row, NAME_FIELD[dataset.key] ?? ['NOME_PRODUTO', 'NO_PRODUTO', 'RAZAO_SOCIAL']).trim()),
  };
  const cnpjValue = pickFirstField(row, CNPJ_FIELD[dataset.key] ?? ['NU_CNPJ', 'CNPJ']);
  const digits = onlyDigits(cnpjValue || '');
  if (digits) fields.searchCnpj = digits;
  return fields;
}

// Concatenação simples dos campos exibidos na tela — suficiente pra detectar
// mudança real linha a linha, sem precisar de hash criptográfico.
function fingerprint(dataset: AnvisaDataset, row: Record<string, string>): string {
  return dataset.displayColumns.map((c) => row[c.key] || '').join('|');
}

// Mesma lógica de "ativo" já usada em consulta-anvisa/page.tsx (isActiveStatus)
// — reaproveitada aqui pra decidir o que vale a pena gravar. Registros
// cancelados/vencidos que NUNCA foram indexados são pulados (reduz bastante
// o volume da primeira carga); um registro que já estava no índice continua
// sendo atualizado mesmo se virar inativo depois, pra não deixar status
// desatualizado — só a primeira gravação de um item já nascido inativo é
// que é evitada.
function isRowActive(dataset: AnvisaDataset, row: Record<string, string>): boolean {
  if (!dataset.statusField || !dataset.statusActiveValues) return true;
  const value = (row[dataset.statusField] || '').trim().toUpperCase();
  return dataset.statusActiveValues.some((v) => v.toUpperCase() === value);
}

function buildDocData(dataset: AnvisaDataset, row: Record<string, string>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const col of dataset.displayColumns) {
    data[col.key] = pickFirstField(row, [col.key]) || '';
  }
  return { ...data, ...buildSearchFields(dataset, row) };
}

function snapshotPath(datasetKey: string): string {
  return `anvisa-snapshots/${datasetKey}.json`;
}

async function readSnapshot(bucket: Bucket, datasetKey: string): Promise<Map<string, string>> {
  const file = bucket.file(snapshotPath(datasetKey));
  const [exists] = await file.exists();
  if (!exists) return new Map();
  try {
    const [buf] = await file.download();
    const obj = JSON.parse(buf.toString('utf-8')) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch {
    // Snapshot corrompido/ilegível: trata como primeira execução em vez de
    // travar o sync (a próxima rodada volta a gravar tudo, sem prejuízo).
    return new Map();
  }
}

async function writeSnapshot(bucket: Bucket, datasetKey: string, snapshot: Map<string, string>): Promise<void> {
  const obj = Object.fromEntries(snapshot);
  await bucket.file(snapshotPath(datasetKey)).save(Buffer.from(JSON.stringify(obj)), {
    metadata: { contentType: 'application/json' },
  });
}

/**
 * Baixa o CSV público da ANVISA, compara linha a linha contra o snapshot
 * (docId -> fingerprint) salvo no Storage na última execução, e grava no
 * Firestore só o que mudou. Os arquivos da ANVISA não são ordenados nem trazem
 * changelog, então o snapshot é o que permite esse diff sem reler ~1M
 * documentos do Firestore a cada rodada.
 *
 * Duas otimizações de custo:
 * 1. Registros cancelados/vencidos que nunca foram indexados são pulados
 *    (isRowActive) — reduz o volume da primeira carga sem afetar registros
 *    já indexados que mudam de status depois (esses continuam sendo
 *    atualizados normalmente).
 * 2. `maxWrites` corta a rodada ao atingir o teto e salva o retrato PARCIAL
 *    do que já foi processado — a próxima chamada retoma sozinha (linhas já
 *    vistas batem com o retrato e são puladas; só as linhas seguintes, ainda
 *    não vistas, voltam a ser avaliadas). Assim dá pra ficar sempre dentro
 *    da cota diária gratuita do Firestore, só rodando em pedaços menores.
 */
export async function syncDataset(dataset: AnvisaDataset, options?: { maxWrites?: number }): Promise<AnvisaSyncStats> {
  const startedAt = Date.now();
  const maxWrites = options?.maxWrites ?? DEFAULT_MAX_WRITES_PER_RUN;
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const previousSnapshot = await readSnapshot(bucket, dataset.key);
  const nextSnapshot = new Map<string, string>();

  const response = await fetch(dataset.downloadUrl, { dispatcher: anvisaInsecureAgent } as any);
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar CSV da ANVISA (${dataset.key}): HTTP ${response.status}`);
  }

  const nodeStream = Readable.fromWeb(response.body as any);
  nodeStream.setEncoding(dataset.encoding === 'ISO-8859-1' ? 'latin1' : 'utf-8');

  const bulkWriter = db.bulkWriter();
  bulkWriter.onWriteError((error) => error.failedAttempts < 3);

  const registrosRef = db.collection('anvisaIndex').doc(dataset.key).collection('registros');

  let totalRows = 0;
  let written = 0;
  let skipped = 0;
  let aborted = false;

  await new Promise<void>((resolve, reject) => {
    Papa.parse<Record<string, string>>(nodeStream as any, {
      header: true,
      delimiter: dataset.delimiter,
      skipEmptyLines: true,
      step: (results, parser) => {
        const row = results.data;
        totalRows++;

        const docId = resolveDocId(dataset, row);
        if (!docId) {
          skipped++;
          return;
        }

        const wasIndexed = previousSnapshot.has(docId);
        if (!wasIndexed && !isRowActive(dataset, row)) {
          // Nunca foi indexado e já nasce cancelado/vencido — não vale a
          // pena gravar. Não entra no retrato: se um dia virar ativo, a
          // ausência no retrato garante que será avaliado (e gravado) de novo.
          skipped++;
          return;
        }

        const fp = fingerprint(dataset, row);
        nextSnapshot.set(docId, fp);

        if (previousSnapshot.get(docId) === fp) {
          skipped++;
          return;
        }

        bulkWriter.set(
          registrosRef.doc(docId),
          { ...buildDocData(dataset, row), updatedAt: Date.now() },
          { merge: true }
        );
        written++;

        if (maxWrites && written >= maxWrites) {
          aborted = true;
          parser.abort();
        }
      },
      complete: () => resolve(),
      error: (err: Error) => reject(err),
    });
  });

  await bulkWriter.close();
  await writeSnapshot(bucket, dataset.key, nextSnapshot);

  const durationMs = Date.now() - startedAt;
  const completo = !aborted;
  await db.collection('anvisaIndex').doc(dataset.key).set(
    {
      lastSyncAt: new Date().toISOString(),
      totalRows,
      written,
      skipped,
      durationMs,
      completo,
    },
    { merge: true }
  );

  return { dataset: dataset.key, totalRows, written, skipped, durationMs, completo };
}

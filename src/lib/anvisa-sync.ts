import Papa from 'papaparse';
import { Readable } from 'stream';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Bucket } from '@google-cloud/storage';
import type { AnvisaDataset } from './anvisa-datasets';
import { normalizeText, onlyDigits } from './text-normalize';

export interface AnvisaSyncStats {
  dataset: string;
  totalRows: number;
  written: number;
  skipped: number;
  durationMs: number;
}

// Campo que identifica cada linha de forma única por dataset — vira o ID do
// documento no Firestore. Mapeado explicitamente (em vez de adivinhado por
// regex) porque só existem 4 datasets fixos, todos já conhecidos.
const ID_FIELD: Record<string, string> = {
  empresas: 'NU_CNPJ',
  'produtos-saude': 'NU_REGISTRO_PRODUTO',
  medicamentos: 'NU_REGISTRO_PRODUTO',
  saneantes: 'NUMERO_REGISTRO',
};

const CNPJ_FIELD: Record<string, string | undefined> = {
  empresas: 'NU_CNPJ',
  'produtos-saude': 'NU_CNPJ_EMPRESA',
  medicamentos: 'NU_CNPJ_EMPRESA',
  saneantes: undefined,
};

const NAME_FIELD: Record<string, string> = {
  empresas: 'NO_RAZAO_SOCIAL',
  'produtos-saude': 'NO_PRODUTO',
  medicamentos: 'NO_PRODUTO',
  saneantes: 'NOME_PRODUTO',
};

function resolveDocId(dataset: AnvisaDataset, row: Record<string, string>): string | null {
  const idField = ID_FIELD[dataset.key];
  const raw = (row[idField] || '').trim();
  if (!raw) return null;

  if (dataset.key === 'empresas') {
    const cnpj = onlyDigits(raw);
    return cnpj.length >= 11 ? cnpj : null;
  }
  // Sanitiza pra virar um ID de documento válido no Firestore (sem "/").
  return raw.replace(/[/\s]/g, '_').slice(0, 300);
}

function buildSearchFields(dataset: AnvisaDataset, row: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {
    searchName: normalizeText((row[NAME_FIELD[dataset.key]] || '').trim()),
  };
  const cnpjField = CNPJ_FIELD[dataset.key];
  if (cnpjField) {
    const digits = onlyDigits(row[cnpjField] || '');
    if (digits) fields.searchCnpj = digits;
  }
  return fields;
}

// Concatenação simples dos campos exibidos na tela — suficiente pra detectar
// mudança real linha a linha, sem precisar de hash criptográfico.
function fingerprint(dataset: AnvisaDataset, row: Record<string, string>): string {
  return dataset.displayColumns.map((c) => row[c.key] || '').join('|');
}

function buildDocData(dataset: AnvisaDataset, row: Record<string, string>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const col of dataset.displayColumns) {
    data[col.key] = row[col.key] || '';
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
 */
export async function syncDataset(dataset: AnvisaDataset): Promise<AnvisaSyncStats> {
  const startedAt = Date.now();
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const previousSnapshot = await readSnapshot(bucket, dataset.key);
  const nextSnapshot = new Map<string, string>();

  const response = await fetch(dataset.downloadUrl);
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

  await new Promise<void>((resolve, reject) => {
    Papa.parse<Record<string, string>>(nodeStream as any, {
      header: true,
      delimiter: dataset.delimiter,
      skipEmptyLines: true,
      step: (results) => {
        const row = results.data;
        totalRows++;

        const docId = resolveDocId(dataset, row);
        if (!docId) {
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
      },
      complete: () => resolve(),
      error: (err: Error) => reject(err),
    });
  });

  await bulkWriter.close();
  await writeSnapshot(bucket, dataset.key, nextSnapshot);

  const durationMs = Date.now() - startedAt;
  await db.collection('anvisaIndex').doc(dataset.key).set(
    {
      lastSyncAt: new Date().toISOString(),
      totalRows,
      written,
      skipped,
      durationMs,
    },
    { merge: true }
  );

  return { dataset: dataset.key, totalRows, written, skipped, durationMs };
}

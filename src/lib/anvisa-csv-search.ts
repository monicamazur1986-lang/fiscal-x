import Papa from 'papaparse';
import type { AnvisaDataset } from './anvisa-datasets';
import { normalizeText as normalize, onlyDigits } from './text-normalize';

const MAX_RESULTS = 200;

export interface AnvisaSearchResult {
  rows: Record<string, string>[];
  truncated: boolean;
}

/**
 * Varre o CSV localmente (no navegador) linha a linha via PapaParse, sem
 * carregar o arquivo inteiro na memória — necessário porque os arquivos da
 * ANVISA passam de 300MB. Só aborta ao atingir o teto de resultados, nunca no
 * primeiro match, pois uma mesma empresa/CNPJ pode ter várias linhas legítimas.
 */
export function searchAnvisaCsv(
  file: File,
  dataset: AnvisaDataset,
  query: string,
  onProgress: (pct: number) => void
): Promise<AnvisaSearchResult> {
  const normalizedQuery = normalize(query.trim());
  const digitsQuery = onlyDigits(query);
  const isDigitQuery = digitsQuery.length >= 6;

  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    let truncated = false;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      delimiter: dataset.delimiter,
      encoding: dataset.encoding,
      worker: true,
      skipEmptyLines: true,
      step: (results, parser) => {
        const row = results.data;
        const matches = dataset.searchFields.some((field) => {
          const value = row[field] || '';
          if (isDigitQuery && onlyDigits(value).length > 0) {
            if (onlyDigits(value).includes(digitsQuery)) return true;
          }
          return normalize(value).includes(normalizedQuery);
        });

        if (matches) {
          rows.push(row);
          if (rows.length >= MAX_RESULTS) {
            truncated = true;
            parser.abort();
          }
        }

        if (file.size > 0) {
          onProgress(Math.min(100, Math.round((results.meta.cursor / file.size) * 100)));
        }
      },
      complete: () => {
        onProgress(100);
        resolve({ rows, truncated });
      },
      error: (err) => reject(err),
    });
  });
}

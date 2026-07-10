import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalização padrão para IDs de município e categorias.
 * Remove acentos, espaços e caracteres especiais para consistência no banco.
 */
export function normalizeId(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .trim();
}

/**
 * Gera um prefixo de 4 caracteres para o município
 */
export function getMuniPrefix(muniId: string): string {
  const normalized = normalizeId(muniId).replace(/-/g, "");
  return normalized.substring(0, 4).toUpperCase().padEnd(4, 'X');
}

/**
 * Converte um número sequencial para Base 36 Curta
 */
export function toBase36(num: number, length: number = 4): string {
  return num.toString(36).toUpperCase().padStart(length, '0');
}

/**
 * Converte de volta de Base 36 para número (para cálculos)
 */
export function fromBase36(code: string): number {
  return parseInt(code, 36);
}

export function numeroParaExtenso(n: number): string {
  if (n === 0) return 'zero';
  const unidades = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dezenaEspecial = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  if (n === 100) return 'cem';
  if (n < 10) return unidades[n];
  if (n < 20) return dezenaEspecial[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return dezenas[d] + (u > 0 ? ' e ' + unidades[u] : '');
  }
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const resto = n % 100;
    return centenas[c] + (resto > 0 ? ' e ' + numeroParaExtenso(resto) : '');
  }
  return n.toString();
}

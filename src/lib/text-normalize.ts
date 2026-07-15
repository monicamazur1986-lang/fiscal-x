/** Minúsculo, sem acentos — usado para comparação/busca tolerante a acentuação. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function onlyDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * Feriados nacionais brasileiros — usado só para descontar dias não úteis no
 * cálculo de prazos legais (src/lib/prazo.ts). Cobre só feriados NACIONAIS
 * (fixos + móveis calculados a partir da Páscoa); feriados estaduais/
 * municipais variam por município e não são cobertos aqui — quem precisar
 * dessa precisão adicional configura por fora.
 */

/** Domingo de Páscoa do ano, pelo algoritmo de Gauss (calendário gregoriano). */
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function addDiasSimples(date: Date, dias: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + dias);
  return d;
}

function mesmaData(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Feriados nacionais fixos + móveis (a partir da Páscoa) do ano da data informada. */
function feriadosDoAno(ano: number): Date[] {
  const pascoa = calcularPascoa(ano);
  return [
    new Date(ano, 0, 1),               // Confraternização Universal
    addDiasSimples(pascoa, -48),        // Carnaval (segunda)
    addDiasSimples(pascoa, -47),        // Carnaval (terça)
    addDiasSimples(pascoa, -2),         // Sexta-feira Santa
    new Date(ano, 3, 21),               // Tiradentes
    new Date(ano, 4, 1),                // Dia do Trabalho
    addDiasSimples(pascoa, 60),         // Corpus Christi
    new Date(ano, 8, 7),                // Independência
    new Date(ano, 9, 12),               // Nossa Senhora Aparecida
    new Date(ano, 10, 2),               // Finados
    new Date(ano, 10, 15),              // Proclamação da República
    new Date(ano, 11, 25),              // Natal
  ];
}

export function isFeriadoNacional(date: Date): boolean {
  const feriados = feriadosDoAno(date.getFullYear());
  return feriados.some((f) => mesmaData(f, date));
}

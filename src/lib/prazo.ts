import { addDays, isWeekend, startOfDay, differenceInDays, format } from "date-fns";
import { isFeriadoNacional } from "./feriados-nacionais";

/**
 * Soma dias úteis (pula sábado/domingo e feriado nacional) a uma data — usado
 * pra calcular o vencimento do prazo de defesa de uma autuação ou de um PAS.
 * Feriados estaduais/municipais não entram (variam por município) — só os
 * nacionais, que valem em qualquer lugar do país.
 */
export function addBusinessDays(startDate: Date, days: number): Date {
  let date = new Date(startDate);
  let addedDays = 0;
  while (addedDays < days) {
    date = addDays(date, 1);
    if (!isWeekend(date) && !isFeriadoNacional(date)) {
      addedDays++;
    }
  }
  return date;
}

export interface PrazoInfo {
  remaining: number;
  date: string;
  status: 'vencido' | 'alerta' | 'normal';
}

/**
 * Calcula o vencimento do prazo de uma autuação finalizada. Compartilhado
 * entre a listagem de Documentos e o alerta da Dashboard, pra nunca divergir.
 */
export function calculateDeadline(doc: { status?: string; dataIntimacao?: any; prazoDias?: number }): PrazoInfo | null {
  if (doc.status !== 'finalizado') return null;
  const baseDate = doc.dataIntimacao ? new Date(doc.dataIntimacao) : new Date();
  const daysAllowed = doc.prazoDias || 15;

  const deadlineDate = addBusinessDays(baseDate, daysAllowed);
  const today = startOfDay(new Date());
  const remaining = differenceInDays(deadlineDate, today);

  return {
    remaining,
    date: format(deadlineDate, "dd/MM/yyyy"),
    status: remaining < 0 ? 'vencido' : remaining <= 3 ? 'alerta' : 'normal'
  };
}

/**
 * Soma prazo processual respeitando a contagem da esfera aplicável.
 *
 * Existe porque a regra não é a mesma em todo lugar: o rito estadual conta em
 * dias úteis (Art. 88, §2º, da Lei Estadual nº 20.656/2021), enquanto o código
 * sanitário de Prudentópolis fala apenas em "dias" (Arts. 30, VI, e 38 da Lei
 * nº 2.276/2017) — e sem a qualificação, contam-se corridos. Contar útil onde a
 * lei diz corrido estende o prazo de ofício e vicia a certidão de decurso; o
 * inverso encurta um prazo de defesa, que é pior ainda.
 */
export function addPrazo(startDate: Date, days: number, contagem: 'corridos' | 'uteis'): Date {
  return contagem === 'uteis' ? addBusinessDays(startDate, days) : addDays(new Date(startDate), days);
}

import { addDays, isWeekend, startOfDay, differenceInDays, format } from "date-fns";

/**
 * Soma dias úteis (pula sábado/domingo) a uma data — usado pra calcular o
 * vencimento do prazo de defesa de uma autuação. Não desconta feriados.
 */
export function addBusinessDays(startDate: Date, days: number): Date {
  let date = new Date(startDate);
  let addedDays = 0;
  while (addedDays < days) {
    date = addDays(date, 1);
    if (!isWeekend(date)) {
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

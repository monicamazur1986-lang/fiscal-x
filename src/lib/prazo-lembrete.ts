import type { Inspecao } from "./types";

/**
 * Ponte entre um prazo calculado (autuação ou PAS) e um lembrete de verdade
 * na Agenda — reaproveita `useInspecoes().saveInspecao`/`deleteInspecao`
 * (src/hooks/use-inspecoes.ts), que já são funções desacopladas da tela de
 * Agenda e já disparam notificação push sozinhas via o cron existente
 * (src/app/api/cron/verificar-alarmes/route.ts) quando `alertaMinutosAntes`
 * está definido. Não precisa nenhum código novo de notificação — só criar a
 * `Inspecao` certa.
 *
 * Prazo é por DIA, não por hora, então o lembrete é criado com alguns dias
 * de antecedência (não "minutos antes do vencimento exato").
 */

const DIAS_ANTECEDENCIA_PADRAO = 2;
const ALERTA_MINUTOS_ANTES_PADRAO = 60; // "1 hora antes" do horário do lembrete, na manhã do dia de antecedência

type SaveInspecao = (data: Partial<Inspecao>, id?: string) => Promise<{ id: string; synced: boolean }>;
type DeleteInspecao = (id: string) => Promise<void>;

export async function criarLembretePrazo(
  saveInspecao: SaveInspecao,
  params: {
    titulo: string;
    descricao?: string;
    prazoISO: string; // data de vencimento do prazo (ISO)
    diasAntecedencia?: number;
    fiscalId: string;
    fiscalNome: string;
    municipioId: string;
  }
): Promise<string> {
  const dias = params.diasAntecedencia ?? DIAS_ANTECEDENCIA_PADRAO;
  const dataLembrete = new Date(params.prazoISO);
  dataLembrete.setDate(dataLembrete.getDate() - dias);
  dataLembrete.setHours(8, 0, 0, 0); // horário fixo de manhã — prazo não tem hora própria

  // descricao só entra no objeto quando informada — um `undefined` explícito
  // faz o Firestore rejeitar a gravação inteira (addDoc/setDoc não aceitam
  // esse valor em nenhum campo).
  const { id } = await saveInspecao({
    titulo: params.titulo,
    ...(params.descricao ? { descricao: params.descricao } : {}),
    data: dataLembrete,
    fiscalId: params.fiscalId,
    fiscalNome: params.fiscalNome,
    municipioId: params.municipioId,
    status: 'pendente',
    alertaMinutosAntes: ALERTA_MINUTOS_ANTES_PADRAO,
  });
  return id;
}

export async function cancelarLembretePrazo(deleteInspecao: DeleteInspecao, inspecaoId?: string | null): Promise<void> {
  if (!inspecaoId) return;
  try {
    await deleteInspecao(inspecaoId);
  } catch (e) {
    // Lembrete órfão (já apagado manualmente, por exemplo) não deve impedir
    // a ação principal (registrar defesa, excluir autuação etc.).
    console.warn('Falha ao cancelar lembrete de prazo na Agenda:', e);
  }
}

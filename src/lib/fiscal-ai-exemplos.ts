import { db } from '@/lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { normalizeId } from '@/lib/utils';

interface SalvarExemploParams {
  caseDescription: string;
  reportType: string;
  draftGerado: string;
  fundamentacao?: string;
  engine: 'local' | 'cloud';
  municipioId: string;
  createdBy: string;
  createdByName?: string;
}

/**
 * Guarda o rascunho que o fiscal decidiu exportar pro formulário de autuação
 * como um "bom exemplo" — sinal implícito de aprovação (se o texto não
 * estivesse bom, o fluxo natural seria limpar e gerar de novo, não exportar).
 * Usado depois em generate-intimacao-draft.ts como referência de estilo.
 */
export async function salvarExemploFiscalAi(params: SalvarExemploParams): Promise<void> {
  if (!db || !params.municipioId) return;
  const targetId = doc(collection(db, 'fiscalAiExemplos')).id;
  const docData = {
    id: targetId,
    caseDescription: params.caseDescription,
    reportType: params.reportType,
    draftGerado: params.draftGerado,
    fundamentacao: params.fundamentacao || '',
    engine: params.engine,
    municipioId: normalizeId(params.municipioId),
    createdBy: params.createdBy,
    createdByName: params.createdByName || '',
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'fiscalAiExemplos', targetId), docData);
  } catch {
    // Falha ao gravar o exemplo não pode travar o fluxo principal do fiscal
    // (exportar o rascunho pro formulário) — é só um efeito colateral.
  }
}

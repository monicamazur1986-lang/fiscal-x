export type RoteiroCatalogItem = {
  id: string;
  titulo: string;
  categoria: string;
  iconName: 'tooth' | 'utensils' | 'pill' | 'syringe' | 'radiation' | 'scan' | 'stethoscope' | 'building' | 'ambulance' | 'activity';
  base: string;
  itens: number;
  municipioId?: string;
  tipo?: 'roi';
  pdfUrl?: string;
};

export const roteirosCatalog: RoteiroCatalogItem[] = [
  {
    id: 'odontologia',
    titulo: 'Roteiro de Inspeção de Odontologia',
    categoria: 'Saúde',
    iconName: 'tooth',
    base: 'Resolução SESA nº 0414/2001',
    itens: 183,
  },
  {
    id: 'odontologia-prudentopolis',
    titulo: 'Guia de Inspeção Consultórios/Clínicas Odontológicas',
    categoria: 'Saúde',
    iconName: 'tooth',
    base: 'RDC 063/11 e Res. SESA',
    municipioId: 'prudentopolis',
    itens: 57,
  },
  {
    id: 'clinica-estetica-prudentopolis',
    titulo: 'Guia de Inspeção para Clínica de Estética',
    categoria: 'Saúde',
    iconName: 'syringe',
    base: 'RDC 63/2011 e Dec. Est. 5.711/2002',
    municipioId: 'prudentopolis',
    itens: 60,
  },
  {
    id: 'alimentacao',
    titulo: 'Roteiro de Inspeção de Serviços de Alimentação',
    categoria: 'Saúde',
    iconName: 'utensils',
    base: 'RDC 275/2002 e RDC 216/2004',
    itens: 108,
  },
  {
    id: 'farmacia',
    titulo: 'Roteiro de Auto-Inspeção de Farmácias e Drogarias',
    categoria: 'Saúde',
    iconName: 'pill',
    base: 'Lei 5.991/1973 e RDC 44/2009',
    itens: 101,
  },
  {
    id: 'guia-clinica-estetica',
    titulo: 'Guia de Inspeção para Clínica de Estética',
    categoria: 'Saúde',
    iconName: 'syringe',
    base: 'RDC 63/2011 e Dec. Est. 5.711/2002',
    itens: 60,
    pdfUrl: '/documentos-roteiros/GUIA-CLINICA-ESTETICA%20(1).pdf',
  },
  {
    id: 'guia-clinicas-de-saude',
    titulo: 'Guia de Inspeção para Clínicas de Saúde',
    categoria: 'Saúde',
    iconName: 'building',
    base: 'RDC 63/2011 e normas locais',
    itens: 52,
    pdfUrl: '/documentos-roteiros/guia-CLINICAS-DE-SAUDE.pdf',
  },
  {
    id: 'guia-supermercado',
    titulo: 'Guia de Inspeção para Supermercado',
    categoria: 'Saúde',
    iconName: 'utensils',
    base: 'RDC 275/2002 e legislação sanitária',
    itens: 68,
    pdfUrl: '/documentos-roteiros/GUIA-Supermercado.pdf',
  },
  {
    id: 'resolucao-sesa-126-07',
    titulo: 'Resolução SESA nº 126/2007',
    categoria: 'Legislação',
    iconName: 'building',
    base: 'Resolução SESA',
    itens: 12,
    pdfUrl: '/documentos-roteiros/Resolucao%20SESA%20126-07%20(2).pdf',
  },
  {
    id: 'roteiro-saa-subterraneo',
    titulo: 'Roteiro de Inspeção de SAA Subterrâneo',
    categoria: 'Saúde',
    iconName: 'building',
    base: 'SAA e saneamento',
    itens: 24,
    pdfUrl: '/documentos-roteiros/ROTEIRO%20DE%20INSPE%C3%87%C3%83O%20DE%20SAA%20-%20SUBTERRANEO.pdf',
  },
  {
    id: 'roi-radiografia-medica',
    titulo: 'ROI — Radiografia Médica',
    categoria: 'Saúde',
    iconName: 'scan',
    base: 'RDC 611/2022 e RDC 63/2011',
    itens: 36,
    tipo: 'roi',
  },
  {
    id: 'roi-mamografia',
    titulo: 'ROI — Mamografia',
    categoria: 'Saúde',
    iconName: 'activity',
    base: 'Roteiro objetivo de inspeção',
    itens: 36,
    tipo: 'roi',
  },
  {
    id: 'roi-radiologia-intervencionista',
    titulo: 'ROI — Radiologia Intervencionista',
    categoria: 'Saúde',
    iconName: 'stethoscope',
    base: 'Roteiro objetivo de inspeção',
    itens: 36,
    tipo: 'roi',
  },
  {
    id: 'roi-endoscopia',
    titulo: 'ROI — Endoscopia',
    categoria: 'Saúde',
    iconName: 'scan',
    base: 'Roteiro objetivo de inspeção',
    itens: 36,
    tipo: 'roi',
  },
  {
    id: 'roi-urgencia-e-emergencia',
    titulo: 'ROI — Urgência e Emergência',
    categoria: 'Saúde',
    iconName: 'ambulance',
    base: 'Roteiro objetivo de inspeção',
    itens: 36,
    tipo: 'roi',
  },
];

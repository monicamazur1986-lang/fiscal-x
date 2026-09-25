/**
 * Grupo pelo qual o roteiro aparece no menu de Roteiros de Inspeção.
 *
 * Existe porque `categoria` não separa nada na prática — 10 dos 17 roteiros
 * são "Saúde", o que deixava a tela como uma lista corrida. ROI da ANVISA e
 * roteiro municipal não precisam de `grupo`: saem de `tipo` e `municipioId`.
 */
export type GrupoRoteiro =
  | 'alimentos'
  | 'medicamentos'
  | 'servicos-saude'
  | 'estetica'
  | 'agua';

export type RoteiroCatalogItem = {
  id: string;
  titulo: string;
  categoria: string;
  /** Ausente em ROI e em roteiro municipal, que têm grupo próprio. */
  grupo?: GrupoRoteiro;
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
    grupo: 'servicos-saude',
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
    grupo: 'alimentos',
    titulo: 'Roteiro de Inspeção de Serviços de Alimentação',
    categoria: 'Saúde',
    iconName: 'utensils',
    base: 'RDC 275/2002 e RDC 216/2004',
    itens: 108,
  },
  {
    id: 'farmacia',
    grupo: 'medicamentos',
    titulo: 'Roteiro de Auto-Inspeção de Farmácias e Drogarias',
    categoria: 'Saúde',
    iconName: 'pill',
    base: 'Lei 5.991/1973 e RDC 44/2009',
    itens: 101,
  },
  {
    id: 'farmacia-resolucao-sesa-590-2014',
    grupo: 'medicamentos',
    titulo: 'Norma Técnica de Farmácias e Drogarias — Resolução SESA nº 590/2014',
    categoria: 'Saúde',
    iconName: 'pill',
    base: 'Resolução SESA nº 590/2014',
    itens: 108,
    pdfUrl: '/documentos-roteiros/resolucao5902014.pdf',
  },
  {
    id: 'guia-clinica-estetica',
    grupo: 'estetica',
    titulo: 'Guia de Inspeção para Clínica de Estética',
    categoria: 'Saúde',
    iconName: 'syringe',
    base: 'RDC 63/2011 e Dec. Est. 5.711/2002',
    itens: 60,
    pdfUrl: '/documentos-roteiros/GUIA-CLINICA-ESTETICA%20(1).pdf',
  },
  {
    id: 'guia-clinicas-de-saude',
    grupo: 'servicos-saude',
    titulo: 'Guia de Inspeção para Clínicas de Saúde',
    categoria: 'Saúde',
    iconName: 'building',
    base: 'RDC 63/2011 e normas locais',
    itens: 58,
    pdfUrl: '/documentos-roteiros/guia-CLINICAS-DE-SAUDE.pdf',
  },
  {
    id: 'guia-supermercado',
    grupo: 'alimentos',
    titulo: 'Guia de Inspeção para Supermercado',
    categoria: 'Saúde',
    iconName: 'utensils',
    base: 'RDC ANVISA nº 216/2004',
    itens: 52,
    pdfUrl: '/documentos-roteiros/GUIA-Supermercado.pdf',
  },
  {
    id: 'resolucao-sesa-126-07',
    grupo: 'estetica',
    titulo: 'Roteiro de Inspeção de Tatuagem, Piercing e Congêneres',
    categoria: 'Saúde',
    iconName: 'building',
    base: 'Resolução SESA nº 126/2007',
    itens: 46,
    pdfUrl: '/documentos-roteiros/Resolucao%20SESA%20126-07%20(2).pdf',
  },
  {
    id: 'salao-beleza-barbearia-depilacao',
    grupo: 'estetica',
    titulo: 'Roteiro de Inspeção de Salão de Beleza, Barbearia e Depilação',
    categoria: 'Saúde',
    iconName: 'building',
    base: 'Resolução SESA nº 700/2013',
    itens: 74,
    pdfUrl: '/documentos-roteiros/resolucao7002013.pdf',
  },
  {
    id: 'roteiro-saa-subterraneo',
    grupo: 'agua',
    titulo: 'Roteiro de Inspeção de SAA Subterrâneo',
    categoria: 'Saúde',
    iconName: 'building',
    base: 'SAA e saneamento',
    itens: 53,
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
  {
    id: 'roi-odontologia',
    titulo: 'ROI — Odontologia',
    categoria: 'Saúde',
    iconName: 'tooth',
    base: 'RDC nº 1.002/2025',
    itens: 51,
    tipo: 'roi',
  },
  {
    id: 'roi-laboratorio',
    titulo: 'ROI — Laboratório Clínico',
    categoria: 'Saúde',
    iconName: 'scan',
    base: 'RDC nº 786/2023',
    itens: 56,
    tipo: 'roi',
  },
  {
    id: 'roteiro-dedetizadoras',
    titulo: 'Roteiro de Inspeção de Empresas de Controle de Vetores e Pragas (Dedetizadoras)',
    categoria: 'Saúde',
    iconName: 'building',
    base: 'RDC Anvisa nº 622/2022',
    itens: 111,
    pdfUrl: '/documentos-roteiros/roteiro_inspecao_dedetizadoras_atualizado.pdf',
  },
  {
    id: 'roteiro-unico-radiologia',
    grupo: 'servicos-saude',
    titulo: 'Roteiro Único de Inspeção — Radiologia Diagnóstica (RX, Mamografia, Tomografia e Ressonância)',
    categoria: 'Saúde',
    iconName: 'radiation',
    base: 'RDC Anvisa nº 611/2022 + INs 90-97/2021',
    itens: 146,
    pdfUrl: '/documentos-roteiros/Roteiro_Unico_RDC611_Impressao.pdf',
  },
  {
    id: 'rdc-978-2025-eac',
    grupo: 'servicos-saude',
    titulo: 'Roteiro de Inspeção Sanitária — Exames de Análises Clínicas (EAC)',
    categoria: 'Saúde',
    iconName: 'scan',
    base: 'RDC Anvisa nº 978/2025',
    itens: 164,
    pdfUrl: '/documentos-roteiros/Roteiro_de_Inspe%C3%A7%C3%A3o_Sanit%C3%A1ria_%E2%80%94_RDC_Anvisa_n%C2%BA_978_2025.pdf',
  },
];

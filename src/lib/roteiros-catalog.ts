export type RoteiroCatalogItem = {
  id: string;
  titulo: string;
  categoria: string;
  iconName: 'tooth' | 'utensils' | 'pill' | 'syringe' | 'radiation';
  base: string;
  itens: number;
  municipioId?: string;
  tipo?: 'roi';
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
    id: 'roi-radiografia-medica',
    titulo: 'ROI — Radiografia Médica',
    categoria: 'Saúde',
    iconName: 'radiation',
    base: 'RDC 611/2022 e RDC 63/2011',
    itens: 36,
    tipo: 'roi',
  },
];

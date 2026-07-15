export interface AnvisaColumn {
  key: string;
  label: string;
}

export interface AnvisaDataset {
  key: string;
  label: string;
  description: string;
  downloadUrl: string;
  delimiter: string;
  encoding: string;
  searchPlaceholder: string;
  searchFields: string[];
  displayColumns: AnvisaColumn[];
  statusField?: string;
  statusActiveValues?: string[];
}

export const ANVISA_DATASETS: AnvisaDataset[] = [
  {
    key: 'empresas',
    label: 'Empresas (AFE)',
    description: 'Autorização de Funcionamento de Empresa (AFE) — empresas nacionais autorizadas pela ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/CONSULTAS/EMPRESA_FISCALIZACAO_PRODUTO/TA_CONSULTA_FUNCIONAMENTO_EMPRESA_NACIONAL.CSV',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'CNPJ ou razão social...',
    searchFields: ['NU_CNPJ', 'NO_RAZAO_SOCIAL', 'NO_FANTASIA'],
    displayColumns: [
      { key: 'NU_CNPJ', label: 'CNPJ' },
      { key: 'NO_RAZAO_SOCIAL', label: 'Razão Social' },
      { key: 'NO_FANTASIA', label: 'Nome Fantasia' },
      { key: 'NU_AUTORIZACAO', label: 'Nº AFE' },
      { key: 'ATIVO', label: 'Situação' },
      { key: 'CIDADE', label: 'Cidade' },
      { key: 'UF', label: 'UF' },
      { key: 'DT_AUTORIZACAO', label: 'Data Autorização' },
      { key: 'DT_CANCELAMENTO', label: 'Data Cancelamento' },
    ],
    statusField: 'ATIVO',
    statusActiveValues: ['SIM'],
  },
  {
    key: 'produtos-saude',
    label: 'Produtos de Saúde',
    description: 'Registros/notificações de produtos para saúde (correlatos, dispositivos médicos) na ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_PRODUTOS_SAUDE.CSV',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'CNPJ, empresa, produto ou nº de registro...',
    searchFields: ['NU_CNPJ_EMPRESA', 'NO_RAZAO_SOCIAL_EMPRESA', 'NO_PRODUTO', 'NU_REGISTRO_PRODUTO'],
    displayColumns: [
      { key: 'NO_PRODUTO', label: 'Produto' },
      { key: 'NU_REGISTRO_PRODUTO', label: 'Nº Registro' },
      { key: 'NO_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NU_CNPJ_EMPRESA', label: 'CNPJ' },
      { key: 'SITUACAO_REGISTRO', label: 'Situação' },
      { key: 'DT_VENCIMENTO_REGISTRO', label: 'Vencimento' },
    ],
    statusField: 'SITUACAO_REGISTRO',
    statusActiveValues: ['VÁLIDO', 'VALIDO'],
  },
  {
    key: 'medicamentos',
    label: 'Medicamentos',
    description: 'Registros de medicamentos junto à ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_MEDICAMENTOS.CSV',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'CNPJ, empresa, produto ou nº de registro...',
    searchFields: ['NU_CNPJ_EMPRESA', 'NO_RAZAO_SOCIAL_EMPRESA', 'NO_PRODUTO', 'NU_REGISTRO_PRODUTO'],
    displayColumns: [
      { key: 'NO_PRODUTO', label: 'Produto' },
      { key: 'NU_REGISTRO_PRODUTO', label: 'Nº Registro' },
      { key: 'NO_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NU_CNPJ_EMPRESA', label: 'CNPJ' },
      { key: 'SITUACAO_ASSUNTO', label: 'Situação' },
      { key: 'DT_VENCIMENTO_PRODUTO', label: 'Vencimento' },
    ],
    statusField: 'SITUACAO_ASSUNTO',
    statusActiveValues: ['VÁLIDO', 'VALIDO', 'DEFERIDO'],
  },
  {
    key: 'saneantes',
    label: 'Saneantes',
    description: 'Registros de saneantes (produtos de limpeza e afins) na ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_REGISTROS_SANEANTES.CSV',
    delimiter: ',',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'Nome do produto ou da empresa...',
    searchFields: ['NOME_PRODUTO', 'RAZAO_SOCIAL_EMPRESA', 'NUMERO_REGISTRO'],
    displayColumns: [
      { key: 'NOME_PRODUTO', label: 'Produto' },
      { key: 'NUMERO_REGISTRO', label: 'Nº Registro' },
      { key: 'RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'ST_SITUACAO_REGISTRO', label: 'Situação' },
      { key: 'DATA_VENCIMENTO_REGISTRO', label: 'Vencimento' },
    ],
    statusField: 'ST_SITUACAO_REGISTRO',
    statusActiveValues: ['ATIVO'],
  },
];

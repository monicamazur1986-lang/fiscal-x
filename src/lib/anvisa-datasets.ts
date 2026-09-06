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
      { key: 'VALIDADE_SITUACAO', label: 'Situação' },
      { key: 'DT_VENCIMENTO_PRODUTO', label: 'Vencimento' },
    ],
    statusField: 'VALIDADE_SITUACAO',
    statusActiveValues: ['ATIVO'],
  },
  {
    key: 'saneantes',
    label: 'Saneantes',
    description: 'Registros de saneantes (produtos de limpeza e afins) na ANVISA.',
    // URL antiga (DADOS_ABERTOS_REGISTROS_SANEANTES.CSV) retornava 404 —
    // conferida em 2026-09-06 direto no servidor da ANVISA.
    downloadUrl: 'https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_SANEANTES.CSV',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'Nome do produto ou da empresa...',
    searchFields: ['NU_CNPJ_EMPRESA', 'NO_RAZAO_SOCIAL_EMPRESA', 'NO_PRODUTO', 'NU_REGISTRO_PRODUTO'],
    displayColumns: [
      { key: 'NO_PRODUTO', label: 'Produto' },
      { key: 'NU_REGISTRO_PRODUTO', label: 'Nº Registro' },
      { key: 'NO_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NU_CNPJ_EMPRESA', label: 'CNPJ' },
      // Este dataset marca ativo/inativo com "S"/"N", não com texto —
      // diferente dos demais (ver statusActiveValues).
      { key: 'ST_PRODUTO_ATIVO', label: 'Situação' },
      { key: 'DT_VENCIMENTO_PRODUTO', label: 'Vencimento' },
    ],
    statusField: 'ST_PRODUTO_ATIVO',
    statusActiveValues: ['S'],
  },
  {
    key: 'alimentos',
    label: 'Alimentos',
    description: 'Produtos e registros de alimentos disponibilizados pela ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_ALIMENTO.csv',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'CNPJ, empresa ou nome do produto...',
    searchFields: ['NU_CNPJ_EMPRESA', 'NO_RAZAO_SOCIAL_EMPRESA', 'NO_PRODUTO', 'NU_REGISTRO_PRODUTO'],
    displayColumns: [
      { key: 'NO_PRODUTO', label: 'Produto' },
      { key: 'NU_REGISTRO_PRODUTO', label: 'Nº Registro' },
      { key: 'NO_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NU_CNPJ_EMPRESA', label: 'CNPJ' },
      { key: 'ST_SITUACAO_REGISTRO', label: 'Situação' },
      { key: 'DT_VENCIMENTO_REGISTRO', label: 'Vencimento' },
    ],
    statusField: 'ST_SITUACAO_REGISTRO',
    statusActiveValues: ['ATIVO', 'VALIDO', 'VÁLIDO'],
  },
  {
    key: 'cosmeticos',
    label: 'Cosméticos',
    description: 'Registros e produtos cosméticos autorizados junto à ANVISA.',
    // URL antiga (DADOS_ABERTOS_COSMETICO.csv) retornava 404 — conferida em
    // 2026-09-06 direto no servidor da ANVISA.
    downloadUrl: 'https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_COSMETICOS.CSV',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'CNPJ, empresa, nome do produto ou registro...',
    searchFields: ['NU_CNPJ_EMPRESA', 'NO_RAZAO_SOCIAL_EMPRESA', 'NO_PRODUTO', 'NU_REGISTRO'],
    displayColumns: [
      { key: 'NO_PRODUTO', label: 'Produto' },
      { key: 'NU_REGISTRO', label: 'Nº Registro' },
      { key: 'NO_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NU_CNPJ_EMPRESA', label: 'CNPJ' },
      // Mesmo formato "S"/"N" do dataset de Saneantes acima.
      { key: 'ST_SITUACAO_PRODUTO', label: 'Situação' },
      { key: 'DT_VENCIMENTO', label: 'Vencimento' },
    ],
    statusField: 'ST_SITUACAO_PRODUTO',
    statusActiveValues: ['S'],
  },
  {
    key: 'ensaios-clinicos',
    label: 'Ensaios Clínicos',
    description: 'Dados públicos de ensaios clínicos e protocolos registrados na ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_ENSAIOS_CLINICOS.CSV',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'Empresa, protocolo, produto ou código CE...',
    searchFields: ['NU_CNPJ_EMPRESA', 'NO_RAZAO_SOCIAL_EMPRESA', 'NOME_PRODUTO', 'CO_CE'],
    displayColumns: [
      { key: 'NOME_PRODUTO', label: 'Produto' },
      // Não é um "registro" (não é um produto comercial) — CO_CE é o código
      // do estudo/comitê de ética, único por linha neste arquivo.
      { key: 'CO_CE', label: 'Código CE' },
      { key: 'NO_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NU_CNPJ_EMPRESA', label: 'CNPJ' },
      { key: 'SITUACAO', label: 'Situação' },
      { key: 'DT_ATUALIZACAO', label: 'Atualizado em' },
    ],
    statusField: 'SITUACAO',
    // Vocabulário próprio de estudo clínico (CANCELADO/FINALIZADO/AUTORIZADO)
    // — não é ATIVO/VÁLIDO como nos demais datasets.
    statusActiveValues: ['AUTORIZADO'],
  },
  {
    key: 'cannabis',
    label: 'Cannabis',
    description: 'Produtos de cannabis e derivados com registro/controle na ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/TA_DA_PRODUTO_CANNABIS.CSV',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'Empresa, produto, registro ou CNPJ...',
    searchFields: ['NUMERO_CNPJ_EMPRESA', 'NOME_RAZAO_SOCIAL_EMPRESA', 'NOME_PRODUTO', 'NUMERO_REGISTRO_PRODUTO'],
    displayColumns: [
      { key: 'NOME_PRODUTO', label: 'Produto' },
      { key: 'NUMERO_REGISTRO_PRODUTO', label: 'Nº Registro' },
      { key: 'NOME_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NUMERO_CNPJ_EMPRESA', label: 'CNPJ' },
      { key: 'STATUS_VALIDADE_REGISTRO', label: 'Situação' },
      { key: 'DATA_VENCIMENTO_REGISTRO', label: 'Vencimento' },
    ],
    statusField: 'STATUS_VALIDADE_REGISTRO',
    statusActiveValues: ['ATIVO', 'VALIDO', 'VÁLIDO'],
  },
  {
    key: 'tabaco',
    label: 'Tabaco',
    description: 'Produtos de tabaco e dispositivos correlatos sob fiscalização da ANVISA.',
    downloadUrl: 'https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_PRODUTO_FUMIGENO.csv',
    delimiter: ';',
    encoding: 'ISO-8859-1',
    searchPlaceholder: 'Empresa, marca, produto ou nº de processo...',
    searchFields: ['NU_CNPJ_EMPRESA', 'NO_RAZAO_SOCIAL_EMPRESA', 'NO_PRODUTO', 'NU_PROCESSO'],
    displayColumns: [
      { key: 'NO_PRODUTO', label: 'Produto' },
      // Este dataset não tem número de registro — o nº do processo é o
      // identificador disponível.
      { key: 'NU_PROCESSO', label: 'Nº Processo' },
      { key: 'NO_RAZAO_SOCIAL_EMPRESA', label: 'Empresa' },
      { key: 'NU_CNPJ_EMPRESA', label: 'CNPJ' },
      { key: 'ST_SITUACAO_REGISTRO', label: 'Situação' },
      { key: 'DT_VENCIMENTO_REGISTRO', label: 'Vencimento' },
    ],
    statusField: 'ST_SITUACAO_REGISTRO',
    statusActiveValues: ['ATIVO', 'VALIDO', 'VÁLIDO'],
  },
];


export type Intimacao = {
  id: string;
  numeroProcesso: string;
  vara: string;
  comarca: string;
  autor: string;
  reu: string;
  reuCargo?: string;
  responsavelLegalConselho?: string;
  responsavelLegalIdentidade?: string;
  responsavelTecnico?: string;
  responsavelTecnicoConselho?: string;
  responsavelTecnicoIdentidade?: string;
  autoridades: Autoridade[];
  dataIntimacao: Date;
  dataRecebimento?: Date;
  dataRecebimentoTecnico?: Date;
  prazo: string;
  prazoDias?: number; 
  prazoJustificativa?: string;
  teor: string;
  tipoTermo?: string;
  status: 'finalizado' | 'rascunho';
  createdAt: string;
  createdBy?: string; 
  createdByName?: string; 
  cnpj?: string;
  endereco?: string;
  bairro?: string;
  legislacaoBase?: string;
  cnae?: string;
  telefone?: string;
  signatureResponsavel?: string; 
  signatureResponsavelTecnico?: string;
  folderId?: string;
  deleted?: boolean;
  deletedAt?: string;
  pdfUrl?: string; 
  dataDocumento?: string;
  horaDocumento?: string;
  secretariaOficial?: string;
  departamentoOficial?: string;
  recusouAssinar?: boolean;
  testemunha1Nome?: string;
  testemunha1Identidade?: string;
  testemunha2Nome?: string;
  testemunha2Identidade?: string;
  signatureTestemunha1?: string;
  signatureTestemunha2?: string;
  fotoDocumento?: string;
  municipioId?: string;
  documentoOrigemId?: string;
  autoInfracaoVinculadaId?: string;
};

export type Folder = {
  id: string;
  name: string;
  parentId?: string;
  createdBy: string;
  createdAt: string;
  deleted?: boolean;
  deletedAt?: string;
};

export type Autoridade = {
  id: string;
  nome: string;
  cargo: string;
  rg: string;
  signature?: string; 
  municipioId?: string;
};

export type Inspecao = {
  id: string;
  titulo: string;
  descricao?: string;
  data: Date;
  local?: string;
  fiscalId: string;
  fiscalNome: string;
  municipioId?: string;
  status: 'pendente' | 'prazo' | 'concluido' | 'cancelada' | 'arquivado' | 'rascunho';
  createdAt: string;
  updatedAt?: string;
  alertaMinutosAntes?: number;
  alertaEnviadoEm?: string;
  checklistData?: {
    answers: Record<string, 'SIM' | 'NAO' | 'ND'>;
    observations: Record<string, string>;
    itemPhotos: Record<string, any[]>;
    idData: any;
    roteiroId: string;
  };
};

export type LegislacaoDocumento = {
  id: string;
  titulo: string;
  categoria: string;
  esfera: 'municipal' | 'estadual' | 'federal';
  descricao: string;
  conteudoIntegral?: string;
  linkOficial?: string;
  pdfUrl?: string;
  keywords?: string;
  updatedAt: string;
  chunks?: string[];
};

export type ArtigoLegislacao = {
  id: string;
  label: string;
  texto: string;
  keywords?: string;
  linkOficial?: string;
};

export type CategoriaLegislacao = {
  titulo: string;
  descricao?: string;
  artigos: ArtigoLegislacao[];
};

export type LegislacaoData = {
  temas: Record<string, CategoriaLegislacao>;
};

export type UserProfile = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isAuthorized: boolean;
  role: 'admin' | 'fiscal' | 'root';
  municipioId: string;
  fiscalCode?: string;
};

export type Chamado = {
  id: string;
  tipo: 'erro' | 'duvida' | 'sugestao' | 'outro';
  assunto: string;
  descricao: string;
  pagina?: string;
  userAgent?: string;
  status: 'aberto' | 'em_andamento' | 'resolvido';
  resposta?: string;
  respondidoPor?: string;
  createdBy: string;
  createdByName?: string;
  createdByEmail?: string;
  municipioId: string;
  createdAt: string;
  updatedAt?: string;
};


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
  updatedAt?: string;
  createdBy?: string;
  createdByName?: string; 
  /** uids dos colegas que podem editar junto — ver schema.ts. */
  compartilhadoCom?: string[];
  compartilhadoComNomes?: { uid: string; nome: string }[];
  updatedBy?: string;
  updatedByName?: string;
  cnpj?: string;
  endereco?: string;
  bairro?: string;
  legislacaoBase?: string;
  cnae?: string;
  telefone?: string;
  signatureResponsavel?: string; 
  signatureResponsavelTecnico?: string;
  folderId?: string;
  /** Fixado pelo fiscal no menu Documentos, pra organizar a lista como preferir. */
  favorito?: boolean;
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
  /** Vistoria que originou este documento — ver schema.ts. */
  inspecaoId?: string;
  /** Bens alcançados pela medida — só nos termos de apreensão/inutilização.
   *  Estava no schema e era gravado, mas faltava aqui. */
  itensApreendidos?: { produto: string; marcaLote: string; quantidade: string; unidade: string; extras?: Record<string, string> }[];
  itensApreendidosColunas?: string[];
  /** Id do PAS (Processo Administrativo Sanitário) já aberto a partir deste
   * Auto de Infração — evita abrir um segundo PAS pro mesmo AI. */
  pasId?: string | null;
  /** Id da entrada de Agenda (Inspecao) criada como lembrete do prazo desta
   * autuação — guardado pra poder cancelar o lembrete se o documento for
   * excluído antes do vencimento (ver src/lib/prazo-lembrete.ts). */
  agendaLembreteId?: string;
};

export type Folder = {
  id: string;
  name: string;
  parentId?: string;
  municipioId: string;
  area: 'intimacoes' | 'docfacil' | 'pas';
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
  /** Link de volta pro processo/documento que gerou este lembrete de prazo
   * (ex.: `/pas/<id>`, `/intimacoes/<id>`) — ausente num compromisso manual
   * da Agenda ou num registro de vistoria de verdade. Ver criarLembretePrazo
   * em prazo-lembrete.ts e a lista "Todos os prazos" em agenda/page.tsx. */
  origemHref?: string;
  /** Pasta de organização no menu Documentos (mesma árvore de Intimações) — só usada em relatórios finalizados. */
  folderId?: string;
  /** Fixado pelo fiscal no menu Documentos, pra organizar a lista como preferir. */
  favorito?: boolean;
  /** Mesma lógica de lixeira de Intimações/Docfacil: mover pra lixeira só marca `deleted`, sem apagar de verdade. */
  deleted?: boolean;
  deletedAt?: string;
  checklistData?: {
    /** SIM/NÃO/ND nos roteiros comuns; '0'..'5' nos roteiros ROI da ANVISA, que são avaliados por nota (ver src/lib/roteiro-roi-radiologia.ts). */
    answers: Record<string, 'SIM' | 'NAO' | 'ND' | '0' | '1' | '2' | '3' | '4' | '5'>;
    observations: Record<string, string>;
    itemPhotos: Record<string, any[]>;
    /** Não conformidades incluídas manualmente pelo fiscal, fora do roteiro oficial. */
    customItems?: { id: string; text: string; crit: 'I' | 'N' | 'R' }[];
    idData: any;
    /**
     * Todas as atividades econômicas (CNAE) que a consulta de CNPJ trouxe da
     * BrasilAPI — principal e secundárias. Guardado junto da inspeção porque
     * um estabelecimento pode ter dezenas delas e o fiscal marca só as que
     * foram efetivamente inspecionadas (as marcadas ficam em idData.cnae);
     * sem persistir a lista, ao reabrir o rascunho não haveria mais como
     * revisar ou mudar a seleção sem consultar o CNPJ de novo.
     */
    cnaesDisponiveis?: string[];
    roteiroId: string;
    /** Textos editáveis de "Considerações Gerais" e "Conclusão e Prazo Legal" do relatório (HTML). */
    introducaoHtml?: string;
    conclusaoHtml?: string;
  };
};

export type LegislacaoDocumento = {
  id: string;
  titulo: string;
  categoria: string;
  esfera: 'municipal' | 'estadual' | 'federal';
  /** Só presente em documentos municipais — vem da pasta do manifest, nunca do conteúdo dele (evita erro de copiar/colar entre municípios). */
  municipioId?: string;
  /** Pasta temática da Biblioteca (ver TEMA_ORDER em src/app/biblioteca/page.tsx)
   * — ex.: "Alimentos e Bebidas", "Farmácias e Medicamentos". Ausente (ou
   * "Normas Gerais e Institucionais") pra códigos-base que cobrem qualquer
   * ramo de atividade, não um tema específico. */
  tema?: string;
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
  /**
   * Padrão PESSOAL de "Considerações Gerais" e "Conclusão e Prazo Legal" por
   * id de roteiro. Tem precedência sobre o padrão do município (ver
   * resolverIntroHtml em src/lib/roteiro-textos-padrao.ts) — quem assina o
   * relatório é o fiscal. Salvo pelo botão "Salvar como meu padrão" na tela de
   * preenchimento do roteiro.
   */
  roteiroTextos?: Record<string, { introducaoHtml?: string; conclusaoHtml?: string }>;
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

export type DocfacilTipo = 'oficio' | 'memorando' | 'circular';

export type DocfacilModelo = {
  id: string;
  codigo: number;
  tipo: DocfacilTipo;
  descricao: string;
  tags: string[];
  conteudo: string;
  municipioId: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
};

export type FiscalAiExemplo = {
  id: string;
  caseDescription: string;
  reportType: string;
  draftGerado: string;
  fundamentacao?: string;
  engine: 'local' | 'cloud';
  municipioId: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
};

export type DocfacilDocumento = {
  id: string;
  modeloId: string;
  tipo: DocfacilTipo;
  numero: string;
  destinatario: string;
  assunto: string;
  conteudo: string;
  municipioId: string;
  folderId?: string;
  /** 'rascunho' até o fiscal finalizar — só então o documento passa a ser
   * considerado emitido de fato (mas o número já é reservado desde o
   * primeiro salvamento, igual às autuações). */
  status: 'rascunho' | 'finalizado';
  /** Mesma lógica de lixeira já usada em Intimações — 'mover pra lixeira'
   * só marca deleted, sem apagar de verdade; a exclusão definitiva é uma
   * ação separada, só disponível de dentro da própria lixeira. */
  deleted?: boolean;
  deletedAt?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
};

/**
 * Processo Administrativo Sanitário — trilha guiada seguindo o Manual de
 * Apoio Teórico-Prático da SESA-PR (PAS, Manual 012/2023). Nasce sempre a
 * partir de um Auto de Infração já finalizado (`Intimacao` com
 * `tipoTermo === 'AUTO DE INFRAÇÃO'`), referenciado por `autoInfracaoId`.
 *
 * `fase` cobre as 4 fases do manual (Instauração → Instrução → Julgamento →
 * Arquivamento). A fase Recursal em si (processar um recurso de verdade)
 * ainda não tem tela própria — só a transição pra ela, ao emitir o TIP.
 */
export type PasFase =
  | 'instauracao'
  | 'instrucao'
  | 'aguardando_julgamento'
  | 'julgamento'
  | 'recursal'
  | 'arquivamento';

export type PasTempestividade = 'tempestiva' | 'intempestiva';

export type PasPecaTipo =
  | 'despacho_inicial'
  | 'despacho_instrucao'
  | 'relatorio_instrucao'
  | 'termo_juntada'
  | 'termo_informacao'
  | 'despacho_encerramento_instrucao'
  | 'julgamento_primeira_instancia'
  | 'despacho_encaminhamento_tip'
  | 'termo_imposicao_penalidade'
  | 'termo_retificacao'
  /** O próprio Auto de Infração (e o Termo de Apreensão/Interdição vinculado,
   * quando houver) que deu origem ao PAS — o PDF oficial completo, anexado
   * automaticamente ao abrir o processo. Não é "termo_juntada": juntada é
   * trazer algo de fora pra dentro de um processo que já existe, e são
   * justamente esses documentos que dão origem ao PAS, não algo recebido
   * depois (ver anexarDocumentosOrigemAoPas em use-pas.ts). */
  | 'documento_origem';

/** Uma peça dos autos — sempre numerada e cronológica, nunca reordenada nem
 * editada depois de criada (autos de processo real não se "corrigem", se
 * complementam com uma peça nova — ver `termo_retificacao` e `refPecaId`
 * abaixo, conforme Título III, Cap.2, §1.1–1.2 do manual: vício sanável vira
 * um NOVO ato que ratifica/reforma/converte o original, sem nunca apagar ou
 * editar o que já foi lavrado). */
export type PasPeca = {
  id: string;
  numero: number;
  tipo: PasPecaTipo;
  titulo: string;
  conteudoHtml: string;
  /** Presente quando a peça é a "capa" de um documento externo juntado aos
   * autos (prova, defesa, comprovante) — ver a regra de sempre juntar ANTES
   * do documento a que se refere, no Cap.2 do Título III do manual. */
  anexoUrl?: string;
  /** Assinatura manuscrita (data URL) de quem lavrou a peça — capturada na
   * revisão antes de gravar (ver PasPecaReviewDialog). Ausente só nas peças
   * geradas automaticamente sem revisão (termo de juntada de prova avulsa)
   * ou quando `assinadoForaDoSistema` é true. */
  assinaturaUrl?: string;
  /** true quando o gestor/fiscal optou por imprimir e assinar a peça no
   * papel, fora do sistema, em vez de assinar digitalmente — o processo não
   * pode ficar travado esperando uma assinatura digital que nunca vai vir.
   * Nesse caso o PDF sai sem imagem de assinatura (só a linha e o nome), pra
   * ser assinado à caneta depois de impresso. */
  assinadoForaDoSistema?: boolean;
  /** Só em peças do tipo `termo_retificacao` — número e id da peça que está
   * sendo corrigida. A peça original nunca é alterada; isso só serve pra
   * marcar visualmente "retificada pela peça nº X" na trilha. */
  refPecaId?: string;
  refPecaNumero?: number;
  /** Só em peças do tipo `documento_origem` — id do documento (Auto de
   * Infração ou termo vinculado) em `intimacoes/{id}` que deu origem ao PAS.
   * Não guarda um PDF nem anexo próprio: "ver"/"baixar" esta peça abre a
   * autuação original em /intimacoes/{id}, que já sabe renderizar e gerar o
   * PDF dela. Evita duplicar esse documento (e o próprio PDF) dentro do PAS
   * — e evita depender do Storage, cujas regras neste projeto não conseguem
   * ler o Firestore pra checar permissão (ver storage.rules). */
  origemIntimacaoId?: string;
  criadoPorUid: string;
  criadoPorNome: string;
  criadoEm: string;
};

export type Pas = {
  id: string;
  municipioId: string;
  /** Reaproveita o numeroProcesso do Auto de Infração de origem — o PAS não
   * tem numeração própria separada da autuação que o originou. */
  numeroProcesso: string;
  autoInfracaoId: string;
  /** Quem estava na inspeção já acompanha o PAS, sem precisar de
   * encaminhamento manual — copiado do compartilhadoCom do próprio Auto de
   * Infração no instante em que o PAS é aberto (ver compartilharComAutoridades
   * em use-intimacoes.ts e handleCriarPas em pas/page.tsx), já que o
   * casamento por nome de autoridade foi feito lá. Só dá LEITURA — agir no
   * processo continua exigindo ser createdBy, responsavelAtualUid (a "vez"
   * de alguém) ou gestor, igual já era; ver a regra de pas/{id} no
   * firestore.rules. */
  compartilhadoCom?: string[];
  compartilhadoComNomes?: { uid: string; nome: string }[];
  estabelecimento: {
    fantasia: string;
    cnpj?: string;
    endereco?: string;
  };
  fase: PasFase;
  autuanteUid: string;
  autuanteNome: string;
  /** Base do cálculo do prazo de defesa (ISO) — data de ciência do AI. */
  dataCienciaAI: string;
  /** addBusinessDays(dataCienciaAI, 15) — Art. 69, Lei 13.331/01. */
  prazoDefesaData?: string;
  defesa?: {
    recebidaEm: string;
    tempestividade: PasTempestividade;
    anexoUrl: string;
  } | null;
  /** Id da entrada de Agenda (Inspecao) do lembrete do prazo de defesa —
   * cancelado assim que a defesa (ou o Termo de Informação) é registrada. */
  agendaLembreteId?: string;
  /**
   * Pra quem o processo foi encaminhado explicitamente — evita o processo
   * ficar parado só porque nenhum gestor/fiscal do município percebeu que
   * era a vez dele de agir. Não é uma trava de permissão (qualquer um do
   * papel certo ainda pode agir) — é só um aviso claro de "encaminhado para
   * X", com notificação. `null` explícito (não `undefined`) quando ninguém
   * está designado, pra sempre poder limpar o campo no Firestore.
   */
  responsavelAtualUid?: string | null;
  responsavelAtualNome?: string | null;
  /** Lembrete/notificação criado ao encaminhar — cancelado quando alguém age. */
  encaminhamentoLembreteId?: string | null;
  /** Quem passou a vez pra responsavelAtualUid — seja um encaminhamento
   * manual (PasEncaminharDialog) ou automático (ex.: instrução concluída
   * devolvendo o despacho pro gestor que o emitiu). Usado só pra avisar essa
   * pessoa quando o processo "volta" pra ela (ver limparEncaminhamento em
   * pas/[id]/page.tsx) — não é trava de permissão, só endereço do aviso. */
  encaminhadoPorUid?: string | null;
  encaminhadoPorNome?: string | null;
  /** Pasta de organização (coleção `folders`, area: 'pas') — só arruma a
   * lista, não tem efeito nenhum no andamento jurídico do processo. */
  folderId?: string;
  /** Guardado pelo usuário pra tirar da vista sem mexer na fase legal — bem
   * diferente da fase `arquivamento`, que é o encerramento de verdade do
   * processo (Título III, Cap.4 do manual), alcançado pelo fluxo de
   * julgamento/TIP. Um PAS ainda em instrução pode ser arquivado aqui só
   * pra sair da lista principal, e devolvido dali a qualquer momento. */
  arquivado?: boolean;
  arquivadoEm?: string;
  /** Rascunho de um despacho/termo ainda não assinado — texto que se
   * perderia se o fiscal saísse da revisão antes de confirmar. Chave é o
   * tipo da peça (ou tipo+número da peça original, no caso da
   * retificação); some da lista assim que a peça de verdade é gravada
   * (ver limparRascunhoPeca em pas/[id]/page.tsx). */
  rascunhosPecas?: Record<string, {
    titulo: string;
    conteudoHtml: string;
    atualizadoEm: string;
    /** Só no rascunho do relatório: provas já enviadas ao Storage nesse
     * rascunho (um `File` do navegador não sobrevive à troca de aparelho,
     * só a URL depois de já estar na nuvem). */
    provas?: { url: string; nome: string }[];
  }>;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
};

/** Pergunta e resposta do Manual/Central de Ajuda — global, igual pra todos
 * os municípios (não é conteúdo legal/municipal, é sobre o próprio sistema). */
export type FaqItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  order: number;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
};

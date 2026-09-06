import {
  FileText,
  Sparkles,
  Archive,
  ClipboardList,
  CalendarDays,
  Library,
  Landmark,
  ShieldAlert,
  FileSignature,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import {
  CenaCartoes,
  CenaFormulario,
  CenaLista,
  CenaChecklist,
  CenaBusca,
  CenaTimbre,
} from "@/components/ajuda/manual-scenes";
import type { ReactNode } from "react";

export interface ManualStep {
  title: string;
  text: string;
  scene: ReactNode;
}

export interface ManualGuide {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  steps: ManualStep[];
}

// Mesmas cores dos cartões do Dashboard (ver dashboard-menu-items.ts) — cada
// guia do manual usa a cor do item que ele explica, pra criar uma associação
// visual direta entre "o card que eu toco" e "o manual que eu leio".
const CORES_MENU: Record<string, { icon: LucideIcon; cor: string }> = {
  "nova-autuacao": { icon: FileText, cor: "#1F7A5C" },
  "fiscal-ai": { icon: Sparkles, cor: "#9C7A3C" },
  agenda: { icon: CalendarDays, cor: "#3D5A73" },
  documentos: { icon: Archive, cor: "#524E45" },
  roteiros: { icon: ClipboardList, cor: "#6B4C80" },
  biblioteca: { icon: Library, cor: "#8A4B5C" },
  "consulta-anvisa": { icon: Landmark, cor: "#2F6668" },
  "risco-sanitario": { icon: ShieldAlert, cor: "#1F6B5C" },
  docfacil: { icon: FileSignature, cor: "#454680" },
  suporte: { icon: LifeBuoy, cor: "#A15437" },
};

export const MANUAL_GUIDES: ManualGuide[] = [
  {
    slug: "nova-autuacao",
    label: "Nova Autuação",
    description: "Como lavrar um auto de infração ou termo de intimação, do zero até o PDF.",
    icon: CORES_MENU["nova-autuacao"].icon,
    color: CORES_MENU["nova-autuacao"].cor,
    steps: [
      {
        title: "Toque em \"Nova Autuação\"",
        text: "No Dashboard ou no botão de Acesso Rápido, toque no cartão \"Nova Autuação\". Essa é a porta de entrada tanto para Auto de Infração quanto para os diversos Termos (Intimação, Interdição, Apreensão etc.).",
        scene: <CenaCartoes titulo="Dashboard" itens={[{ cor: "#1F7A5C" }, { cor: "#9C7A3C" }, { cor: "#3D5A73" }, { cor: "#524E45" }]} destaqueIndex={0} />,
      },
      {
        title: "Escolha o tipo de documento",
        text: "A tela pergunta qual documento você vai lavrar — os tipos aparecem agrupados por fase do processo (Abertura, Interdição, Apreensão/Inutilização, Encerramento). O mais comum pra começar um processo é o Auto de Infração. O documento já abre com o texto e o prazo padrão certos pra esse tipo.",
        scene: <CenaCartoes titulo="Qual documento?" itens={[{ cor: "#0E4A44" }, { cor: "#0E4A44" }, { cor: "#9C7A3C" }, { cor: "#9C7A3C" }]} destaqueIndex={0} />,
      },
      {
        title: "Preencha estabelecimento e responsável",
        text: "Informe o nome do estabelecimento, CNPJ, endereço e o responsável legal presente na fiscalização. Se você já tiver escaneado o documento pelo Scanner, esses campos vêm parcialmente preenchidos sozinhos.",
        scene: <CenaFormulario titulo="Nova Autuação" campos={3} destaqueIndex={0} botaoLabel="Continuar" />,
      },
      {
        title: "Descreva a irregularidade",
        text: "Escreva o que foi constatado na inspeção. Se preferir, use o Fiscal AI (o assistente de redação) pra transformar uma descrição informal num texto técnico formal antes de salvar.",
        scene: <CenaFormulario titulo="Nova Autuação" campos={3} destaqueIndex={2} botaoLabel="Continuar" />,
      },
      {
        title: "Confira o prazo calculado",
        text: "O sistema calcula sozinho o prazo de defesa em dias úteis, descontando fins de semana e feriados. Ele aparece na tela e depois também em Documentos, com alerta no Dashboard quando estiver perto de vencer.",
        scene: <CenaFormulario titulo="Nova Autuação" campos={2} botaoLabel="Gerar PDF" destaqueBotao />,
      },
      {
        title: "Salve como rascunho ou gere o PDF",
        text: "Você pode salvar a qualquer momento e continuar depois — ela fica em Documentos com status \"Rascunho\". Quando finalizar, gere o PDF oficial pra impressão ou envio.",
        scene: <CenaFormulario titulo="Nova Autuação" campos={1} botaoLabel="Gerar PDF" destaqueBotao />,
      },
    ],
  },
  {
    slug: "roteiros",
    label: "Roteiros de Inspeção",
    description: "Como preencher o checklist técnico da vistoria e gerar o relatório de não conformidades.",
    icon: CORES_MENU["roteiros"].icon,
    color: CORES_MENU["roteiros"].cor,
    steps: [
      {
        title: "Abra o roteiro da inspeção",
        text: "Em \"Roteiros\", escolha o catálogo correspondente ao tipo de estabelecimento (ex.: Odontologia) e toque para começar a preencher.",
        scene: <CenaLista titulo="Roteiros" linhas={3} destaqueIndex={0} />,
      },
      {
        title: "Identifique o estabelecimento",
        text: "Preencha nome fantasia, CNPJ/CPF e o responsável presente na vistoria antes de avançar para o checklist.",
        scene: <CenaFormulario titulo="Identificação" campos={3} destaqueIndex={0} botaoLabel="Iniciar checklist" />,
      },
      {
        title: "Marque Sim, Não ou Não se Aplica em cada item",
        text: "Cada seção do checklist mostra um contador de progresso (ex.: 6/15). Vá tocando SIM, NÃO ou N/A em cada item conforme constata na vistoria — o sistema salva sozinho a cada poucos segundos, então dá pra fechar e voltar depois sem perder nada.",
        scene: <CenaChecklist destaque="pilula" />,
      },
      {
        title: "Recolha e expanda seções por categoria",
        text: "Toque no título de uma seção pra recolher ou expandir — útil pra navegar direto pra categoria que está inspecionando no momento, sem rolar a tela toda.",
        scene: <CenaChecklist destaque="secao" />,
      },
      {
        title: "Adicione uma irregularidade fora do checklist",
        text: "Se encontrar um problema que não está listado, toque em \"Adicionar Não Conformidade\" — o formulário só abre quando você clica, mantendo a tela limpa quando não está em uso.",
        scene: <CenaChecklist destaque="campo" />,
      },
      {
        title: "Defina o prazo e gere o relatório",
        text: "Na seção \"Prazo para Regularização e Anexos\", informe os dias e a base legal. O texto de abertura e a conclusão do relatório já vêm preenchidos com o padrão do seu município (dá pra personalizar se quiser). Depois é só gerar o PDF do relatório.",
        scene: <CenaFormulario titulo="Finalizar Roteiro" campos={2} botaoLabel="Gerar Relatório" destaqueBotao />,
      },
    ],
  },
  {
    slug: "docfacil",
    label: "Docfacil",
    description: "Como usar os modelos prontos de ofício, memorando e circular — e entender o timbre do cabeçalho.",
    icon: CORES_MENU["docfacil"].icon,
    color: CORES_MENU["docfacil"].cor,
    steps: [
      {
        title: "Escolha um modelo",
        text: "Em Docfacil, escolha um dos modelos disponíveis (Ofício, Memorando, Circular). Os modelos com a marca \"Padrão do sistema\" valem para qualquer município — toque em \"Duplicar\" se quiser criar sua própria versão editável a partir de um deles.",
        scene: <CenaCartoes titulo="Docfacil" itens={[{ cor: "#454680" }, { cor: "#454680" }, { cor: "#454680" }, { cor: "#9C7A3C" }]} destaqueIndex={0} />,
      },
      {
        title: "Entenda o cabeçalho (timbre)",
        text: "O topo do documento é o timbre oficial: o brasão/logo de um lado, o nome e endereço do município centralizados, e o outro lado reservado — é assim que fica simétrico e alinhado, sem \"puxar\" o texto pra um canto.",
        scene: <CenaTimbre destaque="endereco" />,
      },
      {
        title: "Preencha os campos destacados",
        text: "O corpo do modelo já vem com a estrutura pronta e os trechos que precisam de substituição destacados — normalmente nome do destinatário, assunto e o teor específico do seu caso.",
        scene: <CenaTimbre destaque="corpo" />,
      },
      {
        title: "Revise com o Fiscal AI (opcional)",
        text: "Ao salvar, o sistema pergunta se você quer que a IA revise a gramática e o tom do texto antes de gravar — é opcional, dá pra salvar sem revisar também.",
        scene: <CenaFormulario titulo="Revisar com IA?" campos={0} botaoLabel="Revisar e Salvar" destaqueBotao />,
      },
      {
        title: "Salve e gere o documento",
        text: "Depois de salvo, o documento fica disponível pra reabrir e gerar o arquivo final a qualquer momento, sempre com o mesmo timbre oficial.",
        scene: <CenaFormulario titulo="Docfacil" campos={1} botaoLabel="Salvar" destaqueBotao />,
      },
    ],
  },
  {
    slug: "biblioteca",
    label: "Biblioteca",
    description: "Como encontrar rapidamente a legislação e as normas aplicáveis à sua fiscalização.",
    icon: CORES_MENU["biblioteca"].icon,
    color: CORES_MENU["biblioteca"].cor,
    steps: [
      {
        title: "Busque por palavra-chave",
        text: "Digite um termo (ex.: \"boas práticas\", \"vigilância sanitária\") pra filtrar a lista de leis e resoluções pelo nome ou pelo conteúdo.",
        scene: <CenaBusca titulo="Biblioteca" destaque="campo" />,
      },
      {
        title: "Filtre por esfera",
        text: "Use os filtros pra restringir por esfera — federal, estadual ou municipal. Documentos municipais só aparecem pra quem é daquele município; a esfera federal/estadual é visível pra todos.",
        scene: <CenaBusca titulo="Biblioteca" destaque="filtro" />,
      },
      {
        title: "Abra e leia o documento",
        text: "Toque no resultado pra abrir o texto completo da lei ou resolução, direto no navegador, sem precisar baixar nada.",
        scene: <CenaBusca titulo="Biblioteca" destaque="resultado" />,
      },
    ],
  },
  {
    slug: "fiscal-ai",
    label: "Fiscal AI",
    description: "Como transformar um relato da vistoria em rascunho técnico, ou tirar uma dúvida legal na hora.",
    icon: CORES_MENU["fiscal-ai"].icon,
    color: CORES_MENU["fiscal-ai"].cor,
    steps: [
      {
        title: "Descreva o que aconteceu",
        text: "Na aba \"Gerar Rascunho\", escreva o relato da ocorrência com suas palavras (dá pra ditar por voz também). Não precisa se preocupar com termo técnico — essa parte é só o relato cru da vistoria.",
        scene: <CenaFormulario titulo="Fiscal AI" campos={1} destaqueIndex={0} botaoLabel="Gerar rascunho" />,
      },
      {
        title: "Escolha a finalidade e a base legal",
        text: "Selecione se o texto é pra uma Intimação, Auto de Infração, Termo de Apreensão ou Interdição, e qual base legal usar (geral, estadual, municipal ou uma lei específica da Biblioteca).",
        scene: <CenaFormulario titulo="Fiscal AI" campos={2} destaqueIndex={1} botaoLabel="Gerar rascunho" />,
      },
      {
        title: "Gere e confira o enquadramento",
        text: "Toque em \"Gerar rascunho\". O resultado mostra o texto técnico pronto e o \"Enquadramento detectado\" — os artigos de lei usados na fundamentação, que dá pra conferir e ajustar antes de seguir em frente. Se aparecer aviso de cota, é só aguardar o tempo indicado e tentar de novo.",
        scene: <CenaFormulario titulo="Fiscal AI" campos={0} botaoLabel="Gerar rascunho" destaqueBotao />,
      },
      {
        title: "Exporte para a autuação",
        text: "Gostou do resultado? Toque em \"Exportar para o formulário de autuação\" — isso abre a tela de Nova Autuação já com o texto e a base legal preenchidos, só faltando revisar e gerar o PDF.",
        scene: <CenaFormulario titulo="Rascunho gerado" campos={1} botaoLabel="Exportar para o formulário de autuação" destaqueBotao />,
      },
      {
        title: "Ou tire uma dúvida na aba \"Perguntar\"",
        text: "Se você só quer entender uma norma (sem gerar documento nenhum), use a aba \"Perguntar\": é um chat que responde só com base na legislação sanitária já cadastrada no sistema — nunca inventa lei ou artigo.",
        scene: <CenaBusca titulo="Perguntar" destaque="campo" />,
      },
    ],
  },
  {
    slug: "agenda",
    label: "Agenda",
    description: "Como acompanhar os compromissos do dia e agendar novas vistorias.",
    icon: CORES_MENU["agenda"].icon,
    color: CORES_MENU["agenda"].cor,
    steps: [
      {
        title: "Veja os compromissos do dia",
        text: "A coluna \"Agenda do Dia\" mostra a lista de vistorias e compromissos marcados, com hora e fiscal responsável. A área principal também tem uma visão de calendário (mês, semana ou dia).",
        scene: <CenaLista titulo="Agenda do Dia" linhas={3} />,
      },
      {
        title: "Crie um novo agendamento",
        text: "Toque em \"Novo Registro\" e preencha estabelecimento, data e hora. Em \"Estágio Operacional\", indique se está Pendente, com Prazo de Adequação, Concluído ou Arquivado.",
        scene: <CenaFormulario titulo="Novo Agendamento" campos={4} destaqueIndex={0} botaoLabel="Confirmar" />,
      },
      {
        title: "Escolha quando quer ser alertado",
        text: "No campo \"Alertar\", defina o aviso — na hora marcada ou de 10 minutos a 1 hora antes. Ative os alertas do aparelho pra receber a notificação mesmo com o app fechado.",
        scene: <CenaFormulario titulo="Novo Agendamento" campos={4} destaqueIndex={3} botaoLabel="Confirmar" />,
      },
      {
        title: "Filtre por status",
        text: "Use os filtros \"Todos\", \"Pendentes\", \"Em Prazo\", \"Concluídos\" ou \"Arquivados\" no topo pra ver só o que interessa no momento.",
        scene: <CenaBusca titulo="Agenda" destaque="filtro" />,
      },
    ],
  },
  {
    slug: "documentos",
    label: "Documentos",
    description: "Como organizar autuações em pastas, mover, acompanhar prazos e baixar em lote.",
    icon: CORES_MENU["documentos"].icon,
    color: CORES_MENU["documentos"].cor,
    steps: [
      {
        title: "Crie uma pasta de trabalho",
        text: "Na barra lateral, em \"Pastas de Trabalho\", toque no ícone de nova pasta e dê um nome (ex.: \"Vistorias 2026\") — útil pra separar por bairro, tipo de estabelecimento ou o que fizer sentido pra sua rotina.",
        scene: <CenaFormulario titulo="Nova Pasta" campos={1} destaqueIndex={0} botaoLabel="Criar Pasta" />,
      },
      {
        title: "Selecione e mova documentos",
        text: "Marque a caixinha de um ou mais documentos na lista — aparece uma barra de ações com \"Mover pasta\". Escolha a pasta de destino (ou \"Visão geral\" pra tirar da pasta).",
        scene: <CenaLista titulo="Documentos" linhas={3} destaqueIndex={1} />,
      },
      {
        title: "Acompanhe status e prazo",
        text: "Cada item mostra um selo — \"Rascunho\" (ainda não finalizado) ou \"Final\" — e o prazo restante (\"Resta(m) N dias\", ou \"Expirado há N dias\"). Dá pra ajustar o prazo manualmente pelo menu do item, se precisar registrar uma justificativa.",
        scene: <CenaLista titulo="Documentos" linhas={3} destaqueIndex={0} />,
      },
      {
        title: "Baixe vários PDFs de uma vez",
        text: "Com documentos selecionados, toque em \"Baixar ZIP\" pra receber o PDF de cada um num único arquivo compactado — mais rápido que abrir e baixar um por um.",
        scene: <CenaFormulario titulo="Documentos" campos={0} botaoLabel="Baixar ZIP" destaqueBotao />,
      },
    ],
  },
  {
    slug: "risco-sanitario",
    label: "Risco Sanitário",
    description: "Como consultar o nível de risco e o porte de fiscalização de um estabelecimento pelo CNPJ.",
    icon: CORES_MENU["risco-sanitario"].icon,
    color: CORES_MENU["risco-sanitario"].cor,
    steps: [
      {
        title: "Informe o CNPJ",
        text: "Digite o CNPJ do estabelecimento (a busca é só por CNPJ — não por nome ou CNAE) e toque em \"Consultar Risco Sanitário\".",
        scene: <CenaFormulario titulo="Risco Sanitário" campos={1} destaqueIndex={0} botaoLabel="Consultar Risco Sanitário" />,
      },
      {
        title: "Veja a classificação",
        text: "O resultado mostra o selo de risco (Baixo, Médio, Alto, Condicionado ou \"Atividade Não Localizada\") e o porte de fiscalização, além de exigências específicas — como Projeto Básico de Arquitetura — quando aplicável.",
        scene: <CenaBusca titulo="Risco Sanitário" destaque="resultado" />,
      },
      {
        title: "Confira CNAE por CNAE",
        text: "Se o estabelecimento tiver mais de uma atividade (CNAE), cada uma aparece com seu próprio selo de risco. Quando um CNAE for \"Risco Condicionado\", o sistema faz uma pergunta extra pra refinar a classificação daquele CNAE específico.",
        scene: <CenaLista titulo="CNAEs" linhas={2} destaqueIndex={0} />,
      },
    ],
  },
  {
    slug: "consulta-anvisa",
    label: "Consulta ANVISA",
    description: "Como buscar registros e empresas nas bases oficiais da ANVISA.",
    icon: CORES_MENU["consulta-anvisa"].icon,
    color: CORES_MENU["consulta-anvisa"].cor,
    steps: [
      {
        title: "Escolha a base de dados",
        text: "Na lista lateral \"Objeto da pesquisa\", escolha o que você quer consultar — Empresas, Medicamentos, Produtos para Saúde, Saneantes, Cosméticos, entre outras.",
        scene: <CenaLista titulo="Objeto da pesquisa" linhas={4} destaqueIndex={0} />,
      },
      {
        title: "Busque por texto livre",
        text: "Digite nome, CNPJ ou número de registro (o campo se adapta à base escolhida) e toque em \"Buscar\".",
        scene: <CenaBusca titulo="Consulta ANVISA" destaque="campo" />,
      },
      {
        title: "Confira a situação na lista de resultados",
        text: "Os resultados mostram um selo de situação (ativo/inativo, conforme a base). Se aparecer o aviso de limite de linhas, refine a busca pra reduzir o resultado.",
        scene: <CenaBusca titulo="Consulta ANVISA" destaque="resultado" />,
      },
    ],
  },
  {
    slug: "suporte",
    label: "Suporte Técnico",
    description: "Como reportar um erro ou enviar uma sugestão pra equipe.",
    icon: CORES_MENU["suporte"].icon,
    color: CORES_MENU["suporte"].cor,
    steps: [
      {
        title: "Abra um chamado",
        text: "Descreva o problema ou a sugestão com o máximo de detalhe possível (o que você esperava que acontecesse, e o que aconteceu de fato). A equipe responde no mesmo chamado, e você recebe uma notificação quando ele for resolvido.",
        scene: <CenaFormulario titulo="Suporte Técnico" campos={1} destaqueIndex={0} botaoLabel="Enviar" destaqueBotao />,
      },
    ],
  },
];

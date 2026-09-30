import {
  FileText,
  Sparkles,
  ClipboardList,
  CalendarDays,
  Library,
  Landmark,
  ShieldAlert,
  FileSignature,
  LifeBuoy,
  Scale,
  type LucideIcon,
} from "lucide-react";

export interface DashboardMenuItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Emoji exibido na bolha clara por cima do cartão colorido — mais rico
   * que o ícone de linha branco, sem abrir mão da cor cheia do cartão (ver
   * comentário abaixo). */
  emoji: string;
  color: string;
  /** Módulo já acessível, mas ainda em construção — o item continua clicável
   * e ganha um selo "em desenvolvimento" no menu, pra ninguém tratar o que
   * sai dele como produto acabado. */
  emDesenvolvimento?: boolean;
}

// Cartões coloridos (mantendo a distinção visual rápida entre os itens), com
// tons abatidos/profundos adaptados à paleta institucional — não os puros do
// Tailwind, pra não destoar do papel/verde-petróleo/latão do resto do
// sistema. Cada cor vira um gradiente sutil de dois tons (ver darkenHex
// abaixo) em vez de um preenchimento chapado.
//
// DELIBERADAMENTE DIFERENTE do padrão de emoji em distintivo claro usado no
// resto do sistema (Biblioteca, Roteiros, Identidade Municipal etc.): aqui a
// cor É o cartão inteiro, de propósito — é o menu principal, com poucos
// módulos grandes, e a cor cheia é o que deixa a pessoa achar o módulo certo
// ("SEMPRE aquele verde", "SEMPRE aquele roxo") sem precisar ler o texto.
// O emoji entra por cima, numa bolha translúcida branca (ver
// dashboard-menu-grid.tsx) — cor mais rica que o ícone de linha, sem abrir
// mão do cartão cheio que ajuda a localização.
export const DASHBOARD_MENU_ITEMS: DashboardMenuItem[] = [
  { href: "/intimacoes", label: "Autuações", description: "Lavrar, retomar rascunho ou consultar autuações emitidas", icon: FileText, emoji: "🧾", color: "#1F7A5C" },
  { href: "/rascunho", label: "Fiscal AI", description: "Gerar rascunho ou tirar dúvidas com inteligência artificial", icon: Sparkles, emoji: "✨", color: "#9C7A3C" },
  { href: "/agenda", label: "Agenda", description: "Compromissos e inspeções do dia", icon: CalendarDays, emoji: "📅", color: "#3D5A73" },
  { href: "/roteiros", label: "Roteiros", description: "Checklists técnicos de inspeção", icon: ClipboardList, emoji: "📋", color: "#6B4C80" },
  { href: "/pas", label: "PAS", description: "Processo Administrativo Sanitário", icon: Scale, emoji: "⚖️", color: "#7A2E3B" },
  { href: "/biblioteca", label: "Biblioteca", description: "Legislação e normas aplicáveis", icon: Library, emoji: "📚", color: "#8A4B5C" },
  { href: "/consulta-anvisa", label: "Consulta ANVISA", description: "Registros e processos sanitários", icon: Landmark, emoji: "🏛️", color: "#2F6668" },
  { href: "/risco-sanitario", label: "Risco Sanitário", description: "Classificação de risco por CNPJ/CNAE", icon: ShieldAlert, emoji: "🛡️", color: "#1F6B5C" },
  { href: "/docfacil", label: "Docfacil", description: "Modelos e documentos administrativos", icon: FileSignature, emoji: "📝", color: "#454680" },
  { href: "/suporte", label: "Suporte Técnico", description: "Abrir chamado com a equipe", icon: LifeBuoy, emoji: "🛟", color: "#A15437" },
];

/** Escurece uma cor hex em `amount` (0-255) por canal — usado pra gerar o 2º
 * ponto do gradiente de cada cartão a partir da cor-base já escolhida, sem
 * precisar cadastrar um par de tons pra cada item à mão. */
export function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

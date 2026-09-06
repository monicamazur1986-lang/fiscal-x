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

export interface DashboardMenuItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

// Cartões coloridos (mantendo a distinção visual rápida entre os itens), com
// tons abatidos/profundos adaptados à paleta institucional — não os puros do
// Tailwind, pra não destoar do papel/verde-petróleo/latão do resto do
// sistema. Cada cor vira um gradiente sutil de dois tons (ver darkenHex
// abaixo) em vez de um preenchimento chapado.
export const DASHBOARD_MENU_ITEMS: DashboardMenuItem[] = [
  { href: "/intimacoes/nova", label: "Nova Autuação", description: "Termo de intimação ou auto de infração", icon: FileText, color: "#1F7A5C" },
  { href: "/rascunho", label: "Fiscal AI", description: "Gerar rascunho ou tirar dúvidas com inteligência artificial", icon: Sparkles, color: "#9C7A3C" },
  { href: "/agenda", label: "Agenda", description: "Compromissos e inspeções do dia", icon: CalendarDays, color: "#3D5A73" },
  { href: "/intimacoes", label: "Documentos", description: "Autuações emitidas e rascunhos", icon: Archive, color: "#524E45" },
  { href: "/roteiros", label: "Roteiros", description: "Checklists técnicos de inspeção", icon: ClipboardList, color: "#6B4C80" },
  { href: "/biblioteca", label: "Biblioteca", description: "Legislação e normas aplicáveis", icon: Library, color: "#8A4B5C" },
  { href: "/consulta-anvisa", label: "Consulta ANVISA", description: "Registros e processos sanitários", icon: Landmark, color: "#2F6668" },
  { href: "/risco-sanitario", label: "Risco Sanitário", description: "Classificação de risco por CNPJ/CNAE", icon: ShieldAlert, color: "#1F6B5C" },
  { href: "/docfacil", label: "Docfacil", description: "Modelos e documentos administrativos", icon: FileSignature, color: "#454680" },
  { href: "/suporte", label: "Suporte Técnico", description: "Abrir chamado com a equipe", icon: LifeBuoy, color: "#A15437" },
];

/** Escurece uma cor hex em `amount` (0-255) por canal — usado só pra gerar o
 * 2º ponto do gradiente de cada cartão a partir da cor-base já escolhida, sem
 * precisar cadastrar um par de tons pra cada item à mão. */
export function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

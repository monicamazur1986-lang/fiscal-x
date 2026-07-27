
"use client"

import {
  ClipboardList,
  Search,
  ChevronRight,
  ShieldCheck,
  Building2,
  ChevronsUpDown,
  UtensilsCrossed,
  Pill,
  Syringe,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useMemo, useState } from "react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAuth } from "@/hooks/use-auth"
import { normalizeId } from "@/lib/utils"
import municipiosPR from "@/lib/municipios-pr.json"

// ÍCONE CUSTOMIZADO: DENTE (ODONTOLOGIA)
const ToothIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 8c.5-4.5 2.5-5 7-5s6.5.5 7 5c.3 3.5-1 5-2 6 .5 3 0 5.5-1.5 7-1.5-1.5-2-4-1.5-7-.5-.5-1.5-.5-2 0 .5 3 0 5.5-1.5 7-1.5-1.5-2-4-1.5-7-1-1-2.3-2.5-2-6Z" />
  </svg>
)

const roteiros = [
  { id: 'odontologia', titulo: 'Roteiro de Inspeção de Odontologia', categoria: 'Saúde', icone: ToothIcon, base: 'Resolução SESA nº 0414/2001' },
  // Exclusivo do município de Prudentópolis — não aparece pra outras cidades
  // (ver filtro por municipioId logo abaixo).
  { id: 'odontologia-prudentopolis', titulo: 'Guia de Inspeção Consultórios/Clínicas Odontológicas', categoria: 'Saúde', icone: ToothIcon, base: 'RDC 063/11 e Res. SESA', municipioId: 'prudentopolis' },
  { id: 'clinica-estetica-prudentopolis', titulo: 'Guia de Inspeção para Clínica de Estética', categoria: 'Saúde', icone: Syringe, base: 'RDC 63/2011 e Dec. Est. 5.711/2002', municipioId: 'prudentopolis' },
  // Nível estadual — sem municipioId, visível a qualquer município.
  { id: 'alimentacao', titulo: 'Roteiro de Inspeção de Serviços de Alimentação', categoria: 'Saúde', icone: UtensilsCrossed, base: 'RDC 275/2002 e RDC 216/2004' },
  { id: 'farmacia', titulo: 'Roteiro de Auto-Inspeção de Farmácias e Drogarias', categoria: 'Saúde', icone: Pill, base: 'Lei 5.991/1973 e RDC 44/2009' },
]

export default function RoteirosPage() {
  const { profile } = useAuth()
  const isRoot = profile?.role === 'root'
  const [search, setSearch] = useState("")
  const [municipioPickerOpen, setMunicipioPickerOpen] = useState(false)
  const [municipioSearchTerm, setMunicipioSearchTerm] = useState("")
  const [selectedMunicipioForRoot, setSelectedMunicipioForRoot] = useState("")

  // Pro root, o município efetivo vem do seletor (só municipais globais até
  // escolher um); pros demais papéis, vem sempre do próprio perfil — mesmo
  // padrão já usado em Documentos/Configurações/Gestão de Suporte.
  const effectiveMunicipioId = isRoot
    ? (selectedMunicipioForRoot ? normalizeId(selectedMunicipioForRoot) : undefined)
    : profile?.municipioId ? normalizeId(profile.municipioId) : undefined

  const filteredMunicipiosPicker = useMemo(() => {
    const term = normalizeId(municipioSearchTerm);
    if (!term) return municipiosPR;
    return municipiosPR.filter(m => normalizeId(m).includes(term));
  }, [municipioSearchTerm]);

  const filteredRoteiros = roteiros
    .filter(r => !('municipioId' in r) || r.municipioId === effectiveMunicipioId)
    .filter(r =>
      r.titulo.toLowerCase().includes(search.toLowerCase()) ||
      r.categoria.toLowerCase().includes(search.toLowerCase())
    )

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        title="Roteiros"
        subtitle={isRoot ? (selectedMunicipioForRoot || "Todos os municípios") : "Instrumentos oficiais para fiscalização sanitária"}
        actions={isRoot ? (
          <Popover open={municipioPickerOpen} onOpenChange={setMunicipioPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors">
                <Building2 className="h-3.5 w-3.5" />
                {selectedMunicipioForRoot || "Selecionar município"}
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 bg-white border-[#E4DFD1] rounded-lg shadow-lg">
              <Command className="bg-transparent" shouldFilter={false}>
                <CommandInput
                  placeholder="Pesquisar município..."
                  value={municipioSearchTerm}
                  onValueChange={setMunicipioSearchTerm}
                  className="h-10 border-none focus:ring-0 text-sm"
                />
                <CommandList className="max-h-[300px] overflow-y-auto">
                  {filteredMunicipiosPicker.length === 0 && (
                    <CommandEmpty className="p-4 text-center text-xs text-[#A39D8C] font-medium">Não encontrado.</CommandEmpty>
                  )}
                  <CommandGroup>
                    <div
                      onClick={() => { setSelectedMunicipioForRoot(""); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                      className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm text-[#0E4A44] border-b border-[#F1EEE4]"
                    >
                      Nenhum (só roteiros globais)
                    </div>
                    {filteredMunicipiosPicker.map((m) => (
                      <div
                        key={m}
                        onClick={() => { setSelectedMunicipioForRoot(m); setMunicipioPickerOpen(false); setMunicipioSearchTerm(""); }}
                        className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm border-b border-[#F1EEE4] last:border-0"
                      >
                        {m}
                      </div>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : undefined}
      />

      <div className="max-w-3xl mx-auto w-full p-4 sm:p-8 space-y-8 pb-40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A39D8C]" />
          <Input
            placeholder="Buscar roteiro por atividade ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-md border-[#E4DFD1] bg-white text-sm"
          />
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Roteiros Técnicos</h2>
          <div className="bg-white border border-[#E4DFD1] rounded-lg divide-y divide-[#F1EEE4] overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]">
            {filteredRoteiros.map((r) => (
              <Link key={r.id} href={`/roteiros/${r.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#FAF8F3] transition-colors">
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <r.icone className="h-4 w-4 text-[#9C7A3C] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-serif text-[15px] text-[#262420] truncate">{r.titulo}</p>
                    <p className="text-xs text-[#A39D8C] mt-0.5">{r.categoria} · Base: {r.base}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#C9C2AC] shrink-0" />
              </Link>
            ))}

            {filteredRoteiros.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center gap-2">
                <ClipboardList className="h-8 w-8 text-[#D8D2C0]" />
                <p className="text-xs text-[#A39D8C]">Nenhum roteiro técnico encontrado</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 bg-white border border-[#E4DFD1] rounded-lg p-4">
          <ShieldCheck className="h-4 w-4 text-[#1F7A5C] shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B6659] leading-relaxed">
            <strong className="text-[#262420]">Validade técnica:</strong> estes roteiros são ferramentas de apoio e não substituem o livre convencimento da autoridade sanitária. Sempre verifique as atualizações de resoluções da SESA e ANVISA.
          </p>
        </div>
      </div>
    </div>
  )
}

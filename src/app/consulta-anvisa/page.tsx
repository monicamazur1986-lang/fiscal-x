"use client"

import { useState, useEffect } from "react"
import { Search, Loader2, Info, SearchX, AlertTriangle, CalendarClock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ANVISA_DATASETS, type AnvisaDataset } from "@/lib/anvisa-datasets"
import { searchAnvisaIndex, getAnvisaSyncMeta, MAX_RESULTS, type AnvisaSyncMeta } from "@/lib/anvisa-firestore-search"

// Emoji por tipo de objeto pesquisado — mesmo padrão de badge colorido usado
// no resto do sistema (Biblioteca, Roteiros, menu principal etc.), em vez do
// ícone de linha único repetido pra tudo.
const DATASET_EMOJI: Record<string, string> = {
  empresas: "🏢",
  'produtos-saude': "🏥",
  medicamentos: "💊",
  saneantes: "🧴",
  alimentos: "🍽️",
  cosmeticos: "💅",
  'ensaios-clinicos': "🧪",
  cannabis: "🌿",
  tabaco: "🚬",
};

function DatasetPanel({ dataset }: { dataset: AnvisaDataset }) {
  const { toast } = useToast()
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  // O termo que produziu o resultado atual — não o que está sendo digitado.
  // Sem isso a mensagem de "nada encontrado" mudaria de texto enquanto a
  // pessoa redigita, dizendo que não achou algo que ainda nem foi buscado.
  const [termoBuscado, setTermoBuscado] = useState("")
  const [syncMeta, setSyncMeta] = useState<AnvisaSyncMeta | null>(null)

  useEffect(() => {
    getAnvisaSyncMeta(dataset.key).then(setSyncMeta).catch(() => setSyncMeta(null));
  }, [dataset.key]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const result = await searchAnvisaIndex(dataset, query.trim());
      setRows(result);
      setTermoBuscado(query.trim());
      // A resposta vazia agora é mostrada NA TELA (bloco mais abaixo). O
      // toast sozinho sumia em segundos e deixava a área em branco, sem
      // dizer se a busca tinha rodado.
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao buscar", description: "Não foi possível consultar o índice da ANVISA agora." });
    } finally {
      setIsSearching(false);
    }
  };

  const isActiveStatus = (row: Record<string, string>) => {
    if (!dataset.statusField || !dataset.statusActiveValues) return null;
    const value = (row[dataset.statusField] || "").trim().toUpperCase();
    return dataset.statusActiveValues.some(v => v.toUpperCase() === value);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#6B6659]">{dataset.description}</p>

      {/* A data dos dados é informação de trabalho, não rodapé: o fiscal
          precisa saber de quando é a base antes de concluir que um produto
          não tem registro. */}
      {syncMeta?.lastSyncAt ? (
        <div className="flex items-center gap-2 rounded-xl border border-[#E4DFD1] bg-[#FAF8F3] px-4 py-2.5 text-xs text-[#4A463D]">
          <CalendarClock className="h-4 w-4 shrink-0 text-[#0E4A44]" />
          <span>
            Dados da ANVISA atualizados em{" "}
            <strong>
              {new Date(syncMeta.lastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </strong>
            {typeof syncMeta.totalRows === 'number' && ` · ${syncMeta.totalRows.toLocaleString('pt-BR')} registros`}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Esta base ainda não foi sincronizada.</strong> Enquanto isso, a consulta não
            encontra nada — e a ausência de resultado aqui <strong>não significa</strong> que o
            produto ou a empresa não tenham registro na ANVISA.
          </span>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dataset.searchPlaceholder}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            className="h-12 rounded-xl border-2 border-primary/30 bg-primary/5 text-[#262420] font-medium placeholder:text-[#6B6659] focus:border-primary/60 focus:bg-white transition-colors"
          />
          <Button onClick={handleSearch} disabled={!query.trim() || isSearching} className="h-12 px-6 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold uppercase text-[11px] gap-2 shadow-md shrink-0">
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
          </Button>
        </div>
      </div>

      {/* NADA ENCONTRADO — e o que isso quer dizer.
          Este aviso existe por um motivo jurídico, não estético: "não
          encontrado" aqui significa apenas que o termo não bateu no índice
          que temos. Concluir daí que o produto é irregular e lavrar auto por
          falta de registro seria autuar com base numa busca, não numa prova. */}
      {hasSearched && !isSearching && rows.length === 0 && (
        <div className="rounded-2xl border border-[#E4DFD1] bg-white px-5 py-8 text-center">
          <SearchX className="mx-auto h-8 w-8 text-[#A39D8C]" />
          <p className="mt-3 font-serif text-lg text-[#262420]">Nenhum registro encontrado</p>
          <p className="mt-1 text-sm text-[#6B6659]">
            A busca por <strong className="text-[#262420]">“{termoBuscado}”</strong> não retornou
            resultados em {dataset.label}.
          </p>
          <div className="mx-auto mt-4 max-w-md space-y-1.5 text-left text-xs leading-relaxed text-[#6B6659]">
            <p>• Confira a grafia e tente um trecho menor do nome.</p>
            <p>• Busque pelo número do registro, sem pontos ou traços.</p>
            <p>• Tente pelo nome da empresa ou pelo CNPJ.</p>
          </div>
          <p className="mx-auto mt-4 max-w-md rounded-xl bg-[#FBF7EE] px-4 py-3 text-xs leading-relaxed text-[#7A5D2A]">
            <strong>Atenção:</strong> não encontrar aqui não comprova, por si só, que o produto ou a
            empresa estejam irregulares — a consulta cobre apenas o que já foi baixado da ANVISA
            {syncMeta?.lastSyncAt
              ? " (base de " + new Date(syncMeta.lastSyncAt).toLocaleDateString("pt-BR") + ")"
              : ""}
            . Antes de autuar por falta de registro, confirme no portal oficial da ANVISA.
          </p>
        </div>
      )}

      {hasSearched && rows.length > 0 && (
        <div className="space-y-2">
          {rows.length >= MAX_RESULTS && (
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
              <Info className="h-3.5 w-3.5" /> Mostrando os {MAX_RESULTS} primeiros resultados. Refine a busca para ver menos linhas.
            </div>
          )}
          <div className="border border-[#E4DFD1] rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  {dataset.displayColumns.map(col => <TableHead key={col.key}>{col.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {dataset.displayColumns.map(col => (
                      <TableCell key={col.key} className="text-xs">
                        {col.key === dataset.statusField ? (
                          <Badge className={cn("border-none font-bold", isActiveStatus(row) ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                            {row[col.key] || "-"}
                          </Badge>
                        ) : (row[col.key] || "-")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsultaAnvisaPage() {
  const [activeTab, setActiveTab] = useState(ANVISA_DATASETS[0].key);
  const activeDataset = ANVISA_DATASETS.find((dataset) => dataset.key === activeTab) ?? ANVISA_DATASETS[0];

  return (
    <div className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6 pb-40">
      <header className="flex flex-wrap items-center gap-4 bg-white p-4 md:p-6 rounded-[2rem] border border-[#E4DFD1] shadow-sm">
        <div className="h-14 w-14 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#2F66681A' }}>
          <span className="text-[28px] leading-none" role="img" aria-hidden="true">🏛️</span>
        </div>
        <div>
          <h1 className="font-serif text-xl md:text-2xl font-bold text-[#262420] leading-tight">Consulta ANVISA</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#A39D8C] mt-0.5">Empresas (AFE) e produtos regularizados</p>
        </div>
      </header>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Os dados vêm dos arquivos públicos da ANVISA (<span className="font-mono">dados.anvisa.gov.br</span>), sincronizados periodicamente para um índice próprio — a busca aqui é instantânea, sem precisar baixar nem carregar arquivo nenhum.
        </p>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-[2.5rem] border border-[#E4DFD1] shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-[1.5rem] border border-[#E4DFD1] bg-[#FAF8F3] p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#A39D8C]">Objeto da pesquisa</p>
              <span className="rounded-full bg-[#E4EEEC] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#0E4A44]">
                {activeDataset.label}
              </span>
            </div>

            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
              {ANVISA_DATASETS.map(ds => {
                const selected = activeTab === ds.key;

                return (
                  <button
                    key={ds.key}
                    type="button"
                    onClick={() => setActiveTab(ds.key)}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all",
                      selected
                        ? "border-[#0E4A44]/40 bg-white shadow-sm"
                        : "border-transparent bg-transparent hover:border-[#E4DFD1] hover:bg-white/60"
                    )}
                  >
                    <span className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: selected ? '#0E4A441A' : '#A39D8C1A' }}>
                      <span className="text-[18px] leading-none" role="img" aria-hidden="true">{DATASET_EMOJI[ds.key] || "📄"}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#262420]">
                        {ds.label}
                      </span>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#6B6659]">
                        {ds.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 rounded-[1.5rem] border border-[#E4DFD1] bg-[#FAF8F3]/60 p-3 md:p-5">
            <DatasetPanel dataset={activeDataset} />
          </div>
        </div>
      </div>
    </div>
  );
}

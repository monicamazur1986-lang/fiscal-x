"use client"

import { useState, useEffect } from "react"
import { Search, Loader2, Landmark, Info, RefreshCw, SearchX, AlertTriangle, CalendarClock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ANVISA_DATASETS, type AnvisaDataset } from "@/lib/anvisa-datasets"
import { searchAnvisaIndex, getAnvisaSyncMeta, MAX_RESULTS, type AnvisaSyncMeta } from "@/lib/anvisa-firestore-search"

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
      <p className="text-sm text-zinc-500">{dataset.description}</p>

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
            className="h-12 rounded-xl bg-white border-slate-200"
          />
          <Button onClick={handleSearch} disabled={!query.trim() || isSearching} className="h-12 px-6 rounded-xl font-black uppercase text-[10px] gap-2">
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
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
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
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-sky-500/10 text-sky-600"><Landmark className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Consulta ANVISA</h1>
            <p className="text-[8px] md:text-[9px] text-zinc-400 font-black uppercase tracking-[0.2em] mt-1">Empresas (AFE) e produtos regularizados</p>
          </div>
        </div>
      </header>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Os dados vêm dos arquivos públicos da ANVISA (<span className="font-mono">dados.anvisa.gov.br</span>), sincronizados periodicamente para um índice próprio — a busca aqui é instantânea, sem precisar baixar nem carregar arquivo nenhum.
        </p>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Objeto da pesquisa</p>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-sky-700">
                {activeDataset.label}
              </span>
            </div>

            <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {ANVISA_DATASETS.map(ds => {
                const selected = activeTab === ds.key;

                return (
                  <button
                    key={ds.key}
                    type="button"
                    onClick={() => setActiveTab(ds.key)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition-all",
                      selected
                        ? "border-sky-500 bg-white shadow-sm"
                        : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">
                        {ds.label}
                      </span>
                      {selected && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                        <span className="h-2 w-2 rounded-full bg-sky-600" />
                      </span>}
                    </div>
                    <p className="mt-2 text-[9px] leading-relaxed text-slate-500">
                      {ds.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-slate-50/60 p-3 md:p-5">
            <DatasetPanel dataset={activeDataset} />
          </div>
        </div>
      </div>
    </div>
  );
}

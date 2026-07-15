"use client"

import { useState, useEffect } from "react"
import { Search, Loader2, Landmark, Info, RefreshCw } from "lucide-react"

import { BackButton } from "@/components/back-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
      if (result.length === 0) {
        toast({ title: "Nenhum resultado encontrado" });
      }
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

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
        <RefreshCw className="h-3 w-3" />
        {syncMeta?.lastSyncAt
          ? `Atualizado em ${new Date(syncMeta.lastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
          : "Ainda não sincronizado"}
      </div>

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

  return (
    <div className="max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6 pb-40">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-sky-500/10 text-sky-600"><Landmark className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Consulta ANVISA</h1>
            <p className="text-[8px] md:text-[9px] text-zinc-400 font-black uppercase tracking-[0.2em] mt-1">Empresas (AFE) e produtos regularizados</p>
          </div>
        </div>
        <BackButton href="/dashboard" />
      </header>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Os dados vêm dos arquivos públicos da ANVISA (<span className="font-mono">dados.anvisa.gov.br</span>), sincronizados periodicamente para um índice próprio — a busca aqui é instantânea, sem precisar baixar nem carregar arquivo nenhum.
        </p>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full flex-wrap h-auto">
            {ANVISA_DATASETS.map(ds => (
              <TabsTrigger key={ds.key} value={ds.key} className="flex-1">{ds.label}</TabsTrigger>
            ))}
          </TabsList>
          {ANVISA_DATASETS.map(ds => (
            <TabsContent key={ds.key} value={ds.key} className="pt-6">
              <DatasetPanel dataset={ds} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

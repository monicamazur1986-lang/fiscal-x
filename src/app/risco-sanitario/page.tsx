"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Loader2,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
} from "lucide-react"

import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { auth } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import { analyzeRisk, resolveCnaeRisk, type Cnae, type RiskAnalysisResult, type RiskLevel } from "@/lib/risk-analysis"

interface CompanyData {
  razao_social: string;
  cnpj: string;
  cnaes: Cnae[];
}

const RISK_THEME: Record<RiskLevel, { text: string; bg: string; border: string; label: string }> = {
  'BAIXO': { text: 'text-[#1F7A5C]', bg: 'bg-[#E3F1EA]', border: 'border-[#1F7A5C]', label: 'Baixo Risco' },
  'MEDIO': { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-500', label: 'Médio Risco' },
  'ALTO': { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-500', label: 'Alto Risco' },
  'CONDICIONADO': { text: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-500', label: 'Risco Condicionado' },
  'NÃO ENCONTRADO': { text: 'text-[#6B6659]', bg: 'bg-[#F5F2EA]', border: 'border-[#E4DFD1]', label: 'Atividade Não Localizada' },
};

const PORTE_THEME: Record<string, { text: string; bg: string; border: string }> = {
  'Porte III': { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
  'Porte II e III': { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  'Porte I, II e III': { text: 'text-[#1F7A5C]', bg: 'bg-[#E3F1EA]', border: 'border-[#1F7A5C]/25' },
};

function getPorteTheme(porte?: string) {
  return (porte && PORTE_THEME[porte]) || PORTE_THEME['Porte I, II e III'];
}

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export default function RiscoSanitarioPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [cnpjInput, setCnpjInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [data, setData] = useState<CompanyData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const result: RiskAnalysisResult | null = useMemo(
    () => (data ? analyzeRisk(data.cnaes, answers) : null),
    [data, answers]
  );
  const theme = result ? RISK_THEME[result.level] : RISK_THEME['NÃO ENCONTRADO'];

  const handleNewQuery = () => {
    setData(null);
    setAnswers({});
    setApiError(null);
    setCnpjInput("");
  };

  const handleSearch = async () => {
    const cleaned = cnpjInput.replace(/\D/g, "");
    if (cleaned.length !== 14) {
      setApiError("O CNPJ deve ter 14 números.");
      return;
    }
    setApiError(null);
    setAnswers({});
    setIsSearching(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      const res = await fetch(`/api/cnpj/${cleaned}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setApiError(errData?.message || "CNPJ não localizado.");
        return;
      }
      const raw = await res.json();
      // A rota /api/cnpj devolve os CNAEs como texto "CODIGO - DESCRICAO"
      // (formato pensado pra exibição em Roteiros/Intimações) — aqui
      // separamos de volta em {code, description} pro motor de risco.
      const cnaesList: string[] = raw.cnaes_list || [];
      const cnaes: Cnae[] = cnaesList.map((entry) => {
        const idx = entry.indexOf(' - ');
        return idx === -1
          ? { code: entry.trim(), description: '' }
          : { code: entry.slice(0, idx).trim(), description: entry.slice(idx + 3).trim() };
      });
      setData({ razao_social: raw.razao_social || "NÃO INFORMADO", cnpj: formatCnpj(cleaned), cnaes });
    } catch (e) {
      setApiError("Falha técnica na comunicação com o serviço de consulta.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F2EA]">
      <DocfacilTopbar
        title="Classificação de Risco Sanitário"
        subtitle="Nível de risco e porte de fiscalização por CNAE, a partir do CNPJ"
      />

      <div className="max-w-3xl mx-auto w-full p-4 sm:p-8 pb-40 space-y-8">
        {!data ? (
          <div className="bg-white border border-[#E4DFD1] rounded-lg p-6 sm:p-10 shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)] space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[#E4EEEC] text-[#0E4A44]">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="font-serif text-lg text-[#262420]">Consultar CNPJ</p>
                <p className="text-xs text-[#A39D8C]">Resolução SESA nº 1.034/2020 e Decreto Estadual nº 10.590/2025</p>
              </div>
            </div>

            {apiError && (
              <div className="border-l-2 border-rose-500 bg-rose-50 px-4 py-3 rounded-r-md">
                <p className="text-sm text-rose-700">{apiError}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#6B6659]">CNPJ</Label>
              <Input
                value={cnpjInput}
                onChange={(e) => setCnpjInput(formatCnpj(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                className="h-12 rounded-md border-[#E4DFD1] bg-white text-lg font-mono text-center tracking-wide"
              />
            </div>

            <Button
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full h-11 rounded-md bg-[#0E4A44] hover:bg-[#0B3A35] text-xs font-medium uppercase tracking-wider gap-2"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isSearching ? "Consultando..." : "Consultar Risco Sanitário"}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className={cn("bg-white border rounded-lg overflow-hidden shadow-[0_1px_2px_rgba(38,36,32,0.04),0_8px_24px_-12px_rgba(38,36,32,0.12)]", theme.border, "border-t-2")}>
              <div className={cn("py-10 px-6 text-center border-b border-[#E4DFD1]", theme.bg)}>
                <p className={cn("text-xs font-semibold uppercase tracking-[0.15em] mb-2", theme.text)}>Classificação do Estabelecimento</p>
                <h2 className={cn("font-serif text-3xl sm:text-4xl", theme.text)}>{theme.label}</h2>
                {result?.porte && (
                  <div className={cn("mt-5 inline-flex px-4 py-2 rounded-md border items-center gap-2", getPorteTheme(result.porte).bg, getPorteTheme(result.porte).border)}>
                    <AlertCircle className={cn("h-3.5 w-3.5", getPorteTheme(result.porte).text)} />
                    <span className={cn("text-[11px] font-semibold uppercase tracking-wider", getPorteTheme(result.porte).text)}>
                      Responsabilidade Fiscal: {result.porte}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                <div className="text-center space-y-2">
                  <p className="font-serif text-lg text-[#262420]">{data.razao_social}</p>
                  <p className="font-mono text-sm text-[#0E4A44] tracking-wider">{data.cnpj}</p>
                </div>

                {result && (
                  <div className="bg-[#F5F2EA] border border-[#E4DFD1] rounded-md p-5 text-sm text-[#262420] leading-relaxed">
                    {result.message}
                  </div>
                )}

                {result?.requiresPba && (
                  <div className="border border-[#E4DFD1] rounded-md p-5 space-y-2">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Exigência de Projeto Básico de Arquitetura (PBA)</p>
                        <p className="text-sm text-[#6B6659] leading-relaxed">
                          Sujeita à aprovação prévia de Projeto Básico de Arquitetura pela Vigilância Sanitária, antes do início das operações e nas renovações da licença (art. 9º da Resolução SESA nº 1.034/2020).
                        </p>
                        {result.pbaNotes.map((note, i) => (
                          <p key={i} className="text-xs text-[#A39D8C] flex gap-1.5"><span>•</span>{note}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {result && result.specialProjectNotes.length > 0 && (
                  <div className="border border-[#E4DFD1] rounded-md p-5 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Exigência de Projeto Específico</p>
                    {result.specialProjectNotes.map((note, i) => (
                      <p key={i} className="text-sm text-[#6B6659] flex gap-1.5"><span>•</span>{note}</p>
                    ))}
                  </div>
                )}

                {result && result.porteNotes.length > 0 && (
                  <div className="border border-[#E4DFD1] rounded-md p-5 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Observação sobre o Porte de Fiscalização</p>
                    {result.porteNotes.map((note, i) => (
                      <p key={i} className="text-sm text-[#6B6659] flex gap-1.5"><span>•</span>{note}</p>
                    ))}
                  </div>
                )}

                {result && result.baixoRiscoNotes.length > 0 && (
                  <div className="border border-[#E4DFD1] rounded-md p-5 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Nota sobre Baixo Risco (Decreto Estadual nº 10.590/2025)</p>
                    {result.baixoRiscoNotes.map((note, i) => (
                      <p key={i} className="text-sm text-[#6B6659] flex gap-1.5"><span>•</span>{note}</p>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Detalhamento por CNAE</p>
                  <div className="border-t border-[#E4DFD1] divide-y divide-[#F1EEE4]">
                    {data.cnaes.map((c, idx) => {
                      const cnaeRes = resolveCnaeRisk(c.code, answers);
                      const cnaeTheme = RISK_THEME[cnaeRes.risk] || RISK_THEME['NÃO ENCONTRADO'];
                      return (
                        <div key={`${c.code}-${idx}`} className="py-5 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <code className="text-[11px] font-medium text-[#0E4A44] bg-[#E4EEEC] px-2 py-0.5 rounded-sm">{c.code}</code>
                              <p className="text-sm text-[#262420] leading-snug">{c.description || "Descrição não informada"}</p>
                              {cnaeRes.porte && (
                                <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border w-fit", getPorteTheme(cnaeRes.porte).bg, getPorteTheme(cnaeRes.porte).border)}>
                                  <span className={cn("text-[10px] font-medium uppercase tracking-wide", getPorteTheme(cnaeRes.porte).text)}>
                                    Fiscalização: {cnaeRes.porte}
                                  </span>
                                </div>
                              )}
                            </div>
                            <span className={cn("shrink-0 text-[10px] font-medium h-6 px-2.5 rounded-full border flex items-center", cnaeTheme.bg, cnaeTheme.text, cnaeTheme.border)}>
                              {cnaeTheme.label}
                            </span>
                          </div>

                          {cnaeRes.risk === 'CONDICIONADO' && cnaeRes.path && (
                            <div className="bg-[#F5F2EA] rounded-md p-4 space-y-3 border border-[#E4DFD1]">
                              <p className="text-xs text-[#6B6659] leading-snug">{cnaeRes.question}</p>
                              <RadioGroup
                                value={answers[cnaeRes.path] || ""}
                                onValueChange={(v) => setAnswers(prev => ({ ...prev, [cnaeRes.path!]: v }))}
                                className="flex gap-6"
                              >
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="Sim" id={`${cnaeRes.path}-sim`} className="h-4 w-4" />
                                  <Label htmlFor={`${cnaeRes.path}-sim`} className="text-sm text-[#262420] cursor-pointer font-normal">Sim</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="Não" id={`${cnaeRes.path}-nao`} className="h-4 w-4" />
                                  <Label htmlFor={`${cnaeRes.path}-nao`} className="text-sm text-[#262420] cursor-pointer font-normal">Não</Label>
                                </div>
                              </RadioGroup>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-center pt-4 border-t border-[#E4DFD1]">
                  <Button onClick={handleNewQuery} variant="outline" size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium border-[#E4DFD1] bg-white text-[#6B6659] hover:bg-[#F5F2EA]">
                    <RotateCcw className="h-3.5 w-3.5" /> Nova Consulta
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs text-[#A39D8C] px-2">
              <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>Ferramenta informativa — não substitui a análise da Vigilância Sanitária municipal nem a emissão da Licença Sanitária.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

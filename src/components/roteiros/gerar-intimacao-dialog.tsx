"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, FileText, Loader2, ScrollText } from "lucide-react"

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type ItemNaoConforme = { id: string; text: string; crit: 'I' | 'N' | 'R' };
export type GrupoNaoConformidade = { label: string; itens: ItemNaoConforme[] };

/** Só os dados do estabelecimento que o termo precisa — evita acoplar este
 *  componente ao `idData` inteiro do roteiro. */
export type DadosEstabelecimento = {
  fantasia: string;
  cnpj: string;
  endereco: string;
  bairro: string;
  telefone: string;
  cnae: string;
  responsavel: string;
  responsavelCpf: string;
  prazoDias: string;
  baseLegalPrazo: string;
};

const ROTULO_CRIT: Record<'I' | 'N' | 'R', string> = {
  I: 'IMPRESCINDÍVEL',
  N: 'NECESSÁRIO',
  R: 'RECOMENDÁVEL',
};

const CLASSE_CRIT: Record<'I' | 'N' | 'R', string> = {
  I: 'bg-red-100 text-red-700',
  N: 'bg-amber-100 text-amber-700',
  R: 'bg-sky-100 text-sky-700',
};

/**
 * TERMO DE INTIMAÇÃO A PARTIR DO RELATÓRIO — sem sair da tela.
 *
 * O fiscal termina a vistoria e precisa entregar, na hora, a exigência de
 * adequação ao estabelecimento. Antes, isso significava sair do roteiro, abrir
 * Autuações, escolher o tipo, redigir tudo de novo à mão e depois voltar —
 * na prática ninguém fazia no local.
 *
 * Aqui o termo é montado a partir do que já foi respondido: as não
 * conformidades do relatório viram o corpo do documento, e o prazo sai do que
 * o próprio relatório já coletou. O texto é montado de forma determinística,
 * sem IA: é documento com efeito legal, e o risco de uma redação inventada não
 * compensa a conveniência.
 *
 * O termo nasce como RASCUNHO já numerado: entra em Autuações, conta prazo e
 * aparece nos alertas de vencimento, mas continua editável pro fiscal revisar
 * e assinar quando puder — inclusive depois, de volta no escritório.
 */
export function GerarIntimacaoDialog({
  aberto,
  onOpenChange,
  dados,
  grupos,
  inspecaoId,
  tituloRoteiro,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  dados: DadosEstabelecimento;
  grupos: GrupoNaoConformidade[];
  inspecaoId: string | null;
  tituloRoteiro: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { saveIntimacao, generateNewNumeroProcesso } = useIntimacoes();

  const todosIds = useMemo(
    () => grupos.flatMap(g => g.itens.map(i => i.id)),
    [grupos]
  );

  // Todas marcadas por padrão. A escolha de exigir ou não as "recomendáveis"
  // é sanitária, não técnica — então fica com o fiscal, item a item, em vez de
  // uma regra fixa no código.
  const [selecionados, setSelecionados] = useState<string[]>(todosIds);
  const [prazoDias, setPrazoDias] = useState(dados.prazoDias || '15');
  const [baseLegal, setBaseLegal] = useState(dados.baseLegalPrazo || '');
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<{ id: string; numero: string } | null>(null);

  const alternar = (id: string) =>
    setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const gruposSelecionados = useMemo(
    () => grupos
      .map(g => ({ ...g, itens: g.itens.filter(i => selecionados.includes(i.id)) }))
      .filter(g => g.itens.length > 0),
    [grupos, selecionados]
  );

  const totalSelecionado = gruposSelecionados.reduce((s, g) => s + g.itens.length, 0);

  /** Corpo do termo, em HTML — mesmo formato que o editor da autuação usa. */
  const teor = useMemo(() => {
    const partes: string[] = [];
    partes.push(
      `Em decorrência da inspeção sanitária realizada no estabelecimento <strong>${dados.fantasia || 'acima identificado'}</strong>` +
      (tituloRoteiro ? `, mediante ${tituloRoteiro}` : '') +
      `, fica o responsável <strong>INTIMADO</strong> a promover a adequação das não conformidades abaixo relacionadas, no prazo de <strong>${prazoDias} (${prazoDias}) dias</strong>, contados da ciência deste termo.<br><br>`
    );
    gruposSelecionados.forEach((grupo) => {
      partes.push(`<strong>${grupo.label.toUpperCase()}</strong><br>`);
      grupo.itens.forEach((item) => {
        partes.push(`• [${ROTULO_CRIT[item.crit]}] ${item.text}<br>`);
      });
      partes.push('<br>');
    });
    if (baseLegal) {
      partes.push(`Prazo fundamentado em <strong>${baseLegal}</strong>.<br><br>`);
    }
    partes.push(
      `O descumprimento do prazo sujeita o infrator às penalidades cabíveis, sem prejuízo da lavratura de Auto de Infração e da instauração do respectivo Processo Administrativo Sanitário.`
    );
    return partes.join('');
  }, [dados.fantasia, tituloRoteiro, prazoDias, baseLegal, gruposSelecionados]);

  const gerar = async () => {
    if (totalSelecionado === 0) return;
    setSalvando(true);
    try {
      const numeroProcesso = await generateNewNumeroProcesso();
      const resultado = await saveIntimacao({
        numeroProcesso,
        tipoTermo: 'TERMO DE INTIMAÇÃO',
        // Rascunho de propósito: o termo ainda precisa da assinatura e da
        // conferência do fiscal antes de valer como entregue.
        status: 'rascunho',
        autor: dados.fantasia,
        reu: dados.responsavel,
        responsavelLegalIdentidade: dados.responsavelCpf,
        cnpj: dados.cnpj,
        endereco: dados.endereco,
        bairro: dados.bairro,
        telefone: dados.telefone,
        cnae: dados.cnae,
        prazoDias: Number(prazoDias) || 15,
        legislacaoBase: baseLegal,
        teor,
        dataIntimacao: new Date(),
        // Liga o termo ao relatório que o originou — é esse vínculo que
        // permite, mais tarde, um PAS saber de onde veio a exigência.
        ...(inspecaoId ? { inspecaoId } : {}),
      } as any);

      setCriado({ id: String(resultado?.id ?? ''), numero: numeroProcesso });
      toast({ title: `Termo de Intimação nº ${numeroProcesso} criado` });
    } catch (e: any) {
      console.error('Erro ao gerar termo de intimação a partir do relatório:', e);
      toast({ variant: "destructive", title: "Erro ao gerar o termo", description: e?.message });
    } finally {
      setSalvando(false);
    }
  };

  const fechar = (aberto: boolean) => {
    if (salvando) return;
    if (!aberto) setCriado(null);
    onOpenChange(aberto);
  };

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="rounded-[2rem] sm:max-w-2xl max-h-[90vh] flex flex-col">
        {criado ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-black uppercase tracking-tighter text-xl italic flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Termo nº {criado.numero} criado
              </DialogTitle>
              <DialogDescription>
                Está salvo como rascunho em Autuações, já contando o prazo de {prazoDias} dias.
                Você pode abrir agora para assinar e imprimir, ou continuar no relatório e resolver isso depois —
                ele fica em <strong>Autuações › Em Andamento</strong>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => fechar(false)} className="rounded-xl font-black uppercase text-[10px] tracking-widest">
                Continuar no relatório
              </Button>
              <Button
                onClick={() => router.push(`/intimacoes/${criado.id}`)}
                disabled={!criado.id}
                className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-[#0E4A44] hover:bg-[#0B3A35]"
              >
                <FileText className="h-4 w-4 mr-2" /> Abrir termo agora
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-black uppercase tracking-tighter text-xl italic flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-[#0E4A44]" /> Gerar Termo de Intimação
              </DialogTitle>
              <DialogDescription>
                As não conformidades do relatório viram as exigências do termo. Desmarque o que não deve
                entrar — por exemplo, itens apenas recomendáveis.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-[#6B6659]">Prazo (dias)</Label>
                  <Input type="number" min="1" value={prazoDias} onChange={e => setPrazoDias(e.target.value)} className="h-10 rounded-xl bg-[#FAF8F3] border-[#E4DFD1] font-bold" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] font-black uppercase text-[#6B6659]">Base legal do prazo</Label>
                  <Input value={baseLegal} onChange={e => setBaseLegal(e.target.value)} placeholder="Ex.: Lei Municipal nº 0000/0000" className="h-10 rounded-xl bg-[#FAF8F3] border-[#E4DFD1] font-bold" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#9C7A3C]">
                    Exigências ({totalSelecionado} de {todosIds.length})
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelecionados(selecionados.length === todosIds.length ? [] : todosIds)}
                    className="text-[11px] font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors"
                  >
                    {selecionados.length === todosIds.length ? "Desmarcar todas" : "Marcar todas"}
                  </button>
                </div>

                {grupos.map((grupo) => (
                  <div key={grupo.label} className="space-y-1.5">
                    <p className="text-[11px] font-black uppercase text-[#6B6659]">{grupo.label}</p>
                    {grupo.itens.map((item) => (
                      <label
                        key={item.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors",
                          selecionados.includes(item.id) ? "border-[#E4DFD1] bg-[#FAF8F3]" : "border-transparent bg-white opacity-60"
                        )}
                      >
                        <Checkbox
                          checked={selecionados.includes(item.id)}
                          onCheckedChange={() => alternar(item.id)}
                          className="mt-0.5 h-4 w-4 rounded border-[#C9C2AC] data-[state=checked]:bg-[#0E4A44] data-[state=checked]:border-[#0E4A44]"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <Badge className={cn("text-[9px] font-black uppercase px-1.5 h-4", CLASSE_CRIT[item.crit])}>
                            {ROTULO_CRIT[item.crit]}
                          </Badge>
                          <p className="text-xs text-[#262420] leading-snug">{item.text}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 border-t border-[#F1EEE4] pt-4">
              <Button variant="outline" onClick={() => fechar(false)} disabled={salvando} className="rounded-xl font-black uppercase text-[10px] tracking-widest">
                Cancelar
              </Button>
              <Button
                onClick={gerar}
                disabled={salvando || totalSelecionado === 0}
                className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-[#0E4A44] hover:bg-[#0B3A35]"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScrollText className="h-4 w-4 mr-2" />}
                Criar termo com {totalSelecionado} {totalSelecionado === 1 ? 'exigência' : 'exigências'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { estruturaDoTipo, type TipoAutuacao } from "@/lib/autuacao-estrutura"

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
 * Tipos que fazem sentido nascer direto de uma vistoria recém-concluída —
 * cada um documenta algo que a INSPEÇÃO em si constatou. Termo de
 * Desinterdição (libera uma interdição já existente) e Termo de Imposição de
 * Penalidade (só existe depois do julgamento no PAS) dependem de um
 * documento anterior, não do relatório, por isso ficam de fora daqui.
 */
const OPCOES_TIPO: { valor: TipoAutuacao; rotulo: string }[] = [
  { valor: 'TERMO DE INTIMAÇÃO', rotulo: 'Termo de Intimação' },
  { valor: 'AUTO DE INFRAÇÃO', rotulo: 'Auto de Infração' },
  { valor: 'TERMO DE INTERDIÇÃO', rotulo: 'Termo de Interdição' },
  { valor: 'TERMO DE APREENSÃO', rotulo: 'Termo de Apreensão' },
  { valor: 'TERMO DE APREENSÃO E INUTILIZAÇÃO', rotulo: 'Termo de Apreensão e Inutilização' },
  { valor: 'TERMO DE INUTILIZAÇÃO', rotulo: 'Termo de Inutilização' },
];

const ROTULO_POR_TIPO = new Map(OPCOES_TIPO.map(o => [o.valor, o.rotulo]));

/**
 * AUTUAÇÃO A PARTIR DO RELATÓRIO — sem sair da tela.
 *
 * O fiscal termina a vistoria e precisa entregar, na hora, o documento que a
 * situação pede — nem toda não conformidade é "para regularizar": às vezes é
 * caso de autuar direto, de interditar, de apreender ou inutilizar um bem.
 * Antes, só existia a saída de Termo de Intimação; para os demais era sair
 * do roteiro, abrir Autuações, escolher o tipo e redigir tudo de novo à mão.
 *
 * O corpo do documento (relato dos fatos, exigências, ou motivo do ato,
 * dependendo do tipo — ver src/lib/autuacao-estrutura.ts) é montado de forma
 * determinística a partir do que já foi respondido no checklist, sem IA: é
 * documento com efeito legal, e o risco de uma redação inventada não
 * compensa a conveniência.
 *
 * Nasce como RASCUNHO já numerado: entra em Autuações, conta prazo quando o
 * tipo tem prazo, e continua editável pro fiscal revisar e assinar quando
 * puder — inclusive depois, de volta no escritório. Termos de
 * apreensão/inutilização nascem sem a lista de bens preenchida: o checklist
 * não tem essa informação (produto, lote, quantidade), então o fiscal
 * completa na tela do termo, depois de gerado.
 */
export function GerarAutuacaoDialog({
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

  const [tipo, setTipo] = useState<TipoAutuacao>('TERMO DE INTIMAÇÃO');
  const estrutura = useMemo(() => estruturaDoTipo(tipo), [tipo]);
  const rotuloTipo = ROTULO_POR_TIPO.get(tipo) || tipo;

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

  // Rótulo da seção de itens no painel de seleção — acompanha o que o
  // próprio documento vai chamar aquele bloco (ver documento-oficial-body.tsx).
  const rotuloSecaoItens = estrutura.relatoDosFatos ? 'Infrações constatadas' : (estrutura.objetoLabel || 'Itens');

  /** Corpo do termo, em HTML — mesmo formato que o editor da autuação usa.
   *  A abertura e a lista de itens são comuns a todos os tipos; o que muda é
   *  como a situação é qualificada e se há (e qual) bloco de prazo — a
   *  mesma matriz de src/lib/autuacao-estrutura.ts que o documento final usa
   *  para decidir o rótulo do campo e mostrar ou não a seção de prazo. */
  const teor = useMemo(() => {
    const abertura =
      `Em decorrência da inspeção sanitária realizada no estabelecimento <strong>${dados.fantasia || 'acima identificado'}</strong>` +
      (tituloRoteiro ? `, mediante ${tituloRoteiro}` : '');

    const blocoItens = () => {
      const partes: string[] = [];
      gruposSelecionados.forEach((grupo) => {
        partes.push(`<strong>${grupo.label.toUpperCase()}</strong><br>`);
        grupo.itens.forEach((item) => {
          partes.push(`• [${ROTULO_CRIT[item.crit]}] ${item.text}<br>`);
        });
        partes.push('<br>');
      });
      return partes.join('');
    };

    const partes: string[] = [];

    switch (tipo) {
      case 'AUTO DE INFRAÇÃO':
        partes.push(`${abertura}, foram constatadas as seguintes infrações às normas sanitárias vigentes:<br><br>`);
        partes.push(blocoItens());
        partes.push(
          `Em razão do exposto, fica o autuado <strong>NOTIFICADO</strong> do prazo de <strong>${prazoDias} (${prazoDias}) dias</strong> para apresentação de defesa prévia, contados da ciência deste auto` +
          (baseLegal ? `, com fundamento em <strong>${baseLegal}</strong>` : '') +
          `.<br><br>`
        );
        partes.push(
          `O não atendimento sujeitará o infrator às sanções previstas na legislação sanitária vigente, sem prejuízo da instauração do respectivo Processo Administrativo Sanitário.`
        );
        break;

      case 'TERMO DE INTERDIÇÃO':
        partes.push(`${abertura}, e em razão das irregularidades abaixo relacionadas, fica determinada a <strong>INTERDIÇÃO</strong> das atividades do estabelecimento até a integral regularização:<br><br>`);
        partes.push(blocoItens());
        partes.push(
          `A interdição vigorará até que sejam sanadas as irregularidades apontadas, sem prejuízo da lavratura de Auto de Infração e da instauração do respectivo Processo Administrativo Sanitário.`
        );
        break;

      case 'TERMO DE APREENSÃO':
      case 'TERMO DE APREENSÃO E INUTILIZAÇÃO':
      case 'TERMO DE INUTILIZAÇÃO': {
        const acao = tipo === 'TERMO DE APREENSÃO' ? 'APREENSÃO' : tipo === 'TERMO DE INUTILIZAÇÃO' ? 'INUTILIZAÇÃO' : 'APREENSÃO E INUTILIZAÇÃO';
        partes.push(`${abertura}, em razão das seguintes não conformidades:<br><br>`);
        partes.push(blocoItens());
        partes.push(
          `Fica determinada a <strong>${acao}</strong> dos bens relacionados na seção própria deste termo, sem prejuízo da lavratura de Auto de Infração e da instauração do respectivo Processo Administrativo Sanitário.`
        );
        break;
      }

      default: // TERMO DE INTIMAÇÃO
        partes.push(
          `${abertura}, fica o responsável <strong>INTIMADO</strong> a promover a adequação das não conformidades abaixo relacionadas, no prazo de <strong>${prazoDias} (${prazoDias}) dias</strong>, contados da ciência deste termo.<br><br>`
        );
        partes.push(blocoItens());
        if (baseLegal) {
          partes.push(`Prazo fundamentado em <strong>${baseLegal}</strong>.<br><br>`);
        }
        partes.push(
          `O descumprimento do prazo sujeita o infrator às penalidades cabíveis, sem prejuízo da lavratura de Auto de Infração e da instauração do respectivo Processo Administrativo Sanitário.`
        );
    }

    return partes.join('');
  }, [tipo, dados.fantasia, tituloRoteiro, prazoDias, baseLegal, gruposSelecionados]);

  const gerar = async () => {
    if (totalSelecionado === 0) return;
    setSalvando(true);
    try {
      const numeroProcesso = await generateNewNumeroProcesso();
      const resultado = await saveIntimacao({
        numeroProcesso,
        tipoTermo: tipo,
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
        ...(estrutura.prazo ? { prazoDias: Number(prazoDias) || 15, legislacaoBase: baseLegal } : {}),
        teor,
        dataIntimacao: new Date(),
        // Liga o termo ao relatório que o originou — é esse vínculo que
        // permite, mais tarde, um PAS saber de onde veio a exigência.
        ...(inspecaoId ? { inspecaoId } : {}),
      } as any);

      setCriado({ id: String(resultado?.id ?? ''), numero: numeroProcesso });
      toast({ title: `${rotuloTipo} nº ${numeroProcesso} criado` });
    } catch (e: any) {
      console.error('Erro ao gerar autuação a partir do relatório:', e);
      toast({ variant: "destructive", title: "Erro ao gerar o documento", description: e?.message });
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
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {rotuloTipo} nº {criado.numero} criado
              </DialogTitle>
              <DialogDescription>
                Está salvo como rascunho em Autuações{estrutura.prazo ? `, já contando o prazo de ${prazoDias} dias` : ''}.
                {estrutura.listaDeItens && ' A lista de bens ainda está vazia — complete produto, lote e quantidade na tela do termo.'}{' '}
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
                <ScrollText className="h-5 w-5 text-[#0E4A44]" /> Gerar Autuação
              </DialogTitle>
              <DialogDescription>
                As não conformidades do relatório viram {estrutura.relatoDosFatos ? 'o relato dos fatos' : 'o ' + (estrutura.objetoLabel || 'objeto').toLowerCase()} do documento.
                Desmarque o que não deve entrar — por exemplo, itens apenas recomendáveis.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-[#6B6659]">Tipo de documento</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAutuacao)}>
                  <SelectTrigger className="h-10 rounded-xl bg-[#FAF8F3] border-[#E4DFD1] font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_TIPO.map(o => (
                      <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {estrutura.prazo && (
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
              )}

              {estrutura.listaDeItens && (
                <p className="text-[11px] text-[#9C7A3C] bg-[#FBF4E4] border border-[#E9D9AE] rounded-lg px-3 py-2">
                  Este termo tem uma lista de bens (produto, lote, quantidade) — o checklist não guarda esses dados, então ela nasce vazia e você completa na tela do termo, depois de gerado.
                </p>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#9C7A3C]">
                    {rotuloSecaoItens} ({totalSelecionado} de {todosIds.length})
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
                Criar {rotuloTipo.toLowerCase()} com {totalSelecionado} {totalSelecionado === 1 ? 'item' : 'itens'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

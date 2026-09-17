"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Hash, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useIntimacoes } from "@/hooks/use-intimacoes"
import { definirProximoNumero, lerContadorOficial } from "@/lib/contador-autuacoes"

/**
 * RECALIBRAR A NUMERAÇÃO OFICIAL
 *
 * Situação que motivou a tela: testes de implantação consumiram centenas de
 * números, e o próximo auto real precisa sair com a numeração do livro do
 * município, não com a que o sistema alcançou testando.
 *
 * O contador é por MUNICÍPIO e por ANO, então recalibrar um não mexe em
 * nenhum outro. É de propósito que não exista um botão de "zerar tudo": a
 * numeração de auto de infração é registro público, e um acerto global seria
 * grande demais para ser reversível.
 *
 * A tela mostra o que vai mudar antes de mudar e avisa quando o número
 * escolhido já foi usado — porque o contador sozinho não impede repetição.
 */
export function RecalibrarNumeracao({
  municipioId,
  municipioNome,
}: {
  municipioId: string;
  municipioNome?: string;
}) {
  const { toast } = useToast();
  // Root edita o município que escolheu lá em cima; o gestor, o próprio.
  const { intimacoes } = useIntimacoes({ municipioIdOverride: municipioId });

  const ano = new Date().getFullYear();
  const [ultimoEmitido, setUltimoEmitido] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [proximo, setProximo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmarAberto, setConfirmarAberto] = useState(false);

  const carregar = useCallback(async () => {
    if (!municipioId) return;
    setCarregando(true);
    try {
      const seq = await lerContadorOficial(municipioId, ano);
      setUltimoEmitido(seq);
      setProximo(String(seq + 1));
    } catch {
      setUltimoEmitido(null);
    } finally {
      setCarregando(false);
    }
  }, [municipioId, ano]);

  useEffect(() => { carregar(); }, [carregar]);

  const proximoNumero = parseInt(proximo, 10);
  const valido = Number.isInteger(proximoNumero) && proximoNumero > 0;
  const mudou = valido && ultimoEmitido !== null && proximoNumero !== ultimoEmitido + 1;

  // O contador não sabe quais números já existem: ele só conta. Se as
  // autuações de teste continuarem guardadas, recalibrar para trás faz o
  // próximo auto nascer com um número que já está em uso — e dois documentos
  // com o mesmo número é exatamente o problema que a numeração existe para
  // evitar. A lixeira conta: documento apagado continua gravado.
  const jaUsados = valido
    ? intimacoes.filter((i) => {
        const [seqTexto, anoTexto] = String(i.numeroProcesso || '').split('/');
        return parseInt(anoTexto, 10) === ano && parseInt(seqTexto, 10) >= proximoNumero;
      })
    : [];

  const recalibrar = async () => {
    setSalvando(true);
    try {
      const { seqAnterior, seqNovo } = await definirProximoNumero(municipioId, ano, proximoNumero);
      setUltimoEmitido(seqNovo);
      toast({
        title: "Numeração recalibrada",
        description: `O próximo auto de ${municipioNome || municipioId} sairá como ${String(proximoNumero).padStart(4, '0')}/${ano}. O contador estava em ${String(seqAnterior).padStart(4, '0')}.`,
      });
      setConfirmarAberto(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível recalibrar", description: e?.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card className="bg-white border-[#E4DFD1] rounded-lg overflow-hidden shadow-sm">
      <CardHeader className="bg-[#FAF8F3] border-b border-[#E4DFD1]">
        <CardTitle className="font-serif text-lg text-[#262420] flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" /> Numeração das Autuações
        </CardTitle>
        <CardDescription className="text-[#A39D8C] font-bold uppercase text-[9px] tracking-widest">
          {municipioNome || municipioId} · ano {ano}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6 space-y-5">
        <p className="text-sm text-[#6B6659] leading-relaxed">
          O sistema numera cada auto em sequência, sozinho. Se a contagem se
          afastou da numeração real do município — por testes de implantação,
          por exemplo — é aqui que ela volta ao lugar. Vale só para{" "}
          <strong>{municipioNome || municipioId}</strong> e só para {ano}.
        </p>

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-[#A39D8C]">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando o contador…
          </div>
        ) : ultimoEmitido === null ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E4DFD1] bg-[#FAF8F3] px-4 py-3">
            <p className="text-sm text-[#6B6659]">Não foi possível ler o contador. Verifique a conexão.</p>
            <Button type="button" variant="outline" onClick={carregar} className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2 shrink-0">
              <RotateCcw className="h-3.5 w-3.5" /> Tentar de novo
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-[#E4DFD1] bg-[#FAF8F3] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#A39D8C]">Próximo número hoje</p>
                <p className="font-serif text-2xl text-[#262420] mt-1 tabular-nums">
                  {String(ultimoEmitido + 1).padStart(4, '0')}/{ano}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proximo-numero" className="text-[10px] font-black uppercase tracking-widest text-[#6B6659]">
                  Passar a numerar a partir de
                </Label>
                <Input
                  id="proximo-numero"
                  inputMode="numeric"
                  value={proximo}
                  onChange={(e) => setProximo(e.target.value.replace(/\D/g, ''))}
                  className="h-11 font-serif text-lg tabular-nums"
                  placeholder="52"
                />
                <p className="text-[11px] text-[#A39D8C]">
                  {valido ? `O próximo auto sairá como ${String(proximoNumero).padStart(4, '0')}/${ano}.` : 'Informe o número do próximo auto.'}
                </p>
              </div>
            </div>

            {jaUsados.length > 0 && (
              <div className="flex gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900">
                    {jaUsados.length === 1
                      ? 'Já existe 1 documento com número igual ou maior que esse'
                      : `Já existem ${jaUsados.length} documentos com número igual ou maior que esse`}
                  </p>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Recalibrar não apaga nada: os próximos autos vão repetir números que já estão em uso.
                    Se forem os documentos de teste, apague-os de vez pela lixeira antes de emitir o próximo auto real.
                  </p>
                  <p className="text-[11px] text-amber-800/80 mt-1.5 tabular-nums">
                    Maiores: {jaUsados
                      .map((i) => String(i.numeroProcesso))
                      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
                      .slice(0, 6)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!mudou || salvando}
                onClick={() => setConfirmarAberto(true)}
                className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2 h-11 px-6"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
                Recalibrar
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tighter text-xl italic">
              Recalibrar a numeração?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O próximo auto de {municipioNome || municipioId} passará a sair como{" "}
              <strong>{valido ? String(proximoNumero).padStart(4, '0') : ''}/{ano}</strong>, no lugar de{" "}
              <strong>{ultimoEmitido !== null ? String(ultimoEmitido + 1).padStart(4, '0') : ''}/{ano}</strong>.
              Nenhum documento já emitido é alterado — muda só a contagem daqui para a frente,
              e só neste município.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); recalibrar(); }}
              disabled={salvando}
              className="rounded-xl font-black uppercase text-[10px] tracking-widest"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recalibrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

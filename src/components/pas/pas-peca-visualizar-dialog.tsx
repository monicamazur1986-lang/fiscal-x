"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Download, Loader2, Paperclip } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { FolhaEscalada } from "@/components/folha-escalada"
import { PasTimbreOficial } from "@/components/pas/pas-timbre-oficial"
import { sanitizeHtml } from "@/lib/sanitize-html"
import type { PasPeca } from "@/lib/types"
import type { MunicipalityConfig } from "@/hooks/use-app-config"

/**
 * VER UMA PEÇA SEM BAIXAR O PROCESSO INTEIRO.
 *
 * A lista mostrava o conteúdo cru dentro de um acordeão: texto sem timbre, sem
 * o cabeçalho do processo, sem assinatura — nada parecido com o documento que
 * de fato foi lavrado. Para conferir como a peça ficou, só gerando o PDF.
 *
 * Aqui ela aparece como é: timbre, identificação do processo, corpo, data e
 * assinatura. É a mesma composição do PDF e da tela de revisão, e o objetivo é
 * esse — quem confere precisa ver o documento, não o texto dele.
 *
 * Continua sendo leitura. Peça lavrada não se edita (autos não se corrigem, se
 * complementam com um termo de retificação), então aqui não há campo nenhum.
 */
export function PasPecaVisualizarDialog({
  peca,
  onFechar,
  onBaixar,
  baixando,
  config,
  numeroProcesso,
  autuado,
  cnpj,
  nomeMunicipioExibicao,
}: {
  peca: PasPeca | null;
  onFechar: () => void;
  onBaixar: (peca: PasPeca) => void;
  baixando: boolean;
  config: MunicipalityConfig;
  numeroProcesso: string;
  autuado: string;
  cnpj?: string;
  nomeMunicipioExibicao: string;
}) {
  if (!peca) return null;

  const logoUrl = config.logoUrl;
  const headerRichText = config.headerRichText;

  return (
    <Dialog open={!!peca} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {peca.numero}. {peca.titulo}
          </DialogTitle>
        </DialogHeader>

        {/* Folha A4 de verdade, escalada pro tamanho da tela — mesmo padrão
            da autuação e do relatório de roteiro (ver useEscalaFolha). Antes
            era uma caixa de largura solta, sem essa escala: em tela estreita
            o texto ficava espremido contra a borda em vez de encolher junto
            com o timbre e a assinatura. */}
        <div className="document-paper-wrapper custom-scrollbar">
          <FolhaEscalada deps={[peca.id]}>
            <div className="flex flex-row items-center justify-between gap-4 mb-1 pb-2 border-b border-zinc-200">
              <PasTimbreOficial
                logoUrl={logoUrl}
                headerRichText={headerRichText}
                secretaria={config.secretaria}
                departamento={config.departamento}
                nomeMunicipioExibicao={nomeMunicipioExibicao}
                tamanho="pdf"
              />
            </div>

            <div className="pt-3 text-[9pt]">
              <p><strong>Processo Administrativo Sanitário nº:</strong> {numeroProcesso}</p>
              <p><strong>Autuado:</strong> {autuado}</p>
              {cnpj && <p><strong>CNPJ:</strong> {cnpj}</p>}
            </div>

            <div className="pt-4">
              <div className="text-center border-y border-zinc-200 py-1 mb-4">
                <p className="text-[11pt] font-black uppercase">{peca.numero}. {peca.titulo}</p>
              </div>
              <div
                style={{ fontSize: '11pt', lineHeight: 1.6, textAlign: 'justify', color: '#18181b' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(peca.conteudoHtml) }}
              />
            </div>

            {peca.anexoUrl && (
              <div className="no-print mt-4 flex items-center gap-2 rounded-md border border-[#E4DFD1] bg-[#FAF8F3] px-3 py-2">
                <Paperclip className="h-3.5 w-3.5 text-[#A39D8C] shrink-0" />
                <a
                  href={peca.anexoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9pt] text-[#0E4A44] underline underline-offset-2"
                >
                  Abrir o documento anexado a esta peça
                </a>
              </div>
            )}

            <div className="pt-10 pb-2 text-center space-y-6">
              <p className="text-[10pt]">
                {nomeMunicipioExibicao.toUpperCase()}, {format(new Date(peca.criadoEm), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.
              </p>
              {peca.assinaturaUrl && (
                <img src={peca.assinaturaUrl} alt="Assinatura" className="h-16 mx-auto object-contain" />
              )}
              <div className="pt-1 mx-auto w-full max-w-[280pt] border-t border-black">
                <p className="font-bold uppercase text-[10pt] mt-1">{peca.criadoPorNome}</p>
              </div>
              {peca.assinadoForaDoSistema && !peca.assinaturaUrl && (
                <p className="text-[8pt] text-zinc-400 italic">Assinada fora do sistema.</p>
              )}
            </div>
          </FolhaEscalada>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onFechar} className="rounded-xl font-black uppercase text-[10px] tracking-widest">
            Fechar
          </Button>
          <Button type="button" onClick={() => onBaixar(peca)} disabled={baixando} className="rounded-xl font-black uppercase text-[10px] tracking-widest gap-2">
            {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar esta peça
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

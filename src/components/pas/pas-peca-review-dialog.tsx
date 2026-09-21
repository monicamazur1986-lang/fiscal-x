"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, PenTool, Check, Paperclip, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RichTextEditor } from "@/components/rich-text-editor"
import { FolhaEscalada } from "@/components/folha-escalada"
import { SignaturePad } from "@/components/signature-pad"
import { PasTimbreOficial } from "@/components/pas/pas-timbre-oficial"

export interface PasPecaConfirmacao {
  assinaturaUrl?: string;
  /** true quando o gestor/fiscal optou por assinar fisicamente, no papel,
   * fora do sistema — o processo não pode ficar travado esperando uma
   * assinatura digital que talvez nunca aconteça. */
  assinadoForaDoSistema?: boolean;
  /**
   * Documento já pronto (escaneado/fotografado) anexado no lugar do texto
   * editado aqui — pra quando a etapa não foi feita pelo sistema (alguém
   * lavrou em outro lugar, ou o passo digital falhou) e a peça precisa
   * entrar nos autos mesmo assim, sem travar o processo. Quem chama decide
   * como fazer o upload (`uploadArquivoPas`, já usado nas outras peças).
   */
  anexoExternoFile?: File;
}

export interface PasPecaRevisao {
  titulo: string;
  conteudoInicial: string;
  /** Faz a gravação de verdade (Firestore, Agenda etc.) — decide sozinho
   * quando fechar o diálogo (chamando onFechar) em caso de sucesso; em caso
   * de erro, deve mostrar o próprio toast e deixar o diálogo aberto pra
   * tentar de novo. */
  onConfirmar: (conteudoFinal: string, confirmacao: PasPecaConfirmacao) => Promise<void>;
}

interface PasPecaReviewDialogProps {
  revisao: PasPecaRevisao | null;
  onFechar: () => void;
  numeroProcesso: string;
  autuado: string;
  cnpj?: string;
  nomeMunicipioExibicao: string;
  nomeAssinante: string;
  logoUrl?: string;
  headerRichText?: string;
  secretaria?: string;
  departamento?: string;
}

/**
 * Revisão + assinatura antes de qualquer peça do PAS ser gravada de verdade
 * — o texto padrão (despacho, termo etc.) nasce pronto, mas o fiscal/gestor
 * pode ajustar a redação antes de confirmar, e precisa assinar pra a peça
 * ser considerada válida (mesma lógica de "sem assinatura não é documento
 * oficial" já usada na autuação). Mostra o cabeçalho institucional e o
 * fechamento (local/data/nome de quem assina) ao redor do texto editável,
 * pra já dar a ideia de como o PDF final vai ficar — não só o parágrafo
 * solto, sem contexto nenhum de documento oficial.
 */
export function PasPecaReviewDialog({
  revisao,
  onFechar,
  numeroProcesso,
  autuado,
  cnpj,
  nomeMunicipioExibicao,
  nomeAssinante,
  logoUrl,
  headerRichText,
  secretaria,
  departamento,
}: PasPecaReviewDialogProps) {
  const [conteudo, setConteudo] = useState("");
  const [assinaturaUrl, setAssinaturaUrl] = useState<string | undefined>(undefined);
  const [assinadoForaDoSistema, setAssinadoForaDoSistema] = useState(false);
  const [isSignPadOpen, setIsSignPadOpen] = useState(false);
  const [isSalvando, setIsSalvando] = useState(false);
  const [anexoExternoFile, setAnexoExternoFile] = useState<File | undefined>(undefined);
  const anexoExternoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (revisao) {
      setConteudo(revisao.conteudoInicial);
      setAssinaturaUrl(undefined);
      setAssinadoForaDoSistema(false);
      setAnexoExternoFile(undefined);
    }
  }, [revisao]);

  if (!revisao) return null;

  const podeConfirmar = !!assinaturaUrl || assinadoForaDoSistema || !!anexoExternoFile;

  const handleConfirmar = async () => {
    if (!podeConfirmar) return;
    setIsSalvando(true);
    try {
      await revisao.onConfirmar(conteudo, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile });
    } finally {
      setIsSalvando(false);
    }
  };

  return (
    <Dialog open={!!revisao} onOpenChange={(v) => { if (!v && !isSalvando) onFechar(); }}>
      <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{revisao.titulo}</DialogTitle>
          <DialogDescription>Revise e ajuste o texto se precisar. Depois, assine na tela, marque que vai assinar no papel, ou anexe o documento já pronto — sem uma dessas três coisas, a peça não é gravada.</DialogDescription>
        </DialogHeader>

        {/* Folha A4 de verdade (timbre + corpo + fechamento juntos, numa peça
            só) escalada pro tamanho da tela — mesmo padrão da autuação e do
            relatório de roteiro (ver useEscalaFolha). Antes, o timbre e a
            assinatura viviam numa caixa de largura solta enquanto o corpo
            abria dentro do próprio editor, com sua folha de 210mm fixos: em
            tela estreita as duas partes desalinhavam e o editor cortava
            palavra/letra na borda em vez de encolher junto. */}
        <div className="document-paper-wrapper custom-scrollbar">
          <FolhaEscalada deps={[revisao.titulo, assinaturaUrl, assinadoForaDoSistema]}>
            <div className="flex flex-row items-center justify-between gap-4 mb-1 pb-2 border-b border-zinc-200">
              <PasTimbreOficial
                logoUrl={logoUrl}
                headerRichText={headerRichText}
                secretaria={secretaria}
                departamento={departamento}
                nomeMunicipioExibicao={nomeMunicipioExibicao}
                tamanho="pdf"
              />
            </div>

            <div className="pt-3 text-[9pt]">
              <p><strong>Processo Administrativo Sanitário nº:</strong> {numeroProcesso}</p>
              <p><strong>Autuado:</strong> {autuado}</p>
              {cnpj && <p><strong>CNPJ:</strong> {cnpj}</p>}
            </div>

            <div className="pt-3">
              <p className="text-[11pt] font-black uppercase text-center tracking-wide">{revisao.titulo}</p>
            </div>

            {/* Corpo — editável, direto na folha (mesmo componente usado no
                corpo da autuação), sem um editor de rich text separado
                criando uma segunda folha de largura própria por dentro
                desta. */}
            <div className="pt-4">
              <RichTextEditor value={conteudo} onChange={setConteudo} fontSize="11pt" minHeight="6em" />
            </div>

            {/* Fechamento — local/data automáticos + nome de quem vai assinar.
                Sem imagem de assinatura quando for assinar fisicamente depois
                de impresso — a linha e o nome ficam prontos pra caneta. */}
            <div className="pt-8 pb-2 text-center space-y-4">
              <p className="text-[10pt]">{nomeMunicipioExibicao.toUpperCase()}, {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.</p>
              {assinaturaUrl && !assinadoForaDoSistema && <img src={assinaturaUrl} alt="Assinatura" className="h-14 mx-auto object-contain" />}
              <div className="pt-1 mx-auto w-full max-w-[260pt] border-t border-black">
                <p className="font-bold uppercase text-[10pt] mt-1">{nomeAssinante}</p>
              </div>
            </div>
          </FolhaEscalada>
        </div>

        <div className="space-y-2.5 py-2 border-t border-[#E4DFD1]">
          <div className="flex items-center gap-3">
            {assinaturaUrl && !assinadoForaDoSistema ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#1F7A5C] font-medium">Assinado digitalmente</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsSignPadOpen(true)} className="rounded-md text-xs">Assinar de novo</Button>
              </div>
            ) : (
              <SignaturePad
                title={`Assinar — ${revisao.titulo}`}
                isOpen={isSignPadOpen}
                onOpenChange={setIsSignPadOpen}
                onSave={(url) => { setAssinaturaUrl(url); setAssinadoForaDoSistema(false); }}
                trigger={
                  <Button type="button" variant="outline" disabled={assinadoForaDoSistema} className="rounded-md gap-2">
                    <PenTool className="h-4 w-4" /> Assinar aqui
                  </Button>
                }
              />
            )}
          </div>
          <label className="flex items-start gap-2 text-xs text-[#6B6659] cursor-pointer">
            <Checkbox
              checked={assinadoForaDoSistema}
              onCheckedChange={(v) => { setAssinadoForaDoSistema(!!v); if (v) setAssinaturaUrl(undefined); }}
              className="mt-0.5"
            />
            Já foi (ou vai ser) assinado no papel, fora do sistema — não travar aqui esperando assinatura digital.
          </label>

          <div className="pt-2 border-t border-[#F1EEE4]">
            <p className="text-[11px] text-[#8A8474] mb-1.5">Ou, se essa etapa já foi feita fora do sistema (documento pronto, escaneado):</p>
            <input ref={anexoExternoRef} type="file" className="hidden" onChange={(e) => setAnexoExternoFile(e.target.files?.[0] || undefined)} />
            {anexoExternoFile ? (
              <span className="inline-flex items-center gap-2 bg-[#F5F2EA] rounded px-2 py-1.5 text-xs text-[#6B6659]">
                <Paperclip className="h-3.5 w-3.5" /> {anexoExternoFile.name}
                <button type="button" onClick={() => setAnexoExternoFile(undefined)}><X className="h-3 w-3 text-[#A39D8C] hover:text-rose-500" /></button>
              </span>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => anexoExternoRef.current?.click()} className="h-8 rounded-md text-xs gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Anexar documento pronto
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={isSalvando} className="rounded-md">Cancelar</Button>
          <Button onClick={handleConfirmar} disabled={isSalvando || !podeConfirmar} className="rounded-md bg-[#0E4A44] hover:bg-[#0B3A35]">
            {isSalvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Confirmar e Prosseguir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

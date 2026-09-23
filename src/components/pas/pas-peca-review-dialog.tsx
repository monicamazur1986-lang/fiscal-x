"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, PenTool, Check, Paperclip, X, Save } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  /** Data do ato (ISO, meio-dia local) — vem pré-preenchida com hoje, mas é
   * editável: montar o processo com atraso não pode deixar toda peça datada
   * do dia em que alguém finalmente sentou pra digitar. Quem chama usa isto
   * como `criadoEm` da peça (ver adicionarPeca/adicionarPecas) e, quando o
   * próprio texto da peça carrega um prazo contado a partir desta data (ex.:
   * TIP e o prazo recursal), recalcula a partir dela em vez de `new Date()`. */
  dataAto: string;
}

export interface PasPecaRevisao {
  titulo: string;
  conteudoInicial: string;
  /** Faz a gravação de verdade (Firestore, Agenda etc.) — decide sozinho
   * quando fechar o diálogo (chamando onFechar) em caso de sucesso; em caso
   * de erro, deve mostrar o próprio toast e deixar o diálogo aberto pra
   * tentar de novo. */
  onConfirmar: (conteudoFinal: string, confirmacao: PasPecaConfirmacao) => Promise<void>;
  /**
   * Chave do rascunho (tipo da peça, ou tipo+número da peça original na
   * retificação) — presente só nas revisões que fazem sentido salvar antes
   * de assinar. Ausente, por exemplo, na defesa: ela já depende de um
   * arquivo escolhido antes de abrir a revisão, então "guardar rascunho"
   * não resolveria o problema de perder o que foi digitado.
   */
  chaveRascunho?: string;
  /**
   * true quando esta revisão é do modo "já pronto (anexar PDF)" do
   * Relatório/Julgamento (modoRelatorio/modoJulgamento === 'anexo') — o
   * texto na folha é só uma legenda fixa de juntada, o documento de
   * verdade é o arquivo. Sem isto, o botão de anexar ficava escondido no
   * fim do painel, depois da assinatura, do mesmo jeito pra toda revisão —
   * ninguém reparava que ali era o lugar de anexar o PDF do julgamento/
   * relatório já pronto. Com isto: o anexo vira o primeiro campo do
   * painel, com destaque, texto específico, e passa a ser exigido pra
   * confirmar (não basta assinar a legenda sem anexar nada — ver
   * podeConfirmar). */
  modoAnexo?: boolean;
  /** Grava o texto atual como rascunho (sem assinatura, sem gerar peça de
   * verdade) — quem chama decide onde guardar (ver salvarRascunhoPeca em
   * pas/[id]/page.tsx). Ausente junto com chaveRascunho quando esta revisão
   * não suporta rascunho. */
  onSalvarRascunho?: (chave: string, titulo: string, conteudoHtml: string) => Promise<void>;
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
  const [isSalvandoRascunho, setIsSalvandoRascunho] = useState(false);
  const [anexoExternoFile, setAnexoExternoFile] = useState<File | undefined>(undefined);
  const anexoExternoRef = useRef<HTMLInputElement>(null);
  // "yyyy-MM-dd" pro <input type="date"> — convertido pra ISO só na hora de
  // confirmar (ver handleConfirmar). Pré-preenchida com hoje porque é o caso
  // comum; editável porque montar o processo com atraso não pode deixar
  // toda peça datada do dia em que alguém sentou pra digitar os autos.
  const hojeStr = format(new Date(), "yyyy-MM-dd");
  const [dataAtoStr, setDataAtoStr] = useState(hojeStr);

  useEffect(() => {
    if (revisao) {
      setConteudo(revisao.conteudoInicial);
      setAssinaturaUrl(undefined);
      setAssinadoForaDoSistema(false);
      setAnexoExternoFile(undefined);
      setDataAtoStr(format(new Date(), "yyyy-MM-dd"));
    }
  }, [revisao]);

  if (!revisao) return null;

  // Modo anexo: a legenda da folha não é o documento, o arquivo é — assinar
  // só a legenda sem anexar nada gravaria uma peça de julgamento/relatório
  // sem conteúdo real nenhum. Por isso aqui as duas coisas são exigidas.
  const podeConfirmar = revisao.modoAnexo
    ? !!anexoExternoFile && (!!assinaturaUrl || assinadoForaDoSistema)
    : !!assinaturaUrl || assinadoForaDoSistema || !!anexoExternoFile;
  // Meio-dia local (não meia-noite UTC) — "2026-08-10" interpretado como UTC
  // vira 09/08 à noite no horário do Brasil, o que dataria a peça um dia
  // antes do escolhido (mesmo cuidado já usado em defesaData, pas/[id]/page.tsx).
  const dataAtoIso = new Date(`${dataAtoStr}T12:00:00`).toISOString();

  const handleConfirmar = async () => {
    if (!podeConfirmar) return;
    setIsSalvando(true);
    try {
      await revisao.onConfirmar(conteudo, { assinaturaUrl, assinadoForaDoSistema, anexoExternoFile, dataAto: dataAtoIso });
    } finally {
      setIsSalvando(false);
    }
  };

  const podeSalvarRascunho = !!revisao.chaveRascunho && !!revisao.onSalvarRascunho;
  const handleSalvarRascunho = async () => {
    if (!revisao.chaveRascunho || !revisao.onSalvarRascunho) return;
    setIsSalvandoRascunho(true);
    try {
      await revisao.onSalvarRascunho(revisao.chaveRascunho, revisao.titulo, conteudo);
      onFechar();
    } finally {
      setIsSalvandoRascunho(false);
    }
  };

  return (
    <Dialog open={!!revisao} onOpenChange={(v) => { if (!v && !isSalvando) onFechar(); }}>
      <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{revisao.titulo}</DialogTitle>
          <DialogDescription>
            {revisao.modoAnexo
              ? 'Anexe o documento pronto e assine (na tela ou no papel) — sem os dois, a peça não é gravada.'
              : 'Revise e ajuste o texto se precisar. Depois, assine na tela, marque que vai assinar no papel, ou anexe o documento já pronto — sem uma dessas três coisas, a peça não é gravada.'}
            {podeSalvarRascunho && ' Falta algo pra concluir agora? "Salvar rascunho" guarda o texto sem assinar, pra continuar depois.'}
          </DialogDescription>
        </DialogHeader>

        {/* Folha A4 de verdade (timbre + corpo + fechamento juntos, numa peça
            só) escalada pro tamanho da tela — mesmo padrão da autuação e do
            relatório de roteiro (ver useEscalaFolha). Antes, o timbre e a
            assinatura viviam numa caixa de largura solta enquanto o corpo
            abria dentro do próprio editor, com sua folha de 210mm fixos: em
            tela estreita as duas partes desalinhavam e o editor cortava
            palavra/letra na borda em vez de encolher junto. */}
        <div className="document-paper-wrapper custom-scrollbar">
          <FolhaEscalada deps={[revisao.titulo, assinaturaUrl, assinadoForaDoSistema, dataAtoStr]}>
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
            <div className="pt-8 pb-2 text-center space-y-6">
              <p className="text-[10pt]">{nomeMunicipioExibicao.toUpperCase()}, {format(new Date(`${dataAtoStr}T12:00:00`), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.</p>
              {assinaturaUrl && !assinadoForaDoSistema && <img src={assinaturaUrl} alt="Assinatura" className="h-14 mx-auto object-contain" />}
              <div className="pt-1 mx-auto w-full max-w-[260pt] border-t border-black">
                <p className="font-bold uppercase text-[10pt] mt-1">{nomeAssinante}</p>
              </div>
            </div>
          </FolhaEscalada>
        </div>

        <div className="space-y-2.5 py-2 border-t border-[#E4DFD1]">
          {/* Modo "já pronto (anexar PDF)": o campo de anexo é a AÇÃO
              principal desta revisão, não um fallback discreto no fim do
              painel — sem isto, ficava depois da assinatura, igual pra toda
              revisão, e ninguém reparava que era ali que se anexava o
              julgamento/relatório pronto (ver podeConfirmar acima). */}
          {revisao.modoAnexo && (
            <div className="rounded-lg border-2 border-[#0E4A44]/30 bg-[#0E4A44]/5 p-3 space-y-2">
              <p className="text-xs font-bold text-[#0E4A44]">Anexe aqui o documento pronto</p>
              <p className="text-[11px] text-[#3E5B57]">
                O texto na folha acima é só a legenda de juntada — o {revisao.titulo.toLowerCase()} em si é o arquivo que você anexa abaixo.
              </p>
              <input ref={anexoExternoRef} type="file" className="hidden" onChange={(e) => setAnexoExternoFile(e.target.files?.[0] || undefined)} />
              {anexoExternoFile ? (
                <span className="inline-flex items-center gap-2 bg-white border border-[#0E4A44]/30 rounded px-2 py-1.5 text-xs text-[#0E4A44]">
                  <Paperclip className="h-3.5 w-3.5" /> {anexoExternoFile.name}
                  <button type="button" onClick={() => setAnexoExternoFile(undefined)}><X className="h-3 w-3 text-[#A39D8C] hover:text-rose-500" /></button>
                </span>
              ) : (
                <Button type="button" onClick={() => anexoExternoRef.current?.click()} className="h-9 rounded-md text-xs gap-1.5 bg-[#0E4A44] hover:bg-[#0B3A35]">
                  <Paperclip className="h-3.5 w-3.5" /> Escolher arquivo
                </Button>
              )}
            </div>
          )}

          {/* Pré-preenchida com hoje, mas editável — sem isso, montar o
              processo com atraso (comum na prática) fazia toda peça sair
              datada do dia em que alguém finalmente sentou pra digitar os
              autos, mesmo peças de etapas que na realidade aconteceram em
              datas diferentes. */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-[#6B6659]">Data do ato</Label>
            <Input
              type="date"
              value={dataAtoStr}
              max={hojeStr}
              onChange={(e) => setDataAtoStr(e.target.value || hojeStr)}
              className="h-9 rounded-md border-[#E4DFD1] w-auto"
            />
          </div>

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

          {!revisao.modoAnexo && (
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
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {/* Guardar sem assinar — pra quando falta algo (confirmar um dado,
              esperar a assinatura de outra pessoa) e o texto já digitado não
              pode ficar arriscado a se perder. Sem exigir assinatura/anexo:
              é exatamente o oposto de "Confirmar e Prosseguir". */}
          {podeSalvarRascunho ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleSalvarRascunho}
              disabled={isSalvando || isSalvandoRascunho}
              className="rounded-md gap-1.5 text-[#6B6659]"
            >
              {isSalvandoRascunho ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar rascunho
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onFechar} disabled={isSalvando || isSalvandoRascunho} className="rounded-md">Cancelar</Button>
            <Button onClick={handleConfirmar} disabled={isSalvando || isSalvandoRascunho || !podeConfirmar} className="rounded-md bg-[#0E4A44] hover:bg-[#0B3A35]">
              {isSalvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />} Confirmar e Prosseguir
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

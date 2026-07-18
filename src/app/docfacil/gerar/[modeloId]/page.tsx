"use client"

import { use, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Download, FileText, Loader2 } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DocfacilEditor } from "@/components/docfacil-editor"
import { OfficialLetterhead } from "@/components/official-letterhead"
import { useDocfacil } from "@/hooks/use-docfacil"
import { useToast } from "@/hooks/use-toast"
import type { DocfacilDocumento, DocfacilTipo } from "@/lib/types"

const TIPO_LABEL: Record<DocfacilTipo, string> = {
  oficio: "OFÍCIO",
  memorando: "MEMORANDO",
  circular: "CIRCULAR",
};

export default function GerarDocumentoPage({ params }: { params: Promise<{ modeloId: string }> }) {
  const { modeloId } = use(params);
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folderId") || undefined;
  const { toast } = useToast();
  const { modelos, loading, salvarDocumento } = useDocfacil();
  const reportRef = useRef<HTMLDivElement>(null);

  const modelo = modelos.find((m) => m.id === modeloId) || null;

  const [destinatario, setDestinatario] = useState("");
  const [assunto, setAssunto] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [view, setView] = useState<"edicao" | "relatorio">("edicao");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [documentoEmitido, setDocumentoEmitido] = useState<DocfacilDocumento | null>(null);

  useEffect(() => {
    if (modelo && !conteudo) setConteudo(modelo.conteudo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo?.id]);

  const handleGerar = async () => {
    if (!modelo) return;
    if (!assunto.trim()) {
      toast({ variant: "destructive", title: "Informe o assunto do documento" });
      return;
    }
    setIsGenerating(true);
    try {
      const novo = await salvarDocumento({
        modeloId: modelo.id,
        tipo: modelo.tipo,
        destinatario: destinatario.trim(),
        assunto: assunto.trim(),
        conteudo,
        folderId,
      });
      setDocumentoEmitido(novo);
      setView("relatorio");
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao gerar documento" });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPdf = async () => {
    if (!reportRef.current || !documentoEmitido) return;
    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(reportRef.current, { scale: 3.0, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; const pageHeight = 297; const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight; let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) { position = heightLeft - imgHeight; pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight); heightLeft -= pageHeight; }
      pdf.save(`${TIPO_LABEL[documentoEmitido.tipo]} ${documentoEmitido.numero.replace('/', '-')}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading || !modelo) {
    return (
      <div className="max-w-4xl mx-auto w-full p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
      </div>
    );
  }

  if (view === "relatorio" && documentoEmitido) {
    return (
      <div className="min-h-screen bg-white">
        <DocfacilTopbar
          onBack={() => setView("edicao")}
          title={`${TIPO_LABEL[documentoEmitido.tipo]} Nº ${documentoEmitido.numero}`}
          actions={
            <Button onClick={downloadPdf} disabled={isDownloading} size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium">
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar PDF Oficial
            </Button>
          }
        />
        <div className="document-container font-serif pb-40">
          <div className="document-paper-wrapper custom-scrollbar">
            <div ref={reportRef} className="document-paper h-auto bg-white">
              <div className="mb-1 pb-2 border-none">
                <OfficialLetterhead />
                <p className="text-[14pt] font-black uppercase italic tracking-tighter mt-2 border-y border-zinc-200 py-1 text-center">{TIPO_LABEL[documentoEmitido.tipo]} Nº {documentoEmitido.numero}</p>
              </div>

              <div className="mb-6 mt-6 space-y-1">
                {documentoEmitido.destinatario && <p className="text-[10pt] font-bold uppercase">Destinatário: {documentoEmitido.destinatario}</p>}
                <p className="text-[10pt] font-bold uppercase">Assunto: {documentoEmitido.assunto}</p>
              </div>

              <div className="text-[11pt] leading-relaxed" dangerouslySetInnerHTML={{ __html: documentoEmitido.conteudo }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <DocfacilTopbar
        backHref="/docfacil"
        title={`Gerar ${TIPO_LABEL[modelo.tipo]}`}
        subtitle={`A partir do modelo: ${modelo.descricao}`}
        actions={
          <Button onClick={handleGerar} disabled={isGenerating} size="sm" className="h-9 rounded-md gap-1.5 text-xs font-medium">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Visualizar Documento
          </Button>
        }
      />

      <div className="max-w-4xl mx-auto w-full py-6 space-y-4 pb-40">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-0">
          <Input
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value.toUpperCase())}
            placeholder="Destinatário"
            className="h-8 flex-1 min-w-[180px] rounded-md text-xs uppercase"
          />
          <Input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder="Assunto"
            className="h-8 flex-1 min-w-[180px] rounded-md text-xs"
          />
        </div>

        <DocfacilEditor defaultValue={conteudo} onChange={setConteudo} />
      </div>
    </div>
  )
}

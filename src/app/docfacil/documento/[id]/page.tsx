"use client"

import { use, useRef, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { DocfacilTopbar } from "@/components/docfacil/docfacil-topbar"
import { Button } from "@/components/ui/button"
import { OfficialLetterhead } from "@/components/official-letterhead"
import { useDocfacil } from "@/hooks/use-docfacil"
import type { DocfacilTipo } from "@/lib/types"

const TIPO_LABEL: Record<DocfacilTipo, string> = {
  oficio: "OFÍCIO",
  memorando: "MEMORANDO",
  circular: "CIRCULAR",
};

export default function VisualizarDocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { documentos, loading } = useDocfacil();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const documento = documentos.find((d) => d.id === id) || null;

  const downloadPdf = async () => {
    if (!reportRef.current || !documento) return;
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
      pdf.save(`${TIPO_LABEL[documento.tipo]} ${documento.numero.replace('/', '-')}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading || !documento) {
    return (
      <div className="max-w-4xl mx-auto w-full p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <DocfacilTopbar
        backHref="/docfacil"
        title={`${TIPO_LABEL[documento.tipo]} Nº ${documento.numero}`}
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
              <p className="text-[14pt] font-black uppercase italic tracking-tighter mt-2 border-y border-zinc-200 py-1 text-center">{TIPO_LABEL[documento.tipo]} Nº {documento.numero}</p>
            </div>

            <div className="mb-6 mt-6 space-y-1">
              {documento.destinatario && <p className="text-[10pt] font-bold uppercase">Destinatário: {documento.destinatario}</p>}
              <p className="text-[10pt] font-bold uppercase">Assunto: {documento.assunto}</p>
            </div>

            <div className="text-[11pt] leading-relaxed" dangerouslySetInnerHTML={{ __html: documento.conteudo }} />
          </div>
        </div>
      </div>
    </div>
  )
}

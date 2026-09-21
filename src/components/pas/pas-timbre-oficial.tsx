"use client"

import { Landmark } from "lucide-react"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { cn } from "@/lib/utils"

/**
 * Timbre institucional (brasão + identificação da prefeitura) — extraído de
 * 4 cópias quase idênticas (autos em PDF, etiqueta de capa, diálogo de
 * revisão e diálogo de visualização de peça) que foram divergindo aos
 * poucos: os dois PDFs usavam "PRUDENTÓPOLIS" fixo como nome do município
 * quando `config.municipioNome` não estava preenchido, em vez do nome de
 * verdade já calculado em `nomeMunicipioExibicao` (usado corretamente logo
 * abaixo, no fecho de assinatura do mesmo documento) — qualquer município
 * além de Prudentópolis sem esse campo customizado saía com o cabeçalho
 * errado no PDF assinado, mesmo com a pré-visualização de revisão certa.
 *
 * `tamanho` só ajusta a escala (o PDF é impresso em folha real; os diálogos
 * são preview de tela, menores).
 */
export function PasTimbreOficial({
  logoUrl,
  headerRichText,
  secretaria,
  departamento,
  nomeMunicipioExibicao,
  tamanho,
  comTituloProcesso = true,
}: {
  logoUrl?: string;
  headerRichText?: string;
  secretaria?: string;
  departamento?: string;
  nomeMunicipioExibicao: string;
  tamanho: 'pdf' | 'dialog';
  comTituloProcesso?: boolean;
}) {
  const ehPdf = tamanho === 'pdf';
  return (
    <>
      <div className={cn(ehPdf ? "w-[140px] h-[100px]" : "w-[70px] h-[55px]", "flex items-center justify-start overflow-hidden shrink-0")}>
        {logoUrl ? (
          <img
            src={logoUrl.startsWith('data:') ? logoUrl : `/api/proxy-image?url=${encodeURIComponent(logoUrl)}`}
            className="max-w-full max-h-full object-contain block"
            alt="Brasão"
            // Só o PDF é capturado pelo html2canvas — sem isso, uma imagem
            // externa "suja" o canvas e a geração falha por CORS. O preview
            // de tela nos diálogos não passa por canvas nenhum.
            crossOrigin={ehPdf ? (logoUrl.startsWith('data:') ? undefined : "anonymous") : undefined}
          />
        ) : (
          <Landmark className="w-2/3 h-2/3 text-zinc-300" strokeWidth={1} />
        )}
      </div>
      <div className="flex-1 text-center">
        {headerRichText ? (
          <div className={ehPdf ? undefined : "text-[9pt]"} dangerouslySetInnerHTML={{ __html: sanitizeHtml(headerRichText) }} />
        ) : (
          <>
            <p className={cn(ehPdf ? "text-[10pt]" : "text-[9pt]", "font-black uppercase text-black")}>PREFEITURA MUNICIPAL DE {nomeMunicipioExibicao.toUpperCase()}</p>
            <h2 className={cn(ehPdf ? "text-[12pt]" : "text-[10pt]", "font-black uppercase leading-tight")}>{secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2>
            <h3 className={cn(ehPdf ? "text-[10pt]" : "text-[9pt]", "font-bold uppercase text-zinc-700")}>{departamento || "VIGILÂNCIA SANITÁRIA"}</h3>
          </>
        )}
        {comTituloProcesso && (
          <p className={cn(ehPdf ? "text-[13pt] mt-2 py-1" : "text-[10pt] mt-1.5 py-0.5", "font-black uppercase text-center tracking-tighter border-y border-zinc-200")}>
            Processo Administrativo Sanitário
          </p>
        )}
      </div>
      {!ehPdf && <div className="w-[70px] shrink-0" aria-hidden />}
    </>
  );
}

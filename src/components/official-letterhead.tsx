"use client"

import { Landmark } from "lucide-react"
import { useAppConfig } from "@/hooks/use-app-config"
import { cn } from "@/lib/utils"
import { sanitizeHtml } from "@/lib/sanitize-html"

/** Timbre oficial (brasão + prefeitura/secretaria/departamento) usado em
 * todos os documentos gerados pelo sistema — mesmo padrão já usado em
 * Roteiros/Intimações, agora compartilhado num único lugar. */
export function OfficialLetterhead({ className }: { className?: string }) {
  const { config } = useAppConfig();
  // Sem brasão municipal configurado, mostra um espaço neutro (ícone
  // genérico) em vez de qualquer imagem específica — nunca a marca do
  // sistema (mascote do login) nem qualquer outra logo que não seja a do
  // próprio município.
  const hasLogo = !!config.logoUrl;
  const isDataUrl = hasLogo && config.logoUrl!.startsWith('data:');
  const displayLogoUrl = hasLogo
    ? (isDataUrl ? config.logoUrl! : `/api/proxy-image?url=${encodeURIComponent(config.logoUrl!)}`)
    : undefined;

  return (
    // Grid de 3 colunas (brasão | texto | espaço-fantasma) em vez de um flex
    // de 2 filhos com justify-between: com só 2 filhos, a coluna de texto
    // preenchia todo o espaço sobrando à direita do brasão e centralizava
    // dentro DAQUELE espaço — não da folha inteira —, deixando o timbre
    // visivelmente deslocado pra direita. A 3ª coluna (mesma largura da 1ª,
    // vazia) garante que a coluna do meio fique realmente centralizada na
    // página, com ou sem brasão.
    <div className={cn("grid grid-cols-[140px_1fr_140px] items-center gap-4", className)}>
      <div className="h-[100px] flex items-center justify-center overflow-hidden">
        {hasLogo ? (
          <img src={displayLogoUrl} className="max-w-full max-h-full object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} />
        ) : (
          <Landmark className="w-2/3 h-2/3 text-zinc-300" strokeWidth={1} />
        )}
      </div>
      <div className="text-center font-serif">
        {config.headerRichText ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(config.headerRichText) }} />
        ) : (
          <>
            <p className="text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "MUNICÍPIO"}</p>
            <h2 className="text-[12pt] font-black uppercase leading-tight">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2>
            <h3 className="text-[10pt] font-bold uppercase text-zinc-700">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3>
          </>
        )}
      </div>
      <div aria-hidden="true" />
    </div>
  );
}

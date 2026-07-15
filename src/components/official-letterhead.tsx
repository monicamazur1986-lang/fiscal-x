"use client"

import { useAppConfig } from "@/hooks/use-app-config"
import { cn } from "@/lib/utils"

const OFFICIAL_SYMBOL_URL = "https://firebasestorage.googleapis.com/v0/b/firebasestudio-1937074168.appspot.com/o/user-uploads%2F67b6653d9e6e872d80ef618e%2Flogo_horizontal_preto_transparente.jpg?alt=media";

/** Timbre oficial (brasão + prefeitura/secretaria/departamento) usado em
 * todos os documentos gerados pelo sistema — mesmo padrão já usado em
 * Roteiros/Intimações, agora compartilhado num único lugar. */
export function OfficialLetterhead({ className }: { className?: string }) {
  const { config } = useAppConfig();
  const logoSource = config.logoUrl || OFFICIAL_SYMBOL_URL;
  const isDataUrl = logoSource.startsWith('data:');
  const displayLogoUrl = isDataUrl ? logoSource : `/api/proxy-image?url=${encodeURIComponent(logoSource)}`;

  return (
    <div className={cn("flex flex-row items-center justify-between gap-6", className)}>
      <div className="w-[140px] h-[100px] flex items-center justify-start overflow-hidden shrink-0">
        <img src={displayLogoUrl} className="max-w-full max-h-full object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} />
      </div>
      <div className="flex-1 text-center font-serif">
        {config.headerRichText ? (
          <div dangerouslySetInnerHTML={{ __html: config.headerRichText }} />
        ) : (
          <>
            <p className="text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "PRUDENTÓPOLIS"}</p>
            <h2 className="text-[12pt] font-black uppercase leading-tight">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2>
            <h3 className="text-[10pt] font-bold uppercase text-zinc-700">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3>
          </>
        )}
      </div>
    </div>
  );
}

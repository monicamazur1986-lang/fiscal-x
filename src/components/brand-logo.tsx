
'use client';

import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { useAppConfig } from "@/hooks/use-app-config"

/**
 * Mascot do Sistema vigilanT
 * Detecta automaticamente o logo personalizado (ROOT) ou usa o SVG padrão.
 */
export function SentinelaMascot({ className, width = 280, height = 280, simplified = false }: { className?: string, width?: number, height?: number, simplified?: boolean }) {
  const { systemLogo } = useAppConfig();
  const [imgError, setImgError] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState("/logo.jpg");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setImgError(false);
    setFallbackSrc("/logo.jpg");
  }, [systemLogo]);

  const containerStyle = { width: `${width}px`, height: `${height}px` };
  const containerClasses = cn("relative flex items-center justify-center select-none bg-transparent overflow-hidden rounded-[2rem] shadow-[0_15px_40px_-20px_rgba(0,0,0,0.35)] border border-white/70", className);

  // Evita Hydration Mismatch
  if (!mounted) {
    return <div className={containerClasses} style={containerStyle} />;
  }

  // Tenta carregar o Logotipo Customizado (ROOT)
  if (!imgError && systemLogo && systemLogo.length > 10 && !simplified) {
    return (
      <div className={containerClasses} style={containerStyle}>
        <img 
          src={systemLogo} 
          alt="vigilanT"
          className="object-cover w-full h-full"
          style={{ width: '100%', height: '100%' }}
          onError={() => {
            console.warn("Logo customizado falhou no carregamento. Usando padrão.");
            setImgError(true);
          }}
        />
      </div>
    );
  }

  // FALLBACK: LOGO PADRÃO (SENTINELA)
  return (
    <div className={containerClasses} style={containerStyle}>
      <img
        src={fallbackSrc}
        alt="vigilanT"
        className="object-cover w-full h-full"
        style={{ width: '100%', height: '100%' }}
        onError={() => {
          if (fallbackSrc === "/logo.jpg") {
            setFallbackSrc("/logo.svg");
          }
        }}
      />
    </div>
  );
}

export function VigilantTextLogo({ className, width = 300 }: { className?: string, width?: number }) {
  return (
    <div className={cn("flex flex-col items-center justify-center font-sans select-none", className)} style={{ width: `${width}px` }}>
      <div className="flex items-center">
        <span className="text-[#0f172a] text-5xl md:text-6xl font-black tracking-tighter italic">vigilan</span>
        <span className="text-[#00a99d] text-5xl md:text-6xl font-black uppercase tracking-tighter ml-1 italic">T</span>
      </div>
    </div>
  );
}

"use client";

import { forwardRef, useCallback } from "react";
import { useEscalaFolha } from "@/hooks/use-escala-folha";
import { cn } from "@/lib/utils";

/**
 * Uma folha A4 que cabe na tela.
 *
 * A folha (`.document-paper`) tem 210mm ≈ 794px de largura fixa, porque é
 * assim que ela precisa sair no PDF. Num celular isso é o dobro da tela. Este
 * componente resolve o encaixe visual sem tocar na folha em si: mede o espaço
 * disponível, reduz a folha proporcionalmente e — o ponto que costuma passar
 * batido — encolhe também a CAIXA que a folha ocupa no layout.
 *
 * Sem essa segunda parte, `transform: scale()` deixa para trás uma largura e
 * uma altura fantasma do tamanho original, que continuam rolando de lado e
 * sobrando embaixo. Era o que acontecia na tela de autuações: a folha aparecia
 * deslocada para fora da tela e o fiscal tinha que arrastar para enquadrar.
 *
 * Cada folha ganha o seu contêiner (e não um só para a tela toda) porque há
 * telas com mais de uma — a autuação principal e o termo vinculado, por
 * exemplo —, e cada uma tem altura própria.
 *
 * `ativo={false}` desliga a redução: é o que se usa na geração do PDF e na
 * impressão, onde a folha tem de sair no tamanho real.
 */
export const FolhaEscalada = forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
    /** Recalcula quando algo que muda a altura da folha muda. */
    deps?: unknown[];
    ativo?: boolean;
  }
>(function FolhaEscalada({ children, className, deps, ativo = true }, refExterna) {
  const { wrapperRef, paperRef, estiloWrapper, estiloFolha } = useEscalaFolha({ ativo, deps });

  // A folha precisa responder a dois donos: este componente, que a mede, e
  // quem chamou, que a usa para gerar o PDF.
  const refDaFolha = useCallback(
    (el: HTMLDivElement | null) => {
      (paperRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (typeof refExterna === "function") refExterna(el);
      else if (refExterna) (refExterna as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [paperRef, refExterna]
  );

  return (
    <div ref={wrapperRef} style={ativo ? estiloWrapper : undefined} className="w-full min-w-0 max-w-full">
      <div
        ref={refDaFolha}
        style={ativo ? estiloFolha : undefined}
        className={cn("document-paper h-auto bg-white", className)}
      >
        {children}
      </div>
    </div>
  );
});

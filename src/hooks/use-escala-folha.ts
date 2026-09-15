"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ESCALA DA FOLHA A4 NA TELA
 *
 * Toda prévia de documento do sistema desenha uma folha A4 de largura fixa
 * (210mm ≈ 794px, ver `.document-paper` em globals.css). Num celular de 390px
 * isso é o dobro da tela, e sem tratamento o fiscal precisa arrastar a página
 * de lado para ler — foi exatamente o que aconteceu na tela de autuações.
 *
 * O detalhe que faz a diferença: `transform: scale()` encolhe o que se VÊ, mas
 * não muda o espaço que o elemento OCUPA no layout. Só aplicar a escala deixa
 * a folha pequena e visível, e ao mesmo tempo mantém uma "largura fantasma" de
 * 794px que continua rolando de lado, com a folha aparentemente jogada para
 * fora da tela (pior ainda com `transform-origin: top center`, que empurra o
 * conteúdo para a direita). Por isso este hook faz três coisas juntas:
 *
 *   1. escala a folha com origem em `top left`, para ela começar na borda;
 *   2. fixa a ALTURA do wrapper na altura real já escalada, matando a sobra
 *      vertical que a escala deixaria embaixo;
 *   3. desliga a rolagem horizontal enquanto houver redução.
 *
 * A implementação nasceu na tela de Roteiros e virou hook para que as demais
 * prévias (autuações, DocFácil, PAS) não repitam — nem divirjam — da mesma
 * solução.
 */
export function useEscalaFolha(options?: { ativo?: boolean; deps?: unknown[] }) {
  const ativo = options?.ativo ?? true;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [alturaVisual, setAlturaVisual] = useState<number | undefined>(undefined);

  const deps = options?.deps ?? [];

  const recalcular = useCallback(() => {
    const wrapperEl = wrapperRef.current;
    const paperEl = paperRef.current;
    if (!wrapperEl || !paperEl) return;

    const estilo = window.getComputedStyle(wrapperEl);
    const paddingX =
      parseFloat(estilo.paddingLeft || "0") + parseFloat(estilo.paddingRight || "0");
    const larguraDisponivel = wrapperEl.clientWidth - paddingX;
    const larguraNatural = paperEl.offsetWidth;
    const alturaNatural = paperEl.offsetHeight;
    if (!larguraNatural || larguraDisponivel <= 0) return;

    const nova = larguraNatural > larguraDisponivel ? larguraDisponivel / larguraNatural : 1;
    setEscala(nova);
    setAlturaVisual(alturaNatural * nova);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    const wrapperEl = wrapperRef.current;
    const paperEl = paperRef.current;
    if (!wrapperEl || !paperEl) return;

    recalcular();

    // Só reage a mudança de LARGURA do wrapper (rotação do aparelho, sidebar
    // recolhendo) e a qualquer mudança de conteúdo da folha — nunca à mudança
    // de ALTURA do próprio wrapper, que é justamente o que este efeito define
    // (`setAlturaVisual`). Sem esse filtro o ResizeObserver notifica a própria
    // mudança que causou, entrando num ciclo observer → setState → notificação
    // que nunca converge e trava a tela.
    let ultimaLargura = wrapperEl.clientWidth;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === wrapperEl) {
          const largura = wrapperEl.clientWidth;
          if (largura === ultimaLargura) continue;
          ultimaLargura = largura;
        }
        recalcular();
        break;
      }
    });
    ro.observe(wrapperEl);
    ro.observe(paperEl);
    window.addEventListener("resize", recalcular);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recalcular);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, recalcular, ...deps]);

  return {
    wrapperRef,
    paperRef,
    escala,
    alturaVisual,
    /** Vai no elemento que embrulha a folha (o de `.document-paper-wrapper`). */
    estiloWrapper: {
      overflowX: escala < 1 ? ("hidden" as const) : ("auto" as const),
      height: alturaVisual,
    },
    /** Vai na própria folha (`.document-paper`). */
    estiloFolha: {
      transform: `scale(${escala})`,
      transformOrigin: "top left" as const,
    },
    recalcular,
  };
}

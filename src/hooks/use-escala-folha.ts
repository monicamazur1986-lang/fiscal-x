"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

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
/**
 * `zoom` encolhe o elemento E a caixa que ele ocupa; `transform: scale()`
 * encolhe só o desenho e deixa para trás a largura e a ALTURA originais.
 *
 * Enquanto a folha era só escalada, essa altura fantasma virava um vão de
 * centenas de pixels entre o fim do documento e o que vem depois dele — o
 * botão de gerar o termo vinculado, por exemplo, ficava jogado lá embaixo.
 * Compensar isso fixando a altura do contêiner funciona, mas depende de uma
 * medição que precisa acertar todas as vezes, em cada mudança de conteúdo.
 *
 * Onde `zoom` existe (Chrome, Edge, Safari e Firefox recente — ou seja, o
 * celular e o tablet onde a vistoria acontece), o navegador resolve isso
 * sozinho e não sobra nada. O caminho antigo fica de reserva.
 */
function suportaZoom(): boolean {
  if (typeof window === "undefined" || !window.CSS?.supports) return false;
  return window.CSS.supports("zoom", "0.5");
}

export function useEscalaFolha(options?: { ativo?: boolean; deps?: unknown[] }) {
  const ativo = options?.ativo ?? true;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [alturaVisual, setAlturaVisual] = useState<number | undefined>(undefined);
  // Resolvido depois da montagem: no servidor não existe window, e assumir
  // zoom lá produziria marcação diferente da do cliente.
  const [usaZoom, setUsaZoom] = useState(false);
  // A folha tem largura fixa (210mm) e nunca muda. Guardamos a primeira
  // medição porque, sob `zoom`, medir de novo devolveria a largura JÁ
  // reduzida — e a conta encolheria a folha outra vez a cada passada, até
  // sumir.
  const larguraNaturalRef = useRef(0);
  useEffect(() => setUsaZoom(suportaZoom()), []);

  const deps = options?.deps ?? [];

  const recalcular = useCallback(() => {
    const wrapperEl = wrapperRef.current;
    const paperEl = paperRef.current;
    if (!wrapperEl || !paperEl) return;

    const estilo = window.getComputedStyle(wrapperEl);
    const paddingX =
      parseFloat(estilo.paddingLeft || "0") + parseFloat(estilo.paddingRight || "0");

    // A LARGURA DA JANELA É O TETO, sempre.
    //
    // Medir só o wrapper não basta: basta um ancestral em flex deixar o
    // contêiner crescer junto com a folha para o wrapper reportar os mesmos
    // 794px da folha. A conta então enxerga "cabe quase tudo", reduz 5% e o
    // documento sai pela direita — foi exatamente o que aconteceu no
    // relatório de inspeção. A viewport não mente sobre o tamanho da tela,
    // então ela entra como limite superior do que existe de espaço.
    const larguraJanela = document.documentElement.clientWidth || window.innerWidth || 0;
    const larguraDisponivel = Math.min(
      wrapperEl.clientWidth - paddingX,
      larguraJanela - paddingX
    );
    if (!larguraNaturalRef.current && paperEl.offsetWidth) {
      larguraNaturalRef.current = paperEl.offsetWidth;
    }
    const larguraNatural = larguraNaturalRef.current;
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
    if (!wrapperEl || !paperEl) {
      // Desistir em silêncio aqui custou três tentativas de correção: quem
      // esquece de ligar um dos refs na folha vê o documento abrir em tamanho
      // real, cortado, sem nenhum sinal de que o cálculo nem chegou a rodar.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[useEscalaFolha] wrapperRef e paperRef precisam estar ligados aos elementos ' +
            '(o contêiner e a folha .document-paper). Sem os dois, a folha não encolhe ' +
            'e o documento abre cortado.',
          { wrapper: !!wrapperEl, folha: !!paperEl }
        );
      }
      return;
    }

    recalcular();
    // A primeira medição pode pegar a folha ainda sem conteúdo (fontes e
    // brasão carregando); estas duas repetições cobrem o assentamento sem
    // depender de o ResizeObserver notar a diferença.
    const rafId = requestAnimationFrame(recalcular);
    const timeoutId = setTimeout(recalcular, 400);

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
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
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
      // Com `zoom` não há altura fantasma a compensar: o contêiner encolhe
      // junto com a folha e não sobra vão nenhum embaixo dela.
      height: usaZoom ? undefined : alturaVisual,
    },
    /** Vai na própria folha (`.document-paper`). */
    estiloFolha: usaZoom
      ? ({ zoom: escala } as CSSProperties)
      : {
          transform: `scale(${escala})`,
          transformOrigin: "top left" as const,
        },
    recalcular,
  };
}

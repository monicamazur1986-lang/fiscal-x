"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * DITADO POR VOZ QUE NÃO DESISTE NA PAUSA
 *
 * O problema que este hook existe para resolver: `continuous = true` NÃO
 * significa que o navegador fica ouvindo. O Chrome encerra a sessão de
 * reconhecimento sozinho depois de alguns segundos de silêncio e dispara
 * `onend` — e, como todo `onend` desligava o estado de gravação, o fiscal
 * perdia o microfone toda vez que parava para pensar ou respirar no meio do
 * relato. Na prática, só dava para ditar uma frase por vez.
 *
 * A correção é separar duas coisas que estavam confundidas:
 *
 *   o que o NAVEGADOR está fazendo (pode encerrar quando quiser), e
 *   o que o FISCAL pediu (quer continuar ditando até apertar parar).
 *
 * `deveOuvirRef` guarda a intenção do fiscal. Quando o navegador encerra por
 * conta própria, o hook reabre a sessão e segue ouvindo. A gravação só para de
 * verdade quando a pessoa manda parar — ou quando o erro é daqueles que não
 * adianta insistir (microfone negado, navegador sem suporte).
 *
 * Erros benignos (`no-speech`, `aborted`, `network`) não derrubam nada: são o
 * caso normal de quem está pensando no que falar.
 */

/** Erros que significam "não adianta tentar de novo". */
const ERROS_FATAIS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

export function useDitadoPorVoz(options: {
  /** Recebe cada trecho reconhecido, já finalizado. */
  aoTranscrever: (texto: string) => void;
  /** `true` MAIÚSCULAS (padrão dos relatos de autuação). */
  maiusculas?: boolean;
  aoErrar?: (mensagem: string) => void;
}) {
  const { aoTranscrever, maiusculas = false, aoErrar } = options;

  const [gravando, setGravando] = useState(false);
  const [suportado, setSuportado] = useState(false);
  const reconhecimentoRef = useRef<any>(null);
  /** A intenção do fiscal, que sobrevive aos `onend` do navegador. */
  const deveOuvirRef = useRef(false);
  const reinicioRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callbacks em ref para o reconhecimento não precisar ser recriado (e a
  // sessão reiniciada) a cada render do componente que usa o hook.
  const aoTranscreverRef = useRef(aoTranscrever);
  const aoErrarRef = useRef(aoErrar);
  useEffect(() => {
    aoTranscreverRef.current = aoTranscrever;
    aoErrarRef.current = aoErrar;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Reconhecimento =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Reconhecimento) {
      setSuportado(false);
      return;
    }
    setSuportado(true);

    const rec = new Reconhecimento();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "pt-BR";

    rec.onresult = (evento: any) => {
      let texto = "";
      for (let i = evento.resultIndex; i < evento.results.length; ++i) {
        if (evento.results[i].isFinal) texto += evento.results[i][0].transcript;
      }
      if (texto) aoTranscreverRef.current(maiusculas ? texto.toUpperCase() : texto);
    };

    rec.onerror = (evento: any) => {
      const erro = evento?.error as string | undefined;
      if (erro && ERROS_FATAIS.has(erro)) {
        deveOuvirRef.current = false;
        setGravando(false);
        aoErrarRef.current?.(
          erro === "audio-capture"
            ? "Nenhum microfone encontrado neste aparelho."
            : "Permissão de microfone negada. Libere o microfone nas configurações do navegador."
        );
      }
      // Os demais (no-speech, aborted, network) são silêncio ou soluço da
      // conexão: o `onend` logo abaixo reabre a sessão.
    };

    rec.onend = () => {
      if (!deveOuvirRef.current) {
        setGravando(false);
        return;
      }
      // O navegador desistiu, o fiscal não. Reabre — com um respiro mínimo,
      // porque chamar start() dentro do próprio onend estoura InvalidStateError
      // em alguns navegadores.
      reinicioRef.current = setTimeout(() => {
        if (!deveOuvirRef.current) return;
        try {
          rec.start();
        } catch {
          // Já estava ouvindo: nada a fazer.
        }
      }, 250);
    };

    reconhecimentoRef.current = rec;
    return () => {
      deveOuvirRef.current = false;
      if (reinicioRef.current) clearTimeout(reinicioRef.current);
      try {
        rec.stop();
      } catch {
        /* sessão já encerrada */
      }
    };
  }, [maiusculas]);

  const iniciar = useCallback(() => {
    const rec = reconhecimentoRef.current;
    if (!rec) return;
    deveOuvirRef.current = true;
    setGravando(true);
    try {
      rec.start();
    } catch {
      // start() em sessão já aberta: o estado acima já reflete a gravação.
    }
  }, []);

  const parar = useCallback(() => {
    deveOuvirRef.current = false;
    if (reinicioRef.current) clearTimeout(reinicioRef.current);
    setGravando(false);
    try {
      reconhecimentoRef.current?.stop();
    } catch {
      /* já encerrada */
    }
  }, []);

  const alternar = useCallback(() => {
    if (deveOuvirRef.current) parar();
    else iniciar();
  }, [iniciar, parar]);

  return { gravando, suportado, iniciar, parar, alternar };
}

"use client"

import React, { useRef, useState, useEffect } from 'react';
import SignaturePadLib from 'signature_pad';
import { Button } from './ui/button';
import { Eraser, Check, PenTool, Maximize2, Minimize2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';

/**
 * Largura máxima do PNG exportado. A assinatura é desenhada nos documentos com
 * altura fixa e `object-contain` (h-10 no corpo da autuação, h-16 nas peças do
 * PAS), ocupando cerca de 70mm no papel — 600px ali dão ~220 DPI, mais do que
 * qualquer impressora de escritório resolve.
 */
const LARGURA_MAX_ASSINATURA = 600;

/** Piso do recorte, como fração do canvas: uma rubrica curta não pode virar um
 *  recorte minúsculo, senão o `object-contain` a ampliaria desproporcionalmente
 *  na hora de imprimir. */
const RECORTE_MINIMO = 0.35;

/** Cresce um intervalo até o tamanho mínimo, mantendo o centro e respeitando a
 *  borda do canvas. */
function expandirAteMinimo(inicio: number, fim: number, minimo: number, limite: number): [number, number] {
  if (fim - inicio >= minimo) return [Math.max(0, inicio), Math.min(limite, fim)];
  const centro = (inicio + fim) / 2;
  let novoInicio = Math.round(centro - minimo / 2);
  let novoFim = Math.round(centro + minimo / 2);
  if (novoInicio < 0) { novoFim -= novoInicio; novoInicio = 0; }
  if (novoFim > limite) { novoInicio -= novoFim - limite; novoFim = limite; }
  return [Math.max(0, novoInicio), Math.min(limite, novoFim)];
}

/**
 * ASSINATURA ENXUTA, SEM SAIR DO DOCUMENTO.
 *
 * A assinatura continua embutida no próprio documento como data URL — é peça de
 * valor legal, e depender do Storage pra renderizar significaria PDF sem
 * assinatura quando a rede ou o bucket falham. O que muda é só o tamanho do
 * que é exportado.
 *
 * O canvas do pad é criado em `rect.width * dpr` (ver initPad): num diálogo de
 * 900px com dpr 3, isso dá ~2700px de largura, quase toda transparente, e o
 * `toDataURL` levava tudo isso pra dentro do Firestore e do localStorage — a
 * maior parte do peso de uma autuação vinha daí. Aqui o PNG é recortado no
 * retângulo onde realmente há traço e reamostrado pra uma largura fixa.
 *
 * Se qualquer etapa falhar (canvas sem contexto, getImageData bloqueado), cai
 * pro comportamento antigo: exporta o canvas inteiro. Nunca devolve vazio.
 */
function exportarAssinatura(canvas: HTMLCanvasElement): string {
  const contexto = canvas.getContext('2d');
  if (!contexto) return canvas.toDataURL('image/png');

  let pixels: ImageData;
  try {
    pixels = contexto.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return canvas.toDataURL('image/png');
  }

  // O pad desenha traço preto sobre fundo transparente, então o canal alfa
  // identifica a tinta. O limiar 8 (de 255) ignora o quase-nada da borda
  // antisserrilhada sem cortar o traço de verdade.
  const { data, width, height } = pixels;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL('image/png');

  const folga = Math.round(Math.min(width, height) * 0.04);
  const [x0, x1] = expandirAteMinimo(minX - folga, maxX + folga, width * RECORTE_MINIMO, width);
  const [y0, y1] = expandirAteMinimo(minY - folga, maxY + folga, height * RECORTE_MINIMO, height);

  const larguraRecorte = Math.max(1, x1 - x0);
  const alturaRecorte = Math.max(1, y1 - y0);
  const escala = Math.min(1, LARGURA_MAX_ASSINATURA / larguraRecorte);

  const saida = document.createElement('canvas');
  saida.width = Math.max(1, Math.round(larguraRecorte * escala));
  saida.height = Math.max(1, Math.round(alturaRecorte * escala));
  const contextoSaida = saida.getContext('2d');
  if (!contextoSaida) return canvas.toDataURL('image/png');

  contextoSaida.imageSmoothingEnabled = true;
  contextoSaida.imageSmoothingQuality = 'high';
  contextoSaida.drawImage(canvas, x0, y0, larguraRecorte, alturaRecorte, 0, 0, saida.width, saida.height);
  return saida.toDataURL('image/png');
}

interface SignaturePadProps {
  onSave: (signature: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  trigger?: React.ReactNode;
}

export function SignaturePad({
  onSave,
  isOpen: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  title = "Assinar Documento",
  trigger
}: SignaturePadProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [isZoomedOut, setIsZoomedOut] = useState(false);

  const initPad = () => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.getContext('2d')?.scale(dpr, dpr);

    padRef.current?.off();

    const pad = new SignaturePadLib(canvas, {
      minWidth: 0.75,
      maxWidth: 3,
      penColor: '#000000',
    });
    pad.addEventListener('beginStroke', () => setHasContent(true));
    padRef.current = pad;
    setHasContent(false);
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(initPad, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isZoomedOut]);

  useEffect(() => {
    return () => { padRef.current?.off(); };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setHasContent(false);
  };

  const save = () => {
    if (!padRef.current || padRef.current.isEmpty() || !canvasRef.current) return;
    onSave(exportarAssinatura(canvasRef.current));
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn(
        "p-0 overflow-hidden font-sans border-none shadow-2xl transition-all duration-300 rounded-[2.5rem] flex flex-col max-h-[98vh] w-[98vw] sm:w-[95vw]",
        isZoomedOut ? "sm:max-w-[550px]" : "sm:max-w-[900px]"
      )}>
        <DialogHeader className="p-6 sm:p-8 bg-zinc-900 text-white shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-xl">
                 <PenTool className="h-5 w-5 text-primary" />
              </div>
              <div>
                 <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
                   {title}
                 </DialogTitle>
                 <DialogDescription className="text-zinc-400 text-[9px] font-bold uppercase tracking-widest mt-0.5">
                   Escreva ou desenhe notas rápidas de campo.
                 </DialogDescription>
              </div>
            </div>
            <div className="flex gap-2">
                <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsZoomedOut(!isZoomedOut)}
                className="hidden sm:flex h-9 px-4 text-[9px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-white rounded-xl gap-2"
                >
                {isZoomedOut ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                {isZoomedOut ? "Expandir" : "Reduzir"}
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-9 w-9 rounded-xl text-zinc-500 hover:text-white">
                   <X className="h-5 w-5" />
                </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-8 space-y-4 flex-grow flex flex-col bg-zinc-50">
          <div
            ref={containerRef}
            className="border-2 border-dashed border-zinc-200 rounded-3xl bg-white relative overflow-hidden cursor-crosshair shadow-inner flex-grow min-h-[350px] sm:min-h-[400px]"
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full touch-none"
            />
            {!hasContent && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <div className="flex flex-col items-center gap-3">
                   <PenTool className="h-8 w-8 text-zinc-400" />
                   <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">Espaço para Notas Manuais</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-6 sm:p-8 bg-white border-t border-zinc-100 flex flex-col sm:flex-row gap-3">
          <Button type="button" variant="outline" onClick={clear} className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] border-zinc-200 text-zinc-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all">
            <Eraser className="mr-2 h-4 w-4" /> Limpar Tudo
          </Button>
          <div className="flex flex-[2] gap-3">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]">
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={!hasContent} className="flex-[2] h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-600/20 active:scale-95 transition-all">
              <Check className="mr-2 h-5 w-5" /> Salvar Nota
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

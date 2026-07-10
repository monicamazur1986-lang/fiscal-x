"use client"

import React, { useRef, useState, useEffect } from 'react';
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
  const isDrawingRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);
  const [isZoomedOut, setIsZoomedOut] = useState(false);

  const initCanvas = () => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      
      ctx.clearRect(0, 0, rect.width, rect.height);
      setHasContent(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(initCanvas, 150); 
      return () => clearTimeout(timer);
    }
  }, [isOpen, isZoomedOut]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    
    isDrawingRef.current = true;
    setHasContent(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    if (e.cancelable) e.preventDefault();

    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clear = () => {
    initCanvas();
  };

  const save = () => {
    if (!canvasRef.current || !hasContent) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
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
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
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

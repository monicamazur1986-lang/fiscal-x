"use client"

import React, { useEffect, useRef, useState } from "react"
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  CaseUpper,
  CaseLower,
  ALargeSmall,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"

const FONT_SIZE_PRESETS = [
  { label: "Pequena", value: "8pt" },
  { label: "Normal", value: "10pt" },
  { label: "Média", value: "12pt" },
  { label: "Grande", value: "14pt" },
  { label: "Enorme", value: "16pt" },
];

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
  fontSize?: string;
  fontWeight?: string;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  onBlur,
  className, 
  placeholder, 
  minHeight = "1.1em", 
  disabled = false, 
  fontSize = "10.5pt",
  fontWeight = "normal"
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isSizeMenuOpen, setIsSizeMenuOpen] = useState(false);
  // Ao abrir o menu de tamanho, o Radix costuma mover o foco pro próprio menu
  // — guarda a seleção de texto de antes disso pra reaplicar no clique do
  // item, sem depender do navegador preservar sozinho a seleção original.
  const savedRangeRef = useRef<Range | null>(null);
  const captureSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  useEffect(() => {
    if (editorRef.current) {
      const currentContent = editorRef.current.innerHTML;
      // Sanitiza antes de exibir — `value` vem de dados gravados (Firestore),
      // não só do que a própria barra de formatação produz. Colar conteúdo
      // rico de fora (Ctrl+V) ou editar o registro por outro caminho podia
      // introduzir HTML com handlers de evento (ex.: <img onerror=...>) que
      // executam sozinhos ao virar innerHTML — igual ao que já foi corrigido
      // pro Docfacil (ver src/lib/sanitize-html.ts).
      const newValue = sanitizeHtml(value);
      if (currentContent !== newValue) {
        editorRef.current.innerHTML = newValue;
      }
    }
  }, [value]);

  const execCommand = (command: string, val?: string) => {
    if (disabled || !editorRef.current) return;

    editorRef.current.focus();
    document.execCommand(command, false, val);
    onChange(editorRef.current.innerHTML);
  };

  // Transforma o trecho selecionado em maiúsculo/minúsculo. Usa insertText (em
  // vez de mexer direto no Range) pra reaproveitar o próprio undo/seleção do
  // navegador — mesmo mecanismo que os outros comandos desta barra já usam.
  const applyCase = (mode: 'upper' | 'lower') => {
    if (disabled || !editorRef.current) return;
    const sel = window.getSelection();
    const text = sel?.toString();
    if (!text) return;
    editorRef.current.focus();
    document.execCommand('insertText', false, mode === 'upper' ? text.toUpperCase() : text.toLowerCase());
    onChange(editorRef.current.innerHTML);
  };

  // document.execCommand('fontSize') só aceita os níveis legados 1-7 (mapeados
  // pelo navegador pra tamanhos genéricos tipo xx-small/x-large), incompatíveis
  // com os valores em pt usados no resto do documento. Por isso aplica o nível
  // 7 só pra marcar o trecho com <font size="7">, e troca esse marcador por um
  // estilo inline com o pt exato desejado.
  const applyFontSize = (ptSize: string) => {
    if (disabled || !editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    document.execCommand('fontSize', false, '7');
    editorRef.current.querySelectorAll('font[size="7"]').forEach((el) => {
      el.removeAttribute('size');
      (el as HTMLElement).style.fontSize = ptSize;
    });
    onChange(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    if (disabled) return;
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
        if (document.activeElement !== editorRef.current) {
            setIsFocused(false);
            if (onBlur) onBlur();
        }
    }, 200);
  };

  return (
    <div className={cn("relative group border-none leading-tight w-full", className)}>
      {!disabled && (
        <div className={cn(
          "flex flex-wrap items-center gap-1 p-1 border rounded-md bg-zinc-100 no-print transition-all duration-200 shadow-lg z-[100] max-w-[calc(100vw-32px)] overflow-x-auto no-scrollbar",
          (isFocused || isSizeMenuOpen) ? "opacity-100 scale-100 translate-y-0" : "opacity-0 pointer-events-none scale-95 translate-y-2"
        )} style={{ top: '-45px', left: '0', position: 'absolute' }}>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300" 
            onMouseDown={(e) => e.preventDefault()} 
            onClick={() => execCommand('bold')} 
            title="Negrito"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300" 
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCommand('italic')} 
            title="Itálico"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300" 
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCommand('underline')} 
            title="Sublinhado"
          >
            <Underline className="h-4 w-4" />
          </Button>
          <div className="w-px h-4 bg-zinc-300 mx-1" />
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300" 
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCommand('justifyLeft')} 
            title="Alinhar à Esquerda"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300" 
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCommand('justifyCenter')} 
            title="Centralizar"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300" 
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCommand('justifyRight')} 
            title="Alinhar à Direita"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCommand('justifyFull')}
            title="Justificado"
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
          <div className="w-px h-4 bg-zinc-300 mx-1" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyCase('upper')}
            title="Maiúsculas"
          >
            <CaseUpper className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyCase('lower')}
            title="Minúsculas"
          >
            <CaseLower className="h-4 w-4" />
          </Button>
          <DropdownMenu onOpenChange={setIsSizeMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-black hover:bg-zinc-200 active:bg-zinc-300"
                onMouseDown={(e) => { e.preventDefault(); captureSelection(); }}
                title="Tamanho da Letra"
              >
                <ALargeSmall className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {FONT_SIZE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFontSize(preset.value)}
                >
                  {preset.label} ({preset.value})
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onFocus={() => !disabled && setIsFocused(true)}
        onBlur={handleBlur}
        className={cn(
          "data-field-input outline-none overflow-y-visible whitespace-pre-wrap break-words text-black font-serif",
          !value && !disabled && "before:content-[attr(data-placeholder)] before:text-zinc-300 before:pointer-events-none"
        )}
        style={{ 
          minHeight, 
          color: '#000000',
          fontSize, 
          lineHeight: '1.1',
          textAlign: 'justify',
          width: '100%',
          display: 'block',
          fontWeight,
          fontFamily: "'Times New Roman', Times, serif",
          textTransform: 'none',
          padding: '0'
        }}
        data-placeholder={disabled ? "" : placeholder}
      />
    </div>
  );
}
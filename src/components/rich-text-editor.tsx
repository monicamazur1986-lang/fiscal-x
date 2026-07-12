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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"

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

  useEffect(() => {
    if (editorRef.current) {
      const currentContent = editorRef.current.innerHTML;
      const newValue = value || "";
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
          isFocused ? "opacity-100 scale-100 translate-y-0" : "opacity-0 pointer-events-none scale-95 translate-y-2"
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
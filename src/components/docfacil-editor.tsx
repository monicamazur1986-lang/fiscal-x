"use client"

import dynamic from "next/dynamic"
import lang from "suneditor/src/lang"
import "suneditor/dist/css/suneditor.min.css"
import { OfficialLetterhead } from "./official-letterhead"
import { sanitizeHtml } from "@/lib/sanitize-html"

// SunEditor acessa `document`/`window` já na primeira renderização e não se
// protege contra SSR — mesmo dentro de um arquivo "use client", o Next ainda
// faz uma passada de servidor nele, então precisa ser importado só no
// navegador (ssr: false) pra não quebrar o build/carregamento da página.
const SunEditor = dynamic(() => import("suneditor-react"), { ssr: false })

// Conjunto de botões equivalente ao usado nos editores de "modelo de
// documento" de referência: fonte/tamanho, formatação básica, alinhamento,
// listas, cor/marca-texto, link/imagem, tabela, código e tela cheia.
const BUTTON_LIST = [
  ["undo", "redo"],
  ["fontSize"],
  ["font"],
  ["bold", "italic", "strike", "underline"],
  ["align"],
  ["list"],
  ["formatBlock"],
  ["fontColor", "hiliteColor"],
  ["link", "image"],
  ["removeFormat"],
  ["codeView"],
  ["blockquote"],
  ["table"],
  ["fullScreen"],
  ["print"],
];

interface DocfacilEditorProps {
  defaultValue?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disable?: boolean;
  /** Mostra o timbre oficial acima da área de texto, como pré-visualização
   * de como o documento final vai ficar. Padrão: true. */
  showLetterhead?: boolean;
  /** Empurra esse HTML pro editor sempre que mudar (ex: depois de uma
   * revisão por IA, ou ao retomar um rascunho). O SunEditor é "não
   * controlado" — só lê `defaultValue` na montagem — então uma troca de
   * conteúdo feita fora da digitação do próprio usuário (autofocus)
   * precisa passar por aqui pra realmente aparecer na tela. */
  forceContent?: string;
}

/** Editor de texto rico usado nos modelos e documentos do DOCFACIL — envolve
 * o SunEditor (MIT, github.com/JiHong88/suneditor) num "papel" A4 com
 * margens reais e timbre, para a edição já parecer com a página final
 * (como num editor de texto tipo Word), em vez de uma caixa de texto solta. */
export function DocfacilEditor({ defaultValue, onChange, placeholder, disable, showLetterhead = true, forceContent }: DocfacilEditorProps) {
  return (
    <div className="bg-zinc-100 p-4 sm:p-10 overflow-x-auto">
      <div className="docfacil-paper mx-auto bg-white border border-zinc-200 shadow-sm" style={{ width: "210mm", minWidth: "210mm" }}>
        {showLetterhead && (
          <div className="px-[20mm] pt-[15mm] pb-4">
            <OfficialLetterhead />
          </div>
        )}
        <SunEditor
          defaultValue={sanitizeHtml(defaultValue)}
          setContents={forceContent !== undefined ? sanitizeHtml(forceContent) : undefined}
          onChange={onChange}
          disable={disable}
          lang={lang.pt_br}
          placeholder={placeholder || "Redija o conteúdo do documento..."}
          setOptions={{
            buttonList: BUTTON_LIST,
            minHeight: "500px",
            // O "padding" aqui vira a margem real da página — aplicado
            // dentro da própria área editável (não no wrapper), então fica
            // só em volta do texto, com a barra de ferramentas ocupando a
            // largura inteira da folha, como num editor de documento.
            defaultStyle: "font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; padding: 10mm 20mm 20mm;",
          }}
        />
      </div>
    </div>
  );
}

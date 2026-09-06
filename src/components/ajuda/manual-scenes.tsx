"use client"

import type { ReactNode } from "react"

// Diagramas esquemáticos usados no Manual de Uso (Central de Ajuda) — não são
// prints reais da tela (o conteúdo muda com frequência e evoluiria dessincronizado
// das imagens), mas miniaturas que reproduzem o PADRÃO visual de cada tipo de tela
// do sistema (formulário, lista, checklist, cartões, busca, timbre), com um
// destaque animado mostrando onde o fiscal deve olhar/tocar em cada passo.

function Destaque({ ativo, children, className = "" }: { ativo?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {children}
      {ativo && (
        <span className="pointer-events-none absolute -inset-1 rounded-lg ring-2 ring-[#0E4A44] animate-pulse" />
      )}
    </div>
  );
}

const FRAME = "mx-auto w-full max-w-[280px] rounded-xl border border-[#E4DFD1] bg-white shadow-[0_1px_2px_rgba(38,36,32,0.06),0_8px_20px_-10px_rgba(38,36,32,0.15)] overflow-hidden";

/** Barra de topo genérica (usada como cabeçalho de todas as cenas). */
function BarraTopo({ titulo }: { titulo: string }) {
  return (
    <div className="h-7 bg-[#0E4A44] flex items-center px-2.5">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/90 truncate">{titulo}</span>
    </div>
  );
}

/** Grade de cartões coloridos — telas de escolha (menu, tipo de documento, base de dados). */
export function CenaCartoes({ titulo, itens, destaqueIndex }: { titulo: string; itens: { cor: string }[]; destaqueIndex?: number }) {
  return (
    <div className={FRAME}>
      <BarraTopo titulo={titulo} />
      <div className="p-2.5 grid grid-cols-2 gap-1.5">
        {itens.map((item, i) => (
          <Destaque key={i} ativo={i === destaqueIndex}>
            <div className="h-10 rounded-md flex items-center gap-1.5 px-2" style={{ backgroundColor: `${item.cor}1A` }}>
              <div className="h-4 w-4 rounded shrink-0" style={{ backgroundColor: item.cor }} />
              <div className="flex-1 space-y-1">
                <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: `${item.cor}55` }} />
                <div className="h-1.5 rounded-full w-2/3" style={{ backgroundColor: `${item.cor}30` }} />
              </div>
            </div>
          </Destaque>
        ))}
      </div>
    </div>
  );
}

/** Formulário genérico — linhas de campo + botão principal no rodapé. */
export function CenaFormulario({ titulo, campos, destaqueIndex, botaoLabel, destaqueBotao }: { titulo: string; campos: number; destaqueIndex?: number; botaoLabel: string; destaqueBotao?: boolean }) {
  return (
    <div className={FRAME}>
      <BarraTopo titulo={titulo} />
      <div className="p-3 space-y-2">
        {Array.from({ length: campos }).map((_, i) => (
          <Destaque key={i} ativo={i === destaqueIndex}>
            <div className="space-y-1">
              <div className="h-1.5 w-1/3 rounded-full bg-[#E4DFD1]" />
              <div className="h-6 rounded-md border border-[#E4DFD1] bg-[#FCFAF5]" />
            </div>
          </Destaque>
        ))}
        <Destaque ativo={destaqueBotao} className="pt-1">
          <div className="h-7 rounded-md bg-[#0E4A44] flex items-center justify-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-white">{botaoLabel}</span>
          </div>
        </Destaque>
      </div>
    </div>
  );
}

/** Lista vertical de itens (ícone + duas linhas de texto + seta). */
export function CenaLista({ titulo, linhas, destaqueIndex }: { titulo: string; linhas: number; destaqueIndex?: number }) {
  return (
    <div className={FRAME}>
      <BarraTopo titulo={titulo} />
      <div className="divide-y divide-[#F1EEE4]">
        {Array.from({ length: linhas }).map((_, i) => (
          <Destaque key={i} ativo={i === destaqueIndex}>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="h-6 w-6 rounded-full bg-[#F5F2EA] shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-1.5 w-3/4 rounded-full bg-[#D8D2C2]" />
                <div className="h-1.5 w-1/2 rounded-full bg-[#EDE9DC]" />
              </div>
              <div className="h-2 w-2 border-t border-r border-[#C4BEAC] rotate-45 shrink-0" />
            </div>
          </Destaque>
        ))}
      </div>
    </div>
  );
}

/** Checklist estilo Roteiro — cabeçalho de seção + itens com pílulas Sim/Não/NA. */
export function CenaChecklist({ destaque }: { destaque: "secao" | "pilula" | "campo" }) {
  return (
    <div className={FRAME}>
      <BarraTopo titulo="Roteiro de Inspeção" />
      <div className="p-2.5 space-y-2">
        <Destaque ativo={destaque === "secao"}>
          <div className="flex items-center justify-between rounded-md bg-[#F5F2EA] px-2 py-1.5">
            <div className="h-1.5 w-24 rounded-full bg-[#6B4C80]/50" />
            <span className="text-[8px] font-bold text-[#9C7A3C]">6/15</span>
          </div>
        </Destaque>
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-2 px-1">
            <div className="h-1.5 flex-1 rounded-full bg-[#EDE9DC]" />
            <Destaque ativo={destaque === "pilula" && i === 0} className="shrink-0">
              <div className="flex gap-0.5">
                <div className="h-4 w-6 rounded bg-[#1F7A5C]/20" />
                <div className="h-4 w-6 rounded bg-[#A15437]/15" />
                <div className="h-4 w-6 rounded bg-[#E4DFD1]" />
              </div>
            </Destaque>
          </div>
        ))}
        <Destaque ativo={destaque === "campo"}>
          <div className="h-9 rounded-md border border-dashed border-[#E4DFD1] flex items-center justify-center">
            <span className="text-[8px] font-bold uppercase text-[#9C7A3C]">+ Adicionar Não Conformidade</span>
          </div>
        </Destaque>
      </div>
    </div>
  );
}

/** Busca — campo de busca + chips de filtro + resultados. */
export function CenaBusca({ titulo, destaque }: { titulo: string; destaque: "campo" | "filtro" | "resultado" }) {
  return (
    <div className={FRAME}>
      <BarraTopo titulo={titulo} />
      <div className="p-2.5 space-y-2">
        <Destaque ativo={destaque === "campo"}>
          <div className="h-7 rounded-md border border-[#E4DFD1] bg-[#FCFAF5] flex items-center px-2 gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full border border-[#A39D8C]" />
            <div className="h-1.5 w-16 rounded-full bg-[#E4DFD1]" />
          </div>
        </Destaque>
        <Destaque ativo={destaque === "filtro"}>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 w-12 rounded-full bg-[#F5F2EA] border border-[#E4DFD1]" />
            ))}
          </div>
        </Destaque>
        <div className="space-y-1.5 pt-1">
          {[0, 1].map((i) => (
            <Destaque key={i} ativo={destaque === "resultado" && i === 0}>
              <div className="h-8 rounded-md border border-[#F1EEE4] flex items-center px-2 gap-2">
                <div className="flex-1 space-y-1">
                  <div className="h-1.5 w-3/4 rounded-full bg-[#D8D2C2]" />
                  <div className="h-1.5 w-1/2 rounded-full bg-[#EDE9DC]" />
                </div>
                <div className="h-3 w-8 rounded-full bg-[#1F7A5C]/20" />
              </div>
            </Destaque>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Timbre/cabeçalho oficial do Docfacil — layout de 3 colunas (brasão | endereço | vazio). */
export function CenaTimbre({ destaque }: { destaque: "brasao" | "endereco" | "corpo" }) {
  return (
    <div className={FRAME}>
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-[36px_1fr_36px] items-center gap-2 pb-2 border-b-2 border-[#0E4A44]">
          <Destaque ativo={destaque === "brasao"}>
            <div className="h-9 w-9 rounded-full bg-[#F5F2EA] border border-[#E4DFD1]" />
          </Destaque>
          <Destaque ativo={destaque === "endereco"}>
            <div className="space-y-1 text-center">
              <div className="h-1.5 w-full rounded-full bg-[#524E45]/40 mx-auto" />
              <div className="h-1.5 w-4/5 rounded-full bg-[#524E45]/25 mx-auto" />
            </div>
          </Destaque>
          <div />
        </div>
        <Destaque ativo={destaque === "corpo"}>
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-[#E4DFD1]" />
            <div className="h-1.5 w-full rounded-full bg-[#E4DFD1]" />
            <div className="h-1.5 w-2/3 rounded-full bg-[#E4DFD1]" />
          </div>
        </Destaque>
      </div>
    </div>
  );
}

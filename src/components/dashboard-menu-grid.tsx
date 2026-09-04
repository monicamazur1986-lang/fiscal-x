'use client';

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Star, Pencil, Check } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { darkenHex, type DashboardMenuItem } from "@/lib/dashboard-menu-items";

const PAGE_SIZE = 6;

function MenuTile({
  item,
  editing,
  isFavorito,
  onToggleFavorito,
}: {
  item: DashboardMenuItem;
  editing: boolean;
  isFavorito: boolean;
  onToggleFavorito: (href: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.href,
    disabled: !editing,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: `linear-gradient(135deg, ${item.color} 0%, ${darkenHex(item.color, 28)} 100%)`,
  };

  const baseClass = "group relative flex min-h-[124px] flex-col items-center justify-center gap-2 rounded-lg p-4 text-center shadow-[0_10px_24px_-12px_rgba(38,36,32,0.4)] transition-all duration-200";

  const inner = (
    <>
      {editing && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorito(item.href);
          }}
          aria-label={isFavorito ? "Remover dos favoritos" : "Marcar como favorito"}
          className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-white shadow-md border border-[#E4DFD1] flex items-center justify-center z-10"
        >
          <Star className={cn("h-3.5 w-3.5", isFavorito ? "fill-amber-400 text-amber-400" : "text-[#C9C2AC]")} />
        </button>
      )}
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
        <item.icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="font-serif text-[15px] font-semibold text-white leading-tight">{item.label}</p>
        <p
          className={cn(
            "text-[10.5px] text-white/75 mt-1 leading-snug transition-opacity duration-200",
            !editing && "opacity-0 group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100"
          )}
        >
          {item.description}
        </p>
      </div>
    </>
  );

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(baseClass, "cursor-grab active:cursor-grabbing ring-2 ring-white/50 select-none touch-none")}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      style={style}
      className={cn(baseClass, "hover:-translate-y-1 hover:shadow-[0_16px_32px_-14px_rgba(38,36,32,0.45)] active:scale-[0.98] active:duration-75")}
    >
      {inner}
    </Link>
  );
}

/**
 * Menu inicial em páginas deslizáveis (como a tela inicial de um celular),
 * com favoritos fixados sempre na página 1 e reordenação por arrastar
 * (dentro de cada página) no modo "Organizar". A ordem/favoritos ficam
 * salvos no perfil do usuário (Firestore), então valem em qualquer aparelho
 * que ele logar — ver menuPreferences em src/hooks/use-auth.tsx.
 *
 * Arrastar entre páginas diferentes não é suportado (só dentro da mesma
 * página) — pra mover um item pra página 1, o jeito é marcá-lo como
 * favorito, que já o traz pra frente automaticamente.
 */
export function DashboardMenuGrid({ items }: { items: DashboardMenuItem[] }) {
  const { profile, updateProfileData } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const savedOrder = profile?.menuPreferences?.order || [];
  const favoritosSet = useMemo(
    () => new Set(profile?.menuPreferences?.favoritos || []),
    [profile?.menuPreferences?.favoritos]
  );

  // Sequência visual: favoritos primeiro (na ordem salva entre eles), resto
  // depois — sempre reaplicada a partir do que está salvo, então nunca fica
  // inconsistente mesmo que a ordem salva não esteja mais agrupada assim.
  // Itens que ainda não constam na ordem salva (ex.: um menu recém-lançado)
  // entram no fim do seu grupo, na ordem em que aparecem no catálogo.
  const orderedItems = useMemo(() => {
    const byHref = new Map(items.map((i) => [i.href, i] as const));
    const known = new Set(savedOrder);
    const savedValid = savedOrder.filter((h) => byHref.has(h));
    const novos = items.map((i) => i.href).filter((h) => !known.has(h));
    const sequenciaCompleta = [...savedValid, ...novos];
    const favs = sequenciaCompleta.filter((h) => favoritosSet.has(h));
    const resto = sequenciaCompleta.filter((h) => !favoritosSet.has(h));
    return [...favs, ...resto].map((h) => byHref.get(h)!);
  }, [items, savedOrder, favoritosSet]);

  const pages = useMemo(() => {
    const out: DashboardMenuItem[][] = [];
    for (let i = 0; i < orderedItems.length; i += PAGE_SIZE) out.push(orderedItems.slice(i, i + PAGE_SIZE));
    return out.length ? out : [[]];
  }, [orderedItems]);

  const persist = useCallback(
    (order: string[], favoritos: string[]) => {
      updateProfileData({ menuPreferences: { order, favoritos } }).catch(() => {
        toast({ variant: "destructive", title: "Não foi possível salvar a organização do menu" });
      });
    },
    [updateProfileData, toast]
  );

  const toggleFavorito = useCallback(
    (href: string) => {
      const next = new Set(favoritosSet);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      persist(orderedItems.map((i) => i.href), Array.from(next));
    },
    [favoritosSet, orderedItems, persist]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragEnd = useCallback(
    (pageIndex: number) => (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const pageHrefs = pages[pageIndex].map((i) => i.href);
      const oldIdx = pageHrefs.indexOf(String(active.id));
      const newIdx = pageHrefs.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(pageHrefs, oldIdx, newIdx);
      const fullHrefs = orderedItems.map((i) => i.href);
      fullHrefs.splice(pageIndex * PAGE_SIZE, reordered.length, ...reordered);
      persist(fullHrefs, Array.from(favoritosSet));
    },
    [pages, orderedItems, favoritosSet, persist]
  );

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActivePage(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goToPage = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9C7A3C]">Menu</h2>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="flex items-center gap-1.5 text-xs font-medium text-[#0E4A44] hover:text-[#0B3A35] transition-colors"
        >
          {editing ? (
            <>
              <Check className="h-3.5 w-3.5" /> Concluir
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" /> Organizar
            </>
          )}
        </button>
      </div>

      {editing && (
        <p className="px-1 text-[11px] text-[#A39D8C]">
          Arraste para reordenar dentro da página. Toque na estrela para fixar um favorito na página 1.
        </p>
      )}

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
      >
        {pages.map((pageItems, pageIndex) => (
          <div key={pageIndex} className="w-full shrink-0 snap-center">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(pageIndex)}>
              <SortableContext items={pageItems.map((i) => i.href)} strategy={rectSortingStrategy}>
                <nav className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-1">
                  {pageItems.map((item) => (
                    <MenuTile
                      key={item.href}
                      item={item}
                      editing={editing}
                      isFavorito={favoritosSet.has(item.href)}
                      onToggleFavorito={toggleFavorito}
                    />
                  ))}
                </nav>
              </SortableContext>
            </DndContext>
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {pages.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goToPage(idx)}
              aria-label={`Página ${idx + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === activePage ? "w-5 bg-[#0E4A44]" : "w-1.5 bg-[#D8D2C0]"
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

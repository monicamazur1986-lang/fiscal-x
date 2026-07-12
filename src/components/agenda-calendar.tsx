"use client"

import React from "react"
import { Calendar, dateFnsLocalizer, Views, type SlotInfo, type ToolbarProps, type View } from "react-big-calendar"
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Inspecao } from "@/lib/types"

import "react-big-calendar/lib/css/react-big-calendar.css"
import "react-big-calendar/lib/addons/dragAndDrop/styles.css"

const locales = { 'pt-BR': ptBR }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

export interface AgendaEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Inspecao;
}

const STATUS_COLORS: Record<Inspecao['status'], string> = {
  pendente: '#10b981',
  prazo: '#f59e0b',
  concluido: '#06b6d4',
  arquivado: '#94a3b8',
  cancelada: '#f43f5e',
  rascunho: '#94a3b8',
};

const VIEW_LABELS: Record<string, string> = {
  month: 'Mês',
  week: 'Semana',
  day: 'Dia',
  agenda: 'Agenda',
};

function CustomToolbar({ label, view, views, onNavigate, onView }: ToolbarProps<AgendaEvent>) {
  const viewList = Array.isArray(views) ? views : Object.keys(views);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 no-print">
      <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200">
        <button type="button" onClick={() => onNavigate('PREV')} className="h-9 w-9 rounded-xl hover:bg-white flex items-center justify-center text-slate-400 transition-all">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[10px] font-black uppercase text-slate-900 px-4 min-w-[140px] text-center tracking-widest">{label}</span>
        <button type="button" onClick={() => onNavigate('NEXT')} className="h-9 w-9 rounded-xl hover:bg-white flex items-center justify-center text-slate-400 transition-all">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onNavigate('TODAY')} className="h-9 px-4 rounded-xl border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" /> Hoje
        </button>
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-200">
          {viewList.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView(v as View)}
              className={cn(
                "h-9 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                view === v ? "bg-primary text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              {VIEW_LABELS[v] || v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const DnDCalendar = withDragAndDrop<AgendaEvent, object>(Calendar);

interface AgendaCalendarProps {
  events: AgendaEvent[];
  date: Date;
  onNavigateDate: (date: Date) => void;
  onSelectSlot: (slotInfo: SlotInfo) => void;
  onSelectEvent: (event: AgendaEvent) => void;
  onEventDrop: (args: EventInteractionArgs<AgendaEvent>) => void;
}

export function AgendaCalendar({ events, date, onNavigateDate, onSelectSlot, onSelectEvent, onEventDrop }: AgendaCalendarProps) {
  return (
    <div className="agenda-rbc-wrapper h-full">
      <DnDCalendar
        localizer={localizer}
        culture="pt-BR"
        events={events}
        date={date}
        onNavigate={onNavigateDate}
        defaultView={Views.MONTH}
        views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
        selectable
        popup
        onSelectSlot={onSelectSlot}
        onSelectEvent={onSelectEvent}
        onEventDrop={onEventDrop}
        style={{ height: '100%' }}
        components={{ toolbar: CustomToolbar }}
        eventPropGetter={(event) => ({
          style: {
            backgroundColor: STATUS_COLORS[event.resource.status] || STATUS_COLORS.pendente,
            border: 'none',
          },
        })}
        messages={{
          noEventsInRange: 'Sem registros neste período.',
          showMore: (total: number) => `+${total} mais`,
        }}
      />
    </div>
  );
}

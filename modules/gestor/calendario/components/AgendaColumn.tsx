import React from 'react';
import { toDateKey } from '../calendario.official';
import type { CalendarEvent, EventType } from '../calendario.types';

type GetTypeInfo = (typeId: string) => EventType;

const formatLongDate = (date: Date) => date.toLocaleDateString('pt-BR', {
  day: '2-digit',
  month: 'long',
}).toUpperCase();

const formatShortDate = (date: string) => new Date(`${date}T12:00:00`)
  .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  .replace('.', '')
  .toUpperCase();

interface AgendaColumnProps {
  eyebrow: string;
  title: string;
  icon: React.ElementType;
  events: CalendarEvent[];
  focusedDate: Date;
  getTypeInfo: GetTypeInfo;
  emptyCurrent: string;
  emptyFuture: string;
  onOpenDate: (date: Date) => void;
}

const AgendaEventCard: React.FC<{
  event: CalendarEvent;
  getTypeInfo: GetTypeInfo;
  onOpenDate: (date: Date) => void;
}> = ({ event, getTypeInfo, onOpenDate }) => {
  const type = getTypeInfo(event.typeId);
  return (
    <button
      type="button"
      onClick={() => onOpenDate(new Date(`${event.date}T12:00:00`))}
      className="calendario-agenda-event group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3 pl-5 text-left transition hover:border-blue-200 hover:shadow-sm"
    >
      <span className="absolute bottom-3 left-2.5 top-3 w-1 rounded-full" style={{ backgroundColor: type.color }} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <span className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase" style={{ color: type.color, backgroundColor: `${type.color}12` }}>{type.label}</span>
          {event.turno ? <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-600">{event.turno}</span> : null}
        </div>
        <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase text-slate-600">{formatShortDate(event.date)}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-[#001a33]" title={event.title}>{event.title}</p>
      {event.description ? <p className="mt-1 line-clamp-2 text-[11px] font-normal leading-relaxed text-slate-500">{event.description}</p> : null}
      {event.turmaName || event.professorName ? (
        <p className="mt-2 truncate text-[11px] font-medium text-slate-600">
          {[event.turmaName, event.professorName].filter(Boolean).join(' • ')}
        </p>
      ) : null}
    </button>
  );
};

const AgendaColumn: React.FC<AgendaColumnProps> = ({
  eyebrow,
  title,
  icon: Icon,
  events,
  focusedDate,
  getTypeInfo,
  emptyCurrent,
  emptyFuture,
  onOpenDate,
}) => {
  const focusedKey = toDateKey(focusedDate);
  const currentEvents = events.filter(event => event.date === focusedKey);
  const futureEvents = events.filter(event => event.date > focusedKey).slice(0, 6);

  return (
    <section className="calendario-agenda-column flex min-h-[470px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="border-b border-slate-100 pb-3">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon size={14} /> {eyebrow}</p>
        <h3 className="mt-3 text-sm font-semibold text-slate-700">{title}</h3>
      </div>

      <div className="py-4">
        <p className="mb-3 text-xs font-semibold uppercase text-slate-600">{formatLongDate(focusedDate)}</p>
        {currentEvents.length === 0 ? (
          <div className="flex min-h-20 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-xs font-normal text-slate-500">{emptyCurrent}</div>
        ) : (
          <div className="space-y-2">{currentEvents.map(event => <AgendaEventCard key={event.id} event={event} getTypeInfo={getTypeInfo} onOpenDate={onOpenDate} />)}</div>
        )}
      </div>

      <div className="min-h-0 flex-1 border-t border-slate-100 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase text-slate-600">Próximos compromissos</p>
        {futureEvents.length === 0 ? (
          <div className="flex min-h-20 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-xs font-normal text-slate-500">{emptyFuture}</div>
        ) : (
          <div className="custom-scrollbar max-h-[315px] space-y-2 overflow-y-auto pr-1">
            {futureEvents.map(event => <AgendaEventCard key={event.id} event={event} getTypeInfo={getTypeInfo} onOpenDate={onOpenDate} />)}
          </div>
        )}
      </div>
    </section>
  );
};

export default AgendaColumn;

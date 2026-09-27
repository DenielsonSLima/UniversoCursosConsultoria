import type React from 'react';
import { CalendarDays, ChevronRight, Landmark } from 'lucide-react';
import type { CalendarEvent, EventType } from '../../calendario/calendario.types';
import {
  formatShortDate,
  getEventTone,
  getEventType,
} from '../dashboard.presentation';

interface DashboardOfficialCalendarProps {
  events: CalendarEvent[];
  eventTypes: EventType[];
  loading: boolean;
  canUseCalendar: boolean;
  onOpenCalendar: () => void;
}

const DashboardOfficialCalendar: React.FC<DashboardOfficialCalendarProps> = ({
  events,
  eventTypes,
  loading,
  canUseCalendar,
  onOpenCalendar,
}) => (
  <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Landmark size={18} />
        </span>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-600">Calendário oficial</p>
          <h2 className="mt-1 text-base font-bold text-[#001a33]">Próximas datas institucionais</h2>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Separado dos vencimentos financeiros.</p>
        </div>
      </div>
      {canUseCalendar ? (
        <button type="button" onClick={onOpenCalendar} className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 hover:text-blue-800">
          Ver calendário <ChevronRight size={13} />
        </button>
      ) : null}
    </div>

    <div className="mt-4">
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(item => <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-50" />)}
        </div>
      ) : events.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-3">
          {events.slice(0, 3).map(event => (
            <button
              key={event.id}
              type="button"
              onClick={onOpenCalendar}
              disabled={!canUseCalendar}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-left transition enabled:hover:border-blue-200 enabled:hover:bg-white"
            >
              <span className={`h-9 w-1 shrink-0 rounded-full ${getEventTone(event.typeId)}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-[#001a33]">{event.title}</span>
                <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400">
                  {formatShortDate(event.date)} · {getEventType(eventTypes, event.typeId)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-slate-500">
          <CalendarDays size={17} className="shrink-0 text-slate-400" />
          <p className="text-xs font-medium">Nenhuma data oficial próxima foi cadastrada.</p>
        </div>
      )}
    </div>
  </section>
);

export default DashboardOfficialCalendar;

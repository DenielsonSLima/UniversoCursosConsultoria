import type React from 'react';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Landmark,
  Plus,
} from 'lucide-react';
import type { CalendarEvent, EventType } from '../../calendario/calendario.types';
import {
  addDays,
  formatShortDate,
  getEventTone,
  getEventType,
  type DashboardDaySummary,
} from '../dashboard.presentation';
import { toDateKey } from '../../calendario/calendario.official';

interface DashboardAgendaSectionProps {
  weekStart: Date;
  weekEnd: Date;
  weekDays: DashboardDaySummary[];
  weekEvents: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  nextImportantDate?: CalendarEvent;
  eventTypes: EventType[];
  loading: boolean;
  canUseCalendar: boolean;
  onOpenCalendar: () => void;
}

const DashboardAgendaSection: React.FC<DashboardAgendaSectionProps> = ({
  weekStart,
  weekEnd,
  weekDays,
  weekEvents,
  upcomingEvents,
  nextImportantDate,
  eventTypes,
  loading,
  canUseCalendar,
  onOpenCalendar,
}) => (
  <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.85fr)]">
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Planejamento</p>
          <h2 className="mt-1 text-lg font-bold">Agenda da semana</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {formatShortDate(toDateKey(weekStart))} — {formatShortDate(toDateKey(addDays(weekEnd, -1)))}
          </p>
        </div>
        {canUseCalendar && (
          <button type="button" onClick={onOpenCalendar} className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800">
            Ver calendário completo <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekDays.map((day) => (
            <button
              key={day.dateKey}
              type="button"
              onClick={onOpenCalendar}
              disabled={!canUseCalendar}
              className={`relative flex min-h-20 flex-col items-center justify-center rounded-2xl border transition-all ${
                day.isToday
                  ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-900/15'
                  : day.events.length > 0
                    ? 'border-blue-100 bg-blue-50/60 text-[#001a33] hover:border-blue-300'
                    : 'border-slate-100 bg-slate-50/70 text-slate-500'
              }`}
            >
              <span className={`text-[9px] font-bold uppercase tracking-wider ${day.isToday ? 'text-blue-100' : 'text-slate-400'}`}>
                {day.label}
              </span>
              <span className="mt-1 text-lg font-bold leading-none">{day.dayNumber}</span>
              <span className="mt-2 flex h-1.5 items-center gap-1">
                {day.events.slice(0, 3).map((event) => (
                  <span key={event.id} className={`h-1.5 w-1.5 rounded-full ${day.isToday ? 'bg-white' : getEventTone(event.typeId)}`} />
                ))}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-slate-200" />
                    <div className="h-2 w-1/2 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : weekEvents.length > 0 ? (
            <div className="space-y-2">
              {weekEvents.slice(0, 5).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={onOpenCalendar}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-slate-100 hover:bg-slate-50"
                >
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100">
                    <span className="text-[9px] font-bold uppercase text-slate-400">
                      {new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </span>
                    <span className="text-sm font-bold text-[#001a33]">{event.date.slice(-2)}</span>
                  </span>
                  <span className={`h-8 w-1 shrink-0 rounded-full ${getEventTone(event.typeId)}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#001a33]">{event.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
                      {getEventType(eventTypes, event.typeId)}
                      {event.turmaName ? ` • ${event.turmaName}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={15} className="text-slate-300 group-hover:text-blue-600" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={20} />
              </span>
              <h3 className="mt-3 text-sm font-bold">Semana sem compromissos registrados</h3>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                A agenda está livre. Você pode adicionar aulas, reuniões ou eventos no calendário.
              </p>
              {canUseCalendar && (
                <button type="button" onClick={onOpenCalendar} className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-800">
                  <Plus size={13} /> Adicionar evento
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    <div className="space-y-6">
      <div className="rounded-[1.75rem] bg-[#001a33] p-5 text-white shadow-xl shadow-blue-950/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-300">Próxima data importante</p>
            <h2 className="mt-1 text-base font-bold">{nextImportantDate?.title || 'Nenhuma data próxima'}</h2>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-300">
            <Landmark size={18} />
          </span>
        </div>
        {nextImportantDate ? (
          <>
            <p className="mt-4 text-2xl font-bold tracking-tight">{formatShortDate(nextImportantDate.date)}</p>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-blue-100/65">
              {nextImportantDate.description || getEventType(eventTypes, nextImportantDate.typeId)}
            </p>
          </>
        ) : (
          <p className="mt-4 text-xs font-medium text-blue-100/65">Nenhuma data importante foi retornada pela agenda.</p>
        )}
      </div>

      <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-600">Próximos dias</p>
            <h2 className="mt-1 text-base font-bold">Próximos compromissos</h2>
          </div>
          <CircleAlert size={18} className="text-slate-300" />
        </div>
        <div className="mt-4 space-y-1">
          {upcomingEvents.length > 0 ? upcomingEvents.map((event) => (
            <button key={event.id} type="button" onClick={onOpenCalendar} className="group flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getEventTone(event.typeId)}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-[#001a33]">{event.title}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                  {formatShortDate(event.date)} • {getEventType(eventTypes, event.typeId)}
                </span>
              </span>
            </button>
          )) : (
            <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-xs font-medium text-slate-500">
              Nenhum compromisso futuro cadastrado.
            </p>
          )}
        </div>
      </div>
    </div>
  </section>
);

export default DashboardAgendaSection;

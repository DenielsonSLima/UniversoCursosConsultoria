import { useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  GraduationCap,
} from 'lucide-react';

import type { CalendarEvent, EventType } from '../../../../gestor/calendario/calendario.types';

type StudentCalendarTurma = {
  id: string;
  nome: string;
};

type AlunoMobileAgendaProps = {
  currentMonthIndex: number;
  currentYear: number;
  eventTypes: EventType[];
  events: CalendarEvent[];
  eventsByDate: Map<string, CalendarEvent[]>;
  focusedDate: Date;
  isLoading: boolean;
  selectedCategoryId: string;
  selectedTurmaId: string;
  today: Date;
  turmas: StudentCalendarTurma[];
  getTypeInfo: (typeId: string) => EventType;
  onCategoryChange: (categoryId: string) => void;
  onChangeMonth: (direction: -1 | 1) => void;
  onOpenDate: (date: Date) => void;
  onSelectDate: (date: Date) => void;
  onTurmaChange: (turmaId: string) => void;
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const toDateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const buildMonthGrid = (year: number, monthIndex: number) => {
  const firstDay = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return { date, isCurrentMonth: date.getMonth() === monthIndex };
  });
};

const formatEventDate = (dateKey: string) => new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR', {
  day: '2-digit',
  month: 'short',
  weekday: 'short',
}).replaceAll('.', '');

const AlunoMobileAgenda = ({
  currentMonthIndex,
  currentYear,
  eventTypes,
  events,
  eventsByDate,
  focusedDate,
  isLoading,
  selectedCategoryId,
  selectedTurmaId,
  today,
  turmas,
  getTypeInfo,
  onCategoryChange,
  onChangeMonth,
  onOpenDate,
  onSelectDate,
  onTurmaChange,
}: AlunoMobileAgendaProps) => {
  const cells = useMemo(
    () => buildMonthGrid(currentYear, currentMonthIndex),
    [currentMonthIndex, currentYear],
  );
  const todayKey = toDateKey(today);
  const focusedDateKey = toDateKey(focusedDate);
  const dayEvents = eventsByDate.get(focusedDateKey) || [];
  const nextEvent = events.find((event) => event.date >= todayKey);
  const activeFilters = Number(Boolean(selectedTurmaId)) + Number(Boolean(selectedCategoryId));

  return (
    <div className="space-y-4 md:hidden">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#001a33] p-5 text-white shadow-[0_18px_44px_-28px_rgba(0,26,51,0.85)]">
        <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full border-[24px] border-blue-500/15" />
        <div className="relative">
          <div className="flex items-center gap-2 text-blue-200">
            <CalendarDays size={16} aria-hidden="true" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Próximo compromisso</p>
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-3" aria-live="polite">
              <div className="h-5 w-3/4 animate-pulse rounded-lg bg-white/15 motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none" />
            </div>
          ) : nextEvent ? (
            <button
              type="button"
              onClick={() => onOpenDate(new Date(`${nextEvent.date}T12:00:00`))}
              className="mt-4 flex min-h-20 w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left active:bg-white/10"
            >
              <span
                className="flex h-12 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: getTypeInfo(nextEvent.typeId).color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-[0.15em] text-blue-200">
                  {formatEventDate(nextEvent.date)}
                </span>
                <span className="mt-1 line-clamp-2 block text-sm font-black leading-snug text-white">{nextEvent.title}</span>
                <span className="mt-1 block truncate text-[11px] font-medium text-slate-300">
                  {nextEvent.disciplinaName || nextEvent.turmaName || getTypeInfo(nextEvent.typeId).label}
                </span>
              </span>
              <ChevronRight size={19} className="shrink-0 text-blue-200" aria-hidden="true" />
            </button>
          ) : (
            <div className="mt-4 flex min-h-20 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <Clock3 size={20} className="shrink-0 text-blue-200" aria-hidden="true" />
              <div>
                <p className="text-sm font-black">Agenda livre</p>
                <p className="mt-1 text-[11px] font-medium text-slate-300">Nenhum compromisso futuro encontrado.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Calendário</p>
            <h1 className="mt-0.5 text-lg font-black tracking-tight text-[#001a33]">
              {MONTHS[currentMonthIndex]} <span className="text-slate-400">{currentYear}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onChangeMonth(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-600 active:bg-blue-50 active:text-blue-700" aria-label="Mês anterior">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => onChangeMonth(1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-600 active:bg-blue-50 active:text-blue-700" aria-label="Próximo mês">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Filtros da agenda">
          <label className="relative min-w-[11rem] flex-1">
            <span className="sr-only">Filtrar por turma</span>
            <GraduationCap size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={selectedTurmaId} onChange={(event) => onTurmaChange(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-7 text-base font-bold text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="">Todas as turmas</option>
              {turmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome}</option>)}
            </select>
          </label>
          <label className="relative min-w-[10rem] flex-1">
            <span className="sr-only">Filtrar por categoria</span>
            <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={selectedCategoryId} onChange={(event) => onCategoryChange(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-7 text-base font-bold text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="">Todas as categorias</option>
              {eventTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </label>
        </div>

        {activeFilters > 0 ? (
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-600" aria-live="polite">
            {activeFilters} filtro{activeFilters === 1 ? '' : 's'} ativo{activeFilters === 1 ? '' : 's'}
          </p>
        ) : null}

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((weekday, index) => (
            <span key={`${weekday}-${index}`} className={`pb-1 text-center text-[10px] font-black ${index === 0 ? 'text-rose-500' : index === 6 ? 'text-blue-600' : 'text-slate-400'}`}>
              {weekday}
            </span>
          ))}

          {cells.map(({ date, isCurrentMonth }) => {
            const dateKey = toDateKey(date);
            const dateEvents = eventsByDate.get(dateKey) || [];
            const isFocused = dateKey === focusedDateKey;
            const isToday = dateKey === todayKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(date)}
                className={`relative flex min-h-11 items-center justify-center rounded-xl text-xs font-black outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isFocused
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isCurrentMonth
                      ? 'text-slate-700 active:bg-blue-50'
                      : 'text-slate-300'
                }`}
                aria-label={`${date.getDate()} de ${MONTHS[date.getMonth()]}, ${dateEvents.length} compromisso${dateEvents.length === 1 ? '' : 's'}`}
                aria-pressed={isFocused}
              >
                <span className={isToday && !isFocused ? 'flex h-7 w-7 items-center justify-center rounded-lg bg-[#001a33] text-white' : ''}>{date.getDate()}</span>
                {dateEvents.length > 0 ? (
                  <span className="absolute bottom-1.5 flex gap-0.5" aria-hidden="true">
                    {dateEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className={`h-1 w-1 rounded-full ${isFocused ? 'bg-white' : ''}`} style={isFocused ? undefined : { backgroundColor: getTypeInfo(event.typeId).color }} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm" aria-labelledby="mobile-day-events-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Compromissos do dia</p>
            <h2 id="mobile-day-events-title" className="mt-0.5 text-base font-black text-[#001a33]">
              {focusedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
            </h2>
          </div>
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">{dayEvents.length}</span>
        </div>

        {isLoading ? (
          <div className="mt-4 space-y-2" aria-live="polite">
            {[0, 1].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />)}
          </div>
        ) : dayEvents.length > 0 ? (
          <div className="mt-4 space-y-2">
            {dayEvents.map((event) => {
              const type = getTypeInfo(event.typeId);
              return (
                <button key={event.id} type="button" onClick={() => onOpenDate(focusedDate)} className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-left active:border-blue-200 active:bg-blue-50">
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-xs font-black leading-snug text-[#001a33]">{event.title}</span>
                    <span className="mt-1 block truncate text-[10px] font-bold text-slate-500">{event.disciplinaName || event.turmaName || type.label}</span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex min-h-20 items-center gap-3 rounded-2xl bg-slate-50 p-4">
            <Clock3 size={19} className="shrink-0 text-slate-300" />
            <div>
              <p className="text-xs font-black text-[#001a33]">Nenhum compromisso</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Selecione outro dia para consultar sua agenda.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default AlunoMobileAgenda;

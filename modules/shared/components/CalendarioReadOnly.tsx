import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Info, Tag, X } from 'lucide-react';
import { CalendarEvent, EventType } from '../../gestor/calendario/calendario.types';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface CalendarioReadOnlyProps {
  events: CalendarEvent[];
  eventTypes: EventType[];
  isLoading?: boolean;
}

const addMonths = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth() + offset, 1);

const toDateKey = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const parseDateKey = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const isSameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const CalendarioReadOnly: React.FC<CalendarioReadOnlyProps> = ({ events, eventTypes, isLoading = false }) => {
  const [centerMonth, setCenterMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!isModalOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen]);

  const visibleMonths = useMemo(
    () => [-1, 0, 1].map((offset) => addMonths(centerMonth, offset)),
    [centerMonth]
  );

  const getDaysInMonth = (year: number, monthIndex: number) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
    const days: (Date | null)[] = [];

    for (let i = 0; i < firstDayOfWeek; i += 1) days.push(null);
    for (let i = 1; i <= daysInMonth; i += 1) days.push(new Date(year, monthIndex, i));

    return days;
  };

  const getTypeColor = (typeId: string) => eventTypes.find((type) => type.id === typeId)?.color || '#cbd5e1';
  const getTypeName = (typeId: string) => eventTypes.find((type) => type.id === typeId)?.label || 'Geral';

  const getEventsForDay = (date: Date) => {
    const dateStr = toDateKey(date);
    return events
      .filter((event) => event.date === dateStr)
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  };

  const getEventsForMonth = (monthDate: Date) => (
    events
      .filter((event) => {
        const eventDate = parseDateKey(event.date);
        return isSameMonth(eventDate, monthDate);
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR'))
  );

  const centerMonthEvents = useMemo(() => getEventsForMonth(centerMonth), [events, centerMonth]);

  const legendTypes = useMemo(() => {
    const usedTypeIds = new Set(centerMonthEvents.map((event) => event.typeId));
    return eventTypes.filter((type) => usedTypeIds.has(type.id));
  }, [centerMonthEvents, eventTypes]);

  const handleDayClick = (date: Date) => {
    if (getEventsForDay(date).length === 0) return;
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const formatMonthShort = (monthIndex: number) => MONTHS[monthIndex].slice(0, 3).toUpperCase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-[2rem] border border-slate-100 bg-white py-20 shadow-sm">
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Carregando agenda...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="rounded-[2rem] border border-slate-100 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
          <button
            type="button"
            onClick={() => setCenterMonth((prev) => addMonths(prev, -1))}
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-slate-50 hover:text-[#001a33]"
            aria-label="Ver mês anterior"
          >
            <ChevronLeft size={22} />
          </button>

          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">
              Agenda {centerMonth.getFullYear()}
            </p>
            <h2 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">
              {MONTHS[centerMonth.getMonth()]}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setCenterMonth((prev) => addMonths(prev, 1))}
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-slate-50 hover:text-[#001a33]"
            aria-label="Ver próximo mês"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {visibleMonths.map((monthDate) => {
          const monthName = MONTHS[monthDate.getMonth()];
          const days = getDaysInMonth(monthDate.getFullYear(), monthDate.getMonth());
          const monthEvents = getEventsForMonth(monthDate);
          const isCenter = isSameMonth(monthDate, centerMonth);
          const isActualCurrentMonth = isSameMonth(monthDate, new Date());

          return (
            <section
              key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}
              className={`flex min-h-[25rem] flex-col rounded-[2rem] border bg-white p-5 shadow-sm transition ${
                isCenter
                  ? 'border-blue-200 ring-2 ring-blue-100'
                  : isActualCurrentMonth
                    ? 'border-emerald-100'
                    : 'border-slate-100'
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className={`text-xl font-black uppercase tracking-tight ${isCenter ? 'text-blue-600' : 'text-[#001a33]'}`}>
                    {monthName}
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {monthDate.getFullYear()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {monthEvents.length} evento{monthEvents.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="grid grid-cols-7 pb-2">
                {WEEKDAYS.map((day, index) => (
                  <div key={`${day}-${index}`} className="text-center text-[10px] font-black text-slate-600">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-2">
                {days.map((date, dayIndex) => {
                  if (!date) return <div key={`empty-${dayIndex}`} className="h-10" />;

                  const dayEvents = getEventsForDay(date);
                  const hasEvents = dayEvents.length > 0;
                  const isToday = toDateKey(date) === toDateKey(new Date());

                  return (
                    <button
                      key={toDateKey(date)}
                      type="button"
                      disabled={!hasEvents}
                      onClick={() => handleDayClick(date)}
                      className={`flex h-10 flex-col items-center justify-center rounded-xl text-xs font-black transition ${
                        hasEvents ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default'
                      }`}
                      title={hasEvents ? `${dayEvents.length} evento(s)` : undefined}
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-blue-600 text-white'
                          : hasEvents
                            ? 'text-[#001a33]'
                            : 'text-slate-600'
                      }`}>
                        {date.getDate()}
                      </span>
                      <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                        {dayEvents.slice(0, 3).map((event) => (
                          <span
                            key={event.id}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: getTypeColor(event.typeId) }}
                          />
                        ))}
                        {dayEvents.length > 3 && <span className="h-1 w-1 rounded-full bg-slate-300" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Eventos do mês</p>
            <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">
              {MONTHS[centerMonth.getMonth()]} {centerMonth.getFullYear()}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setCenterMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            }}
            className="inline-flex items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 transition hover:border-blue-300"
          >
            Voltar ao mês atual
          </button>
        </div>

        {centerMonthEvents.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
            <Clock size={24} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-black text-[#001a33]">Nenhum evento neste mês</p>
            <p className="mt-1 text-xs font-bold text-slate-400">
              Use as setas para navegar entre os meses.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {centerMonthEvents.map((event) => {
              const eventDate = parseDateKey(event.date);
              const typeColor = getTypeColor(event.typeId);

              return (
                <article key={event.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex gap-4">
                    <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white shadow-sm">
                      <span className="text-lg font-black text-[#001a33]">{String(eventDate.getDate()).padStart(2, '0')}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                        {formatMonthShort(eventDate.getMonth())}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: typeColor }} />
                        <div className="min-w-0">
                          <p className="text-sm font-black leading-snug text-[#001a33]">{event.title}</p>
                          {event.description && (
                            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">
                              {event.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span
                          className="rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-widest"
                          style={{ backgroundColor: `${typeColor}18`, color: typeColor }}
                        >
                          {getTypeName(event.typeId)}
                        </span>
                        {event.disciplinaName && (
                          <span className="rounded-lg bg-white px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                            {event.disciplinaName}
                          </span>
                        )}
                        {event.professorName && (
                          <span className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-blue-600">
                            Prof: {event.professorName}
                          </span>
                        )}
                        {event.cargaHoraria ? (
                          <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-600">
                            {event.cargaHoraria}H
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Legenda do mês</p>
          {legendTypes.length === 0 ? (
            <p className="text-xs font-bold text-slate-400">Sem categorias para este mês.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {legendTypes.map((type) => (
                <div key={type.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
                  <span className="text-xs font-black text-slate-600">{type.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <Info size={12} className="shrink-0 text-slate-400" />
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Agenda somente leitura - eventos gerenciados pela coordenação
          </p>
        </div>
      </section>

      {isModalOpen && selectedDate && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex h-dvh w-screen items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
          role="presentation"
        >
          <div
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl animate-fadeIn"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Eventos do dia"
          >
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Fechar detalhes do dia"
            >
              <X size={18} />
            </button>

            <div className="mb-6 flex items-center gap-3 pr-10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <CalendarDays size={20} />
              </div>
              <div>
                <h4 className="text-base font-black text-[#001a33]">
                  {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </h4>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Eventos do dia</p>
              </div>
            </div>

            <div className="space-y-3">
              {getEventsForDay(selectedDate).map((event) => {
                const typeColor = getTypeColor(event.typeId);

                return (
                  <article key={event.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex gap-3">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: typeColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black leading-snug text-[#001a33]">{event.title}</p>
                        {event.description && (
                          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                            {event.description}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <Tag size={10} className="text-slate-400" />
                          <span
                            className="text-[9px] font-black uppercase tracking-widest"
                            style={{ color: typeColor }}
                          >
                            {getTypeName(event.typeId)}
                          </span>
                          {event.professorName && (
                            <span className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-blue-600">
                              Prof: {event.professorName}
                            </span>
                          )}
                          {event.turmaName && (
                            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                              Turma: {event.turmaName}
                            </span>
                          )}
                          {event.cargaHoraria ? (
                            <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-600">
                              {event.cargaHoraria}H
                            </span>
                          ) : null}
                          {event.turno && (
                            <span className="rounded-lg bg-purple-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-purple-600">
                              {event.turno}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CalendarioReadOnly;

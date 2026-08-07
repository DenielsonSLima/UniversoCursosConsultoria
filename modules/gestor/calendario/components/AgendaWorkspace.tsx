import React, { useMemo } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileDown,
  Filter,
  Landmark,
  ListPlus,
  Plus,
  Settings,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';

import { toDateKey } from '../calendario.official';
import type { CalendarEvent, EventType } from '../calendario.types';
import CalendarioAulasExportPanel from '../exportacao-aulas/components/CalendarioAulasExportPanel';

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface CalendarCell {
  date: Date;
  isCurrentMonth: boolean;
}

const buildMonthGrid = (year: number, monthIndex: number): CalendarCell[] => {
  const firstDay = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return { date, isCurrentMonth: date.getMonth() === monthIndex };
  });
};

const formatLongDate = (date: Date) => date.toLocaleDateString('pt-BR', {
  day: '2-digit',
  month: 'long',
}).toUpperCase();

const formatShortDate = (date: string) => new Date(`${date}T12:00:00`)
  .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  .replace('.', '')
  .toUpperCase();

const getPreviousMonth = (year: number, monthIndex: number) => {
  const date = new Date(year, monthIndex - 1, 1);
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
};

type GetTypeInfo = (typeId: string) => EventType;

interface MiniCalendarProps {
  year: number;
  monthIndex: number;
  eventsByDate: Map<string, CalendarEvent[]>;
  focusedDateKey: string;
  todayKey: string;
  muted?: boolean;
  getTypeInfo: GetTypeInfo;
  onFocusDate: (date: Date) => void;
}

const MiniCalendar: React.FC<MiniCalendarProps> = ({
  year,
  monthIndex,
  eventsByDate,
  focusedDateKey,
  todayKey,
  muted = false,
  getTypeInfo,
  onFocusDate,
}) => {
  const cells = useMemo(() => buildMonthGrid(year, monthIndex), [monthIndex, year]);

  return (
    <div className={`rounded-2xl border bg-white p-3.5 sm:p-4 ${
      muted ? 'border-slate-200 opacity-55' : 'border-blue-300 shadow-[0_8px_30px_rgba(37,99,235,0.08)]'
    }`}>
      <h3 className="mb-3 text-base font-bold text-[#001a33]">
        {MONTHS[monthIndex]} <span className="font-semibold text-slate-500">{year}</span>
      </h3>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((weekday, index) => (
          <div key={`${weekday}-${index}`} className={`pb-1 text-center text-[11px] font-semibold uppercase ${
            index === 0 ? 'text-rose-600' : index === 6 ? 'text-blue-700' : 'text-slate-500'
          }`}>
            {weekday}
          </div>
        ))}

        {cells.map(({ date, isCurrentMonth }) => {
          const dateKey = toDateKey(date);
          const events = eventsByDate.get(dateKey) || [];
          const isFocused = dateKey === focusedDateKey;
          const isToday = dateKey === todayKey;
          const weekday = date.getDay();

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onFocusDate(date)}
              className={`relative flex min-h-12 flex-col items-center rounded-xl px-1 pt-2 text-[13px] font-semibold transition-all sm:min-h-14 ${
                !isCurrentMonth
                  ? 'text-slate-300'
                  : weekday === 0
                    ? 'bg-rose-50/80 text-rose-600'
                    : weekday === 6
                      ? 'bg-blue-50/90 text-blue-600'
                      : 'text-slate-700 hover:bg-slate-50'
              } ${isFocused ? 'ring-2 ring-blue-500 ring-inset bg-blue-50 text-blue-700' : ''}`}
              aria-label={`${date.getDate()} de ${MONTHS[date.getMonth()]}`}
            >
              <span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1 ${
                isToday ? 'bg-[#001a33] text-white shadow-md' : ''
              }`}>
                {date.getDate()}
              </span>
              {events.length > 0 ? (
                <span className="absolute bottom-1.5 flex max-w-[85%] items-center justify-center gap-0.5">
                  {events.slice(0, 4).map(event => (
                    <span key={event.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getTypeInfo(event.typeId).color }} />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface MonthAgendaProps {
  year: number;
  monthIndex: number;
  events: CalendarEvent[];
  getTypeInfo: GetTypeInfo;
  onOpenDate: (date: Date) => void;
  readOnly?: boolean;
}

const MonthAgenda: React.FC<MonthAgendaProps> = ({ year, monthIndex, events, getTypeInfo, onOpenDate, readOnly = false }) => (
  <div className="flex min-h-[435px] flex-col overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/45">
    <div className="border-b border-blue-100 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">Agenda do mês</p>
      <h3 className="mt-1 text-lg font-bold text-[#001a33]">{MONTHS[monthIndex]} <span className="font-semibold text-slate-500">{year}</span></h3>
      <p className="mt-1 text-xs font-medium text-slate-500">{events.length} compromisso{events.length === 1 ? '' : 's'} encontrado{events.length === 1 ? '' : 's'}</p>
    </div>

    <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
      {events.length === 0 ? (
        <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white/70 px-5 text-center">
          <CalendarDays size={24} className="mb-2 text-blue-200" />
          <p className="text-sm font-semibold text-slate-600">Nenhum compromisso no mês</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{readOnly ? 'Não há aulas, eventos ou datas oficiais neste período.' : 'Selecione um dia e use o botão “Novo evento”.'}</p>
        </div>
      ) : events.map(event => {
        const type = getTypeInfo(event.typeId);
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onOpenDate(new Date(`${event.date}T12:00:00`))}
            className="flex w-full items-center gap-3 rounded-xl border border-blue-100 bg-white p-2.5 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm"
          >
            <span className="flex h-9 min-w-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700">
              {event.date.slice(8, 10)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[#001a33]">{event.title}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: type.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: type.color }} /> {type.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

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
      className="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3 pl-5 text-left transition hover:border-blue-200 hover:shadow-sm"
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
    <section className="flex min-h-[470px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

interface AgendaWorkspaceProps {
  variant?: 'manager' | 'professor' | 'student';
  poloId?: string | null;
  currentYear: number;
  currentMonthIndex: number;
  today: Date;
  focusedDate: Date;
  events: CalendarEvent[];
  monthEvents: CalendarEvent[];
  eventsByDate: Map<string, CalendarEvent[]>;
  eventTypes: EventType[];
  teachers: any[];
  turmas: any[];
  selectedTeacherId: string;
  selectedTurmaId: string;
  selectedCategoryId: string;
  isLoading: boolean;
  isExportingPdf: boolean;
  getTypeInfo: GetTypeInfo;
  onTeacherChange: (value: string) => void;
  onTurmaChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onClearFilters: () => void;
  onMonthChange: (monthIndex: number) => void;
  onChangeMonth: (direction: -1 | 1) => void;
  onFocusDate: (date: Date) => void;
  onOpenDate: (date: Date) => void;
  onManageTypes?: () => void;
  onExportCsv?: () => void;
  onExportIcs?: () => void;
  onExportPdf?: () => void;
}

const AgendaWorkspace: React.FC<AgendaWorkspaceProps> = ({
  variant = 'manager',
  poloId,
  currentYear,
  currentMonthIndex,
  today,
  focusedDate,
  events,
  monthEvents,
  eventsByDate,
  eventTypes,
  teachers,
  turmas,
  selectedTeacherId,
  selectedTurmaId,
  selectedCategoryId,
  isLoading,
  isExportingPdf,
  getTypeInfo,
  onTeacherChange,
  onTurmaChange,
  onCategoryChange,
  onClearFilters,
  onMonthChange,
  onChangeMonth,
  onFocusDate,
  onOpenDate,
  onManageTypes,
  onExportCsv,
  onExportIcs,
  onExportPdf,
}) => {
  const isProfessor = variant === 'professor';
  const isStudent = variant === 'student';
  const previousMonth = getPreviousMonth(currentYear, currentMonthIndex);
  const focusedDateKey = toDateKey(focusedDate);
  const todayKey = toDateKey(today);
  const hasActiveFilters = Boolean(selectedTeacherId || selectedTurmaId || selectedCategoryId);
  const manualEvents = events.filter(event => !event.id.startsWith('class-') && !event.id.startsWith('official-'));
  const classEvents = events.filter(event => event.id.startsWith('class-'));
  const officialEvents = events.filter(event => event.id.startsWith('official-'));
  const personalEvents = manualEvents.filter(event => event.visibility === 'PERSONAL');
  const institutionalEvents = manualEvents.filter(event => event.visibility !== 'PERSONAL');
  const generalEvents = [...institutionalEvents, ...officialEvents]
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR'));
  const visibleTeachers = Array.from(new Set(events.map(event => event.professorName).filter(Boolean) as string[])).slice(0, 5);

  return (
    <div
      className="agenda-typography animate-fadeIn space-y-5 pb-12 font-sans text-[#001a33]"
      style={{
        fontFamily: "'Inter', sans-serif",
        WebkitFontSmoothing: 'auto',
        textRendering: 'optimizeLegibility',
      }}
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="min-w-64">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
              {isProfessor ? 'Planejamento docente' : isStudent ? 'Agenda acadêmica' : 'Planejamento acadêmico'}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {isProfessor || isStudent ? 'Minha agenda e calendário' : 'Agenda e calendário'}
            </h1>
            <p className="mt-1 text-[13px] font-normal text-slate-500">
              {isProfessor
                ? 'Suas aulas, seus compromissos e as datas gerais da instituição.'
                : isStudent
                  ? 'Aulas das suas turmas, comunicados institucionais e datas oficiais para todos.'
                : 'Aulas, eventos internos e datas oficiais em uma visão operacional.'}
            </p>
          </div>

          <div className={`grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 ${isProfessor || isStudent ? 'xl:grid-cols-3' : 'xl:grid-cols-4'}`}>
            <label className="relative">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mês</span>
              <select value={currentMonthIndex} onChange={event => onMonthChange(Number(event.target.value))} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-xs font-semibold uppercase text-slate-700 outline-none focus:border-blue-400">
                {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute bottom-3 right-3 text-slate-400" />
            </label>
            {!isProfessor && !isStudent ? <label className="relative">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Professor</span>
              <select value={selectedTeacherId} onChange={event => onTeacherChange(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-xs font-semibold uppercase text-slate-700 outline-none focus:border-blue-400">
                <option value="">Todos</option>
                {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.nome}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute bottom-3 right-3 text-slate-400" />
            </label> : null}
            <label className="relative">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Turma</span>
              <select value={selectedTurmaId} onChange={event => onTurmaChange(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-xs font-semibold uppercase text-slate-700 outline-none focus:border-blue-400">
                <option value="">Todas</option>
                {turmas.map(turma => <option key={turma.id} value={turma.id}>{turma.nome}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute bottom-3 right-3 text-slate-400" />
            </label>
            <label className="relative">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Categoria</span>
              <select value={selectedCategoryId} onChange={event => onCategoryChange(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-xs font-semibold uppercase text-slate-700 outline-none focus:border-blue-400">
                <option value="">Todas</option>
                {eventTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute bottom-3 right-3 text-slate-400" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters ? (
              <button type="button" onClick={onClearFilters} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold uppercase text-slate-600 hover:bg-slate-50"><Filter size={13} /> Limpar</button>
            ) : null}
            {!isStudent ? <>
              <button type="button" onClick={onExportCsv} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold uppercase text-slate-600 hover:bg-slate-50"><Download size={13} /> CSV</button>
              <button type="button" onClick={onExportIcs} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold uppercase text-slate-600 hover:bg-slate-50"><Share2 size={13} /> ICS</button>
              <button type="button" onClick={onExportPdf} disabled={isExportingPdf} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-50"><FileDown size={13} /> PDF</button>
              <button type="button" onClick={() => onOpenDate(focusedDate)} className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-[11px] font-semibold uppercase text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700"><Plus size={14} /> {isProfessor ? 'Novo evento pessoal' : 'Novo evento'}</button>
            </> : null}
          </div>
        </div>
      </section>

      {!isProfessor && !isStudent ? (
        <CalendarioAulasExportPanel key={poloId || 'sem-polo'} poloId={poloId} />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="grid grid-cols-1 items-center gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <button type="button" onClick={() => onChangeMonth(-1)} className="flex items-center justify-center gap-2 justify-self-stretch rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase text-slate-600 hover:border-blue-200 hover:text-blue-600 sm:justify-self-start"><ChevronLeft size={15} /> Voltar mês</button>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Agenda mensal</p>
            <h2 className="mt-1 text-lg font-bold">{MONTHS[currentMonthIndex]} <span className="font-semibold text-slate-500">{currentYear}</span></h2>
          </div>
          <button type="button" onClick={() => onChangeMonth(1)} className="flex items-center justify-center gap-2 justify-self-stretch rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase text-slate-600 hover:border-blue-200 hover:text-blue-600 sm:justify-self-end">Próximo mês <ChevronRight size={15} /></button>
        </header>

        <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-3">
          <MiniCalendar year={previousMonth.year} monthIndex={previousMonth.monthIndex} eventsByDate={eventsByDate}
            focusedDateKey={focusedDateKey} todayKey={todayKey} muted getTypeInfo={getTypeInfo} onFocusDate={onFocusDate} />
          <MiniCalendar year={currentYear} monthIndex={currentMonthIndex} eventsByDate={eventsByDate}
            focusedDateKey={focusedDateKey} todayKey={todayKey} getTypeInfo={getTypeInfo} onFocusDate={onFocusDate} />
          <MonthAgenda year={currentYear} monthIndex={currentMonthIndex} events={monthEvents} getTypeInfo={getTypeInfo} onOpenDate={onOpenDate} readOnly={isStudent} />
        </div>

        <div className="grid gap-3 border-t border-slate-100 px-4 py-4 text-[11px] font-medium text-slate-600 lg:grid-cols-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#001a33]">Origem</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> {isProfessor ? 'Meu evento' : isStudent ? 'Institucional' : 'Manual'}</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aula</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Geral</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#001a33]">Categorias</span>
            {eventTypes.slice(0, 5).map(type => <span key={type.id} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: type.color }} /> {type.label}</span>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#001a33]">{isProfessor ? 'Visibilidade' : isStudent ? 'Escopo' : 'Professores'}</span>
              {isProfessor
                ? <span>Somente você cria e exclui seus eventos pessoais.</span>
                : isStudent
                  ? <span>Suas turmas • feriados e datas oficiais para todos</span>
                : visibleTeachers.length === 0
                  ? <span>Sem responsável</span>
                  : visibleTeachers.map(name => <span key={name}>• {name}</span>)}
            </div>
            {!isProfessor && !isStudent && onManageTypes ? <button type="button" onClick={onManageTypes} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50" title="Gerenciar categorias"><Settings size={14} /></button> : null}
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-[470px] animate-pulse rounded-2xl bg-white shadow-sm" />)}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {isProfessor ? (
            <>
              <AgendaColumn eyebrow="Minha agenda" title="Meus eventos pessoais" icon={CalendarDays} events={personalEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Você não criou nenhum evento para este dia." emptyFuture="Nenhum evento pessoal futuro." onOpenDate={onOpenDate} />
              <AgendaColumn eyebrow="Minhas aulas" title="Programação das minhas turmas" icon={BookOpen} events={classEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhuma aula sua programada neste dia." emptyFuture="Nenhuma aula futura encontrada." onOpenDate={onOpenDate} />
              <AgendaColumn eyebrow="Agenda geral" title="Instituição, feriados e datas oficiais" icon={Landmark} events={generalEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhum evento geral neste dia." emptyFuture="Nenhum evento geral futuro." onOpenDate={onOpenDate} />
            </>
          ) : isStudent ? (
            <>
              <AgendaColumn eyebrow="Minha turma" title="Comunicados e eventos da instituição" icon={CalendarDays} events={manualEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhum comunicado para este dia." emptyFuture="Nenhum comunicado futuro." onOpenDate={onOpenDate} />
              <AgendaColumn eyebrow="Aulas e atividades" title="Programação das minhas turmas" icon={BookOpen} events={classEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhuma aula programada neste dia." emptyFuture="Nenhuma aula futura encontrada." onOpenDate={onOpenDate} />
              <AgendaColumn eyebrow="Calendário oficial" title="Feriados e datas para todos" icon={Landmark} events={officialEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhuma data oficial neste dia." emptyFuture="Nenhuma data oficial futura." onOpenDate={onOpenDate} />
            </>
          ) : (
            <>
              <AgendaColumn eyebrow="Agenda" title="Eventos manuais" icon={CalendarDays} events={manualEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhum evento manual neste dia." emptyFuture="Nenhum evento manual futuro." onOpenDate={onOpenDate} />
              <AgendaColumn eyebrow="Aulas e atividades" title="Programação pedagógica" icon={BookOpen} events={classEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhuma aula programada neste dia." emptyFuture="Nenhuma aula futura encontrada." onOpenDate={onOpenDate} />
              <AgendaColumn eyebrow="Calendário oficial" title="Feriados e datas comemorativas" icon={Landmark} events={officialEvents} focusedDate={focusedDate}
                getTypeInfo={getTypeInfo} emptyCurrent="Nenhuma data oficial neste dia." emptyFuture="Nenhuma data oficial futura." onOpenDate={onOpenDate} />
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-medium text-slate-500 shadow-sm">
        <span className="flex items-center gap-2"><Clock3 size={13} /> Selecione um dia para atualizar as três colunas.</span>
        {!isProfessor && !isStudent && onManageTypes ? <button type="button" onClick={onManageTypes} className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-semibold uppercase text-blue-700 hover:bg-blue-50"><ListPlus size={13} /> Gerenciar categorias</button> : null}
        <span className="flex items-center gap-2"><SlidersHorizontal size={13} /> {isProfessor ? 'Mês e categoria afetam sua agenda e as exportações.' : isStudent ? 'O filtro de turma não oculta feriados nem datas oficiais.' : 'Os filtros afetam calendário, agenda e exportações.'}</span>
      </div>
    </div>
  );
};

export default AgendaWorkspace;

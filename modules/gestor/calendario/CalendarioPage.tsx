import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Filter,
  GraduationCap,
  ListPlus,
  Plus,
  Settings,
  Share2,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { calendarioService } from './calendario.service';
import { CalendarEvent, EventType } from './calendario.types';
import { exportAnnualCalendarPdf } from './calendario.pdf';
import {
  getBrazilianOfficialEvents,
  OFFICIAL_EVENT_TYPES,
  toDateKey,
} from './calendario.official';
import EventModal from './components/EventModal';
import TypeManagerModal from './components/TypeManagerModal';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

const escapeICS = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const CalendarioPage: React.FC = () => {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [eventsData, typesData] = await Promise.all([
        calendarioService.getEvents(),
        calendarioService.getEventTypes(),
      ]);

      const [{ data: dbTeachers }, { data: dbTurmas }, { data: dbAulas, error: errorAulas }] = await Promise.all([
        supabase
          .from('parceiros')
          .select('id, nome')
          .eq('tipo', 'Professor')
          .eq('status', 'ATIVO')
          .order('nome', { ascending: true }),
        supabase
          .from('turmas')
          .select('id, nome, codigo, turno')
          .order('nome', { ascending: true }),
        supabase
          .from('aulas_turma')
          .select(`
            id,
            titulo,
            carga_horaria,
            data_aula,
            turma_id,
            disciplina_id,
            turmas ( nome, codigo, turno ),
            disciplinas ( nome )
          `)
          .not('data_aula', 'is', null),
      ]);

      setTeachers(dbTeachers || []);
      setTurmas(dbTurmas || []);

      let classEvents: CalendarEvent[] = [];
      if (!errorAulas && dbAulas?.length) {
        const { data: dbConfigs } = await supabase
          .from('turmas_disciplinas')
          .select('turma_id, disciplina_id, professor_nome, professor_id');

        const configMap: Record<string, { nome: string; id: string | null }> = {};
        dbConfigs?.forEach(config => {
          configMap[`${config.turma_id}-${config.disciplina_id}`] = {
            nome: config.professor_nome || 'Não atribuído',
            id: config.professor_id || null,
          };
        });

        classEvents = dbAulas.map((aula: any) => {
          const config = configMap[`${aula.turma_id}-${aula.disciplina_id}`] || { nome: 'Não atribuído', id: null };
          const turma = Array.isArray(aula.turmas) ? aula.turmas[0] : aula.turmas;
          const disciplina = Array.isArray(aula.disciplinas) ? aula.disciplinas[0] : aula.disciplinas;
          const turmaNome = turma?.nome || 'Turma';
          const disciplinaNome = disciplina?.nome || 'Disciplina';
          const cargaHoraria = Number(aula.carga_horaria || 0);

          return {
            id: `class-${aula.id}`,
            title: `${turmaNome} — ${disciplinaNome}`,
            description: [
              aula.titulo || 'Aula cadastrada',
              `Professor: ${config.nome}`,
              turma?.codigo ? `Turma: ${turmaNome} (${turma.codigo})` : `Turma: ${turmaNome}`,
              cargaHoraria ? `Carga horária: ${cargaHoraria}h` : null,
              turma?.turno ? `Turno: ${turma.turno}` : null,
            ].filter(Boolean).join(' • '),
            date: aula.data_aula,
            typeId: 'ped',
            professorId: config.id,
            professorName: config.nome,
            turmaId: aula.turma_id,
            turmaName: turmaNome,
            disciplinaId: aula.disciplina_id,
            disciplinaName: disciplinaNome,
            cargaHoraria,
            turno: turma?.turno || null,
          };
        });
      }

      setEvents([...eventsData, ...classEvents]);
      setEventTypes(typesData);
    } catch (error) {
      console.error('Erro ao carregar eventos do calendário:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const allEventTypes = useMemo(() => {
    const typeMap = new Map<string, EventType>();
    eventTypes.forEach(type => typeMap.set(type.id, type));
    OFFICIAL_EVENT_TYPES.forEach(type => typeMap.set(type.id, type));
    return Array.from(typeMap.values());
  }, [eventTypes]);

  const officialEvents = useMemo(
    () => getBrazilianOfficialEvents(currentYear),
    [currentYear],
  );

  const filteredAcademicEvents = useMemo(() => events.filter(event => {
    if (selectedTeacherId && event.professorId !== selectedTeacherId) return false;
    if (selectedTurmaId && event.turmaId !== selectedTurmaId) return false;
    if (selectedCategoryId && event.typeId !== selectedCategoryId) return false;
    return true;
  }), [events, selectedTeacherId, selectedTurmaId, selectedCategoryId]);

  const filteredOfficialEvents = useMemo(
    () => officialEvents.filter(event => !selectedCategoryId || event.typeId === selectedCategoryId),
    [officialEvents, selectedCategoryId],
  );

  const visibleYearEvents = useMemo(
    () => [...filteredAcademicEvents, ...filteredOfficialEvents]
      .filter(event => event.date.startsWith(`${currentYear}-`))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR')),
    [currentYear, filteredAcademicEvents, filteredOfficialEvents],
  );

  const monthEvents = useMemo(
    () => visibleYearEvents.filter(event => Number(event.date.slice(5, 7)) === currentMonthIndex + 1),
    [currentMonthIndex, visibleYearEvents],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    visibleYearEvents.forEach(event => {
      const dateEvents = map.get(event.date) || [];
      dateEvents.push(event);
      map.set(event.date, dateEvents);
    });
    return map;
  }, [visibleYearEvents]);

  const monthGrid = useMemo(
    () => buildMonthGrid(currentYear, currentMonthIndex),
    [currentMonthIndex, currentYear],
  );

  const getTypeInfo = (typeId: string) =>
    allEventTypes.find(type => type.id === typeId) || { id: 'other', label: 'Outro', color: '#94a3b8' };

  const changeMonth = (direction: -1 | 1) => {
    setCurrentMonthIndex(previous => {
      const next = previous + direction;
      if (next < 0) {
        setCurrentYear(year => year - 1);
        return 11;
      }
      if (next > 11) {
        setCurrentYear(year => year + 1);
        return 0;
      }
      return next;
    });
  };

  const openDay = (date: Date, isCurrentMonth = true) => {
    if (!isCurrentMonth) {
      setCurrentYear(date.getFullYear());
      setCurrentMonthIndex(date.getMonth());
    }
    setSelectedDate(date);
    setIsEventModalOpen(true);
  };

  const handleAddEvent = async (event: Omit<CalendarEvent, 'id'>) => {
    await calendarioService.addEvent(event);
    await loadData();
  };

  const handleDeleteEvent = async (id: string) => {
    if (id.startsWith('official-') || id.startsWith('class-')) return;
    await calendarioService.deleteEvent(id);
    await loadData();
  };

  const handleAddType = async (data: { label: string; color: string }) => {
    await calendarioService.createEventType(data);
    await loadData();
  };

  const handleDeleteType = async (id: string) => {
    await calendarioService.deleteEventType(id);
    await loadData();
  };

  const exportToICS = () => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Universo Cursos//Calendario//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    visibleYearEvents.forEach(event => {
      const dateRaw = event.date.replace(/-/g, '');
      const nextDate = new Date(`${event.date}T12:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      const type = getTypeInfo(event.typeId);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeICS(event.id)}-${currentYear}@universocursos.com.br`,
        `DTSTART;VALUE=DATE:${dateRaw}`,
        `DTEND;VALUE=DATE:${toDateKey(nextDate).replace(/-/g, '')}`,
        `SUMMARY:${escapeICS(event.title)}`,
        `DESCRIPTION:${escapeICS(`${event.description || ''} Categoria: ${type.label}`.trim())}`,
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calendario-universo-${currentYear}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    const headers = ['Data', 'Evento', 'Categoria', 'Professor', 'Turma', 'Descrição'];
    const rows = visibleYearEvents.map(event => {
      const teacher = event.professorName || teachers.find(item => item.id === event.professorId)?.nome || 'Geral';
      const turma = event.turmaName || turmas.find(item => item.id === event.turmaId)?.nome || 'Geral';
      return [event.date, event.title, getTypeInfo(event.typeId).label, teacher, turma, event.description || ''];
    });
    const content = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agenda-universo-${currentYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    setIsExportingPdf(true);
    try {
      exportAnnualCalendarPdf({
        year: currentYear,
        events: visibleYearEvents,
        eventTypes: allEventTypes,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const hasActiveFilters = Boolean(selectedTeacherId || selectedTurmaId || selectedCategoryId);
  const academicCount = monthEvents.filter(event => !event.id.startsWith('official-')).length;
  const officialCount = monthEvents.filter(event => event.id.startsWith('official-')).length;
  const activeDaysCount = new Set(monthEvents.map(event => event.date)).size;

  return (
    <div className="min-h-screen animate-fadeIn pb-12 text-[#001a33]">
      <section className="relative mb-5 overflow-hidden rounded-[2rem] bg-[#001a33] px-5 py-5 text-white shadow-xl shadow-slate-900/10 sm:px-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border-[38px] border-blue-500/10" />
        <div className="pointer-events-none absolute right-24 top-4 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-950/30">
              <CalendarDays size={24} />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-blue-200">
                <Sparkles size={12} /> Planejamento acadêmico
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Calendário {currentYear}</h1>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-300 sm:text-sm">
                Aulas, compromissos, feriados nacionais e datas importantes em uma agenda única.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={exportToCSV} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-wider transition hover:bg-white/10">
              <Download size={15} /> CSV
            </button>
            <button onClick={exportToICS} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-wider transition hover:bg-white/10">
              <Share2 size={15} /> ICS
            </button>
            <button onClick={exportToPDF} disabled={isExportingPdf} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#001a33] shadow-lg transition hover:bg-blue-50 disabled:opacity-60">
              <FileDown size={16} /> {isExportingPdf ? 'Gerando...' : 'Exportar PDF A4'}
            </button>
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 ml-1 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Mês em foco</span>
              <span className="relative block">
                <select value={currentMonthIndex} onChange={event => setCurrentMonthIndex(Number(event.target.value))} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-9 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white">
                  {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 ml-1 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Professor</span>
              <span className="relative block">
                <select value={selectedTeacherId} onChange={event => setSelectedTeacherId(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-9 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white">
                  <option value="">Todos os professores</option>
                  {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.nome}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 ml-1 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Turma</span>
              <span className="relative block">
                <select value={selectedTurmaId} onChange={event => setSelectedTurmaId(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-9 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white">
                  <option value="">Todas as turmas</option>
                  {turmas.map(turma => <option key={turma.id} value={turma.id}>{turma.nome}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 ml-1 block text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Categoria</span>
              <span className="relative block">
                <select value={selectedCategoryId} onChange={event => setSelectedCategoryId(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-9 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white">
                  <option value="">Todas as categorias</option>
                  {allEventTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
              </span>
            </label>
          </div>

          {hasActiveFilters && (
            <button onClick={() => { setSelectedTeacherId(''); setSelectedTurmaId(''); setSelectedCategoryId(''); }} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">
              <Filter size={14} /> Limpar filtros
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-12">
        <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm 2xl:col-span-9">
          <header className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button onClick={() => changeMonth(-1)} className="order-2 flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 sm:order-1">
              <ChevronLeft size={16} /> Mês anterior
            </button>
            <div className="order-1 text-center sm:order-2">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-500">Agenda mensal</p>
              <h2 className="mt-0.5 text-xl font-black tracking-tight sm:text-2xl">{MONTHS[currentMonthIndex]} <span className="text-slate-400">{currentYear}</span></h2>
            </div>
            <button onClick={() => changeMonth(1)} className="order-3 flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">
              Próximo mês <ChevronRight size={16} />
            </button>
          </header>

          <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50/60">
            <div className="border-r border-slate-100 px-3 py-3 text-center">
              <p className="text-lg font-black text-blue-600">{activeDaysCount}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Dias com agenda</p>
            </div>
            <div className="border-r border-slate-100 px-3 py-3 text-center">
              <p className="text-lg font-black text-emerald-600">{academicCount}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Eventos acadêmicos</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-lg font-black text-rose-600">{officialCount}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Datas oficiais</p>
            </div>
          </div>

          <div className="p-3 sm:p-5">
            <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {WEEKDAYS.map((weekday, index) => (
                <div key={weekday} className={`border-r border-slate-200 px-1 py-2.5 text-center text-[9px] font-black uppercase tracking-wider last:border-r-0 ${index === 0 ? 'bg-rose-50 text-rose-600' : index === 6 ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}>
                  {weekday}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {monthGrid.map(({ date, isCurrentMonth }, index) => {
                const dateKey = toDateKey(date);
                const dayEvents = eventsByDate.get(dateKey) || [];
                const weekday = date.getDay();
                const isSunday = weekday === 0;
                const isSaturday = weekday === 6;
                const isToday = dateKey === toDateKey(today);
                const hasHoliday = dayEvents.some(event => event.typeId === 'fer');

                return (
                  <button
                    key={dateKey}
                    onClick={() => openDay(date, isCurrentMonth)}
                    className={`group relative min-h-[72px] border-b border-r border-slate-100 p-1.5 text-left transition hover:z-10 hover:bg-blue-50/60 sm:min-h-[94px] sm:p-2.5 xl:min-h-[108px] ${index % 7 === 6 ? 'border-r-0' : ''} ${index >= 35 ? 'border-b-0' : ''} ${!isCurrentMonth ? 'bg-slate-50/60 opacity-45' : ''} ${isSunday ? 'bg-rose-50/45' : ''} ${isSaturday ? 'bg-blue-50/45' : ''} ${hasHoliday ? 'ring-1 ring-inset ring-rose-100' : ''}`}
                    aria-label={`${date.getDate()} de ${MONTHS[date.getMonth()]}`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black transition sm:h-8 sm:w-8 ${isToday ? 'bg-[#001a33] text-white shadow-md' : hasHoliday || isSunday ? 'text-rose-600' : isSaturday ? 'text-blue-600' : 'text-slate-700 group-hover:bg-white'}`}>
                      {date.getDate()}
                    </span>

                    <div className="mt-1.5 space-y-1">
                      {dayEvents.slice(0, 2).map(event => {
                        const type = getTypeInfo(event.typeId);
                        return (
                          <div key={event.id} className="hidden min-w-0 items-center gap-1.5 rounded-md bg-white/85 px-1.5 py-1 shadow-sm ring-1 ring-slate-100 sm:flex" title={event.title}>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
                            <span className="truncate text-[8px] font-bold text-slate-600 xl:text-[9px]">{event.title}</span>
                          </div>
                        );
                      })}
                      <div className="flex gap-0.5 sm:hidden">
                        {dayEvents.slice(0, 4).map(event => <span key={event.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getTypeInfo(event.typeId).color }} />)}
                      </div>
                      {dayEvents.length > 2 && <p className="hidden pl-1 text-[8px] font-bold text-slate-400 sm:block">+{dayEvents.length - 2} evento{dayEvents.length > 3 ? 's' : ''}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="flex min-h-[620px] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm 2xl:col-span-3 2xl:max-h-[820px]">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500">Agenda do mês</p>
                <h3 className="mt-1 text-xl font-black">{MONTHS[currentMonthIndex]}</h3>
                <p className="mt-1 text-[10px] font-medium text-slate-400">{monthEvents.length} registros encontrados</p>
              </div>
              <button onClick={() => openDay(currentYear === today.getFullYear() && currentMonthIndex === today.getMonth() ? today : new Date(currentYear, currentMonthIndex, 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700" title="Adicionar evento">
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : monthEvents.length === 0 ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                <CalendarDays size={28} className="mb-3 text-slate-300" />
                <p className="text-xs font-black text-slate-500">Mês sem registros</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Clique em qualquer dia para adicionar um novo evento.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {monthEvents.map(event => {
                  const type = getTypeInfo(event.typeId);
                  const isOfficial = event.id.startsWith('official-');
                  return (
                    <button key={event.id} onClick={() => openDay(new Date(`${event.date}T12:00:00`))} className="group flex w-full gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white shadow-sm">
                        <span className="text-sm font-black" style={{ color: type.color }}>{event.date.slice(8, 10)}</span>
                        <span className="text-[7px] font-black uppercase text-slate-400">{MONTHS[Number(event.date.slice(5, 7)) - 1].slice(0, 3)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-black text-[#001a33]" title={event.title}>{event.title}</p>
                        <p className="mt-1 line-clamp-2 text-[9px] font-medium leading-relaxed text-slate-400">{event.description || 'Sem detalhes adicionais.'}</p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: type.color }} />
                          <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: type.color }}>{type.label}</span>
                          {isOfficial && <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[7px] font-black uppercase text-slate-400">Brasil</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Legenda</p>
              <button onClick={() => setIsTypeManagerOpen(true)} className="rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-100" title="Gerenciar categorias"><Settings size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allEventTypes.map(type => (
                <span key={type.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[8px] font-bold text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: type.color }} /> {type.label}
                </span>
              ))}
            </div>
            <button onClick={() => setIsTypeManagerOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600">
              <ListPlus size={14} /> Nova categoria
            </button>
          </div>
        </aside>
      </div>

      <section className="mt-5 rounded-[1.75rem] border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500">Navegação rápida</p>
            <h3 className="mt-1 text-lg font-black">Visão anual compacta</h3>
          </div>
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button onClick={() => setCurrentYear(year => year - 1)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-blue-600"><ChevronLeft size={16} /></button>
            <span className="min-w-20 text-center text-sm font-black">{currentYear}</span>
            <button onClick={() => setCurrentYear(year => year + 1)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-blue-600"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12">
          {MONTHS.map((month, index) => {
            const monthCount = visibleYearEvents.filter(event => Number(event.date.slice(5, 7)) === index + 1).length;
            const isActive = index === currentMonthIndex;
            return (
              <button key={month} onClick={() => { setCurrentMonthIndex(index); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`rounded-xl border px-2 py-3 text-center transition ${isActive ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/15' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600'}`}>
                <span className="block text-[9px] font-black uppercase tracking-wider">{month.slice(0, 3)}</span>
                <span className={`mt-1 block text-[8px] font-bold ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>{monthCount} evento{monthCount === 1 ? '' : 's'}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-[9px] font-bold text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> Sábados em azul</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-600" /> Domingos e feriados em vermelho</span>
          <span className="flex items-center gap-1.5"><GraduationCap size={12} /> Clique no dia para ver ou adicionar compromissos</span>
        </div>
      </section>

      {selectedDate && (
        <EventModal
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          selectedDate={selectedDate}
          eventsOnDate={eventsByDate.get(toDateKey(selectedDate)) || []}
          eventTypes={allEventTypes}
          teachers={teachers}
          turmas={turmas}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      )}

      <TypeManagerModal
        isOpen={isTypeManagerOpen}
        onClose={() => setIsTypeManagerOpen(false)}
        types={eventTypes}
        onAddType={handleAddType}
        onDeleteType={handleDeleteType}
      />
    </div>
  );
};

export default CalendarioPage;

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { getBrazilianOfficialEvents, OFFICIAL_EVENT_TYPES, toDateKey } from './calendario.official';
import { exportAnnualCalendarPdf } from './calendario.pdf';
import { calendarioService } from './calendario.service';
import type { CalendarEvent, EventType } from './calendario.types';
import AgendaWorkspace from './components/AgendaWorkspace';
import EventModal from './components/EventModal';
import TypeManagerModal from './components/TypeManagerModal';

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

  const [focusedDate, setFocusedDate] = useState(today);
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
    void loadData();
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

  const visibleFilteredEvents = useMemo(
    () => [...filteredAcademicEvents, ...filteredOfficialEvents]
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR')),
    [filteredAcademicEvents, filteredOfficialEvents],
  );

  const monthEvents = useMemo(
    () => visibleYearEvents.filter(event => Number(event.date.slice(5, 7)) === currentMonthIndex + 1),
    [currentMonthIndex, visibleYearEvents],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    visibleFilteredEvents.forEach(event => {
      const dateEvents = map.get(event.date) || [];
      dateEvents.push(event);
      map.set(event.date, dateEvents);
    });
    return map;
  }, [visibleFilteredEvents]);

  const getTypeInfo = useCallback((typeId: string): EventType => (
    allEventTypes.find(type => type.id === typeId)
    || { id: 'other', label: 'Outro', color: '#94a3b8' }
  ), [allEventTypes]);

  const focusMonth = (year: number, monthIndex: number) => {
    setCurrentYear(year);
    setCurrentMonthIndex(monthIndex);
    setFocusedDate(new Date(year, monthIndex, 1));
  };

  const changeMonth = (direction: -1 | 1) => {
    const nextMonth = new Date(currentYear, currentMonthIndex + direction, 1);
    focusMonth(nextMonth.getFullYear(), nextMonth.getMonth());
  };

  const openDay = (date: Date) => {
    setFocusedDate(date);
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

  return (
    <>
      <AgendaWorkspace
        currentYear={currentYear}
        currentMonthIndex={currentMonthIndex}
        today={today}
        focusedDate={focusedDate}
        events={visibleFilteredEvents}
        monthEvents={monthEvents}
        eventsByDate={eventsByDate}
        eventTypes={allEventTypes}
        teachers={teachers}
        turmas={turmas}
        selectedTeacherId={selectedTeacherId}
        selectedTurmaId={selectedTurmaId}
        selectedCategoryId={selectedCategoryId}
        isLoading={isLoading}
        isExportingPdf={isExportingPdf}
        getTypeInfo={getTypeInfo}
        onTeacherChange={setSelectedTeacherId}
        onTurmaChange={setSelectedTurmaId}
        onCategoryChange={setSelectedCategoryId}
        onClearFilters={() => {
          setSelectedTeacherId('');
          setSelectedTurmaId('');
          setSelectedCategoryId('');
        }}
        onMonthChange={monthIndex => focusMonth(currentYear, monthIndex)}
        onChangeMonth={changeMonth}
        onFocusDate={setFocusedDate}
        onOpenDate={openDay}
        onManageTypes={() => setIsTypeManagerOpen(true)}
        onExportCsv={exportToCSV}
        onExportIcs={exportToICS}
        onExportPdf={exportToPDF}
      />

      {selectedDate ? (
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
      ) : null}

      <TypeManagerModal
        isOpen={isTypeManagerOpen}
        onClose={() => setIsTypeManagerOpen(false)}
        types={eventTypes}
        onAddType={handleAddType}
        onDeleteType={handleDeleteType}
      />
    </>
  );
};

export default CalendarioPage;

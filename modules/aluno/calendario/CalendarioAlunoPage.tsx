import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { formatAcademicSessions, groupAcademicClassMeetings } from '../../../lib/academicClassMeetings';
import { supabase } from '../../../lib/supabase';
import {
  getBrazilianOfficialEvents,
  OFFICIAL_EVENT_TYPES,
  toDateKey,
} from '../../gestor/calendario/calendario.official';
import { calendarioService } from '../../gestor/calendario/calendario.service';
import type { CalendarEvent, EventType } from '../../gestor/calendario/calendario.types';
import AgendaWorkspace from '../../gestor/calendario/components/AgendaWorkspace';
import EventModal from '../../gestor/calendario/components/EventModal';
import { alunoCourseAccessKeys } from '../shared/aluno-course-access.queries';
import {
  filterStudentCalendarEvents,
  isCalendarEventVisibleToStudent,
} from './calendario-aluno.utils';
import AlunoMobileAgenda from './components/mobile/AlunoMobileAgenda';
import useAlunoMobileLayout from '../hooks/useAlunoMobileLayout';

interface CalendarioAlunoPageProps {
  alunoId: string;
}

interface StudentCalendarTurma {
  id: string;
  nome: string;
  codigo?: string | null;
  turno?: string | null;
  polo_id?: string | null;
}

interface StudentCalendarData {
  events: CalendarEvent[];
  eventTypes: EventType[];
  turmas: StudentCalendarTurma[];
  teachers: Array<{ id: string; nome: string }>;
}

const relation = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

const EMPTY_CALENDAR_DATA: StudentCalendarData = {
  events: [],
  eventTypes: [],
  turmas: [],
  teachers: [],
};

const CalendarioAlunoPage: React.FC<CalendarioAlunoPageProps> = ({ alunoId }) => {
  const isMobileLayout = useAlunoMobileLayout();
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState(today.getMonth());
  const [focusedDate, setFocusedDate] = useState(today);
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);

  const {
    data: calendarData = EMPTY_CALENDAR_DATA,
    isLoading,
    isError,
    refetch,
  } = useQuery<StudentCalendarData>({
    queryKey: alunoCourseAccessKeys.calendar(alunoId),
    enabled: Boolean(alunoId),
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { data: matriculas, error: enrollmentError } = await supabase
        .from('matriculas')
        .select(`
          turma_id,
          turmas!inner(
            id, nome, codigo, turno, polo_id,
            cursos!inner(id, modalidade)
          )
        `)
        .eq('aluno_id', alunoId)
        .in('status', ['ATIVO', 'CONCLUIDO', 'EM_DEPENDENCIA'])
        .in('turmas.cursos.modalidade', ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'])
        .abortSignal(signal);

      if (enrollmentError) throw enrollmentError;

      const turmaById = new Map<string, StudentCalendarTurma>();
      (matriculas || []).forEach((enrollment: any) => {
        const turma = relation<any>(enrollment.turmas);
        if (!turma?.id) return;
        turmaById.set(String(turma.id), {
          id: String(turma.id),
          nome: String(turma.nome || 'Turma'),
          codigo: turma.codigo || null,
          turno: turma.turno || null,
          polo_id: turma.polo_id || null,
        });
      });

      const turmas = [...turmaById.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const turmaIds = turmas.map((turma) => turma.id);
      const turmaIdSet = new Set(turmaIds);
      const poloIds = [...new Set(turmas.map((turma) => turma.polo_id).filter(Boolean) as string[])];

      const [eventTypes, eventsByPolo, aulasResult, configsResult] = await Promise.all([
        calendarioService.getEventTypes(),
        Promise.all(poloIds.map((poloId) => calendarioService.getEvents(poloId, signal))),
        turmaIds.length > 0
          ? supabase
            .from('aulas_turma')
            .select(`
              id, titulo, carga_horaria, sessao, data_aula, turma_id, disciplina_id,
              turmas!inner(id, nome, codigo, turno, polo_id),
              disciplinas(nome)
            `)
            .in('turma_id', turmaIds)
            .not('data_aula', 'is', null)
            .abortSignal(signal)
          : Promise.resolve({ data: [], error: null } as any),
        turmaIds.length > 0
          ? supabase
            .from('turmas_disciplinas')
            .select('turma_id, disciplina_id, professor_nome, professor_id')
            .in('turma_id', turmaIds)
            .abortSignal(signal)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (aulasResult.error) throw aulasResult.error;
      if (configsResult.error) throw configsResult.error;

      const configs = configsResult.data || [];
      const configByClassDiscipline = new Map<string, { id: string | null; nome: string }>();
      const professorById = new Map<string, string>();
      configs.forEach((config: any) => {
        const professorId = config.professor_id ? String(config.professor_id) : null;
        const professorNome = String(config.professor_nome || 'Não informado');
        configByClassDiscipline.set(`${config.turma_id}-${config.disciplina_id}`, {
          id: professorId,
          nome: professorNome,
        });
        if (professorId) professorById.set(professorId, professorNome);
      });

      const publicEvents = [...new Map(
        eventsByPolo
          .flat()
          .filter((event) => isCalendarEventVisibleToStudent(event, turmaIdSet))
          .map((event) => [event.id, {
            ...event,
            turmaName: event.turmaId ? turmaById.get(event.turmaId)?.nome || event.turmaName : event.turmaName,
            professorName: event.professorId
              ? professorById.get(event.professorId) || event.professorName
              : event.professorName,
          }]),
      ).values()];

      const classEvents: CalendarEvent[] = groupAcademicClassMeetings((aulasResult.data || []) as any[])
        .map((aula: any) => {
          const turma = turmaById.get(String(aula.turma_id));
          const disciplina = relation<any>(aula.disciplinas);
          const config = configByClassDiscipline.get(`${aula.turma_id}-${aula.disciplina_id}`)
            || { id: null, nome: 'Não informado' };
          const turmaNome = turma?.nome || relation<any>(aula.turmas)?.nome || 'Turma';
          const disciplinaNome = String(disciplina?.nome || 'Disciplina');
          const cargaHoraria = Number(aula.carga_horaria || 0);
          const sessoesLabel = formatAcademicSessions(aula.sessoes);

          return {
            id: `class-${aula.id}`,
            title: `${turmaNome} — ${disciplinaNome}`,
            description: [
              aula.titulo || 'Aula cadastrada',
              `Professor: ${config.nome}`,
              turma?.codigo ? `Turma: ${turmaNome} (${turma.codigo})` : `Turma: ${turmaNome}`,
              cargaHoraria ? `Carga horária: ${cargaHoraria}h` : null,
              sessoesLabel ? `Sessões: ${sessoesLabel}` : null,
              turma?.turno ? `Turno: ${turma.turno}` : null,
            ].filter(Boolean).join(' • '),
            date: aula.data_aula,
            typeId: 'ped',
            professorId: config.id,
            professorName: config.nome,
            turmaId: String(aula.turma_id),
            turmaName: turmaNome,
            disciplinaId: aula.disciplina_id,
            disciplinaName: disciplinaNome,
            cargaHoraria,
            turno: turma?.turno || null,
            poloId: turma?.polo_id || null,
            visibility: 'TURMA',
          };
        });

      return {
        events: [...publicEvents, ...classEvents],
        eventTypes,
        turmas,
        teachers: [...professorById.entries()]
          .map(([id, nome]) => ({ id, nome }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      };
    },
  });

  const allEventTypes = useMemo(() => {
    const byId = new Map<string, EventType>();
    OFFICIAL_EVENT_TYPES.forEach((type) => byId.set(type.id, type));
    calendarData.eventTypes.forEach((type) => byId.set(type.id, type));
    return [...byId.values()];
  }, [calendarData.eventTypes]);

  const officialEvents = useMemo(
    () => [-1, 0, 1].flatMap((yearOffset) => getBrazilianOfficialEvents(currentYear + yearOffset)),
    [currentYear],
  );

  const visibleEvents = useMemo(
    () => filterStudentCalendarEvents(
      [...calendarData.events, ...officialEvents],
      selectedTurmaId,
      selectedCategoryId,
    ).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'pt-BR')),
    [calendarData.events, officialEvents, selectedCategoryId, selectedTurmaId],
  );

  const monthEvents = useMemo(
    () => visibleEvents.filter((event) => (
      event.date.startsWith(`${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-`)
    )),
    [currentMonthIndex, currentYear, visibleEvents],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    visibleEvents.forEach((event) => {
      const dayEvents = map.get(event.date) || [];
      dayEvents.push(event);
      map.set(event.date, dayEvents);
    });
    return map;
  }, [visibleEvents]);

  const getTypeInfo = useCallback((typeId: string): EventType => (
    allEventTypes.find((type) => type.id === typeId)
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
    setIsDayModalOpen(true);
  };

  return (
    <>
      {isError ? (
        <div className="mb-5 flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center">
          <AlertCircle size={24} className="text-rose-500" />
          <div>
            <p className="text-sm font-bold text-rose-700">Não foi possível carregar sua agenda.</p>
            <p className="mt-1 text-xs text-rose-600">Tente novamente sem alterar suas matrículas ou filtros.</p>
          </div>
          <button type="button" onClick={() => void refetch()} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-white">
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      ) : null}

      {isMobileLayout ? <AlunoMobileAgenda
        currentYear={currentYear}
        currentMonthIndex={currentMonthIndex}
        today={today}
        focusedDate={focusedDate}
        events={visibleEvents}
        eventsByDate={eventsByDate}
        eventTypes={allEventTypes}
        turmas={calendarData.turmas}
        selectedTurmaId={selectedTurmaId}
        selectedCategoryId={selectedCategoryId}
        isLoading={isLoading}
        getTypeInfo={getTypeInfo}
        onTurmaChange={setSelectedTurmaId}
        onCategoryChange={setSelectedCategoryId}
        onChangeMonth={changeMonth}
        onSelectDate={(date) => {
          if (date.getFullYear() !== currentYear || date.getMonth() !== currentMonthIndex) {
            focusMonth(date.getFullYear(), date.getMonth());
          }
          setFocusedDate(date);
        }}
        onOpenDate={openDay}
      /> : null}

      {!isMobileLayout ? <AgendaWorkspace
        variant="student"
        currentYear={currentYear}
        currentMonthIndex={currentMonthIndex}
        today={today}
        focusedDate={focusedDate}
        events={visibleEvents}
        monthEvents={monthEvents}
        eventsByDate={eventsByDate}
        eventTypes={allEventTypes}
        teachers={calendarData.teachers}
        turmas={calendarData.turmas}
        selectedTeacherId=""
        selectedTurmaId={selectedTurmaId}
        selectedCategoryId={selectedCategoryId}
        isLoading={isLoading}
        isExportingPdf={false}
        getTypeInfo={getTypeInfo}
        onTeacherChange={() => undefined}
        onTurmaChange={setSelectedTurmaId}
        onCategoryChange={setSelectedCategoryId}
        onClearFilters={() => {
          setSelectedTurmaId('');
          setSelectedCategoryId('');
        }}
        onMonthChange={(monthIndex) => focusMonth(currentYear, monthIndex)}
        onChangeMonth={changeMonth}
        onFocusDate={setFocusedDate}
        onOpenDate={openDay}
      /> : null}

      {selectedDate ? (
        <EventModal
          isOpen={isDayModalOpen}
          onClose={() => setIsDayModalOpen(false)}
          selectedDate={selectedDate}
          eventsOnDate={eventsByDate.get(toDateKey(selectedDate)) || []}
          eventTypes={allEventTypes}
          teachers={calendarData.teachers}
          turmas={calendarData.turmas}
          variant="student"
        />
      ) : null}
    </>
  );
};

export default CalendarioAlunoPage;

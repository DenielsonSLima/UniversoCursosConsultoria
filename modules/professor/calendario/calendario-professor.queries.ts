import { queryOptions } from '@tanstack/react-query';

import { formatAcademicSessions, groupAcademicClassMeetings } from '../../../lib/academicClassMeetings';
import { supabase } from '../../../lib/supabase';
import { calendarioService } from '../../gestor/calendario/calendario.service';
import type { CalendarEvent, EventType } from '../../gestor/calendario/calendario.types';

export interface ProfessorCalendarData {
  events: CalendarEvent[];
  eventTypes: EventType[];
  turmas: Array<{ id: string; nome: string; codigo?: string | null; turno?: string | null }>;
}

const EMPTY_DATA: ProfessorCalendarData = {
  events: [],
  eventTypes: [],
  turmas: [],
};

export const professorCalendarQueryKey = (professorId: string, poloId: string) => (
  ['professor-calendario', professorId, poloId] as const
);

export const professorCalendarQueryOptions = (professorId: string, poloId: string) => queryOptions({
  queryKey: professorCalendarQueryKey(professorId, poloId),
  enabled: Boolean(professorId && poloId),
  staleTime: 30_000,
  queryFn: async ({ signal }): Promise<ProfessorCalendarData> => {
    if (!professorId || !poloId) return EMPTY_DATA;

    const [assignmentResult, persistedEvents, eventTypes] = await Promise.all([
      supabase
        .from('turmas_disciplinas')
        .select('turma_id, disciplina_id, professor_nome, turmas!inner(polo_id)')
        .eq('professor_id', professorId)
        .eq('turmas.polo_id', poloId)
        .abortSignal(signal),
      calendarioService.getEvents(poloId, signal),
      calendarioService.getEventTypes(),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;

    const assignments = assignmentResult.data || [];
    const turmaIds = Array.from(new Set(assignments.map(item => item.turma_id).filter(Boolean)));
    const disciplinaIds = Array.from(new Set(assignments.map(item => item.disciplina_id).filter(Boolean)));
    const assignmentPairs = new Set(
      assignments.map(item => `${item.turma_id}:${item.disciplina_id}`),
    );

    let classEvents: CalendarEvent[] = [];
    let turmas: ProfessorCalendarData['turmas'] = [];

    if (turmaIds.length > 0 && disciplinaIds.length > 0) {
      const [aulasResult, turmasResult, disciplinasResult] = await Promise.all([
        supabase
          .from('aulas_turma')
          .select('id, titulo, carga_horaria, sessao, data_aula, turma_id, disciplina_id')
          .in('turma_id', turmaIds)
          .in('disciplina_id', disciplinaIds)
          .not('data_aula', 'is', null)
          .abortSignal(signal),
        supabase
          .from('turmas')
          .select('id, nome, codigo, turno')
          .in('id', turmaIds)
          .order('nome', { ascending: true })
          .abortSignal(signal),
        supabase
          .from('disciplinas')
          .select('id, nome')
          .in('id', disciplinaIds)
          .abortSignal(signal),
      ]);

      if (aulasResult.error) throw aulasResult.error;
      if (turmasResult.error) throw turmasResult.error;
      if (disciplinasResult.error) throw disciplinasResult.error;

      turmas = turmasResult.data || [];
      const turmaById = new Map(turmas.map(turma => [turma.id, turma]));
      const disciplinaNames = new Map(
        (disciplinasResult.data || []).map(disciplina => [disciplina.id, disciplina.nome]),
      );
      const professorNames = new Map(
        assignments.map(item => [
          `${item.turma_id}:${item.disciplina_id}`,
          item.professor_nome || 'Professor',
        ]),
      );

      classEvents = groupAcademicClassMeetings((aulasResult.data || []) as any[])
        .filter((aula: any) => assignmentPairs.has(`${aula.turma_id}:${aula.disciplina_id}`))
        .map((aula: any) => {
          const turma = turmaById.get(aula.turma_id);
          const turmaNome = turma?.nome || 'Turma';
          const disciplinaNome = disciplinaNames.get(aula.disciplina_id) || 'Disciplina';
          const professorName = professorNames.get(`${aula.turma_id}:${aula.disciplina_id}`) || 'Professor';
          const cargaHoraria = Number(aula.carga_horaria || 0);
          const sessoesLabel = formatAcademicSessions(aula.sessoes);

          return {
            id: `class-${aula.id}`,
            title: `${turmaNome} — ${disciplinaNome}`,
            description: [
              `Aula: ${aula.titulo || 'Aula cadastrada'}`,
              `Professor: ${professorName}`,
              `Turma: ${turmaNome}${turma?.codigo ? ` (${turma.codigo})` : ''}`,
              `Carga horária: ${cargaHoraria > 0 ? `${cargaHoraria}H` : 'não informada'}`,
              sessoesLabel ? `Sessões: ${sessoesLabel}` : null,
              turma?.turno ? `Turno: ${turma.turno}` : null,
            ].filter(Boolean).join(' • '),
            date: aula.data_aula,
            typeId: 'ped',
            professorId,
            professorName,
            turmaId: aula.turma_id,
            turmaName: turmaNome,
            disciplinaId: aula.disciplina_id,
            disciplinaName: disciplinaNome,
            cargaHoraria,
            turno: turma?.turno || null,
            poloId,
          } satisfies CalendarEvent;
        });
    }

    const turmaById = new Map(turmas.map(turma => [turma.id, turma]));
    const scopedPersistedEvents = persistedEvents
      .filter(event => (
        event.visibility === 'GENERAL'
        || (
          (event.visibility === 'PERSONAL' || event.visibility === 'PROFESSOR')
          && event.professorId === professorId
        )
        || (event.visibility === 'TURMA' && turmaIds.includes(event.turmaId || ''))
      ))
      .map(event => ({
        ...event,
        professorName: event.professorId === professorId ? 'Você' : event.professorName,
        turmaName: event.turmaId ? turmaById.get(event.turmaId)?.nome || event.turmaName : event.turmaName,
      }));

    return {
      events: [...scopedPersistedEvents, ...classEvents],
      eventTypes,
      turmas,
    };
  },
});

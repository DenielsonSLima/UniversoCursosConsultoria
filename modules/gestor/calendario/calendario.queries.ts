import { queryOptions } from '@tanstack/react-query';

import { formatAcademicSessions, groupAcademicClassMeetings } from '../../../lib/academicClassMeetings';
import { supabase } from '../../../lib/supabase';
import { calendarioService } from './calendario.service';
import type { CalendarEvent, EventType } from './calendario.types';

export interface GestorCalendarData {
  events: CalendarEvent[];
  eventTypes: EventType[];
  teachers: Array<{ id: string; nome: string }>;
  turmas: Array<{ id: string; nome: string; codigo?: string | null; turno?: string | null }>;
}

const EMPTY_CALENDAR_DATA: GestorCalendarData = {
  events: [],
  eventTypes: [],
  teachers: [],
  turmas: [],
};

export const gestorCalendarQueryOptions = (poloId?: string | null) => queryOptions({
  queryKey: ['gestor-calendario', poloId || 'sem-polo'],
  enabled: Boolean(poloId),
  staleTime: 30_000,
  queryFn: async ({ signal }): Promise<GestorCalendarData> => {
    if (!poloId) return EMPTY_CALENDAR_DATA;

    const [eventsData, typesData, turmasResult, aulasResult] = await Promise.all([
      calendarioService.getEvents(),
      calendarioService.getEventTypes(),
      supabase
        .from('turmas')
        .select('id, nome, codigo, turno')
        .eq('polo_id', poloId)
        .order('nome', { ascending: true })
        .abortSignal(signal),
      supabase
        .from('aulas_turma')
        .select(`
          id,
          titulo,
          carga_horaria,
          sessao,
          data_aula,
          turma_id,
          disciplina_id,
          turmas!inner ( nome, codigo, turno, polo_id ),
          disciplinas ( nome )
        `)
        .eq('turmas.polo_id', poloId)
        .not('data_aula', 'is', null)
        .abortSignal(signal),
    ]);

    if (turmasResult.error) throw turmasResult.error;
    if (aulasResult.error) throw aulasResult.error;

    const dbTurmas = turmasResult.data || [];
    const dbAulas = aulasResult.data || [];
    const turmaIds = dbTurmas.map((turma) => turma.id).filter(Boolean);

    const { data: dbConfigs, error: configsError } = turmaIds.length > 0
      ? await supabase
          .from('turmas_disciplinas')
          .select('turma_id, disciplina_id, professor_nome, professor_id')
          .in('turma_id', turmaIds)
          .abortSignal(signal)
      : { data: [], error: null };

    if (configsError) throw configsError;

    const professorIds = Array.from(new Set(
      (dbConfigs || []).map((config) => config.professor_id).filter(Boolean),
    ));
    const { data: dbTeachers, error: teachersError } = professorIds.length > 0
      ? await supabase
          .from('parceiros')
          .select('id, nome')
          .in('id', professorIds)
          .eq('tipo', 'Professor')
          .eq('status', 'ATIVO')
          .order('nome', { ascending: true })
          .abortSignal(signal)
      : { data: [], error: null };

    if (teachersError) throw teachersError;

    const configMap: Record<string, { nome: string; id: string | null }> = {};
    (dbConfigs || []).forEach((config) => {
      configMap[`${config.turma_id}-${config.disciplina_id}`] = {
        nome: config.professor_nome || 'Não atribuído',
        id: config.professor_id || null,
      };
    });

    const classEvents: CalendarEvent[] = groupAcademicClassMeetings(dbAulas as any[]).map((aula: any) => {
      const config = configMap[`${aula.turma_id}-${aula.disciplina_id}`]
        || { nome: 'Não atribuído', id: null };
      const turma = Array.isArray(aula.turmas) ? aula.turmas[0] : aula.turmas;
      const disciplina = Array.isArray(aula.disciplinas) ? aula.disciplinas[0] : aula.disciplinas;
      const turmaNome = turma?.nome || 'Turma';
      const disciplinaNome = disciplina?.nome || 'Disciplina';
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
        turmaId: aula.turma_id,
        turmaName: turmaNome,
        disciplinaId: aula.disciplina_id,
        disciplinaName: disciplinaNome,
        cargaHoraria,
        turno: turma?.turno || null,
      };
    });

    return {
      events: [...eventsData, ...classEvents],
      eventTypes: typesData,
      teachers: (dbTeachers || []) as Array<{ id: string; nome: string }>,
      turmas: dbTurmas,
    };
  },
});

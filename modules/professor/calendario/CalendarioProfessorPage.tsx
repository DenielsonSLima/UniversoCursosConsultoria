import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { formatAcademicSessions, groupAcademicClassMeetings } from '../../../lib/academicClassMeetings';
import { CalendarEvent } from '../../gestor/calendario/calendario.types';
import { DEFAULT_EVENT_TYPES } from '../../gestor/calendario/calendario.types';
import CalendarioReadOnly from '../../shared/components/CalendarioReadOnly';
import { CalendarDays } from 'lucide-react';

interface CalendarioProfessorPageProps {
  professorId: string;
  poloId: string;
}

const CalendarioProfessorPage: React.FC<CalendarioProfessorPageProps> = ({ professorId, poloId }) => {
  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['professor-calendario', professorId, poloId],
    enabled: Boolean(professorId && poloId),
    queryFn: async () => {
      // 1. Buscar disciplinas atribuídas ao professor
      const { data: disciplinas, error: errDisc } = await supabase
        .from('turmas_disciplinas')
        .select('turma_id, disciplina_id, professor_nome, turmas!inner(polo_id)')
        .eq('professor_id', professorId)
        .eq('turmas.polo_id', poloId);

      if (errDisc) throw errDisc;

      const turmaIds = [...new Set((disciplinas || []).map(d => d.turma_id).filter(Boolean))];
      const disciplinaIds = [...new Set((disciplinas || []).map(d => d.disciplina_id).filter(Boolean))];
      const assignmentPairs = new Set((disciplinas || []).map((d: any) => `${d.turma_id}:${d.disciplina_id}`));

      // 2. Buscar aulas agendadas dessas turmas
      let classEvents: CalendarEvent[] = [];
      if (turmaIds.length > 0 && disciplinaIds.length > 0) {
        const [
          { data: aulas, error: errAulas },
          { data: turmasData, error: errTurmas },
          { data: disciplinasData, error: errDisciplinas },
        ] = await Promise.all([
          supabase
          .from('aulas_turma')
          .select(`
            id,
            titulo,
            carga_horaria,
            sessao,
            data_aula,
            turma_id,
            disciplina_id
          `)
          .in('turma_id', turmaIds)
          .in('disciplina_id', disciplinaIds)
          .not('data_aula', 'is', null),
          supabase
            .from('turmas')
            .select('id, nome, codigo, turno')
            .in('id', turmaIds),
          supabase
            .from('disciplinas')
            .select('id, nome')
            .in('id', disciplinaIds),
        ]);

        if (errAulas) throw errAulas;
        if (errTurmas) throw errTurmas;
        if (errDisciplinas) throw errDisciplinas;

        const turmaById = new Map((turmasData || []).map((turma: any) => [turma.id, turma]));
        const disciplinaNames = new Map((disciplinasData || []).map((disciplina: any) => [disciplina.id, disciplina.nome]));
        const professorNames = new Map((disciplinas || []).map((disciplina: any) => [`${disciplina.turma_id}:${disciplina.disciplina_id}`, disciplina.professor_nome || 'Professor']));

        classEvents = groupAcademicClassMeetings((aulas || []) as any[])
          .filter((aula: any) => assignmentPairs.has(`${aula.turma_id}:${aula.disciplina_id}`))
          .map((a: any) => {
            const turma = turmaById.get(a.turma_id) || {};
            const turmaNome = turma.nome || 'Turma';
            const disciplinaNome = disciplinaNames.get(a.disciplina_id) || 'Disciplina';
            const professorName = professorNames.get(`${a.turma_id}:${a.disciplina_id}`) || 'Professor';
            const cargaHoraria = Number(a.carga_horaria || 0);
            const cargaLabel = cargaHoraria > 0 ? `${cargaHoraria}H` : 'carga não informada';
            const sessoesLabel = formatAcademicSessions(a.sessoes);

            return {
              id: `class-${a.id}`,
              title: `${turmaNome} — ${disciplinaNome}`,
              description: [
                `Aula: ${a.titulo || 'Aula cadastrada'}`,
                `Professor: ${professorName}`,
                `Turma: ${turmaNome}${turma.codigo ? ` (${turma.codigo})` : ''}`,
                `Carga horária: ${cargaLabel}`,
                sessoesLabel ? `Sessões: ${sessoesLabel}` : null,
                turma.turno ? `Turno: ${turma.turno}` : null,
              ].filter(Boolean).join(' • '),
              date: a.data_aula,
              typeId: 'ped',
              professorId,
              professorName,
              turmaId: a.turma_id,
              turmaName: turmaNome,
              disciplinaId: a.disciplina_id,
              disciplinaName: disciplinaNome,
              cargaHoraria,
              turno: turma.turno || null,
            };
          });
      }

      // 3. Buscar eventos públicos (sem turmaId vinculado — feriados, recessos, institucionais)
      // O service ainda usa mock, então buscamos direto via Supabase se houver tabela,
      // ou usamos o mock do service para eventos globais.
      // Como o service usa mock, importamos os dados de mock como fallback.
      // Por ora retornamos apenas os classEvents + mock global para consistência.
      const { calendarioService } = await import('../../gestor/calendario/calendario.service');
      const globalEvents = await calendarioService.getEvents();

      // Filtrar apenas eventos sem turmaId específico (públicos globais)
      const publicEvents = globalEvents.filter(e => !e.turmaId);

      return [...publicEvents, ...classEvents];
    },
  });

  const eventTypes = DEFAULT_EVENT_TYPES;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
          <CalendarDays className="text-purple-600" />
          Minha Agenda
        </h2>
        <p className="text-xs text-slate-450 font-medium mt-1">
          Visualize suas aulas agendadas, feriados e eventos institucionais. Somente suas turmas são exibidas.
        </p>
      </div>

      <CalendarioReadOnly
        events={events}
        eventTypes={eventTypes}
        isLoading={isLoading}
      />
    </div>
  );
};

export default CalendarioProfessorPage;

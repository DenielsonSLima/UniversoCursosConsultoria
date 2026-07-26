import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { formatAcademicSessions, groupAcademicClassMeetings } from '../../../lib/academicClassMeetings';
import { CalendarEvent, DEFAULT_EVENT_TYPES } from '../../gestor/calendario/calendario.types';
import CalendarioReadOnly from '../../shared/components/CalendarioReadOnly';
import { CalendarDays } from 'lucide-react';
import { alunoCourseAccessKeys } from '../shared/aluno-course-access.queries';

interface CalendarioAlunoPageProps {
  alunoId: string;
}

const CalendarioAlunoPage: React.FC<CalendarioAlunoPageProps> = ({ alunoId }) => {
  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: alunoCourseAccessKeys.calendar(alunoId),
    enabled: !!alunoId,
    queryFn: async () => {
      // 1. Buscar turmas do aluno via matrículas
      const { data: matriculas, error: errMat } = await supabase
        .from('matriculas')
        .select(`
          turma_id,
          turmas!inner(
            id,
            cursos!inner(id, modalidade)
          )
        `)
        .eq('aluno_id', alunoId)
        .in('status', ['ATIVO', 'CONCLUIDO'])
        .in('turmas.cursos.modalidade', ['TECNICO', 'LIVRE', 'ESPECIALIZACAO']);

      if (errMat) throw errMat;

      const turmaIds = [...new Set((matriculas || []).map(m => m.turma_id).filter(Boolean))];

      // 2. Buscar aulas agendadas das turmas do aluno
      let classEvents: CalendarEvent[] = [];
      if (turmaIds.length > 0) {
        const { data: aulas, error: errAulas } = await supabase
          .from('aulas_turma')
          .select('id, titulo, carga_horaria, sessao, data_aula, turma_id, disciplina_id')
          .in('turma_id', turmaIds)
          .not('data_aula', 'is', null);

        if (errAulas) throw errAulas;

        const disciplinaIds = [...new Set((aulas || []).map((aula: any) => aula.disciplina_id).filter(Boolean))];
        const [
          { data: turmasData, error: errTurmas },
          { data: disciplinasData, error: errDisciplinas },
          { data: configs, error: errConfigs },
        ] = await Promise.all([
          supabase
            .from('turmas')
            .select('id, nome, codigo, turno')
            .in('id', turmaIds),
          disciplinaIds.length > 0
            ? supabase
              .from('disciplinas')
              .select('id, nome')
              .in('id', disciplinaIds)
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from('turmas_disciplinas')
            .select('turma_id, disciplina_id, professor_nome, professor_id')
            .in('turma_id', turmaIds),
        ]);

        if (errTurmas) throw errTurmas;
        if (errDisciplinas) throw errDisciplinas;
        if (errConfigs) throw errConfigs;

        const turmaById = new Map<string, any>(
          (turmasData || []).map((turma: any) => [String(turma.id), turma])
        );
        const disciplinaNames = new Map<string, string>(
          (disciplinasData || []).map((disciplina: any) => [
            String(disciplina.id),
            String(disciplina.nome || 'Disciplina'),
          ])
        );
        const configMap: Record<string, { nome: string; id: string | null }> = {};
        configs?.forEach((config: any) => {
          configMap[`${config.turma_id}-${config.disciplina_id}`] = {
            nome: config.professor_nome || 'Não informado',
            id: config.professor_id || null,
          };
        });

        classEvents = groupAcademicClassMeetings((aulas || []) as any[]).map((a: any) => {
          const config = configMap[`${a.turma_id}-${a.disciplina_id}`] || { nome: 'Não informado', id: null };
          const turma = turmaById.get(String(a.turma_id)) || {};
          const turmaNome = turma.nome || 'Turma';
          const disciplinaNome = disciplinaNames.get(String(a.disciplina_id)) || 'Disciplina';
          const cargaHoraria = Number(a.carga_horaria || 0);
          const cargaLabel = cargaHoraria > 0 ? `${cargaHoraria}H` : 'carga não informada';
          const sessoesLabel = formatAcademicSessions(a.sessoes);

          return {
            id: `class-${a.id}`,
            title: `${turmaNome} — ${disciplinaNome}`,
            description: [
              `Aula: ${a.titulo || 'Aula cadastrada'}`,
              `Professor: ${config.nome}`,
              `Turma: ${turmaNome}${turma.codigo ? ` (${turma.codigo})` : ''}`,
              `Carga horária: ${cargaLabel}`,
              sessoesLabel ? `Sessões: ${sessoesLabel}` : null,
              turma.turno ? `Turno: ${turma.turno}` : null,
            ].filter(Boolean).join(' • '),
            date: a.data_aula,
            typeId: 'ped',
            professorId: config.id,
            professorName: config.nome,
            turmaId: a.turma_id,
            turmaName: turmaNome,
            disciplinaId: a.disciplina_id,
            disciplinaName: disciplinaNome,
            cargaHoraria,
            turno: turma.turno || null,
          };
        });
      }

      // 3. Eventos públicos globais (feriados, recessos, institucionais)
      const { calendarioService } = await import('../../gestor/calendario/calendario.service');
      const globalEvents = await calendarioService.getEvents();
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
          <CalendarDays className="text-blue-600" />
          Minha Agenda
        </h2>
        <p className="text-xs text-slate-450 font-medium mt-1">
          Acompanhe suas aulas, feriados e eventos da instituição. Você visualiza apenas as turmas em que está matriculado.
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

export default CalendarioAlunoPage;

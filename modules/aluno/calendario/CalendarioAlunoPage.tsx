import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { CalendarEvent, DEFAULT_EVENT_TYPES } from '../../gestor/calendario/calendario.types';
import CalendarioReadOnly from '../../shared/components/CalendarioReadOnly';
import { CalendarDays } from 'lucide-react';

interface CalendarioAlunoPageProps {
  alunoId: string;
}

const CalendarioAlunoPage: React.FC<CalendarioAlunoPageProps> = ({ alunoId }) => {
  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['aluno-calendario', alunoId],
    enabled: !!alunoId,
    queryFn: async () => {
      // 1. Buscar turmas do aluno via matrículas
      const { data: matriculas, error: errMat } = await supabase
        .from('matriculas')
        .select('turma_id')
        .eq('aluno_id', alunoId);

      if (errMat) throw errMat;

      const turmaIds = [...new Set((matriculas || []).map(m => m.turma_id).filter(Boolean))];

      // 2. Buscar aulas agendadas das turmas do aluno
      let classEvents: CalendarEvent[] = [];
      if (turmaIds.length > 0) {
        const { data: aulas, error: errAulas } = await supabase
          .from('aulas_turma')
          .select(`
            id,
            titulo,
            carga_horaria,
            data_aula,
            turma_id,
            disciplina_id,
            turmas ( nome ),
            disciplinas ( nome )
          `)
          .in('turma_id', turmaIds)
          .not('data_aula', 'is', null);

        if (!errAulas && aulas) {
          // Buscar professores de cada disciplina/turma para exibir ao aluno
          const { data: configs } = await supabase
            .from('turmas_disciplinas')
            .select('turma_id, disciplina_id, professor_nome')
            .in('turma_id', turmaIds);

          const configMap: Record<string, string> = {};
          configs?.forEach(c => {
            configMap[`${c.turma_id}-${c.disciplina_id}`] = c.professor_nome || 'Não informado';
          });

          classEvents = aulas.map((a: any) => {
            const profNome = configMap[`${a.turma_id}-${a.disciplina_id}`] || 'Não informado';
            return {
              id: `class-${a.id}`,
              title: `${a.turmas?.nome || 'Turma'} — ${a.disciplinas?.nome || 'Disciplina'}`,
              description: `Prof. ${profNome}${a.titulo ? ` • ${a.titulo}` : ''}${a.carga_horaria ? ` (${a.carga_horaria}H)` : ''}`,
              date: a.data_aula,
              typeId: 'ped',
              turmaId: a.turma_id,
            };
          });
        }
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

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { CalendarEvent } from '../../gestor/calendario/calendario.types';
import { DEFAULT_EVENT_TYPES } from '../../gestor/calendario/calendario.types';
import CalendarioReadOnly from '../../shared/components/CalendarioReadOnly';
import { CalendarDays } from 'lucide-react';

interface CalendarioProfessorPageProps {
  professorId: string;
}

const CalendarioProfessorPage: React.FC<CalendarioProfessorPageProps> = ({ professorId }) => {
  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['professor-calendario', professorId],
    enabled: !!professorId,
    queryFn: async () => {
      // 1. Buscar disciplinas atribuídas ao professor
      const { data: disciplinas, error: errDisc } = await supabase
        .from('turmas_disciplinas')
        .select('turma_id, disciplina_id')
        .eq('professor_id', professorId);

      if (errDisc) throw errDisc;

      const turmaIds = [...new Set((disciplinas || []).map(d => d.turma_id).filter(Boolean))];

      // 2. Buscar aulas agendadas dessas turmas
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
          classEvents = aulas.map((a: any) => ({
            id: `class-${a.id}`,
            title: `${a.turmas?.nome || 'Turma'} — ${a.disciplinas?.nome || 'Disciplina'}`,
            description: `Aula: ${a.titulo}${a.carga_horaria ? ` (${a.carga_horaria}H)` : ''}`,
            date: a.data_aula,
            typeId: 'ped',
            professorId,
            turmaId: a.turma_id,
          }));
        }
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

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';
import {
  portalRealtimeSignalFilter,
  portalRealtimeTopics,
} from '../../shared/realtime/portal-realtime-signals';

export interface ProfessorDisciplinaAssignment {
  id: string;
  turmaId: string;
  disciplinaId: string;
  turmaNome: string;
  turmaCodigo: string;
  cursoNome: string;
  cursoId: string;
  modalidade: string;
  turno: string;
  status: string;
  disciplinaNome: string;
  cargaHoraria: number;
  cargaHorariaEstagio: number;
  totalAulas: number;
  totalAulasDadas: number;
  totalAtividades: number;
  cargaHorariaDada: number;
  cargaDadaPercent: number;
  horasLancadas: number;
  progressoPercent: number;
  primeiraAula: string | null;
  ultimaAula: string | null;
  primeiraAulaLabel: string;
  ultimaAulaLabel: string;
  isEstagio: boolean;
  isFinalizada: boolean;
  canEdit: boolean;
  accessLabel: string;
  accessMessage: string;
  raw: any;
  turmaForDiario: any;
  disciplinaForDiario: any;
}

type ProfessorDisciplinaPortalRow = Omit<
  ProfessorDisciplinaAssignment,
  'primeiraAulaLabel' | 'ultimaAulaLabel' | 'isFinalizada'
>;

export const professorDisciplinasKeys = {
  all: ['professor-disciplinas'] as const,
  list: (professorId: string, poloId: string) =>
    [...professorDisciplinasKeys.all, professorId, poloId, 'list'] as const,
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const useProfessorDisciplinas = (professorId: string, poloId: string) => useQuery<ProfessorDisciplinaAssignment[]>({
  queryKey: professorDisciplinasKeys.list(professorId, poloId),
  enabled: Boolean(professorId && poloId),
  staleTime: 15_000,
  queryFn: async () => {
    const { data, error } = await supabase.rpc('get_professor_disciplinas_portal', {
      p_polo_id: poloId,
    });

    if (error) throw error;

    if (!Array.isArray(data)) return [];

    return (data as ProfessorDisciplinaPortalRow[]).map((row) => {
      const turmaStatus = String(row.status || '').trim().toUpperCase();
      const periodoStatus = String(row.raw?.periodo_status || '').trim().toUpperCase();
      const bloqueioDiario = String(row.raw?.bloqueio_diario || '').trim().toUpperCase();

      return {
        ...row,
        primeiraAulaLabel: formatDate(row.primeiraAula),
        ultimaAulaLabel: formatDate(row.ultimaAula),
        isFinalizada: turmaStatus === 'FINALIZADA'
          || periodoStatus === 'FECHADO'
          || bloqueioDiario === 'TOTAL',
      };
    });
  },
});

export const useProfessorDisciplinasRealtime = (
  professorId: string,
  poloId: string,
  _turmaIds: string[],
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!professorId || !poloId) return undefined;

    const invalidation = createRealtimeInvalidationController({
      invalidate: () => queryClient.invalidateQueries({
        queryKey: professorDisciplinasKeys.list(professorId, poloId),
        exact: true,
      }),
    });

    const channel = supabase.channel(
      `professor_disciplinas_realtime_${professorId}_${poloId}`,
    );
    channel
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(
          portalRealtimeTopics.professorAcademic(professorId, poloId),
        ),
        invalidation.schedule,
      )
      .subscribe(invalidation.onChannelStatus);

    return () => {
      invalidation.dispose();
      void supabase.removeChannel(channel);
    };
  }, [poloId, professorId, queryClient]);
};

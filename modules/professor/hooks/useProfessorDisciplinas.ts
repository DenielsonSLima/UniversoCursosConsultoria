import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

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
  canEdit: boolean;
  accessLabel: string;
  accessMessage: string;
  raw: any;
  turmaForDiario: any;
  disciplinaForDiario: any;
}

type ProfessorDisciplinaPortalRow = Omit<
  ProfessorDisciplinaAssignment,
  'primeiraAulaLabel' | 'ultimaAulaLabel'
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

    return (data as ProfessorDisciplinaPortalRow[]).map((row) => ({
      ...row,
      primeiraAulaLabel: formatDate(row.primeiraAula),
      ultimaAulaLabel: formatDate(row.ultimaAula),
    }));
  },
});

export const useProfessorDisciplinasRealtime = (
  professorId: string,
  poloId: string,
  turmaIds: string[],
) => {
  const queryClient = useQueryClient();
  const turmaIdsKey = [...new Set(turmaIds)].sort().join(',');

  useEffect(() => {
    if (!professorId || !poloId) return undefined;

    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: professorDisciplinasKeys.list(professorId, poloId),
        });
      }, 250);
    };

    const channel = supabase
      .channel(`professor_disciplinas_realtime_${professorId}_${poloId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turmas_disciplinas', filter: `professor_id=eq.${professorId}` },
        invalidate,
      );

    if (turmaIdsKey) {
      const turmaFilter = `turma_id=in.(${turmaIdsKey})`;
      const turmaPrimaryKeyFilter = `id=in.(${turmaIdsKey})`;

      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'aulas_turma', filter: turmaFilter },
          invalidate,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'atividades_extra_classe', filter: turmaFilter },
          invalidate,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'periodos_letivos', filter: turmaFilter },
          invalidate,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'turmas', filter: turmaPrimaryKeyFilter },
          invalidate,
        );
    }

    channel.subscribe();

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      supabase.removeChannel(channel);
    };
  }, [poloId, professorId, queryClient, turmaIdsKey]);
};

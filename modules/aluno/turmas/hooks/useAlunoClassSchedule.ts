import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import type { AulaTurmaAluno } from '../turmas.types';

export interface AlunoClassScheduleScope {
  alunoId: string;
  matriculaId: string | null;
  turmaId: string | null;
  enabled: boolean;
}

export const alunoClassScheduleOptions = (scope: AlunoClassScheduleScope) => ({
  queryKey: ['aluno-turma-aulas', scope.alunoId, scope.matriculaId, scope.turmaId],
  enabled: Boolean(scope.enabled && scope.alunoId && scope.matriculaId && scope.turmaId),
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<AulaTurmaAluno[]> => {
    const { data, error } = await supabase
      .from('aulas_turma')
      .select('id, turma_id, titulo, carga_horaria, data_aula, disciplina_id, sessao')
      .eq('turma_id', scope.turmaId!)
      .order('data_aula', { ascending: true, nullsFirst: false })
      .abortSignal(signal);
    if (error) throw error;
    const rows = (data || []) as AulaTurmaAluno[];
    if (rows.some((row) => row.turma_id !== scope.turmaId)) {
      throw new Error('A consulta retornou aulas fora da turma selecionada.');
    }
    return rows;
  },
});

export const useAlunoClassSchedule = (scope: AlunoClassScheduleScope) => (
  useQuery<AulaTurmaAluno[]>(alunoClassScheduleOptions(scope))
);

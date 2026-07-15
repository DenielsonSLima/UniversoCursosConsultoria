import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import type { EstagioAluno } from '../turmas.types';

interface UseAlunoInternshipsParams {
  alunoId: string;
  turmaId: string | null;
  disciplineIds: string[];
  enabled: boolean;
}

const ensureOwnInternships = (
  data: unknown,
  alunoId: string,
  turmaId: string,
  disciplineIds: string[],
) => {
  const rows = (Array.isArray(data) ? data : []) as EstagioAluno[];
  const allowedDisciplines = new Set(disciplineIds);
  const hasOutOfScopeRow = rows.some((row) => (
    row.aluno_id !== alunoId
    || row.turma_id !== turmaId
    || !row.disciplina_id
    || !allowedDisciplines.has(row.disciplina_id)
  ));

  if (hasOutOfScopeRow) {
    throw new Error('A consulta de estágio retornou dados fora do escopo do aluno.');
  }
  return rows;
};

export const useAlunoInternships = ({
  alunoId,
  turmaId,
  disciplineIds,
  enabled,
}: UseAlunoInternshipsParams) => useQuery<EstagioAluno[]>({
  queryKey: ['aluno-turma-estagios', alunoId, turmaId, disciplineIds],
  enabled: Boolean(enabled && alunoId && turmaId && disciplineIds.length > 0),
  staleTime: 30_000,
  queryFn: async () => {
    if (!turmaId || disciplineIds.length === 0) return [];
    const { data, error } = await supabase
      .from('matriculas_estagios')
      .select(`
        turma_id, disciplina_id, aluno_id, created_at, data_avaliacao,
        instrutor_nome, frequencia_estagio, nota_final,
        nota_comportamento, nota_registros, nota_tecnicas
      `)
      .eq('turma_id', turmaId)
      .eq('aluno_id', alunoId)
      .in('disciplina_id', disciplineIds)
      .order('data_avaliacao', { ascending: false });
    if (error) throw error;
    return ensureOwnInternships(data, alunoId, turmaId, disciplineIds);
  },
});

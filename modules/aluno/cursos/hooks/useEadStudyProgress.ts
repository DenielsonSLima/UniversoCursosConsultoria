import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import type { EadProgressState } from '../cursosPage.types';

interface StudyProgressOptions {
  alunoId?: string;
  courseId?: string;
  enrollmentId?: string;
  enabled: boolean;
  queryKey: readonly unknown[];
}

export function useEadStudyProgress({
  alunoId, courseId, enrollmentId, enabled, queryKey,
}: StudyProgressOptions) {
  const request = async (rpc: 'ead_start_study' | 'ead_get_aluno_progress') => {
    if (!alunoId || !courseId) throw new Error('Aluno ou curso não identificado.');
    const { data, error } = await supabase.rpc(rpc, { p_aluno_id: alunoId, p_curso_id: courseId });
    if (error) throw error;
    return data as EadProgressState;
  };
  const canOpenRoom = enabled && Boolean(alunoId && courseId);
  // The catalog already shares the read query. Keep the room's first access
  // separate so a pending read cannot absorb the idempotent start RPC.
  const start = useQuery({
    queryKey: ['ead-inicio-estudo', alunoId, courseId, enrollmentId],
    enabled: canOpenRoom,
    queryFn: () => request('ead_start_study'),
    staleTime: Infinity,
    retry: 1,
  });
  const progress = useQuery({
    queryKey,
    enabled: canOpenRoom && start.isSuccess,
    refetchOnMount: 'always',
    retry: 1,
    refetchInterval: canOpenRoom && start.isSuccess ? 30_000 : false,
    queryFn: () => request('ead_get_aluno_progress'),
  });
  const readMatchesRoom = progress.data?.summary.studyStartedAt === start.data?.summary.studyStartedAt;
  return {
    data: start.isSuccess ? (readMatchesRoom ? progress.data ?? start.data : start.data) : undefined,
    error: start.error ?? progress.error,
    isError: start.isError || progress.isError,
    isFetching: start.isFetching || progress.isFetching,
    refetch: start.isSuccess ? progress.refetch : start.refetch,
  };
}

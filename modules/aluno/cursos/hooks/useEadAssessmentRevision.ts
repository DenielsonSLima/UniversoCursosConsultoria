import { useMutation, type QueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { EadProgressState } from '../cursosPage.types';
import { isEadProgressStatePayload } from '../eadAssessmentFeedback';
import { canStartEadRevision } from '../eadAssessmentRevision';

interface Input {
  alunoId?: string;
  courseId?: string;
  state?: EadProgressState;
  queryClient: QueryClient;
  disabled: boolean;
  onAccepted: () => void;
}

export function useEadAssessmentRevision(input: Input) {
  const contextRef = useRef('');
  const acceptingRef = useRef(false);
  contextRef.current = `${input.alunoId}:${input.courseId}`;
  const mutation = useMutation({
    retry: false,
    mutationFn: async (request: { alunoId: string; courseId: string; revision: string }) => {
      const { data, error } = await supabase.rpc('ead_start_assessment_revision', {
        p_aluno_id: request.alunoId,
        p_curso_id: request.courseId,
        p_expected_revision: request.revision,
      });
      if (error) throw error;
      if (!isEadProgressStatePayload(data) || !data.effectiveEadConfig
        || data.assessmentRevision?.current !== request.revision) {
        throw new Error('Não foi possível confirmar a revisão. Atualize o progresso antes de continuar.');
      }
      return data as EadProgressState;
    },
    onSuccess: (data, request) => {
      input.queryClient.setQueryData(['ead-aluno-progresso', request.alunoId, request.courseId], data);
      input.queryClient.invalidateQueries({ queryKey: ['ead-aluno-progresso', request.alunoId, request.courseId] });
      if (contextRef.current === `${request.alunoId}:${request.courseId}`) input.onAccepted();
    },
    onError: (_error, request) => {
      input.queryClient.invalidateQueries({ queryKey: ['ead-aluno-progresso', request.alunoId, request.courseId] });
    },
  });
  const startRevision = async () => {
    if (input.disabled || acceptingRef.current || !input.alunoId || !input.courseId
      || !canStartEadRevision(input.state)) return;
    acceptingRef.current = true;
    try {
      await mutation.mutateAsync({
        alunoId: input.alunoId,
        courseId: input.courseId,
        revision: input.state!.assessmentRevision!.available!,
      });
    } catch {
      // A mensagem permanece no painel; uma falha de rede exige atualização antes de tentar de novo.
    } finally {
      acceptingRef.current = false;
    }
  };
  return {
    assessmentRevision: input.state?.assessmentRevision,
    canStartRevision: canStartEadRevision(input.state),
    startRevision,
    revisionPending: mutation.isPending,
    revisionError: mutation.isError && mutation.variables?.courseId === input.courseId
      && mutation.variables?.alunoId === input.alunoId
      ? (mutation.error as Error)?.message || 'Falha ao iniciar a revisão.' : '',
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { alunoCourseAccessKeys } from '../../../shared/aluno-course-access.queries';
import {
  createCursoLivreAssessmentRequestId,
  cursoLivreFinalAssessmentService,
} from './curso-livre-final-assessment.service';

export const cursoLivreFinalAssessmentKeys = {
  detail: (matriculaId: string) => ['aluno', 'curso-livre', 'avaliacao-final', matriculaId] as const,
};

interface UseCursoLivreFinalAssessmentParams {
  alunoId: string;
  matriculaId: string;
  turmaId: string;
  enabled?: boolean;
}

export const useCursoLivreFinalAssessment = ({
  alunoId,
  matriculaId,
  turmaId,
  enabled = true,
}: UseCursoLivreFinalAssessmentParams) => {
  const queryClient = useQueryClient();
  const requestIds = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: cursoLivreFinalAssessmentKeys.detail(matriculaId),
    queryFn: () => cursoLivreFinalAssessmentService.obter(matriculaId),
    enabled: enabled && Boolean(matriculaId),
    staleTime: 15_000,
    retry: 1,
  });

  const syncWorkspace = useCallback((workspace: Awaited<ReturnType<typeof cursoLivreFinalAssessmentService.obter>>) => {
    queryClient.setQueryData(cursoLivreFinalAssessmentKeys.detail(workspace.matriculaId), workspace);
  }, [queryClient]);

  const startMutation = useMutation({
    mutationFn: cursoLivreFinalAssessmentService.iniciar,
    onSuccess: syncWorkspace,
  });
  const submitMutation = useMutation({
    mutationFn: cursoLivreFinalAssessmentService.entregar,
    onSuccess: async (workspace) => {
      syncWorkspace(workspace);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cursoLivreFinalAssessmentKeys.detail(workspace.matriculaId), exact: true }),
        queryClient.invalidateQueries({ queryKey: alunoCourseAccessKeys.enrollments(alunoId), exact: true }),
        queryClient.invalidateQueries({ queryKey: alunoCourseAccessKeys.catalog(alunoId), exact: true }),
        queryClient.invalidateQueries({ queryKey: ['aluno-certificados-matricula', alunoId, workspace.matriculaId, turmaId], exact: true }),
      ]);
    },
  });

  const getRequestId = useCallback((signature: string) => {
    const requestId = requestIds.current.get(signature) || createCursoLivreAssessmentRequestId();
    requestIds.current.set(signature, requestId);
    return requestId;
  }, []);

  const start = useCallback(async () => {
    const signature = `start:${matriculaId}`;
    const result = await startMutation.mutateAsync({
      requestId: getRequestId(signature),
      matriculaId,
    });
    requestIds.current.delete(signature);
    return result;
  }, [getRequestId, matriculaId, startMutation]);

  const submit = useCallback(async (tentativaId: string, respostas: Record<string, number>) => {
    const signature = `submit:${tentativaId}:${JSON.stringify(respostas)}`;
    const result = await submitMutation.mutateAsync({
      requestId: getRequestId(signature),
      tentativaId,
      respostas,
    });
    requestIds.current.delete(signature);
    return result;
  }, [getRequestId, submitMutation]);

  return { query, startMutation, submitMutation, start, submit };
};

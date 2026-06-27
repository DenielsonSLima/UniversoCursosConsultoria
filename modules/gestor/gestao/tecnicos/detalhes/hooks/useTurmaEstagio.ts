import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { turmaEstagioService } from '../turma-estagio.service';
import {
  EstagioCriteriosValores,
  SaveEstagioEvaluationInput,
} from '../turma-estagio.types';

export const useTurmaEstagioData = (turmaId: string, cursoId: string) => useQuery({
  queryKey: academicLifecycleKeys.estagio(turmaId),
  queryFn: () => turmaEstagioService.getEstagioData(turmaId, cursoId),
  staleTime: 15_000,
});

export const useTurmaEstagioAvaliacoes = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: academicLifecycleKeys.estagioAvaliacoes(turmaId, disciplinaId),
  queryFn: () => turmaEstagioService.getAvaliacoes(turmaId, disciplinaId),
  enabled: Boolean(disciplinaId),
  staleTime: 10_000,
});

export const useAvaliacaoEstagioCalculada = (
  criterios: EstagioCriteriosValores,
  enabled: boolean,
) => useQuery({
  queryKey: academicLifecycleKeys.avaliacaoEstagio(criterios),
  queryFn: () => turmaEstagioService.calcularAvaliacao(criterios),
  enabled,
});

export const useSaveEstagioEvaluationMutation = (
  turmaId: string,
  disciplinaId: string,
  onSuccess?: () => void | Promise<void>,
  onError?: (error: any) => void,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveEstagioEvaluationInput) => turmaEstagioService.saveEvaluation(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.estagioAvaliacoes(turmaId, disciplinaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.estagio(turmaId) }),
      ]);
      await onSuccess?.();
    },
    onError,
  });
};

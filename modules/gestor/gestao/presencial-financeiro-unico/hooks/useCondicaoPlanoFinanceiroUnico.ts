import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../tecnicos/detalhes/academic-lifecycle.keys';
import { planoFinanceiroUnicoKeys } from '../keys';
import { planoFinanceiroUnicoService } from '../presencial-financeiro-unico.service';
import type {
  PreviewCondicaoPlanoFinanceiroUnicoInput,
  RedefinirCodigoCondicaoPlanoFinanceiroUnicoInput,
} from '../types';

export const usePreviewCondicaoPlanoFinanceiroUnico = (
  input: PreviewCondicaoPlanoFinanceiroUnicoInput | null,
) => useQuery({
  queryKey: input
    ? planoFinanceiroUnicoKeys.previaCondicao(
      input.turmaId,
      input.alunoId,
      JSON.stringify(input.ajuste),
    )
    : planoFinanceiroUnicoKeys.previaCondicao('', '', ''),
  queryFn: () => planoFinanceiroUnicoService.previewEnrollmentCondition(input!),
  enabled: Boolean(input?.turmaId && input?.alunoId),
  staleTime: 30_000,
  retry: 0,
});

export const usePendenciasPlanoFinanceiroUnico = (turmaId: string, enabled: boolean) => useQuery({
  queryKey: planoFinanceiroUnicoKeys.pendencias(turmaId),
  queryFn: () => planoFinanceiroUnicoService.getPendingConditions(turmaId),
  enabled: enabled && Boolean(turmaId),
  staleTime: 15_000,
  retry: 1,
});

export const useMatricularAlunoPlanoFinanceiroUnicoV2 = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: planoFinanceiroUnicoService.matricularAlunoV2,
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: planoFinanceiroUnicoKeys.turma(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: planoFinanceiroUnicoKeys.pendencias(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.alunos(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.movimentacoes(input.turmaId) }),
        queryClient.invalidateQueries({ queryKey: ['turma-financeiro', input.turmaId] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-alunos', input.turmaId] }),
      ]);
    },
  });
};

export const useCodigoCondicaoPlanoFinanceiroUnico = (turmaId: string, enabled: boolean) => useQuery({
  queryKey: planoFinanceiroUnicoKeys.codigo(turmaId),
  queryFn: () => planoFinanceiroUnicoService.getConditionCodeStatus(turmaId),
  enabled: enabled && Boolean(turmaId),
  staleTime: 30_000,
  retry: 1,
});

export const useRedefinirCodigoCondicaoPlanoFinanceiroUnico = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RedefinirCodigoCondicaoPlanoFinanceiroUnicoInput) => (
      planoFinanceiroUnicoService.resetConditionCode(input)
    ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: planoFinanceiroUnicoKeys.codigo(input.turmaId),
      });
    },
  });
};

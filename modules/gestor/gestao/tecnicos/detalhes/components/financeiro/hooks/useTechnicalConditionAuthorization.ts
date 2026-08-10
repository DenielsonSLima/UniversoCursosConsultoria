import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';
import {
  technicalConditionAuthorizationService,
  type ValidateTechnicalConditionCodeInput,
} from '../technical-condition-authorization.service';

export const useTechnicalConditionCodeStatus = (turmaId: string, enabled = true) => useQuery({
  queryKey: matriculaTecnicaFinanceiroKeys.conditionCodeStatus(turmaId),
  queryFn: () => technicalConditionAuthorizationService.getStatus(turmaId),
  enabled: enabled && Boolean(turmaId),
  staleTime: 30_000,
});

export const useValidateTechnicalConditionCode = () => useMutation({
  mutationFn: (input: ValidateTechnicalConditionCodeInput) => (
    technicalConditionAuthorizationService.validateCode(input)
  ),
});

export const useRedefineTechnicalConditionCode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: technicalConditionAuthorizationService.redefineCode,
    onSuccess: (status) => {
      queryClient.setQueryData(
        matriculaTecnicaFinanceiroKeys.conditionCodeStatus(status.turmaId),
        status,
      );
    },
  });
};

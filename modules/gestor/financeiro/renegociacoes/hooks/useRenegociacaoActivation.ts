import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { renegociacoesQueryKeys } from '../renegociacoes.queryKeys';
import { renegociacaoActivationService } from '../renegociacoes.activation.service';
import type { ActivateRenegociacaoInput } from '../renegociacoes.activation';

export const useRenegociacaoActivation = (agreementId: string, enabled: boolean) => {
  const client = useQueryClient();
  const operationKey = [...renegociacoesQueryKeys.all, 'activation', agreementId];
  const operation = useQuery({
    queryKey: operationKey, queryFn: ({ signal }) => renegociacaoActivationService.get(agreementId, signal),
    enabled, retry: false, staleTime: 0, refetchOnWindowFocus: true,
    refetchInterval: (query) => query.state.data?.retryable ? 10_000 : false,
  });
  const activation = useMutation({
    mutationFn: (input: ActivateRenegociacaoInput) => renegociacaoActivationService.activate(input),
    retry: false,
    // Mesmo em erro de transporte, a leitura precisa descobrir se o banco já avançou.
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: renegociacoesQueryKeys.all }),
        client.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
      ]);
    },
  });
  return { operation, activation };
};

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { carteirinhasPreceptorKeys } from '../carteirinhas-preceptor.keys';
import { carteirinhasPreceptorService } from '../services/carteirinhas-preceptor.service';
import type { CarteirinhaPreceptorPreparationInput } from '../types/carteirinhas-preceptor.types';

export const usePrepararEmissaoCarteirinhaPreceptor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CarteirinhaPreceptorPreparationInput) => carteirinhasPreceptorService.prepararEmissao(input),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: carteirinhasPreceptorKeys.workspace(input.poloId),
        exact: true,
      });
    },
  });
};

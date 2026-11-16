import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eadCouponsManagementService } from '../../../../ead/cupons/coupons-management.service';
import type { SaveEadCouponInput } from '../../../../ead/cupons/coupons-management.types';
import { cuponsEadKeys } from '../cupons-ead.keys';

export function useSaveCupomEad(poloId: string, contextId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveEadCouponInput) => {
      if (input.poloId !== poloId) throw new Error('O polo mudou. Abra o formulário novamente.');
      return eadCouponsManagementService.save(input);
    },
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cuponsEadKeys.scope(poloId, contextId) }),
    onError: () => queryClient.invalidateQueries({ queryKey: cuponsEadKeys.scope(poloId, contextId) }),
  });
}

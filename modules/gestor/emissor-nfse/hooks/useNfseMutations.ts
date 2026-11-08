import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';
import { nfseService } from '../services/nfse.service';
export { useSaveNfseModel } from '../modelos/hooks/useNfseModels';
import { NfseAccessError } from '../services/nfse.errors';
import type {
  NfseCapabilities, NfseConfigurationInput, NfsePrepareInput, NfseScope,
} from '../types/nfse.types';

function useNfseMutation<T>(scope: NfseScope | null, mutation: (captured: NfseScope, input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      if (!scope) throw new NfseAccessError();
      const captured = { ...scope };
      return { result: await mutation(captured, input), scope: captured };
    },
    retry: false,
    onSuccess: ({ scope: completedScope }) => client.invalidateQueries({ queryKey: nfseQueryKeys.scope(completedScope) }),
  });
}

export function usePrepareNfseBatch(scope: NfseScope | null, capabilities?: NfseCapabilities) {
  return useNfseMutation<NfsePrepareInput>(scope, (captured, input) => nfseService.prepare(captured, input, capabilities?.prepare === true));
}

export function useSaveNfseConfiguration(scope: NfseScope | null, canManage = false) {
  return useNfseMutation<NfseConfigurationInput>(scope, (captured, input) => nfseService.saveConfiguration(captured, input, canManage));
}

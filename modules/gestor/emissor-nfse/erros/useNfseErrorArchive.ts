import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../types/nfse.types';
import { createNfseErrorArchiveService, type NfseErrorArchiveInput } from './nfse-error-archive.contract';
import { mapNfseTransportError } from '../services/nfse.errors';
import { invalidateNfseCache } from '../queries/nfse-cache';

const save = createNfseErrorArchiveService(async (name, args) => {
  const { supabase } = await import('../../../../lib/supabase');
  const result = await supabase.rpc(name, args);
  if (result.error) throw mapNfseTransportError(result.error);
  return result.data;
});
export function useNfseErrorArchive(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (input: NfseErrorArchiveInput) => {
    if (!scope) throw new Error('Selecione o estabelecimento antes de atualizar a lista.');
    const captured = { ...scope };
    return { result: await save(captured, input), scope: captured };
  }, onSuccess: ({ scope: captured }) => invalidateNfseCache(client, captured, 'operations') });
}

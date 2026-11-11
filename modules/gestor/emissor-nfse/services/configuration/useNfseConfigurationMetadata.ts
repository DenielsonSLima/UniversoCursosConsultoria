import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { NfseAccessError } from '../nfse.errors';
import { nfseConfigurationService } from './configuration.service';
import { invalidateNfseCache, nfseMetadataKeys } from '../../queries/nfse-cache';
import type { SaveNfseConfigurationMetadata } from './configuration.types';

const key = nfseMetadataKeys.configuration;

export function useNfseConfigurationMetadata(scope: NfseScope) {
  return useQuery({queryKey:[...key(scope),scope.month],enabled:isNfseScopeValid(scope),retry:false,
    staleTime:30_000,gcTime:0,refetchOnWindowFocus:true,refetchOnReconnect:true,
    queryFn:({signal})=>nfseConfigurationService.get(scope,signal)});
}

export function useSaveNfseConfigurationMetadata(scope: NfseScope) {
  const client=useQueryClient();
  return useMutation({retry:false,mutationFn:async(input: SaveNfseConfigurationMetadata)=>{
    if (!isNfseScopeValid(scope)) throw new NfseAccessError();
    const captured={...scope};
    return {result:await nfseConfigurationService.save(captured,input),scope:captured};
  },onSuccess:({scope:captured})=>invalidateNfseCache(client,captured,'configuration')});
}

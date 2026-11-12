import type { QueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../types/nfse.types';
import { nfseQueryKeys } from './nfse.queryKeys';
import { nfseQueueKeys } from '../fila/nfse-queue.types';
import { nfseModelsKeys } from '../modelos/queries/nfse-models.keys';
import { nfsePartnerServicesKeys } from '../parceiros/queries/nfse-partner-services.keys';
import { nfseStudentKeys } from '../preparar/queries/nfse-students.keys';

export type NfseCacheResource = 'operations' | 'models' | 'configuration' | 'cancellation-models' | 'services';
export const nfseMetadataKeys = {
  configuration: (s: NfseScope) => ['nfse-configuration-metadata', s.contextKey, s.poloId, s.environment] as const,
  numbering: (s: NfseScope) => ['nfse-numbering', 'v1', s.contextKey, s.poloId, s.environment] as const,
  cancellationModels: (s: NfseScope | null) => ['nfse-cancellation-models', 'v1', s?.contextKey, s?.poloId, s?.environment] as const,
  issuer: (s: NfseScope) => ['nfse', 'model-issuer', s.contextKey, s.poloId, s.environment] as const,
};

/** Only public RPC projections are invalidated. This never invokes a fiscal command. */
export function nfseCacheTargets(scope: NfseScope, resource: NfseCacheResource): readonly (readonly unknown[])[] {
  switch (resource) {
    case 'operations': return [nfseQueryKeys.scope(scope), nfseQueueKeys.scope(scope),
      nfsePartnerServicesKeys.scope(scope), nfseMetadataKeys.numbering(scope),
      nfseStudentKeys.authority({ contextId: scope.contextKey, poloId: scope.poloId, environment: scope.environment })];
    case 'models': return [nfseModelsKeys.scope(scope), nfseQueryKeys.workspace(scope),
      nfsePartnerServicesKeys.options(scope),
      ['nfse-fiscal-review', 'v1', scope.contextKey, scope.poloId, scope.environment, scope.month]];
    case 'configuration': return [nfseMetadataKeys.configuration(scope), nfseMetadataKeys.issuer(scope),
      nfseQueryKeys.scope(scope), nfseMetadataKeys.numbering(scope), nfseQueueKeys.scope(scope),
      ['nfse-fiscal-review', 'v1', scope.contextKey, scope.poloId, scope.environment, scope.month]];
    case 'cancellation-models': return [nfseMetadataKeys.cancellationModels(scope)];
    case 'services': return [nfsePartnerServicesKeys.scope(scope), nfseQueryKeys.workspace(scope)];
  }
}

export function invalidateNfseCache(client: QueryClient, scope: NfseScope, resource: NfseCacheResource) {
  return Promise.all(nfseCacheTargets(scope, resource).map(queryKey => client.invalidateQueries({ queryKey })));
}

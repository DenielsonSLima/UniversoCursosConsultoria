import type { NfseScope } from '../types/nfse.types';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';
import { nfseCacheTargets, type NfseCacheResource } from '../queries/nfse-cache';

export type NfseRealtimeResource = 'workspace' | 'candidates' | 'documents' | 'models' | 'configuration';
const resources = ['workspace', 'candidates', 'documents', 'models', 'configuration', 'cancellation-models', 'services'] as const;

/** Sanitized change hints only: fiscal snapshots and credentials never enter this channel. */
export function nfseRealtimeTargets(payload: unknown, scope: NfseScope): readonly (readonly unknown[])[] {
  if (!payload || typeof payload !== 'object' || !('new' in payload)) return [];
  const row = payload.new;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
  const event = row as Record<string, unknown>;
  const resource = event.resource;
  if (event.version !== 1 || event.polo_id !== scope.poloId || event.environment !== scope.environment
    || !resources.includes(resource as typeof resources[number])) return [];
  const global = resource === 'models' || resource === 'configuration' || resource === 'cancellation-models';
  if (event.month !== scope.month && !(global && event.month === null)) return [];
  if (global || resource === 'services') return nfseCacheTargets(scope, resource as NfseCacheResource);
  const target = [...nfseQueryKeys.scope(scope), event.resource] as const;
  return event.resource === 'workspace' ? [target] : [target, nfseQueryKeys.workspace(scope)];
}

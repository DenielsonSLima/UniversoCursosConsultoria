import type { NfseScope } from '../types/nfse.types';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';

export type NfseRealtimeResource = 'workspace' | 'candidates' | 'documents' | 'models' | 'configuration';
const resources: readonly NfseRealtimeResource[] = ['workspace', 'candidates', 'documents', 'models', 'configuration'];

/** Proposed sanitized event contract. No document payloads or global fallback. */
export function nfseRealtimeTargets(payload: unknown, scope: NfseScope): readonly (readonly unknown[])[] {
  if (!payload || typeof payload !== 'object' || !('new' in payload)) return [];
  const row = payload.new;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
  const event = row as Record<string, unknown>;
  if (event.version !== 1 || event.polo_id !== scope.poloId
    || event.environment !== scope.environment || event.month !== scope.month
    || !resources.includes(event.resource as NfseRealtimeResource)) return [];
  const target = [...nfseQueryKeys.scope(scope), event.resource] as const;
  return event.resource === 'workspace' ? [target] : [target, nfseQueryKeys.workspace(scope)];
}

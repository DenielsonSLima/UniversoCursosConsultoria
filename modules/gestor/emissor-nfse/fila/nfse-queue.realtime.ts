import type { NfseScope } from '../types/nfse.types';
import { nfseCacheTargets, nfseMetadataKeys } from '../queries/nfse-cache';
import { nfseStudentKeys } from '../preparar/queries/nfse-students.keys';

export function nfseQueueRealtimeTargets(payload: unknown, scope: NfseScope): readonly (readonly unknown[])[] {
  if (!payload || typeof payload !== 'object' || !('new' in payload)) return [];
  const row = payload.new;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
  const event = row as Record<string, unknown>;
  if (event.version !== 1 || event.polo_id !== scope.poloId || event.environment !== scope.environment
    || typeof event.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.month)) return [];
  return event.month === scope.month ? nfseCacheTargets(scope, 'operations') : [nfseMetadataKeys.numbering(scope),
    nfseStudentKeys.authority({ contextId: scope.contextKey, poloId: scope.poloId, environment: scope.environment })];
}

export function isNfseQueueEvent(payload: unknown, scope: NfseScope): boolean {
  if (!payload || typeof payload !== 'object' || !('new' in payload)) return false;
  const event = payload.new;
  if (!event || typeof event !== 'object') return false;
  const row = event as Record<string, unknown>;
  return row.version === 1 && row.polo_id === scope.poloId
    && row.environment === scope.environment && row.month === scope.month;
}

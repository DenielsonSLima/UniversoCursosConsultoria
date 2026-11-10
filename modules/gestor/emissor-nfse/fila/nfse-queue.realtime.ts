import type { NfseScope } from '../types/nfse.types';

export function isNfseQueueEvent(payload: unknown, scope: NfseScope): boolean {
  if (!payload || typeof payload !== 'object' || !('new' in payload)) return false;
  const event = payload.new;
  if (!event || typeof event !== 'object') return false;
  const row = event as Record<string, unknown>;
  return row.version === 1 && row.polo_id === scope.poloId
    && row.environment === scope.environment && row.month === scope.month;
}

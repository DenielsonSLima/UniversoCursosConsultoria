import type { NfseScope } from '../../../emissor-nfse/types/nfse.types';
import type { NfseRpcTransport } from '../../../emissor-nfse/services/nfse.service-core';
import { NfseContractError } from '../../../emissor-nfse/services/nfse.errors';
import { assertScope, oneOf, record, string, unwrapNfseEnvelope } from '../../../emissor-nfse/services/nfse.validation';

export interface NfseNumbering {
  checkedAt: string;
  lastAuthorized: { number: string; authorizedAt: string; state: 'AUTHORIZED' | 'CANCELLED' } | null;
  dps: { series: string; lastAllocated: string | null; nextNumber: string | null;
    nextNumberIsEstimate: true; allocatorScope: 'SHARED_DATABASE_IDENTITY' } | null;
}
export interface NfseNumberingService { get(scope: NfseScope, signal?: AbortSignal): Promise<NfseNumbering> }
const code = (value: unknown, pattern: RegExp) => {
  const result = string(value);
  if (!pattern.test(result)) throw new NfseContractError();
  return result;
};
const timestamp = (value: unknown) => {
  const result = string(value);
  if (result.length > 40 || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) throw new NfseContractError();
  return result;
};
export function parseNfseNumbering(value: unknown): NfseNumbering {
  const row = record(value), authorized = row.lastAuthorized === null ? null : record(row.lastAuthorized), dps = row.dps === null ? null : record(row.dps);
  if (dps && (dps.nextNumberIsEstimate !== true || dps.allocatorScope !== 'SHARED_DATABASE_IDENTITY')) throw new NfseContractError();
  return { checkedAt: timestamp(row.checkedAt), lastAuthorized: authorized ? {
    number: code(authorized.number, /^[1-9][0-9]{0,12}$/), authorizedAt: timestamp(authorized.authorizedAt), state: oneOf(authorized.state, ['AUTHORIZED', 'CANCELLED']),
  } : null, dps: dps ? { series: code(dps.series, /^[1-9][0-9]{0,4}$/),
    lastAllocated: dps.lastAllocated === null ? null : code(dps.lastAllocated, /^[1-9][0-9]{0,14}$/),
    nextNumber: dps.nextNumber === null ? null : code(dps.nextNumber, /^[1-9][0-9]{0,14}$/),
    nextNumberIsEstimate: true, allocatorScope: 'SHARED_DATABASE_IDENTITY' } : null };
}
export function createNfseNumberingService(transport: NfseRpcTransport): NfseNumberingService {
  return { async get(scope, signal) {
    assertScope(scope); code(scope.contextKey, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const captured = { ...scope };
    const value = await transport('get_nfse_numbering_secure', { p_context_key: captured.contextKey, p_polo_id: captured.poloId,
      p_environment: captured.environment, p_month: captured.month }, signal);
    return parseNfseNumbering(unwrapNfseEnvelope(value, captured));
  } };
}

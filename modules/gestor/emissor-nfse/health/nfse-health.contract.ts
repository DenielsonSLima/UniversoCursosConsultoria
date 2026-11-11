import type { NfseScope } from '../types/nfse.types';

export interface NfseHealthObservation {
  state: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  reason: 'NATIONAL_QUERY_OK' | 'NATIONAL_QUERY_ERROR' | 'NO_REFERENCE' | 'VERIFICATION_UNCONFIRMED';
  checkedAt: string;
  expiresAt: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function parseNfseHealth(value: unknown, scope: NfseScope): NfseHealthObservation {
  if (!object(value) || value.version !== 1 || !object(value.scope) || !object(value.data)) throw new Error('Verificação indisponível.');
  const responseScope = value.scope;
  if (Object.entries(scope).some(([key, expected]) => responseScope[key] !== expected)) throw new Error('Verificação indisponível.');
  const data = value.data;
  const validReason = data.state === 'AVAILABLE' ? data.reason === 'NATIONAL_QUERY_OK'
    : data.state === 'UNAVAILABLE' ? data.reason === 'NATIONAL_QUERY_ERROR'
      : data.state === 'UNKNOWN' && ['NO_REFERENCE', 'VERIFICATION_UNCONFIRMED'].includes(String(data.reason));
  if (!validReason || typeof data.checkedAt !== 'string' || typeof data.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(data.checkedAt)) || Date.parse(data.expiresAt) - Date.parse(data.checkedAt) !== 60_000) {
    throw new Error('Verificação indisponível.');
  }
  return { state: data.state, reason: data.reason, checkedAt: data.checkedAt, expiresAt: data.expiresAt } as NfseHealthObservation;
}

export function isNfseHealthFresh(value: NfseHealthObservation, now = Date.now()) {
  return Date.parse(value.checkedAt) <= now + 5_000 && Date.parse(value.expiresAt) > now;
}

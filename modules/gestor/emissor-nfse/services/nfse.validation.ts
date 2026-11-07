import type { NfseScope } from '../types/nfse.types';
import { isNfseScopeValid } from '../types/nfse.scope';
import { NfseContractError } from './nfse.errors';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NfseContractError();
  return value as Record<string, unknown>;
}

export function string(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 10000) {
    throw new NfseContractError();
  }
  return value;
}

export const nullableString = (value: unknown) => value === null ? null : string(value);

export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new NfseContractError();
  return value;
}

export function integer(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new NfseContractError();
  return value;
}

export const nullableInteger = (value: unknown) => value === null ? null : integer(value);

export function money(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,17})\.\d{2}$/.test(value)) {
    throw new NfseContractError();
  }
  return value;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new NfseContractError();
  return value as T;
}

export function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 500) throw new NfseContractError();
  return value.map(parse);
}

export function assertScope(scope: NfseScope): void {
  if (!isNfseScopeValid(scope)) throw new NfseContractError();
}

export function unwrapNfseEnvelope(value: unknown, expected: NfseScope): unknown {
  assertScope(expected);
  const envelope = record(value);
  const scope = record(envelope.scope);
  if (envelope.version !== 1
    || scope.poloId !== expected.poloId || scope.contextKey !== expected.contextKey
    || scope.environment !== expected.environment || scope.month !== expected.month) {
    throw new NfseContractError();
  }
  return envelope.data;
}

export function assertUniqueIds(rows: { id: string }[]): void {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new NfseContractError();
}

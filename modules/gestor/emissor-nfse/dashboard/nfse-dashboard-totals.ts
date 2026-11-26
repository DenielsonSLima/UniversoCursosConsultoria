import { NfseContractError } from '../services/nfse.errors';
import type { NfseScope } from '../types/nfse.types';

export interface NfseDashboardTotals {
  totalAmount: string | null;
  byPolo: { poloId: string; poloName: string; amount: string | null }[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NfseContractError();
  return value as Record<string, unknown>;
}

function amount(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && /^(0|[1-9]\d{0,27})\.\d{2}$/.test(value)) return value;
  throw new NfseContractError();
}

export function parseNfseDashboardTotals(value: unknown, expected: NfseScope): NfseDashboardTotals {
  const result = record(value);
  const scope = record(result.scope);
  if (result.version !== 1 || scope.contextKey !== expected.contextKey || scope.poloId !== expected.poloId
    || scope.environment !== expected.environment || scope.month !== expected.month) throw new NfseContractError();
  const { totalAmount, byPolo } = record(result.data);
  if (!Array.isArray(byPolo) || !byPolo.length) throw new NfseContractError();
  const seen = new Set();
  const units = byPolo.map(value => {
    const { poloId, poloName, amount: unitAmount } = record(value);
    if (typeof poloId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(poloId)
      || seen.has(poloId) || typeof poloName !== 'string' || !poloName.trim()) throw new NfseContractError();
    seen.add(poloId);
    return { poloId, poloName, amount: amount(unitAmount) };
  });
  if (!seen.has(expected.poloId)) throw new NfseContractError();
  return { totalAmount: amount(totalAmount), byPolo: units };
}

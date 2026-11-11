import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNfseHealth, isNfseHealthFresh } from './nfse-health.contract.ts';

const scope = { contextKey: 'synthetic-context', poloId: 'synthetic-polo', environment: 'PRODUCAO' as const, month: '2026-11' };
const now = Date.parse('2026-11-11T12:00:00Z');
const data = { state: 'AVAILABLE', reason: 'NATIONAL_QUERY_OK', checkedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 60_000).toISOString() };

test('national health parser validates scope, state/reason and bounded validity', () => {
  const valid = parseNfseHealth({ version: 1, scope, data }, scope);
  assert.equal(isNfseHealthFresh(valid, now), true);
  assert.equal(isNfseHealthFresh(valid, now + 60_000), false);
  assert.equal(isNfseHealthFresh(valid, now - 5_001), false);
  for (const change of [{contextKey:'other'},{poloId:'other'},{environment:'HOMOLOGACAO'},{month:'2026-10'}]) {
    assert.throws(() => parseNfseHealth({ version: 1, scope: { ...scope, ...change }, data }, scope));
  }
  for (const change of [{state:'UNKNOWN'},{reason:'NO_REFERENCE'},{checkedAt:'invalid'},
    {expiresAt:new Date(now + 120_000).toISOString()}]) {
    assert.throws(() => parseNfseHealth({ version: 1, scope, data: { ...data, ...change } }, scope));
  }
  for (const value of [null, [], { version: 1, scope }, { version: 2, scope, data }]) {
    assert.throws(() => parseNfseHealth(value, scope));
  }
});

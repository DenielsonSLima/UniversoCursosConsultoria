import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../../../emissor-nfse/types/nfse.types';
import { NfseContractError } from '../../../emissor-nfse/services/nfse.errors';
import { createNfseNumberingService, parseNfseNumbering } from './nfse-numbering.contract';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
const data = { checkedAt: '2026-11-11T00:00:00Z', lastAuthorized: { number: '123', authorizedAt: '2026-11-10T20:00:00Z', state: 'CANCELLED' },
  dps: { series: '49998', lastAllocated: '2', nextNumber: '10', nextNumberIsEstimate: true, allocatorScope: 'SHARED_DATABASE_IDENTITY' } };

test('numbering reads only the authorized scoped RPC and never allocates or accepts a client counter', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const service = createNfseNumberingService(async (name, args) => { calls.push({ name, args }); return { version: 1, scope, data }; });
  assert.deepEqual(await service.get(scope), data);
  assert.deepEqual(calls, [{ name: 'get_nfse_numbering_secure', args: { p_context_key: id(1), p_polo_id: id(2), p_environment: 'PRODUCAO', p_month: '2026-11' } }]);
  assert(!/nextval|setval|requestId|counter|nextNumber/.test(JSON.stringify(calls)));
});

test('numbering keeps cancellation history and exact server strings; a DPS allocation is distinct from authorization', () => {
  const parsed = parseNfseNumbering({ ...data, privateKey: 'SECRET', dps: { ...data.dps, lastAllocated: '999999999999998', nextNumber: '999999999999999' } });
  assert.equal(parsed.lastAuthorized?.state, 'CANCELLED'); assert.equal(parsed.lastAuthorized?.number, '123');
  assert.equal(parsed.dps?.lastAllocated, '999999999999998'); assert.equal(parsed.dps?.nextNumber, '999999999999999');
  assert.equal('privateKey' in parsed, false);
  assert.equal(parseNfseNumbering({ ...data, lastAuthorized: null }).lastAuthorized, null);
  assert.equal(parseNfseNumbering({ ...data, lastAuthorized: null, dps: null }).dps, null);
  assert.equal(parseNfseNumbering({ ...data, dps: { ...data.dps, lastAllocated: null, nextNumber: null } }).dps?.nextNumber, null);
});

test('numbering rejects invented reservation guarantees, malformed numbers and crossed environments', async () => {
  for (const change of [{ nextNumberIsEstimate: false }, { allocatorScope: 'POLO_ONLY' }, { nextNumber: 10 }, { lastAllocated: '1e3' }, { series: '' }]) {
    assert.throws(() => parseNfseNumbering({ ...data, dps: { ...data.dps, ...change } }), NfseContractError);
  }
  assert.throws(() => parseNfseNumbering({ ...data, lastAuthorized: { ...data.lastAuthorized, state: 'REJECTED' } }), NfseContractError);
  const crossed = createNfseNumberingService(async () => ({ version: 1, scope: { ...scope, environment: 'HOMOLOGACAO' }, data }));
  await assert.rejects(crossed.get(scope), NfseContractError);
});

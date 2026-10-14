import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCancellationRequest } from './contract.ts';
import { processCancellationBatch, processCancellationItem } from './processor.ts';
import type { CancellationStore, Claim } from './store.ts';
import type { BankCancellation, CancellationBank } from './bank.ts';

const OP = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const ID2 = '44444444-4444-4444-8444-444444444444';
const LEASE = '33333333-3333-4333-8333-333333333333';
const bankResult = (alreadyCanceled = false): BankCancellation => ({
  convenio: '123', nossoNumero: '123456789', situationCode: 5, remoteStatus: 'CANCELED',
  alreadyCanceled, mutationAttempted: !alreadyCanceled, pixAvailable: false,
  pixPayload: null, pixEncodedImage: null, raw: {},
});
const harness = (mode: Claim['mode'] = 'CANCEL_ALLOWED') => {
  const calls: string[] = [];
  const evidence: unknown[] = [];
  const store: CancellationStore = {
    claim: async (_operation, id) => {
      calls.push('claim');
      return { mode, leaseToken: LEASE, receivable: { id, gateway_boleto_convenio: '123', gateway_boleto_nosso_numero: '123456789' } };
    },
    start: async () => { calls.push('start'); },
    complete: async (_op, _id, _lease, proof) => { calls.push('complete'); evidence.push(proof); },
    review: async (_op, _id, _lease, reason) => { calls.push(`review:${reason}`); },
  };
  const bank: CancellationBank = async (_claim, start) => {
    calls.push('bank-get'); await start(); calls.push('bank-put'); calls.push('bank-get-confirm');
    return bankResult();
  };
  return { calls, evidence, store, bank };
};

test('request bounds exact unique targets and immutable reason', () => {
  assert.deepEqual(parseCancellationRequest({ idempotencyKey: OP, receivableIds: [ID2, ID], reason: ' Emissão errada ' }), {
    idempotencyKey: OP, receivableIds: [ID, ID2], reason: 'Emissão errada',
  });
  for (const receivableIds of [[], [ID, ID], [ID, 'not-an-id'], Array.from({ length: 26 }, () => ID)]) {
    assert.throws(() => parseCancellationRequest({ idempotencyKey: OP, receivableIds, reason: 'Emissão errada' }));
  }
  assert.throws(() => parseCancellationRequest({ idempotencyKey: OP, receivableIds: [ID], reason: 'erro' }));
  assert.throws(() => parseCancellationRequest({ idempotencyKey: OP, receivableIds: [ID], reason: 'erro confirmado', actor: ID }));
});

test('durable intent precedes bank PUT and confirmed GET precedes local cancellation', async () => {
  const h = harness();
  assert.equal((await processCancellationItem(OP, ID, h)).status, 'CANCELED');
  assert.deepEqual(h.calls, ['claim', 'bank-get', 'start', 'bank-put', 'bank-get-confirm', 'complete']);
  assert.match((h.evidence[0] as any).evidenceFingerprint, /^[a-f0-9]{64}$/);
  assert.equal((h.evidence[0] as any).paymentsCount, 0);
});

test('local cancellation does not call bank or manufacture remote intent', async () => {
  const h = harness('LOCAL');
  assert.equal((await processCancellationItem(OP, ID, h)).status, 'CANCELED');
  assert.deepEqual(h.calls, ['claim', 'complete']);
  assert.equal((h.evidence[0] as any).remoteStatus, 'LOCAL');
});

test('completed and busy replays never touch bank or local receivable', async () => {
  for (const [mode, expected] of [['COMPLETE', 'CANCELED'], ['BUSY', 'PROCESSING']] as const) {
    const h = harness(mode);
    assert.equal((await processCancellationItem(OP, ID, h)).status, expected);
    assert.deepEqual(h.calls, ['claim']);
  }
});

test('payment, missing payment query and inconsistent identity block local completion', async () => {
  for (const message of ['PAID', 'PARTIAL_PAID', 'PAYMENTS_QUERY_FAILED', 'IDENTITY_MISMATCH']) {
    const h = harness();
    h.bank = async () => { throw new Error(message); };
    assert.equal((await processCancellationItem(OP, ID, h)).status, 'REVIEW_REQUIRED');
    assert.deepEqual(h.calls, ['claim', 'review:REMOTE_PREFLIGHT_ERROR']);
  }
});

test('failed durable intent prevents remote PUT', async () => {
  const h = harness();
  h.store.start = async () => { throw new Error('CAS_CHANGED'); };
  assert.equal((await processCancellationItem(OP, ID, h)).status, 'REVIEW_REQUIRED');
  assert.deepEqual(h.calls, ['claim', 'bank-get', 'review:REMOTE_PREFLIGHT_ERROR']);
});

test('timeout after bank PUT retains ambiguous state without local cancellation', async () => {
  const h = harness();
  h.bank = async (_claim, start) => { await start(); throw new Error('TIMEOUT'); };
  assert.equal((await processCancellationItem(OP, ID, h)).status, 'REVIEW_REQUIRED');
  assert.deepEqual(h.calls, ['claim', 'start', 'review:REMOTE_AMBIGUOUS']);
});

test('confirmed cancellation with local CAS failure is reported as pending reconciliation', async () => {
  const h = harness();
  h.store.complete = async () => { h.calls.push('complete'); throw new Error('CAS_CHANGED'); };
  const result = await processCancellationItem(OP, ID, h);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.match(result.message!, /banco confirmou/);
  assert.equal(h.calls.at(-1), 'review:LOCAL_SYNC_AFTER_REMOTE');
});

test('retry confirm-only cannot authorize a fresh PUT', async () => {
  const h = harness('CONFIRM_ONLY');
  assert.equal((await processCancellationItem(OP, ID, h)).status, 'REVIEW_REQUIRED');
  assert.deepEqual(h.calls, ['claim', 'bank-get', 'review:REMOTE_AMBIGUOUS']);
  h.calls.length = 0;
  h.bank = async () => bankResult(true);
  assert.equal((await processCancellationItem(OP, ID, h)).status, 'CANCELED');
  assert.deepEqual(h.calls, ['claim', 'complete']);
});

test('different bank title, false terminal acknowledgement or malformed claim never complete', async () => {
  for (const patch of [
    { nossoNumero: '987654321' }, { convenio: '999' }, { remoteStatus: 'PENDING' },
    { situationCode: 2 }, { mutationAttempted: false }, { alreadyCanceled: true },
  ]) {
    const h = harness();
    h.bank = async (_claim, start) => { await start(); return { ...bankResult(), ...patch }; };
    assert.equal((await processCancellationItem(OP, ID, h)).status, 'REVIEW_REQUIRED');
    assert.equal(h.calls.includes('complete'), false);
  }
  const h = harness();
  h.store.claim = async () => ({ mode: 'CANCEL_ALLOWED', leaseToken: LEASE, receivable: { id: ID2 } });
  assert.equal((await processCancellationItem(OP, ID, h)).status, 'FAILED');
  assert.deepEqual(h.calls, []);
});

test('batch preserves separate outcomes and continues after a blocked target', async () => {
  const h = harness();
  const original = h.store.claim;
  h.store.claim = async (op, id) => { if (id === ID) throw new Error('PAID'); return await original(op, id); };
  const result = await processCancellationBatch(OP, [ID, ID2], h);
  assert.deepEqual(result.results.map(r => r.status), ['FAILED', 'CANCELED']);
  assert.equal(result.operationId, OP);
});

test('batch deadline leaves unclaimed items resumable, never marks them canceled', async () => {
  const h = harness(); let time = 0;
  const result = await processCancellationBatch(OP, [ID, ID2], { ...h, clock: () => { time += 50_000; return time; } });
  assert.deepEqual(result.results.map(r => r.status), ['CANCELED', 'PROCESSING']);
  assert.equal(h.calls.filter(v => v === 'claim').length, 1);
});

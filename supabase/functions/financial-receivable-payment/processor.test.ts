import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processReceipt } from './processor.ts';
import type { Claim, PaymentStore } from './store.ts';
import type { ReceiptBank } from './bank.ts';
const ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const LEASE = '33333333-3333-4333-8333-333333333333';
const result = { success: true, paymentId: ATTEMPT, replayed: false,
  preview: { originalAmount: '200.00', paymentAmount: '100.00', remainingAfter: '100.00', status: 'PENDENTE' } };
function harness(mode: Claim['mode'] = 'CANCEL_ALLOWED') {
  const calls: string[] = [];
  const claim: Claim = { mode, leaseToken: LEASE, receivable: {
    id: ID, gateway_boleto_convenio: '123', gateway_boleto_nosso_numero: '123456789',
  }, result };
  const store: PaymentStore = {
    claim: async () => { calls.push('claim'); return claim; },
    start: async () => { calls.push('start'); },
    complete: async (_id, _lease, proof) => {
      calls.push('complete'); assert.equal(proof.paymentsCount, 0); return result;
    },
    review: async (_id, _lease, reason) => { calls.push(reason); },
  };
  const bank: ReceiptBank = async (_claim, start) => {
    calls.push('get');
    if (mode !== 'CONFIRM_ONLY') { await start(); calls.push('put'); }
    calls.push('confirm');
    return { convenio: '123', nossoNumero: '123456789', situationCode: 5, remoteStatus: 'CANCELED',
      alreadyCanceled: mode === 'CONFIRM_ONLY', mutationAttempted: mode !== 'CONFIRM_ONLY',
      pixAvailable: false, pixPayload: null, pixEncodedImage: null, raw: {} };
  };
  return { calls, claim, dependencies: { store, bank } };
}
test('partial bank receipt persists intent before PUT and ledger only after GET confirmation', async () => {
  const h = harness();
  assert.deepEqual(await processReceipt(ATTEMPT, ID, h.dependencies), result);
  assert.deepEqual(h.calls, ['claim', 'get', 'start', 'put', 'confirm', 'complete']);
});
test('local receipt never touches bank', async () => {
  const h = harness('LOCAL'); await processReceipt(ATTEMPT, ID, h.dependencies);
  assert.deepEqual(h.calls, ['claim', 'complete']);
});
test('completed replay and busy request cannot produce another payment', async () => {
  const h = harness('COMPLETE'); assert.deepEqual(await processReceipt(ATTEMPT, ID, h.dependencies), result);
  assert.deepEqual(h.calls, ['claim']);
  const busy = harness('BUSY'); await assert.rejects(processReceipt(ATTEMPT, ID, busy.dependencies));
  assert.deepEqual(busy.calls, ['claim']);
});
test('ambiguous prior PUT only confirms and never repeats mutation', async () => {
  const h = harness('CONFIRM_ONLY'); await processReceipt(ATTEMPT, ID, h.dependencies);
  assert.deepEqual(h.calls, ['claim', 'get', 'confirm', 'complete']);
  h.dependencies.bank = async (_claim, start) => { await start(); throw new Error('UNREACHABLE'); };
  await assert.rejects(processReceipt(ATTEMPT, ID, h.dependencies));
  assert.equal(h.calls.filter(x => x === 'start').length, 0);
});
test('failure persisting intent prevents PUT, failed confirmation prevents ledger append', async () => {
  const h = harness(); h.dependencies.store.start = async () => { throw new Error('database unavailable'); };
  await assert.rejects(processReceipt(ATTEMPT, ID, h.dependencies));
  assert.deepEqual(h.calls, ['claim', 'get', 'REMOTE_PREFLIGHT_ERROR']);
  const second = harness(); second.dependencies.bank = async (_claim, start) => { await start(); throw new Error('timeout'); };
  await assert.rejects(processReceipt(ATTEMPT, ID, second.dependencies));
  assert.deepEqual(second.calls, ['claim', 'start', 'REMOTE_AMBIGUOUS']);
});
test('wrong title claim and wrong bank identity cannot append', async () => {
  const h = harness(); h.claim.receivable!.id = ATTEMPT;
  await assert.rejects(processReceipt(ATTEMPT, ID, h.dependencies), /SCOPE_MISMATCH/);
  assert.deepEqual(h.calls, ['claim']);
  const second = harness(); const bank = second.dependencies.bank;
  second.dependencies.bank = async (claim, start) => ({ ...await bank(claim, start), nossoNumero: '999999999' });
  await assert.rejects(processReceipt(ATTEMPT, ID, second.dependencies));
  assert.equal(second.calls.includes('complete'), false);
});
test('bank confirmed and local append failed remains recoverable same intent', async () => {
  const h = harness(); h.dependencies.store.complete = async () => { throw new Error('rollback'); };
  await assert.rejects(processReceipt(ATTEMPT, ID, h.dependencies));
  assert.equal(h.calls.at(-1), 'LOCAL_SYNC_AFTER_REMOTE');
});

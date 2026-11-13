import assert from 'node:assert/strict';
import { retrySqlDeadlock } from '../_shared/sql-deadlock-retry.ts';
import { createPaymentStore, type PaymentEvidence } from './store.ts';
import { processReceipt } from './processor.ts';
import { createManualSettlementRepository } from '../asaas/api/manual-settlement.repository.ts';

const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const SOURCE = '11111111-1111-4111-8111-111111111111';
const LEASE = '33333333-3333-4333-8333-333333333333';
const result = { success: true, paymentId: ATTEMPT, settlementId: ATTEMPT,
  preview: { status: 'PAGO', remainingAfter: '0.00' } };
const evidence: PaymentEvidence = { remoteStatus: 'CANCELED', situationCode: 5,
  confirmedAt: '2026-11-13T10:00:00.000Z', evidenceFingerprint: 'a'.repeat(64),
  strictEffectivePayments: true, identityValidated: true, termsValidated: true,
  paymentsCount: 0, mutationAttempted: true, alreadyCanceled: false, convenio: '123', nossoNumero: '123456789' };
const completions = [
  { name: 'current receipt', rpc: 'complete_receivable_payment_service', parameters: {
    p_attempt_id: ATTEMPT, p_lease_token: LEASE, p_evidence: evidence,
  }, run: (admin: any) => createPaymentStore(admin).complete(ATTEMPT, LEASE, evidence) },
  { name: 'legacy settlement', rpc: 'finalize_receivable_manual_settlement', parameters: {
    p_settlement_id: ATTEMPT, p_lease_token: LEASE,
  }, run: (admin: any) => createManualSettlementRepository(admin).finalize(ATTEMPT, LEASE) },
];

for (const completion of completions) {
  Deno.test(`${completion.name}: one deadlock retries only the same completion with the same immutable payload`, async () => {
    const calls: unknown[] = [];
    const admin = { rpc: async (name: string, parameters: unknown) => {
      assert.equal(name, completion.rpc); calls.push(parameters);
      return calls.length === 1 ? { data: null, error: { code: '40P01', message: 'synthetic deadlock' } }
        : { data: result, error: null };
    } };
    assert.equal(await completion.run(admin), result);
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], completion.parameters);
    assert.strictEqual(calls[0], calls[1], 'The lease, request and evidence are captured once before SQL retry');
  });

  Deno.test(`${completion.name}: three deadlocks stop and preserve the original SQL error`, async () => {
    const error = { code: '40P01', message: 'synthetic deadlock exhausted' }; let calls = 0;
    await assert.rejects(completion.run({ rpc: async () => { calls++; return { data: null, error }; } }),
      caught => caught === error);
    assert.equal(calls, 3);
  });

  Deno.test(`${completion.name}: business, serialization, lock timeout and transport errors never retry`, async () => {
    for (const code of ['PT409', '40001', '55P03', '57014', '42501', 'PGRST003']) {
      const error = { code, message: '40P01 in a message is not a deadlock SQLSTATE' }; let calls = 0;
      await assert.rejects(completion.run({ rpc: async () => { calls++; return { data: null, error }; } }),
        caught => caught === error);
      assert.equal(calls, 1, code);
    }
    const error = new TypeError('synthetic transport failure'); let calls = 0;
    await assert.rejects(completion.run({ rpc: async () => { calls++; throw error; } }), caught => caught === error);
    assert.equal(calls, 1);
  });
}

Deno.test('the actual receipt processor calls the bank once even when final SQL deadlocks twice', async () => {
  const calls: string[] = []; let completionCount = 0; let bankCount = 0; let proof: unknown;
  const admin = { rpc: async (name: string, parameters: any) => {
    calls.push(name);
    if (name === 'claim_receivable_payment_service') return { data: { mode: 'CANCEL_ALLOWED', leaseToken: LEASE,
      receivable: { id: SOURCE, gateway_boleto_convenio: '123', gateway_boleto_nosso_numero: '123456789' } }, error: null };
    if (name === 'start_receivable_payment_service') return { data: { started: true }, error: null };
    assert.equal(name, 'complete_receivable_payment_service'); completionCount++;
    if (!proof) proof = parameters;
    assert.strictEqual(parameters, proof);
    return completionCount < 3 ? { data: null, error: { code: '40P01' } } : { data: result, error: null };
  } };
  assert.equal(await processReceipt(ATTEMPT, SOURCE, { store: createPaymentStore(admin), bank: async (_claim, start) => {
    bankCount++; await start();
    return { convenio: '123', nossoNumero: '123456789', situationCode: 5, remoteStatus: 'CANCELED',
      alreadyCanceled: false, mutationAttempted: true, pixAvailable: false, pixPayload: null, pixEncodedImage: null, raw: {} };
  } }), result);
  assert.equal(bankCount, 1); assert.equal(completionCount, 3);
  assert.equal(calls.filter(name => name === 'start_receivable_payment_service').length, 1);
  assert.equal(calls.filter(name => name === 'review_receivable_payment_service').length, 0);
});

Deno.test('the completion retry rejects a thrown transport error without treating it as a resolved SQL rollback', async () => {
  const error = Object.assign(new Error('unconfirmed client failure'), { code: '40P01' }); let calls = 0;
  await assert.rejects(retrySqlDeadlock(async () => { calls++; throw error; }), caught => caught === error);
  assert.equal(calls, 1);
});

Deno.test('review preserves deployed FAILED_SAFE only with the three explicit server confirmations and never retries', async () => {
  for (const [expected, data] of [
    [true, { reviewed: true, state: 'FAILED_SAFE', safeToEdit: true }],
    [false, { reviewed: false, state: 'FAILED_SAFE', safeToEdit: true }],
    [false, { reviewed: 'true', state: 'FAILED_SAFE', safeToEdit: true }],
    [false, { reviewed: true, state: 'REVIEW', safeToEdit: true }],
    [false, { reviewed: true, state: 'FAILED_SAFE', safeToEdit: 'true' }],
    [false, { reviewed: true, state: 'FAILED_SAFE' }], [false, null],
  ] as const) {
    let calls = 0;
    const store = createPaymentStore({ rpc: async (name, parameters) => {
      calls++; assert.equal(name, 'review_receivable_payment_service');
      assert.deepEqual(parameters, { p_attempt_id: ATTEMPT, p_lease_token: LEASE, p_reason: 'REMOTE_PREFLIGHT_ERROR' });
      return { data, error: null };
    } });
    assert.deepEqual(await store.review(ATTEMPT, LEASE, 'REMOTE_PREFLIGHT_ERROR'), { safeToEdit: expected });
    assert.equal(calls, 1);
  }
  let calls = 0;
  const store = createPaymentStore({ rpc: async () => { calls++; return { data: null, error: { code: '40P01' } }; } });
  await assert.rejects(store.review(ATTEMPT, LEASE, 'REMOTE_PREFLIGHT_ERROR'), /PAYMENT_STATE_NOT_CONFIRMED/);
  assert.equal(calls, 1, 'Review itself cannot retry; only final SQL completion is eligible');
});

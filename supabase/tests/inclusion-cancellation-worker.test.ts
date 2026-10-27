import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../functions/enrollment-inclusion-cancellation/worker.ts';
import { ACTION } from '../functions/enrollment-inclusion-cancellation/request.ts';
import { manifestCanonicalText, manifestFingerprint } from '../functions/enrollment-inclusion-cancellation/processor.ts';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const secret = 'synthetic-test-only-not-a-production-secret';
async function fixture() {
  const item = { receivableId: id(1), enrollmentId: id(2), classId: id(3),
    environment: 'sandbox' as const, convenio: '123', nossoNumero: '123456789',
    amountCents: 27990, dueDate: '2026-11-30', agency: '123',
    payerDocument: '00000000000', digitableLine: '1'.repeat(47), barcode: '2'.repeat(44),
    financialTerms: { discount: 0 } };
  const operationId = id(4); const fingerprint = await manifestFingerprint(operationId, [item]);
  const request = { action: ACTION, operationId, receivableId: item.receivableId, manifestFingerprint: fingerprint };
  const calls: string[] = []; const bankCalls: string[] = [];
  const responses: Record<string, unknown> = {
    get_banese_reconciliation_worker_secret: secret,
    load_inclusion_cancellation_service: { operationId, fingerprint,
      canonicalText: manifestCanonicalText(operationId, [item]),
      purpose: 'FINANCIAL_CORRECTION_CANCEL_ONLY', state: 'APPROVED', items: [item] },
    claim_inclusion_cancellation_service: { operationId, manifestFingerprint: fingerprint,
      item, leaseToken: id(5), mode: 'CANCEL_ALLOWED' },
    start_inclusion_cancellation_service: { started: true },
    complete_inclusion_cancellation_service: { completed: true },
    review_inclusion_cancellation_service: { reviewed: true },
  };
  const handler = createHandler({ getEnv: name => name === 'SUPABASE_URL' ? 'https://example.invalid' : 'synthetic-key',
    createAdmin: () => ({ rpc: async name => { calls.push(name); return { data: responses[name], error: null }; } }),
    createBank: () => ({
      cancel: async (_, input) => {
        bankCalls.push('GET'); await input.onMutationStart(); bankCalls.push('PUT', 'GET');
        return { convenio: item.convenio, nossoNumero: item.nossoNumero, situationCode: 5,
          remoteStatus: 'CANCELED', alreadyCanceled: false, mutationAttempted: true,
          raw: { CodigoSituacaoBoleto: 5 }, proof: { strictEffectivePayments: true,
            paymentsCount: 0, identityValidated: true, termsValidated: true } };
      },
      confirmOnly: async () => { throw new Error('Unexpected confirm-only test branch'); },
    }),
  });
  const invoke = (body: unknown = request, token = secret, method = 'POST') => handler(new Request(
    'https://example.invalid/enrollment-inclusion-cancellation', { method,
      headers: { 'X-Banese-Worker-Token': token },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    },
  ));
  return { invoke, request, responses, calls, bankCalls };
}

test('separate boundary executes exactly one approved item, no issuance or academic change', async () => {
  const f = await fixture(); const response = await f.invoke(); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.reissued, false); assert.equal(result.academicChanged, false);
  assert.deepEqual(f.bankCalls, ['GET', 'PUT', 'GET']);
  assert.deepEqual(f.calls, ['get_banese_reconciliation_worker_secret', 'load_inclusion_cancellation_service',
    'claim_inclusion_cancellation_service', 'start_inclusion_cancellation_service', 'complete_inclusion_cancellation_service']);
});
test('bad secret prevents even manifest lookup', async () => {
  const f = await fixture(); assert.equal((await f.invoke(f.request, 'wrong')).status, 401);
  assert.deepEqual(f.calls, ['get_banese_reconciliation_worker_secret']); assert.equal(f.bankCalls.length, 0);
});
test('missing secret fails closed', async () => {
  const f = await fixture(); f.responses.get_banese_reconciliation_worker_secret = null;
  assert.equal((await f.invoke()).status, 503); assert.equal(f.bankCalls.length, 0);
});
test('method does not authenticate or mutate', async () => {
  const f = await fixture(); assert.equal((await f.invoke(null, secret, 'GET')).status, 405); assert.equal(f.calls.length, 0);
});
test('legacy recovery/issuance action is rejected, not forwarded', async () => {
  const f = await fixture(); assert.equal((await f.invoke({ ...f.request, action: 'resume_existing_technical_cycle' })).status, 400);
  assert.equal(f.calls.length, 1); assert.equal(f.bankCalls.length, 0);
});
test('caller cannot provide actor, arbitrary target terms or another receipt list', async () => {
  for (const key of ['actorId', 'receivableIds', 'expectedDueDate']) {
    const f = await fixture(); assert.equal((await f.invoke({ ...f.request, [key]: 'forged' })).status, 400);
    assert.equal(f.calls.length, 1);
  }
});
test('invalid and oversized JSON never reaches manifest', async () => {
  for (const body of ['{', 'a'.repeat(1025), 'null', '[]']) {
    const f = await fixture(); assert.equal((await f.invoke(body)).status, 400); assert.equal(f.calls.length, 1);
  }
});
test('store failure is sanitized, no bank fallback', async () => {
  const f = await fixture(); f.responses.load_inclusion_cancellation_service = null;
  const response = await f.invoke(); assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'CORRECTION_STORE_GUARD_FAILED'); assert.equal(f.bankCalls.length, 0);
});
test('completed replay still authenticates but never calls bank', async () => {
  const f = await fixture(); (f.responses.claim_inclusion_cancellation_service as { mode: string }).mode = 'COMPLETE';
  const response = await f.invoke(); assert.equal(response.status, 200); assert.equal((await response.json()).replayed, true);
  assert.equal(f.bankCalls.length, 0); assert.equal(f.calls.length, 3);
});

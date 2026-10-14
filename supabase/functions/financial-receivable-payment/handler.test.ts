import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPaymentHandler } from './handler.ts';
import { parsePaymentRequest } from './contract.ts';
const ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const input = { requestId: ATTEMPT, sourceId: ID, paymentDate: '2026-10-14',
  components: [{ accountId: ID, method: 'DINHEIRO', amount: '100.00' }, { accountId: ATTEMPT, method: 'PIX', amount: '150.00' }],
  interest: '0.00', penalty: '0.00', addition: '0.00', discount: '0.00', notes: '', fingerprint: 'a'.repeat(32) };
const request = (body = input) => new Request('https://example.test', { method: 'POST',
  headers: { Authorization: 'Bearer verified-user-session', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function harness() {
  const calls: string[] = [];
  const dependencies = {
    createAdmin: () => ({}), authorize: async () => { calls.push('auth'); return { perfil: 'financeiro' } as any; },
    createUser: (authorization: string) => {
      assert.equal(authorization, 'Bearer verified-user-session');
      return { rpc: async (name: string, args: any) => {
        calls.push(name); assert.deepEqual(args, { p_source_id: ID, p_input: input });
        return { data: { attemptId: ATTEMPT, sourceId: ID }, error: null as unknown };
      } };
    },
    process: async () => { calls.push('process'); return { success: true, paymentId: ATTEMPT, preview: { status: 'PENDENTE' } }; },
    academic: async (_admin: any, _id: string, result: any) => result,
  };
  return { calls, dependencies };
}
test('verified JWT user SQL authorization precedes financial processing', async () => {
  const h = harness(); assert.equal((await createPaymentHandler(h.dependencies)(request())).status, 200);
  assert.deepEqual(h.calls, ['auth', 'begin_receivable_payment_secure', 'process']);
});
test('bad auth and SQL actor/polo/snapshot denial never process', async () => {
  const h = harness(); h.dependencies.authorize = async () => { throw new Error('Sessao invalida'); };
  assert.equal((await createPaymentHandler(h.dependencies)(request())).status, 401);
  assert.deepEqual(h.calls, []);
  const denied = harness(); denied.dependencies.createUser = () => ({ rpc: async () => ({ data: null as any, error: new Error('scope denied') }) });
  assert.equal((await createPaymentHandler(denied.dependencies)(request())).status, 409);
  assert.deepEqual(denied.calls, ['auth']);
});
test('different attempt or source returned by SQL fails closed', async () => {
  for (const changed of [{ attemptId: ID, sourceId: ID }, { attemptId: ATTEMPT, sourceId: ATTEMPT }]) {
    const h = harness(); h.dependencies.createUser = () => ({ rpc: async () => ({ data: changed, error: null }) });
    assert.equal((await createPaymentHandler(h.dependencies)(request())).status, 409);
    assert.deepEqual(h.calls, ['auth']);
  }
});
test('payload forwards exact components but strips actor, flags and evidence', () => {
  assert.deepEqual(parsePaymentRequest({ ...input, actorId: ID, allowRemoteCanceled: true, remoteEvidence: {} }), input);
  for (const amount of ['NaN', '1.001', '-1', '100,00', '1e3']) {
    assert.throws(() => parsePaymentRequest({ ...input, components: [{ ...input.components[0], amount }] }));
  }
});

test('only stale begin before any effect releases the immutable UI attempt', async () => {
  for (const code of ['PAYMENT_PREVIEW_CHANGED', 'PAYMENT_REQUEST_CONFLICT']) {
    const h = harness();
    h.dependencies.createUser = () => ({ rpc: async () => ({ data: null as any, error: new Error(code) }) });
    const response = await createPaymentHandler(h.dependencies)(request());
    assert.equal(response.status, 409);
    assert.equal((await response.json()).safeToEdit, code === 'PAYMENT_PREVIEW_CHANGED');
    assert.deepEqual(h.calls, ['auth']);
  }
});

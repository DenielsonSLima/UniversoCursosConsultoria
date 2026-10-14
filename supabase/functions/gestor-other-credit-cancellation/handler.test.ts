import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCancellationHandler } from './handler.ts';
import type { GestorAutorizado } from '../_shared/authz.ts';
import type { RpcClient } from './store.ts';

if (!('Deno' in globalThis)) Object.assign(globalThis, { Deno: { env: { get: () => undefined } } });
const OP = '11111111-1111-4111-8111-111111111111';
const OLD_OP = '44444444-4444-4444-8444-444444444444';
const ID = '22222222-2222-4222-8222-222222222222';
const actor: GestorAutorizado = {
  id: '33333333-3333-4333-8333-333333333333', email: 'synthetic@example.test',
  perfil: 'financeiro', status: 'ativo', context: null, isGlobal: true, poloId: null, poloIds: [],
  modules: ['financeiro'], financeiroTabs: ['outros-creditos'], tabs: {}, communicationSector: '',
  communicationPoloId: null, canViewAllCommunicationPolos: false, canViewAllCommunication: false,
};
const request = () => new Request('https://example.test', { method: 'POST',
  headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' },
  body: JSON.stringify({ idempotencyKey: OP, receivableIds: [ID], reason: 'Emissão incorreta' }),
});
const harness = () => {
  const calls: string[] = [];
  const dependencies = {
    createAdmin: () => ({}),
    authorize: async () => { calls.push('authorize'); return actor; },
    createUser: (authorization: string): RpcClient => {
      assert.equal(authorization, 'Bearer test-session');
      return { rpc: async (name: string, args: any) => {
        calls.push(name); assert.equal(args.p_request_id, OP);
        return { data: { operationId: OP, receivableIds: [ID] }, error: null as unknown };
      } };
    },
    process: async (operationId: string) => {
      calls.push('process'); return { operationId, results: [{ receivableId: ID, status: 'CANCELED' as const }] };
    },
  };
  return { calls, dependencies };
};

test('authentication, tab/profile and user SQL authorization precede any bank work', async () => {
  const h = harness(); const response = await createCancellationHandler(h.dependencies)(request());
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls, ['authorize', 'begin_other_credit_cancellation', 'process']);
});

test('invalid authentication or missing finance tab/profile never creates operation', async () => {
  for (const mutate of ['auth', 'tab', 'profile']) {
    const h = harness();
    h.dependencies.authorize = async () => {
      if (mutate === 'auth') throw new Error('Sessao invalida');
      return { ...actor, ...(mutate === 'tab' ? { financeiroTabs: [] } : { perfil: 'secretaria' }) };
    };
    const response = await createCancellationHandler(h.dependencies)(request());
    assert.ok([401, 403].includes(response.status)); assert.deepEqual(h.calls, []);
  }
});

test('SQL authorization/snapshot/replay failure never invokes processing', async () => {
  const h = harness();
  h.dependencies.createUser = () => ({ rpc: async () => ({ data: null, error: new Error('SCOPE_DENIED') }) });
  const response = await createCancellationHandler(h.dependencies)(request());
  assert.equal(response.status, 409); assert.deepEqual(h.calls, ['authorize']);
});

test('SQL returning different selection fails closed, including unrequested financial target', async () => {
  const h = harness();
  h.dependencies.createUser = () => ({ rpc: async () => ({ data: { operationId: OP, receivableIds: [OLD_OP] }, error: null }) });
  assert.equal((await createCancellationHandler(h.dependencies)(request())).status, 409);
  assert.deepEqual(h.calls, ['authorize']);
});

test('canonical previous operation from authorized retry resumes that ID', async () => {
  const h = harness();
  h.dependencies.createUser = () => ({ rpc: async () => ({ data: { operationId: OLD_OP, receivableIds: [ID] }, error: null }) });
  const response = await createCancellationHandler(h.dependencies)(request());
  assert.equal((await response.json()).operationId, OLD_OP);
});

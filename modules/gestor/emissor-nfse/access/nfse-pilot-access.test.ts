import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGestorPermissions } from '../../access-control';
import { canOpenGestorModule } from '../../gestor-module-access';
import {
  createNfseAccessReader, hasNfseAccessDecision, nfseAccessQueryKey,
} from './nfse-access.contract';

const identity = {
  authUserId: '11111111-1111-1111-1111-111111111111',
  contextId: '22222222-2222-2222-2222-222222222222',
};
const otherId = '33333333-3333-3333-3333-333333333333';

test('permissão editável não supera a recusa do gate piloto', () => {
  const permissions = normalizeGestorPermissions({
    modules: ['emissor-nfse', 'configuracoes', 'financeiro'], allPolos: true,
  });
  assert.equal(canOpenGestorModule('emissor-nfse', permissions, true, false), false);
  assert.equal(canOpenGestorModule('emissor-nfse', permissions, true, true), true);
  assert.equal(canOpenGestorModule('emissor-nfse', permissions, false, true), true);
  assert.equal(canOpenGestorModule('configuracoes', permissions, false, true), false);
  assert.equal(canOpenGestorModule('financeiro', permissions, true, false), true);
  assert.equal(canOpenGestorModule('emissor-nfse', normalizeGestorPermissions({ modules: [] }), true, true), false);
});

test('decisão e cache não atravessam usuário nem contexto', () => {
  const decision = { ...identity, allowed: true };
  assert.equal(hasNfseAccessDecision(decision, identity), true);
  assert.equal(hasNfseAccessDecision(decision, { ...identity, authUserId: otherId }), false);
  assert.equal(hasNfseAccessDecision(decision, { ...identity, contextId: otherId }), false);
  assert.equal(hasNfseAccessDecision({ ...identity, allowed: false }, identity), false);
  assert.equal(hasNfseAccessDecision(undefined, identity), false);
  assert.notDeepEqual(nfseAccessQueryKey(identity), nfseAccessQueryKey({ ...identity, authUserId: otherId }));
  assert.notDeepEqual(nfseAccessQueryKey(identity), nfseAccessQueryKey({ ...identity, contextId: otherId }));
});

test('identidade inválida ou diferente não chama a RPC', async () => {
  let calls = 0;
  const read = createNfseAccessReader({
    currentAuthUserId: async () => otherId,
    request: async () => { calls += 1; return true; },
  });
  await assert.rejects(read({ ...identity, contextId: 'invalido' }), /inválido/);
  await assert.rejects(read(identity), /sessão/);
  assert.equal(calls, 0);
});

test('RPC somente aceita booleano e propaga falha fechada', async () => {
  for (const invalid of ['true', 1, null, { allowed: true }, []]) {
    const read = createNfseAccessReader({
      currentAuthUserId: async () => identity.authUserId,
      request: async () => invalid,
    });
    await assert.rejects(read(identity), /inválida/);
  }
  const read = createNfseAccessReader({
    currentAuthUserId: async () => identity.authUserId,
    request: async () => { throw new Error('serviço indisponível'); },
  });
  await assert.rejects(read(identity), /indisponível/);
});

test('troca de sessão durante resposta não concede acesso', async () => {
  let calls = 0;
  const read = createNfseAccessReader({
    currentAuthUserId: async () => ++calls === 1 ? identity.authUserId : otherId,
    request: async () => true,
  });
  await assert.rejects(read(identity), /sessão/);
});

test('recusa e concessão preservam identidade validada', async () => {
  for (const allowed of [false, true]) {
    const read = createNfseAccessReader({
      currentAuthUserId: async () => identity.authUserId,
      request: async contextId => { assert.equal(contextId, identity.contextId); return allowed; },
    });
    assert.deepEqual(await read(identity), { ...identity, allowed });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { normalizeGestorPermissions } from '../../access-control';
import { canOpenGestorModule } from '../../gestor-module-access';
import {
  createNfseAccessReader, hasNfseAccessDecision, nfseAccessQueryKey, resolveNfsePilotAccessState,
} from './nfse-access.contract';

const identity = {
  authUserId: '11111111-1111-1111-1111-111111111111',
  contextId: '22222222-2222-2222-2222-222222222222',
};
const otherId = '33333333-3333-3333-3333-333333333333';

test('permissão da interface não supera recusa de autorização no servidor', () => {
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

test('foco revalida sem remover acesso; recusa e erro continuam bloqueando', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let resolve: (allowed: boolean) => void = () => {};
  let reject: (error: Error) => void = () => {};
  let calls = 0;
  const observer = new QueryObserver(client, {
    queryKey: nfseAccessQueryKey(identity), staleTime: 0, refetchOnWindowFocus: 'always',
    queryFn: async () => {
      calls += 1;
      const allowed = await new Promise<boolean>((accept, fail) => { resolve = accept; reject = fail; });
      return { ...identity, allowed };
    },
  });
  const state = () => resolveNfsePilotAccessState(identity, true, observer.getCurrentResult());
  const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 20 && !predicate(); attempt += 1) await new Promise(done => setTimeout(done, 0));
    assert.ok(predicate(), 'query did not reach the expected state');
  };
  client.mount();
  const unsubscribe = observer.subscribe(() => {});
  try {
    assert.deepEqual(state(), { allowed: false, isChecking: true });
    resolve(true);
    await waitFor(() => state().allowed);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await waitFor(() => calls === 2);
    assert.equal(observer.getCurrentResult().isFetching, true);
    assert.deepEqual(state(), { allowed: true, isChecking: false });
    resolve(false);
    await waitFor(() => !observer.getCurrentResult().isFetching);
    assert.deepEqual(state(), { allowed: false, isChecking: false });

    const accepted = observer.refetch();
    resolve(true);
    await accepted;
    assert.equal(state().allowed, true);
    const failed = observer.refetch();
    assert.deepEqual(state(), { allowed: true, isChecking: false });
    reject(new Error('serviço indisponível'));
    await failed;
    assert.equal(observer.getCurrentResult().data?.allowed, true, 'the stale decision remains in Query cache');
    assert.deepEqual(state(), { allowed: false, isChecking: false });
  } finally {
    unsubscribe(); client.unmount(); client.clear(); focusManager.setFocused(undefined);
  }
});

test('carregamento nunca preserva decisão de outra identidade nem de sessão inelegível', () => {
  const query = { data: { ...identity, allowed: true }, isFetching: true, isError: false };
  assert.deepEqual(resolveNfsePilotAccessState({ ...identity, authUserId: otherId }, true, query), { allowed: false, isChecking: true });
  assert.deepEqual(resolveNfsePilotAccessState({ ...identity, contextId: otherId }, true, query), { allowed: false, isChecking: true });
  assert.deepEqual(resolveNfsePilotAccessState(identity, false, query), { allowed: false, isChecking: false });
});

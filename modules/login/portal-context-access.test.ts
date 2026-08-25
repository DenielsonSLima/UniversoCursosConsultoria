import assert from 'node:assert/strict';
import test from 'node:test';
import type { User } from '@supabase/supabase-js';
import type { PortalAuthProfile } from './portal-session.ts';
import { resolvePortalContextAccess } from './portal-context-access.ts';

const AUTHENTICATED_USER = {
  id: 'f86ada0a-8ed2-461c-8326-4555b8a36a13',
  email: 'professor@example.test',
} as User;

const PROFESSOR_PROFILE: PortalAuthProfile = {
  id: '6a8af6e1-d14f-48a4-9827-0dfba879193a',
  contextId: '6a8af6e1-d14f-48a4-9827-0dfba879193a',
  nome: 'Professor Teste',
  email: 'professor@example.test',
  tipo: 'Professor',
  poloIds: ['0ae5eed3-9aad-4318-972c-fb7f1dc9bf3c'],
};

const authenticated = () => Promise.resolve({
  data: { user: AUTHENTICATED_USER },
  error: null,
});

test('timeout e falha de transporte da RPC são transitórios', async () => {
  const timeout = await resolvePortalContextAccess({
    role: 'Professor',
    timeoutMs: 5,
    getUser: () => new Promise(() => undefined),
    getProfile: () => Promise.resolve(PROFESSOR_PROFILE),
  });
  assert.equal(timeout.status, 'transient-error');

  const rpcFailure = await resolvePortalContextAccess({
    role: 'Professor',
    getUser: authenticated,
    getProfile: () => Promise.reject(new TypeError('Failed to fetch')),
  });
  assert.equal(rpcFailure.status, 'transient-error');
});

test('JWT inválido, perfil ausente e papel divergente permanecem fail-closed', async () => {
  const invalidJwt = await resolvePortalContextAccess({
    role: 'Professor',
    getUser: () => Promise.resolve({
      data: { user: null },
      error: { code: 'bad_jwt', status: 401, message: 'JWT inválido' },
    }),
    getProfile: () => Promise.resolve(PROFESSOR_PROFILE),
  });
  assert.equal(invalidJwt.status, 'unauthorized');

  const absentProfile = await resolvePortalContextAccess({
    role: 'Professor',
    getUser: authenticated,
    getProfile: () => Promise.resolve(null),
  });
  assert.equal(absentProfile.status, 'unauthorized');

  const wrongRole = await resolvePortalContextAccess({
    role: 'Professor',
    getUser: authenticated,
    getProfile: () => Promise.resolve({ ...PROFESSOR_PROFILE, tipo: 'Gestor' }),
  });
  assert.equal(wrongRole.status, 'unauthorized');
});

test('RPC sem identidade autenticada é falha definitiva mesmo sem status HTTP', async () => {
  const missingRpcIdentity = await resolvePortalContextAccess({
    role: 'Professor',
    getUser: authenticated,
    getProfile: () => Promise.reject({
      code: '42501',
      message: 'AUTENTICACAO_OBRIGATORIA',
    }),
  });

  assert.equal(missingRpcIdentity.status, 'unauthorized');
});

test('nova tentativa bem-sucedida hidrata somente o perfil autoritativo', async () => {
  let attempt = 0;
  const resolveAttempt = () => resolvePortalContextAccess({
    role: 'Professor',
    getUser: authenticated,
    getProfile: () => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('Network request failed'))
        : Promise.resolve(PROFESSOR_PROFILE);
    },
  });

  assert.equal((await resolveAttempt()).status, 'transient-error');
  const recovered = await resolveAttempt();
  assert.equal(recovered.status, 'authorized');
  if (recovered.status === 'authorized') {
    assert.equal(recovered.profile.contextId, PROFESSOR_PROFILE.contextId);
    assert.equal(recovered.profile.tipo, 'Professor');
  }
});

test('cancelamento na desmontagem encerra a hidratação sem produzir resultado de acesso', async () => {
  const controller = new globalThis.AbortController();
  let releaseProfile!: (profile: PortalAuthProfile) => void;
  let markProfileStarted!: () => void;
  const profileStarted = new Promise<void>((resolve) => {
    markProfileStarted = resolve;
  });
  const pendingProfile = new Promise<PortalAuthProfile>((resolve) => {
    releaseProfile = resolve;
  });

  const pendingResolution = resolvePortalContextAccess({
    role: 'Professor',
    signal: controller.signal,
    getUser: authenticated,
    getProfile: () => {
      markProfileStarted();
      return pendingProfile;
    },
  });
  await profileStarted;
  controller.abort();
  releaseProfile(PROFESSOR_PROFILE);

  assert.deepEqual(await pendingResolution, { status: 'cancelled' });
});

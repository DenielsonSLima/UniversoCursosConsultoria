import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function clock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) { timers.set(++id, { callback, at: now + delay }); return id; },
    clearTimeout(key) { timers.delete(key); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
    count: () => timers.size,
  };
}

function load(path, imports, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, AbortController, Error, Promise, setTimeout, clearTimeout,
    require(name) {
      assert.ok(name in imports, `import inesperado: ${name}`);
      return imports[name];
    },
    ...globals,
  });
  return module.exports;
}

function harness(options = {}) {
  const timers = clock();
  const deadline = load('./auth-request.ts', {}, timers);
  const calls = [];
  const auth = {
    initialize: options.initialize || (() => Promise.resolve({ error: null })),
    setSession: tokens => {
      calls.push(['commit', tokens]);
      return options.setSession?.(tokens) || Promise.resolve({ data: { user: { id: 'user' }, session: {} }, error: null });
    },
  };
  const { loginService } = load('./login.service.ts', {
    '../../lib/supabase': {
      supabase: { auth },
      requestPublicPortalAuth: async payload => {
        calls.push(['request', payload]);
        if (options.authResponse) return options.authResponse;
        return { data: { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' }, error: null };
      },
    },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => false } },
    '../../lib/app-url': {}, './portal-session': { clearPortalSession() {} },
    '../shared/auth/oauth-return-state': {},
    './portal-logout-flow': { performPortalLogout: options.logout || (() => Promise.resolve({ status: 'revoked' })) },
    './auth-request': deadline,
  });
  return { timers, deadline, calls, loginService };
}

const credentials = { email: 'synthetic@example.test', password: 'synthetic', turnstileToken: 'synthetic' };

test('prazo termina mesmo antes do fetch e aborta a operação sem repetição', async () => {
  const { timers, deadline } = harness();
  let signal;
  const request = deadline.withAuthDeadline(value => { signal = value; return new Promise(() => {}); });
  const rejected = assert.rejects(request, { code: 'AUTH_REQUEST_TIMEOUT' });
  timers.advance(15_000);
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(timers.count(), 0);
});

test('inicialização pendente não bloqueia portal-auth nem enfileira sessão após timeout', async () => {
  const initialization = deferred();
  const h = harness({ initialize: () => initialization.promise });
  const result = h.loginService.login(credentials);
  const rejected = assert.rejects(result, { code: 'AUTH_REQUEST_TIMEOUT' });
  await flush();
  assert.equal(h.calls[0][0], 'request');
  h.timers.advance(15_000);
  await rejected;
  initialization.resolve({ error: null });
  await flush();
  assert.equal(h.calls.filter(([name]) => name === 'commit').length, 0);
});

test('commit que excede prazo impede sessão velha de concorrer com nova tentativa', async () => {
  const pending = deferred();
  let attempt = 0;
  const h = harness({ setSession: () => ++attempt === 1 ? pending.promise : Promise.resolve({ data: { user: { id: 'new-user' }, session: {} }, error: null }) });
  const first = h.loginService.login(credentials);
  const rejected = assert.rejects(first, { code: 'AUTH_REQUEST_TIMEOUT' });
  await flush();
  h.timers.advance(15_000);
  await rejected;
  const blocked = await h.loginService.login(credentials);
  assert.equal(blocked.user, null);
  assert.ok(blocked.error);
  assert.equal(h.calls.filter(([name]) => name === 'request').length, 1);
  pending.resolve({ data: { user: { id: 'old-user' }, session: {} }, error: null });
  await flush();
  const next = await h.loginService.login(credentials);
  assert.equal(next.user.id, 'new-user');
  assert.equal(h.timers.count(), 0);
});

test('cancelamento durante initialize não grava nem devolve sessão tardia', async () => {
  const initialization = deferred();
  const h = harness({ initialize: () => initialization.promise });
  const controller = new AbortController();
  const result = h.loginService.login(credentials, controller.signal);
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await flush();
  controller.abort();
  await rejected;
  initialization.resolve({ error: null });
  await flush();
  assert.equal(h.calls.filter(([name]) => name === 'commit').length, 0);
});

test('logout lento termina feedback mas bloqueia novo login até revogação pendente encerrar', async () => {
  const pending = deferred();
  const h = harness({ logout: () => pending.promise });
  const result = h.loginService.logout();
  const rejected = assert.rejects(result, { code: 'AUTH_REQUEST_TIMEOUT' });
  h.timers.advance(15_000);
  await rejected;
  assert.ok((await h.loginService.login(credentials)).error);
  assert.throws(() => h.loginService.assertAuthMutationAvailable(), /temporariamente indisponível/);
  await assert.rejects(h.loginService.loginWithGoogle(), /temporariamente indisponível/);
  assert.equal(h.calls.length, 0);
  pending.resolve({ status: 'revoked' });
  await flush();
  assert.equal((await h.loginService.login(credentials)).user.id, 'user');
});

test('transporte público mantém challenge e usa somente chave pública, sem consultar sessão', async () => {
  const h = harness();
  const requests = [];
  const { createPortalAuthRequest } = load('../../lib/portal-auth-client.ts', {
    '@supabase/supabase-js': { FunctionsFetchError, FunctionsHttpError },
    '../modules/login/auth-request': h.deadline,
  }, {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json({ accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
    },
  });
  const send = createPortalAuthRequest('https://example.invalid', 'synthetic-public-key');
  const response = await send({ action: 'login', turnstileToken: 'synthetic-challenge' });
  assert.equal(response.error, null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer synthetic-public-key');
  assert.equal(JSON.parse(requests[0].options.body).turnstileToken, 'synthetic-challenge');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(h.timers.count(), 0);
});

test('falha 502 do gateway informa indisponibilidade em vez de culpar credenciais', async () => {
  const h = harness({ authResponse: {
    data: null,
    error: new FunctionsHttpError(Response.json({ message: 'upstream unavailable' }, { status: 502 })),
  } });
  const result = await h.loginService.login(credentials);
  assert.match(result.error, /temporariamente indisponível/);
  assert.equal(h.calls.filter(([name]) => name === 'commit').length, 0);
});

test('transporte público aborta fetch lento e não reenvia credenciais automaticamente', async () => {
  const h = harness();
  const requests = [];
  const { createPortalAuthRequest } = load('../../lib/portal-auth-client.ts', {
    '@supabase/supabase-js': { FunctionsFetchError, FunctionsHttpError },
    '../modules/login/auth-request': h.deadline,
  }, {
    fetch: (url, options) => {
      requests.push(options);
      return new Promise(() => {});
    },
  });
  const result = createPortalAuthRequest('https://example.invalid', 'sb_publishable_synthetic')({ action: 'login' });
  const rejected = assert.rejects(result, { code: 'AUTH_REQUEST_TIMEOUT' });
  h.timers.advance(15_000);
  await rejected;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[0].headers.Authorization, undefined);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Exercita o handler real com transporte em memória; nenhuma chamada remota.
const result = await build({
  entryPoints: ['supabase/functions/portal-auth/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  plugins: [{
    name: 'memory-supabase',
    setup(builder) {
      builder.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({
        path: 'supabase', namespace: 'memory',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'memory' }, () => ({
        contents: 'export const createClient = (...args) => globalThis.__portalTestClient(...args);',
        loader: 'js',
      }));
    },
  }],
});

const bundle = result.outputFiles[0].text;

test('portal-auth interrompe dependências indisponíveis e preserva proteção', async t => {
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  const originalTimeout = AbortSignal.timeout;
  const originalInfo = console.info;
  const originalError = console.error;
  let handler;
  let rpcCalls;
  let authCalls;
  let mode;
  let queryRetries;
  let querySignal;
  const pending = signal => new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  globalThis.Deno = {
    env: { get: name => ({
      SUPABASE_URL: 'https://project.example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      SUPABASE_ANON_KEY: 'test-public-key',
      TURNSTILE_SECRET_KEY: 'test-private-challenge-key',
    })[name] },
    serve: fn => { handler = fn; },
  };
  AbortSignal.timeout = milliseconds => originalTimeout.call(AbortSignal, milliseconds / 100);
  console.info = () => {};
  console.error = () => {};
  globalThis.__portalTestClient = () => ({
    rpc(name) {
      rpcCalls.push(name);
      return {
        retry(value) { queryRetries.push(value); return this; },
        abortSignal(signal) { querySignal = signal; return this; },
        then(resolve, reject) {
          const response = mode === 'database_timeout'
            ? pending(querySignal)
            : Promise.resolve({ data: [{ allowed: mode !== 'rate_limited' }], error: null });
          return response.then(resolve, reject);
        },
      };
    },
  });
  globalThis.fetch = async (input, options) => {
    if (String(input).includes('/siteverify')) {
      return Response.json({ success: true, hostname: 'universocc.com.br', action: 'login' });
    }
    assert.match(String(input), /\/auth\/v1\/token\?grant_type=password$/);
    authCalls++;
    if (mode === 'auth_timeout') return pending(options.signal);
    if (mode === 'auth_body_timeout') return {
      ok: true, status: 200, json: () => pending(options.signal),
    };
    if (mode === 'auth_unavailable') return Response.json({ error: 'unavailable' }, { status: 503 });
    return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh' });
  };
  const request = () => new Request('https://project.example.test/functions/v1/portal-auth', {
    method: 'POST',
    headers: { origin: 'https://universocc.com.br', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', identifier: 'test@example.test', password: 'test-only', turnstileToken: 'test-only' }),
  });
  const reset = nextMode => {
    mode = nextMode;
    rpcCalls = [];
    authCalls = 0;
    queryRetries = [];
  };
  try {
    await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`);
    await t.test('timeout do limitador falha fechado, uma consulta, nenhum Auth', async () => {
      reset('database_timeout');
      const response = await handler(request());
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'service_unavailable');
      assert.equal(rpcCalls.length, 1);
      assert.deepEqual(queryRetries, [false]);
      assert.equal(querySignal.aborted, true);
      assert.equal(authCalls, 0);
    });
    await t.test('limite excedido continua 429 e bloqueia Auth', async () => {
      reset('rate_limited');
      assert.equal((await handler(request())).status, 429);
      assert.equal(authCalls, 0);
    });
    for (const failure of ['auth_timeout', 'auth_body_timeout', 'auth_unavailable']) {
      await t.test(`${failure} retorna indisponibilidade, não credencial inválida`, async () => {
        reset(failure);
        const response = await handler(request());
        assert.equal(response.status, 503);
        assert.equal((await response.json()).code, 'service_unavailable');
        assert.equal(authCalls, 1);
        assert.deepEqual(queryRetries, [false, false]);
      });
    }
    await t.test('sucesso mantém duas verificações e tokens sem cache', async () => {
      reset('success');
      const response = await handler(request());
      assert.equal(response.status, 200);
      assert.equal(rpcCalls.length, 2);
      assert.equal(authCalls, 1);
      assert.match(response.headers.get('Cache-Control'), /no-store/);
      assert.equal((await response.json()).accessToken, 'test-access');
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
    AbortSignal.timeout = originalTimeout;
    console.info = originalInfo;
    console.error = originalError;
    delete globalThis.__portalTestClient;
  }
});

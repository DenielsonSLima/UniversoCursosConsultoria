import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { build } from 'esbuild';

// Executa o endpoint e as proteções reais com todos os transportes em memória.
// O contrato SQL do resolvedor é exercitado separadamente, sem dados de alunos.
const result = await build({
  entryPoints: ['supabase/functions/portal-auth/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  plugins: [{
    name: 'registration-auth-memory-transport',
    setup(builder) {
      builder.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({
        path: 'supabase', namespace: 'memory',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'memory' }, () => ({
        contents: 'export const createClient = (...args) => globalThis.__registrationAuthClient(...args);',
        loader: 'js',
      }));
    },
  }],
});

const PASSWORD = '  Senha.Teste-123Aa  ';
const AUTH_EMAIL = 'synthetic-student@acesso.universocc.invalid';
const PRINCIPAL = 'UNIV-TEST-0001';
const LEGACY = 'UNIV-A-99999999';

test('login por matrícula preserva credenciais e as barreiras do endpoint', async t => {
  const originals = {
    fetch: globalThis.fetch,
    Deno: globalThis.Deno,
    info: console.info,
    error: console.error,
  };
  let handler;
  let challengeAccepted = true;
  let events = [];
  let authBodies = [];
  let resolverArguments = [];
  let logs = [];
  globalThis.Deno = {
    env: { get: name => ({
      SUPABASE_URL: 'https://project.example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
      SUPABASE_ANON_KEY: 'synthetic-public-key',
      TURNSTILE_SECRET_KEY: 'synthetic-private-challenge-key',
    })[name] },
    serve: callback => { handler = callback; },
  };
  console.info = (...args) => { logs.push(args.join(' ')); };
  console.error = (...args) => { logs.push(args.join(' ')); };
  globalThis.__registrationAuthClient = (url, key, options) => {
    assert.equal(url, 'https://project.example.test');
    assert.equal(key, 'synthetic-service-key');
    assert.equal(options.auth.persistSession, false);
    return {
      rpc(name, args) {
        let data;
        if (name === 'consume_portal_auth_rate_limit') {
          events.push(args.p_bucket_key.includes(':ip:') ? 'ip-limit' : 'identifier-limit');
          data = [{ allowed: true, retry_after_seconds: 0 }];
        } else {
          assert.equal(name, 'resolve_portal_login_identity');
          events.push('resolve');
          resolverArguments.push(args);
          data = [PRINCIPAL, LEGACY].some(value => value.toLowerCase() === args.p_identifier)
            ? AUTH_EMAIL : null;
        }
        return {
          retry(value) { assert.equal(value, false); return this; },
          abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return this; },
          then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); },
        };
      },
    };
  };
  globalThis.fetch = async (input, options) => {
    if (String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      events.push('turnstile');
      assert.equal(options.body.get('response'), 'synthetic-challenge');
      return Response.json({ success: challengeAccepted, hostname: 'universocc.com.br', action: 'login' });
    }
    assert.equal(String(input), 'https://project.example.test/auth/v1/token?grant_type=password');
    events.push('auth');
    assert.equal(options.headers.apikey, 'synthetic-public-key');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-public-key');
    const body = JSON.parse(options.body);
    authBodies.push(body);
    if (body.email !== AUTH_EMAIL || body.password !== PASSWORD) {
      return Response.json({ error_code: 'invalid_credentials' }, { status: 400 });
    }
    return Response.json({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token' });
  };
  const request = (identifier, password = PASSWORD) => new Request('https://project.example.test/functions/v1/portal-auth', {
    method: 'POST',
    headers: { origin: 'https://universocc.com.br', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', identifier, password, turnstileToken: 'synthetic-challenge' }),
  });
  const reset = () => {
    challengeAccepted = true;
    events = [];
    authBodies = [];
    resolverArguments = [];
    logs = [];
  };
  const assertNoSensitiveLogs = () => {
    const text = logs.join('\n');
    for (const value of [PASSWORD, AUTH_EMAIL, PRINCIPAL, LEGACY, 'synthetic-access-token', 'synthetic-refresh-token']) {
      assert.equal(text.includes(value), false);
    }
  };

  try {
    await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    for (const [label, registration] of [['principal', PRINCIPAL], ['legada', LEGACY]]) {
      await t.test(`matrícula ${label} resolve alias interno e mantém senha pontuada intacta`, async () => {
        reset();
        const response = await handler(request(`  ${registration.toLowerCase()}  `));
        assert.equal(response.status, 200);
        assert.deepEqual(events, ['ip-limit', 'turnstile', 'identifier-limit', 'resolve', 'auth']);
        assert.deepEqual(resolverArguments, [{ p_identifier: registration.toLowerCase() }]);
        assert.deepEqual(authBodies, [{ email: AUTH_EMAIL, password: PASSWORD }]);
        assert.match(response.headers.get('Cache-Control'), /no-store/);
        assert.equal(response.headers.get('Pragma'), 'no-cache');
        assert.deepEqual(await response.json(), {
          accessToken: 'synthetic-access-token', refreshToken: 'synthetic-refresh-token',
        });
        assertNoSensitiveLogs();
      });
    }

    await t.test('matrícula inexistente e senha incorreta retornam o mesmo erro genérico', async () => {
      reset();
      const wrongPassword = await handler(request(PRINCIPAL, 'Senha.Incorreta-123Aa'));
      assert.equal(wrongPassword.status, 401);
      const wrongBody = await wrongPassword.json();
      assert.equal(wrongBody.code, 'invalid_credentials');
      assert.deepEqual(authBodies, [{ email: AUTH_EMAIL, password: 'Senha.Incorreta-123Aa' }]);
      assertNoSensitiveLogs();

      reset();
      const unknown = await handler(request('UNIV-TEST-INEXISTENTE'));
      assert.equal(unknown.status, 401);
      assert.deepEqual(await unknown.json(), wrongBody);
      assert.deepEqual(events, ['ip-limit', 'turnstile', 'identifier-limit', 'resolve', 'auth']);
      assert.equal(authBodies.length, 1);
      assert.match(authBodies[0].email, /^unknown\.[a-f0-9]{24}@acesso\.universocc\.invalid$/);
      assert.equal(authBodies[0].password, PASSWORD);
      assertNoSensitiveLogs();
    });

    await t.test('Turnstile rejeitado impede resolvedor, cota de matrícula e Auth', async () => {
      reset();
      challengeAccepted = false;
      const response = await handler(request(PRINCIPAL));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'challenge_failed');
      assert.deepEqual(events, ['ip-limit', 'turnstile']);
      assert.deepEqual(resolverArguments, []);
      assert.deepEqual(authBodies, []);
      assertNoSensitiveLogs();
    });
  } finally {
    globalThis.fetch = originals.fetch;
    globalThis.Deno = originals.Deno;
    console.info = originals.info;
    console.error = originals.error;
    delete globalThis.__registrationAuthClient;
  }
});

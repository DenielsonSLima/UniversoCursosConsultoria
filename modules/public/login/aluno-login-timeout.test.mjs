import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function runtime() {
  const timers = new Map();
  let now = 0, id = 0;
  const clock = {
    setTimeout(callback, delay) { timers.set(++id, { callback, at: now + delay }); return id; },
    clearTimeout(key) { timers.delete(key); },
  };
  const load = (path, imports) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
      module, Error, Promise, AbortController, URLSearchParams, ...clock,
      window: { location: { pathname: '/login', search: '' } },
      console: { error() {} },
      require: name => imports[name] || {},
    });
    return module.exports;
  };
  return {
    load,
    deadline: load('../../login/auth-request.ts', {}),
    advance(ms) {
      now += ms;
      for (const [key, timer] of timers) {
        if (timer.at <= now) { timers.delete(key); timer.callback(); }
      }
    },
  };
}

function pageHarness({ login, externalSession, externalProfiles }) {
  const env = runtime();
  const states = [], effects = [], saved = [], navigation = [];
  const react = {
    useState(initial) {
      const i = states.length;
      states.push(typeof initial === 'function' ? initial() : initial);
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef: current => ({ current }),
    useMemo: callback => callback(),
    useEffect: callback => effects.push(callback),
  };
  const { useAlunoLoginPublicPage } = env.load('./useAlunoLoginPublicPage.ts', {
    react,
    'react-router': {
      useNavigate: () => path => navigation.push(path),
      useSearchParams: () => [new URLSearchParams(), () => {}],
    },
    '@tanstack/react-query': { useQueryClient: () => ({ clear() {} }) },
    '../../../lib/supabase': { supabase: { auth: { getSession: externalSession } } },
    '../../login/auth-request': env.deadline,
    '../../login/portal-session': { savePortalSession: profile => saved.push(profile) },
    '../../login/profile-selection': { resolveProfilePostLoginRoute: () => '/aluno' },
    '../../login/motivationalPhrases': { getRandomMotivationalPhrase: () => 'Mensagem' },
    '../../shared/auth/oauth-return-state': {
      readPendingOAuthReturn: () => null,
      hasOAuthReturnInUrl: () => Boolean(externalSession),
      getOAuthReturnError: () => null,
      clearPendingOAuthReturn() {}, clearOAuthReturnParams() {},
    },
    './aluno-public-auth.service': {
      getSafePublicAlunoRedirectPath: () => '/aluno',
      alunoPublicAuthService: {
        loginAndListProfiles: login,
        finishExternalLoginAndListProfiles: externalProfiles,
        needsInitialAccess: () => false,
      },
    },
    './aluno-login-redirect': { openAlunoAppDocument: () => false, isExpiredAuthLink: () => false },
    './useAlunoSignupForm': { useAlunoSignupForm: () => ({ values: {}, cardProps: {} }) },
  });
  const model = useAlunoLoginPublicPage();
  return {
    submit: () => model.cardProps.onLogin({ preventDefault() {} }, 'synthetic-challenge'),
    loading: () => states[3],
    checking: () => states[4],
    profiles: () => states[5],
    message: () => states[8],
    unmount: effects[0](),
    runExternal: () => effects[3](),
    saved, navigation, advance: env.advance,
  };
}

const profile = { id: 'synthetic', tipo: 'Aluno', nome: 'Teste' };

test('aluno abre portal uma vez e ignora duplo submit', async () => {
  const pending = deferred();
  let calls = 0;
  const page = pageHarness({ login: () => { calls++; return pending.promise; } });
  const first = page.submit();
  await page.submit();
  assert.equal(calls, 1);
  pending.resolve([profile]);
  await first;
  assert.equal(page.loading(), false);
  assert.deepEqual(page.navigation, ['/aluno']);
  assert.deepEqual(page.saved, [profile]);
});

test('aluno encerra loading no prazo e não navega nem seleciona perfis tardios', async () => {
  const pending = deferred();
  let signal;
  const page = pageHarness({ login: (...args) => { signal = args[3]; return pending.promise; } });
  const submitted = page.submit();
  assert.equal(page.loading(), true);
  page.advance(45_000);
  await submitted;
  assert.equal(page.loading(), false);
  assert.match(page.message().text, /demorou para responder/);
  assert.equal(signal.aborted, true);
  pending.resolve([profile, { ...profile, id: 'second' }]);
  await flush();
  assert.equal(page.profiles().length, 0);
  assert.deepEqual(page.navigation, []);
  assert.deepEqual(page.saved, []);
});

test('desmontagem cancela login aluno e bloqueia gravação tardia', async () => {
  const pending = deferred();
  let signal;
  const page = pageHarness({ login: (...args) => { signal = args[3]; return pending.promise; } });
  const submitted = page.submit();
  page.unmount();
  await submitted;
  assert.equal(signal.aborted, true);
  pending.resolve([profile]);
  await flush();
  assert.deepEqual(page.saved, []);
  assert.deepEqual(page.navigation, []);
});

test('retorno Google aluno termina conferência se getSession não responder', async () => {
  const pending = deferred();
  let profileCalls = 0;
  const page = pageHarness({
    externalSession: () => pending.promise,
    externalProfiles: async () => { profileCalls++; return [profile]; },
  });
  page.runExternal();
  page.advance(15_000);
  await flush();
  assert.equal(page.checking(), false);
  assert.match(page.message().text, /demorou para responder/);
  pending.resolve({ data: { session: { user: {} } }, error: null });
  await flush();
  assert.equal(profileCalls, 0);
  assert.deepEqual(page.navigation, []);
});

function sessionHarness(getProfiles) {
  const env = runtime();
  const user = { id: 'synthetic', email_confirmed_at: '2026-01-01' };
  let logouts = 0;
  const service = env.load('./aluno-public-session.service.ts', {
    '../../login/auth-request': env.deadline,
    '../../login/login.service': { loginService: {
      login: async () => ({ user, error: null }),
      logout: async () => { logouts++; },
    } },
    '../../login/portal-session': { getPublicPortalProfiles: getProfiles },
    '../../login/institutional-login-error': {
      getPortalAccessErrorLog: () => ({}),
      getPortalAccessErrorMessage: error => error.message,
    },
    './aluno-public-auth-session.helpers': { hasConfirmedEmail: value => Boolean(value?.email_confirmed_at) },
  });
  return { ...env, service, user, logouts: () => logouts };
}

test('Google aluno respeita bloqueio compartilhado antes de abrir novo OAuth', async () => {
  const env = runtime();
  const service = env.load('./aluno-public-session.service.ts', {
    '../../login/auth-request': env.deadline,
    '../../login/login.service': { loginService: {
      assertAuthMutationAvailable() { throw new Error('Mutação Auth anterior pendente'); },
    } },
  });
  await assert.rejects(service.loginPublicAlunoWithGoogle(), /Mutação Auth anterior pendente/);
});

test('resolvedor aluno reutiliza usuário autenticado sem repetir consulta getUser', async () => {
  let received;
  const h = sessionHarness(async user => { received = user; return [profile]; });
  assert.deepEqual(await h.service.loginPublicAlunoAndListProfiles('synthetic', 'synthetic', 'synthetic'), [profile]);
  assert.equal(received, h.user);
});

test('perfis aluno sem resposta têm prazo8s e tentativa cancelada não inicia logout tardio', async () => {
  const h = sessionHarness(() => new Promise(() => {}));
  const controller = new AbortController();
  const result = h.service.loginPublicAlunoAndListProfiles('synthetic', 'synthetic', 'synthetic', controller.signal);
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await flush();
  controller.abort();
  await rejected;
  assert.equal(h.logouts(), 0);

  const timeout = h.service.finishPublicAlunoExternalLoginAndListProfiles();
  const timeoutRejected = assert.rejects(timeout, /demorou para responder/);
  await flush();
  h.advance(8_000);
  await timeoutRejected;
});

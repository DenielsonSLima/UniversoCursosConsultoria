import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const flush = async () => {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
};

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function harness({ login, profiles }) {
  const states = [];
  const effects = [];
  const navigation = [];
  const savedProfiles = [];
  const timers = new Map();
  let timerId = 0;
  let elapsed = 0;
  const clock = {
    setTimeout(callback, delay) {
      timers.set(++timerId, { callback, at: elapsed + delay });
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const index = states.length;
      states.push(typeof initial === 'function' ? initial() : initial);
      return [states[index], value => {
        states[index] = typeof value === 'function' ? value(states[index]) : value;
      }];
    },
    useRef: current => ({ current }),
    useMemo: callback => callback(),
    useEffect: callback => { effects.push(callback); },
  };
  const load = (file, imports) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const compiled = transformSync(source, {
      loader: file.endsWith('.tsx') ? 'tsx' : 'ts',
      format: 'cjs',
    }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
      module, Error, Promise, AbortController, URLSearchParams,
      ...clock,
      window: { location: { search: '' } },
      console: { error() {} },
      require: name => imports[name] || {},
    });
    return module.exports;
  };
  const deadline = load('./auth-request.ts', {});
  const LoginForm = () => null;
  const imports = {
    react,
    'react-router': { useNavigate: () => destination => navigation.push(destination) },
    '@tanstack/react-query': { useQueryClient: () => ({ clear() {} }) },
    './components/LoginForm': { default: LoginForm, __esModule: true },
    './login.service': { loginService: { login } },
    './portal-session': {
      getInstitutionalProfiles: profiles,
      savePortalSession: profile => savedProfiles.push(profile),
    },
    './profile-selection': {
      requiresProfessorPoloSelection: () => false,
      resolveProfilePostLoginRoute: () => '/gestor',
    },
    '../shared/auth/oauth-return-state': {
      readPendingOAuthReturn: () => null,
      hasOAuthReturnInUrl: () => false,
    },
    './motivationalPhrases': { getRandomMotivationalPhrase: () => 'Mensagem' },
    './institutional-login-error': {
      getPortalAccessErrorLog: () => ({}),
      getPortalAccessErrorMessage: error => error.message,
    },
    './auth-request': deadline,
  };
  const { default: LoginPage } = load('./LoginPage.tsx', imports);
  const tree = LoginPage();
  const findForm = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === LoginForm) return node;
    return (node.children || []).flat(Infinity).map(findForm).find(Boolean);
  };
  const form = findForm(tree);
  assert.ok(form, 'O formulário institucional precisa montar.');
  return {
    submit: form.props.onSubmit,
    loading: () => states[2],
    error: () => states[3],
    loginStep: () => states[5],
    navigation,
    savedProfiles,
    unmount: effects[0](),
    advance(ms) {
      elapsed += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= elapsed) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

const profile = { id: 'synthetic', tipo: 'Gestor', nome: 'Teste' };

test('resposta válida grava o perfil e abre o portal uma única vez', async () => {
  const pending = deferred();
  let loginCalls = 0;
  const page = harness({
    login: () => { loginCalls += 1; return pending.promise; },
    profiles: async () => [profile],
  });
  const submitted = page.submit({});
  await page.submit({});
  assert.equal(loginCalls, 1);
  pending.resolve({ error: null, user: { id: 'synthetic' } });
  await submitted;
  assert.equal(page.loading(), false);
  assert.deepEqual(page.savedProfiles, [profile]);
  assert.deepEqual(page.navigation, ['/gestor']);
});

test('login institucional encerra o spinner e ignora autenticação tardia após o prazo', async () => {
  const pending = deferred();
  let profileCalls = 0;
  const page = harness({
    login: () => pending.promise,
    profiles: async () => { profileCalls += 1; return [profile]; },
  });
  const submitted = page.submit({});
  assert.equal(page.loading(), true);
  page.advance(45_000);
  await submitted;
  assert.equal(page.loading(), false);
  assert.match(page.error(), /demorou para responder/);
  pending.resolve({ error: null, user: { id: 'synthetic' } });
  await flush();
  assert.equal(profileCalls, 0);
  assert.deepEqual(page.navigation, []);
  assert.deepEqual(page.savedProfiles, []);
});

test('perfil tardio após o prazo não abre seletor nem grava acesso', async () => {
  const pending = deferred();
  const page = harness({
    login: async () => ({ error: null, user: { id: 'synthetic' } }),
    profiles: () => pending.promise,
  });
  const submitted = page.submit({});
  await flush();
  page.advance(45_000);
  await submitted;
  pending.resolve([profile, { ...profile, id: 'second' }]);
  await flush();
  assert.equal(page.loading(), false);
  assert.equal(page.loginStep(), 'credentials');
  assert.deepEqual(page.navigation, []);
  assert.deepEqual(page.savedProfiles, []);
});

test('desmontar o login cancela a tentativa antes de um resultado tardio navegar', async () => {
  const pending = deferred();
  let receivedSignal;
  const page = harness({
    login: (_, signal) => { receivedSignal = signal; return pending.promise; },
    profiles: async () => [profile],
  });
  const submitted = page.submit({});
  page.unmount();
  await submitted;
  assert.equal(receivedSignal.aborted, true);
  pending.resolve({ error: null, user: { id: 'synthetic' } });
  await flush();
  assert.deepEqual(page.navigation, []);
  assert.deepEqual(page.savedProfiles, []);
});

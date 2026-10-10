import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
import {
  PORTAL_INACTIVITY_TIMEOUT_MS,
  PORTAL_LAST_ACTIVITY_STORAGE_KEY,
  getInactivityRemainingMs,
  hasInactivityExpired,
} from './inactivity-policy.ts';

const source = await readFile(new URL('./useInactivityLogout.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const MINUTE = 60_000;

// Model the browser's capture/bubble boundary and delayed cross-tab events.
// Run the real hook with a deterministic clock, without a browser or Auth API.
const runtime = ({ enabled = true, stored = 1_000 } = {}) => {
  let now = 1_000;
  let nextTimer = 1;
  const timers = new Map();
  const cleanup = [];
  const calls = [];
  const storage = new Map(stored === null ? [] : [[PORTAL_LAST_ACTIVITY_STORAGE_KEY, String(stored)]]);
  const surface = () => {
    const listeners = [];
    return {
      listeners,
      addEventListener(name, handler, options) {
        listeners.push({ name, handler, capture: options === true || !!options?.capture });
      },
      removeEventListener(name, handler, options) {
        const capture = options === true || !!options?.capture;
        const index = listeners.findIndex((entry) => entry.name === name && entry.handler === handler && entry.capture === capture);
        if (index >= 0) listeners.splice(index, 1);
      },
      dispatch(name, { descendant = false, bubbles = true, stopped = false, ...event } = {}) {
        for (const listener of [...listeners]) {
          if (listener.name !== name) continue;
          if (descendant && !listener.capture && (!bubbles || stopped)) continue;
          listener.handler(event);
        }
      },
    };
  };
  const window = {
    ...surface(),
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  const document = { ...surface(), visibilityState: 'visible' };
  const dependencies = {
    react: {
      useRef: (current) => ({ current }),
      useEffect: (effect) => { const dispose = effect(); if (dispose) cleanup.push(dispose); },
    },
    './inactivity-policy': {
      PORTAL_INACTIVITY_TIMEOUT_MS, PORTAL_LAST_ACTIVITY_STORAGE_KEY,
      getInactivityRemainingMs, hasInactivityExpired,
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'document', 'Date', 'setTimeout', 'clearTimeout', code)(
    (name) => { assert.ok(dependencies[name], `Unexpected dependency ${name}`); return dependencies[name]; },
    module, module.exports, window, document, { now: () => now },
    (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, due: now + delay }); return id; },
    (id) => timers.delete(id),
  );
  module.exports.useInactivityLogout({ isEnabled: enabled, onTimeout: (reason) => calls.push(reason) });
  return {
    calls, window, document, storage, timers,
    elapsed: (minutes) => 1_000 + minutes * MINUTE,
    jump(minutes) { now = 1_000 + minutes * MINUTE; },
    advance(minutes) {
      const target = 1_000 + minutes * MINUTE;
      for (;;) {
        const pending = [...timers].filter(([, timer]) => timer.due <= target)
          .sort((left, right) => left[1].due - right[1].due)[0];
        if (!pending) break;
        const [id, timer] = pending;
        now = timer.due;
        timers.delete(id);
        timer.callback();
      }
      now = target;
    },
    unmount() { cleanup.reverse().forEach((dispose) => dispose()); },
  };
};

test('trinta minutos reais sem atividade encerram uma vez e não são revividos por retorno tardio', () => {
  const session = runtime();
  session.advance(29.999);
  assert.deepEqual(session.calls, []);
  session.advance(30);
  session.window.dispatch('focus');
  session.window.dispatch('click');
  session.advance(60);
  assert.deepEqual(session.calls, ['inactivity']);
});

test('rolagem de painel que não propaga preserva a sessão enquanto o usuário está ativo', () => {
  const session = runtime();
  session.advance(29);
  session.window.dispatch('scroll', { descendant: true, bubbles: false });
  session.advance(30);
  assert.deepEqual(session.calls, []);
  session.advance(59);
  assert.deepEqual(session.calls, ['inactivity']);
});

test('clique e teclado em controles que interrompem propagação contam como atividade', () => {
  for (const event of ['click', 'keydown']) {
    const session = runtime();
    session.advance(29);
    session.window.dispatch(event, { descendant: true, stopped: true });
    session.advance(30);
    assert.deepEqual(session.calls, [], event);
    session.unmount();
  }
});

test('roda do mouse, movimento por toque e entrada de texto preservam atividade no portal', () => {
  for (const event of ['wheel', 'touchmove', 'input']) {
    const session = runtime();
    session.advance(29);
    session.window.dispatch(event, { descendant: true, stopped: true });
    session.advance(30);
    assert.deepEqual(session.calls, [], event);
    session.unmount();
  }
});

test('timer e foco revalidam atividade recente de outra aba mesmo antes do evento storage', () => {
  for (const check of ['timer', 'focus']) {
    const session = runtime();
    session.storage.set(PORTAL_LAST_ACTIVITY_STORAGE_KEY, String(session.elapsed(29)));
    if (check === 'focus') {
      session.jump(30);
      session.window.dispatch('focus');
    } else session.advance(30);
    assert.deepEqual(session.calls, [], check);
    session.unmount();
  }
});

test('eventos atrasados de outra aba não fazem o relógio regredir nem anulam um novo acesso', () => {
  const session = runtime();
  session.advance(20);
  session.window.dispatch('click');
  session.window.dispatch('storage', { key: PORTAL_LAST_ACTIVITY_STORAGE_KEY, newValue: '1000' });
  session.advance(30);
  assert.deepEqual(session.calls, []);
  session.window.dispatch('storage', { key: PORTAL_LAST_ACTIVITY_STORAGE_KEY, newValue: null });
  assert.deepEqual(session.calls, []);
  session.advance(50);
  assert.deepEqual(session.calls, ['inactivity']);
});

test('callback antigo de outra aba respeita o novo timestamp gravado no login', () => {
  const previousTab = runtime();
  previousTab.jump(20);
  previousTab.storage.set(PORTAL_LAST_ACTIVITY_STORAGE_KEY, String(previousTab.elapsed(20)));
  previousTab.advance(30);
  assert.deepEqual(previousTab.calls, [], 'O login recente não pode ser encerrado pelo timer da aba anterior');
  previousTab.advance(50);
  assert.deepEqual(previousTab.calls, ['inactivity']);
});

test('remoção real da atividade em outra aba encerra a instalação local', () => {
  const session = runtime();
  session.storage.delete(PORTAL_LAST_ACTIVITY_STORAGE_KEY);
  session.window.dispatch('storage', { key: PORTAL_LAST_ACTIVITY_STORAGE_KEY, newValue: null });
  assert.deepEqual(session.calls, ['inactivity']);
});

test('refresh automático, visibilidade oculta e desmontagem não simulam atividade', () => {
  const session = runtime();
  session.advance(29);
  session.window.dispatch('TOKEN_REFRESHED');
  session.document.visibilityState = 'hidden';
  session.window.dispatch('click');
  session.advance(30);
  assert.deepEqual(session.calls, ['inactivity']);
  session.unmount();
  assert.equal(session.window.listeners.length, 0);
  assert.equal(session.document.listeners.length, 0);
  assert.equal(session.timers.size, 0);
  const disabled = runtime({ enabled: false });
  assert.equal(disabled.window.listeners.length, 0);
  assert.equal(disabled.timers.size, 0);
});

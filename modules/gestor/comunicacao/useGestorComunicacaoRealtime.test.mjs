import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./useGestorComunicacaoRealtime.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

// Execute the actual hook effect with controlled network/attachment timing, without a browser.
function createHarness() {
  const states = [];
  const refs = [];
  const layouts = [];
  const pendingLoads = new Map();
  const pendingAttachments = new Map();
  const subscriptions = new Map();
  const removals = [];
  const sounds = [];
  let stateCursor = 0;
  let refCursor = 0;
  let layoutCursor = 0;
  let effects = [];
  let pendingLayouts = [];
  let activeMessageCleanup;
  let api;
  let stateWrites = 0;
  const react = {
    useState(initial) {
      const slot = stateCursor++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (next) => {
        stateWrites += 1;
        states[slot] = typeof next === 'function' ? next(states[slot]) : next;
      }];
    },
    useRef(initial) {
      const slot = refCursor++;
      if (!(slot in refs)) refs[slot] = { current: initial };
      return refs[slot];
    },
    useLayoutEffect(callback, deps) {
      const slot = layoutCursor++;
      const previous = layouts[slot];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        pendingLayouts.push(() => {
          previous?.cleanup?.();
          layouts[slot] = { deps, cleanup: callback() };
        });
      }
    },
    useEffect(callback) { effects.push(callback); },
  };
  const supabase = {
    from() {
      let chatId;
      const chain = {
        select() { return chain; },
        update() { return chain; },
        in() { return chain; },
        eq(key, value) {
          if (key === 'chat_id') chatId = value;
          return chain;
        },
        order() {
          const request = deferred();
          pendingLoads.set(chatId, request);
          return request.promise;
        },
        then(resolve) { return Promise.resolve({ data: [] }).then(resolve); },
      };
      return chain;
    },
    channel(name) {
      const channel = {
        name,
        on(_event, _config, handler) {
          subscriptions.set(name, handler);
          return channel;
        },
        subscribe() { return channel; },
      };
      return channel;
    },
    removeChannel(channel) { removals.push(channel.name); },
  };
  const imports = {
    react,
    '../../../lib/supabase': { supabase },
    '../../shared/comunicacao/comunicacao-attachments.service': {
      resolveCommunicationAttachmentUrls: async (rows) => {
        const pending = pendingAttachments.get(rows[0]?.id);
        if (pending) await pending.promise;
        return rows;
      },
    },
    './gestor-comunicacao.types': { playGestorMessageSound: (kind) => sounds.push(kind) },
    './unified-support-selection': {
      getUnifiedSupportSelection() { return null; },
      isUnifiedSupportActive() { return true; },
      subscribeUnifiedSupportSelection() { return () => {}; },
      notifyUnifiedSupportOpened() {},
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected hook dependency: ${name}`);
      return imports[name];
    },
    console,
  });
  const render = () => {
    stateCursor = 0;
    refCursor = 0;
    layoutCursor = 0;
    effects = [];
    pendingLayouts = [];
    api = exports.useGestorComunicacaoRealtime();
    pendingLayouts.forEach((layout) => layout());
    return api;
  };
  render();
  return {
    removals, sounds,
    get stateWrites() { return stateWrites; },
    snapshot: render,
    select(chatId) {
      api.setActiveChatId(chatId);
      render();
      const effect = effects.find((callback) => callback.toString().includes('comunicacao_msgs_realtime_'));
      assert.ok(effect, 'The real per-conversation messages effect must be present');
      activeMessageCleanup = effect();
      return activeMessageCleanup;
    },
    unmount() {
      activeMessageCleanup?.();
      layouts.forEach((layout) => layout.cleanup?.());
    },
    resolveLoad(chatId, rows) {
      assert.ok(pendingLoads.has(chatId), `Missing request for chat ${chatId}`);
      pendingLoads.get(chatId).resolve({ data: rows, error: null });
    },
    delayAttachment(messageId) {
      const pending = deferred();
      pendingAttachments.set(messageId, pending);
      return pending.resolve;
    },
    insert(chatId, message) {
      return subscriptions.get(`comunicacao_msgs_realtime_${chatId}`)({ new: message });
    },
  };
}

const messageIds = (harness) => Array.from(harness.snapshot().messages, (message) => message.id);

test('carga de A atrasada não sobrescreve mensagens de B nem encerra seu loading', async () => {
  const harness = createHarness();
  const cleanupA = harness.select('A');
  cleanupA();
  harness.select('B');
  harness.resolveLoad('A', [{ id: 'message-A', chat_id: 'A' }]);
  await flush();
  assert.equal(harness.snapshot().loadingMessages, true);
  assert.deepEqual(messageIds(harness), []);
  harness.resolveLoad('B', [{ id: 'message-B', chat_id: 'B' }]);
  await flush();
  assert.deepEqual(messageIds(harness), ['message-B']);
  assert.equal(harness.snapshot().loadingMessages, false);
  assert.deepEqual(harness.removals, ['comunicacao_msgs_realtime_A']);
});

test('troca de conversa limpa o histórico anterior antes de carregar a próxima', async () => {
  const harness = createHarness();
  const cleanupA = harness.select('A');
  harness.resolveLoad('A', [{ id: 'message-A', chat_id: 'A' }]);
  await flush();
  assert.deepEqual(messageIds(harness), ['message-A']);
  cleanupA();
  harness.select('B');
  assert.deepEqual(messageIds(harness), []);
  assert.equal(harness.snapshot().loadingMessages, true);
});

test('resolução de anexos da carga anterior não repõe A após B carregar', async () => {
  const harness = createHarness();
  const releaseAttachment = harness.delayAttachment('attachment-A');
  const cleanupA = harness.select('A');
  harness.resolveLoad('A', [{ id: 'attachment-A', chat_id: 'A' }]);
  await flush();
  cleanupA();
  harness.select('B');
  harness.resolveLoad('B', [{ id: 'message-B', chat_id: 'B' }]);
  await flush();
  releaseAttachment();
  await flush();
  assert.deepEqual(messageIds(harness), ['message-B']);
});

test('INSERT de A aguardando anexo é descartado após cleanup, sem som tardio', async () => {
  const harness = createHarness();
  const releaseAttachment = harness.delayAttachment('late-insert-A');
  const cleanupA = harness.select('A');
  harness.resolveLoad('A', []);
  await flush();
  const insertPromise = harness.insert('A', {
    id: 'late-insert-A', chat_id: 'A', remetente_tipo: 'aluno',
  });
  cleanupA();
  harness.select('B');
  harness.resolveLoad('B', [{ id: 'message-B', chat_id: 'B' }]);
  await flush();
  releaseAttachment();
  await insertPromise;
  assert.deepEqual(messageIds(harness), ['message-B']);
  assert.deepEqual(harness.sounds, []);
});

test('seleção null limpa mensagens e loading, ignorando a carga abandonada', async () => {
  const harness = createHarness();
  const cleanupA = harness.select('A');
  assert.equal(harness.snapshot().loadingMessages, true);
  cleanupA();
  harness.select(null);
  harness.resolveLoad('A', [{ id: 'message-A', chat_id: 'A' }]);
  await flush();
  assert.deepEqual(messageIds(harness), []);
  assert.equal(harness.snapshot().loadingMessages, false);
});

test('desmontagem impede escritas de estado por carga e callback já removidos', async () => {
  const harness = createHarness();
  const cleanupA = harness.select('A');
  cleanupA();
  const writesAfterCleanup = harness.stateWrites;
  harness.resolveLoad('A', [{ id: 'message-A', chat_id: 'A' }]);
  await harness.insert('A', { id: 'late-insert-A', chat_id: 'A', remetente_tipo: 'aluno' });
  await flush();
  assert.equal(harness.stateWrites, writesAfterCleanup);
  assert.deepEqual(harness.sounds, []);
});

test('setter externo capturado em A não anexa mensagem em B, mas setter vigente funciona', async () => {
  const harness = createHarness();
  const cleanupA = harness.select('A');
  harness.resolveLoad('A', [{ id: 'message-A', chat_id: 'A' }]);
  await flush();
  const completeSendA = harness.snapshot().setMessages;
  cleanupA();
  harness.select('B');
  harness.resolveLoad('B', [{ id: 'message-B', chat_id: 'B' }]);
  await flush();
  completeSendA((current) => [...current, { id: 'late-send-A', chat_id: 'A' }]);
  assert.deepEqual(messageIds(harness), ['message-B']);
  harness.snapshot().setMessages((current) => [...current, { id: 'send-B', chat_id: 'B' }]);
  assert.deepEqual(messageIds(harness), ['message-B', 'send-B']);
  harness.snapshot().setMessages([{ id: 'replacement-B', chat_id: 'B' }]);
  assert.deepEqual(messageIds(harness), ['replacement-B']);
});

test('setter externo capturado antes de seleção null não repõe histórico abandonado', async () => {
  const harness = createHarness();
  const cleanupA = harness.select('A');
  const completeSendA = harness.snapshot().setMessages;
  cleanupA();
  harness.select(null);
  completeSendA([{ id: 'late-send-A', chat_id: 'A' }]);
  assert.deepEqual(messageIds(harness), []);
  assert.equal(harness.snapshot().loadingMessages, false);
});

test('setter externo capturado antes da desmontagem não escreve estado', () => {
  const harness = createHarness();
  harness.select('A');
  const completeSendA = harness.snapshot().setMessages;
  harness.unmount();
  const writesAfterUnmount = harness.stateWrites;
  completeSendA((current) => [...current, { id: 'late-send-A', chat_id: 'A' }]);
  assert.equal(harness.stateWrites, writesAfterUnmount);
});

test('layout de B invalida carga e INSERT de A antes do cleanup passivo', async () => {
  const harness = createHarness();
  harness.select('A');
  const releaseAttachment = harness.delayAttachment('late-insert-A');
  const pendingInsert = harness.insert('A', {
    id: 'late-insert-A', chat_id: 'A', remetente_tipo: 'aluno',
  });
  harness.snapshot().setActiveChatId('B');
  harness.snapshot(); // Commit B's layout without running A's passive cleanup.
  harness.resolveLoad('A', [{ id: 'late-load-A', chat_id: 'A' }]);
  releaseAttachment();
  await pendingInsert;
  await flush();
  assert.equal(harness.snapshot().activeChatId, 'B');
  assert.deepEqual(messageIds(harness), []);
  assert.equal(harness.snapshot().loadingMessages, true);
  assert.deepEqual(harness.sounds, []);
});

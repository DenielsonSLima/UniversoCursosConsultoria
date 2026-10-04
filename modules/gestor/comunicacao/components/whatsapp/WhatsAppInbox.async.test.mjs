import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('./WhatsAppInbox.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const conversation = (id) => ({
  id, aluno_id: `student-${id}`, contato_nome: id, telefone: '5579999999999',
  status: 'aberta', ultima_data: '2026-10-04T00:00:00Z', unread_count: 0,
});

// Execute the component's real event handlers with deterministic hooks and I/O.
// No DOM, browser, Supabase connection, or actual message sending is involved.
const createHarness = ({ send = async () => ({}), remove = async () => {} } = {}) => {
  const slots = [];
  const components = new Map();
  const changes = [];
  let cursor = 0;
  let pendingEffects = [];
  let selection = new Set(['old']);
  let connectionId = 'line-a';
  let tree;
  const component = (name) => {
    if (!components.has(name)) components.set(name, function MockComponent() {});
    return components.get(name);
  };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => {
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: (factory) => factory(),
    useLayoutEffect(effect, deps) { React.useEffect(effect, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return React;
      if (name === '@tanstack/react-query') return {
        useQuery: () => ({ data: [] }),
        useQueryClient: () => ({ invalidateQueries: async () => {} }),
      };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => component(key) });
      if (name.endsWith('/whatsapp.utils')) return { formatPhone: String, normalizePhone: String };
      if (name.endsWith('/whatsapp.service')) return { whatsappService: { sendMessage: send } };
      if (name.endsWith('/mediaUtils')) return { fileToBase64: async () => '' };
      if (name.endsWith('/useWhatsAppTypingPresence')) return {
        useWhatsAppTypingPresence: () => ({ isContactTyping: false, sendTyping: () => {} }),
      };
      return component(name.split('/').at(-1));
    },
  });
  const find = (predicate, node = tree) => {
    if (Array.isArray(node)) return node.map((child) => find(predicate, child)).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    return find(predicate, node.props?.children);
  };
  const text = (node) => {
    if (Array.isArray(node)) return node.map(text).join('');
    if (node && typeof node === 'object') return text(node.props?.children);
    return String(node ?? '');
  };
  const render = () => {
    cursor = 0;
    pendingEffects = [];
    tree = module.exports.default({
      connectionId, conversations: [conversation('old'), conversation('new')],
      messages: [], flowSessions: [], activeConversationId: 'old', apiReady: true,
      loadingConversations: false, loadingMessages: false,
      externalSelection: { ids: selection, onChange: (next) => { selection = next; changes.push(next); } },
      onDeleteConversations: remove,
    });
    pendingEffects.forEach((effect) => effect());
    return tree;
  };
  render();
  return {
    changes,
    selected: () => [...selection],
    select(ids) { selection = new Set(ids); render(); },
    line(id) { connectionId = id; render(); },
    unmount() { slots.forEach((slot) => slot.cleanup?.()); },
    batch() {
      find((node) => node.type === 'button' && text(node) === ' Enviar em lote').props.onClick();
      render();
      return find((node) => node.type === components.get('BatchMessageModal')).props.onSend('Mensagem');
    },
    remove() {
      find((node) => node.type === components.get('ConversationToolbar')).props.onDelete();
      render();
      return find((node) => node.type === 'button' && text(node) === 'Apagar conversas').props.onClick();
    },
  };
};

test('lote concluído limpa sua seleção ainda vigente', async () => {
  const harness = createHarness();
  const result = await harness.batch();
  assert.equal(result.sent, 1);
  assert.deepEqual(harness.selected(), []);
  assert.equal(harness.changes.length, 1);
});

test('conclusão do lote antigo não apaga seleção nova', async () => {
  const pending = deferred();
  const harness = createHarness({ send: () => pending.promise });
  const sending = harness.batch();
  harness.select(['new']);
  pending.resolve({});
  await sending;
  assert.deepEqual(harness.selected(), ['new']);
  assert.equal(harness.changes.length, 0);
});

test('lote de detalhe desmontado não altera seleção global', async () => {
  const pending = deferred();
  const harness = createHarness({ send: () => pending.promise });
  const sending = harness.batch();
  harness.unmount();
  pending.resolve({});
  await sending;
  assert.deepEqual(harness.selected(), ['old']);
  assert.equal(harness.changes.length, 0);
});

test('trocar de linha invalida a conclusão antiga mesmo ao voltar à linha original', async () => {
  const pending = deferred();
  const harness = createHarness({ send: () => pending.promise });
  const sending = harness.batch();
  harness.line('line-b');
  harness.line('line-a');
  pending.resolve({});
  await sending;
  assert.deepEqual(harness.selected(), ['old']);
  assert.equal(harness.changes.length, 0);
});

test('exclusão concluída limpa sua seleção ainda vigente', async () => {
  const harness = createHarness();
  await harness.remove();
  assert.deepEqual(harness.selected(), []);
  assert.equal(harness.changes.length, 1);
});

test('conclusão da exclusão antiga não apaga seleção nova', async () => {
  const pending = deferred();
  const harness = createHarness({ remove: () => pending.promise });
  const deleting = harness.remove();
  harness.select(['new']);
  pending.resolve();
  await deleting;
  assert.deepEqual(harness.selected(), ['new']);
  assert.equal(harness.changes.length, 0);
});

test('exclusão de detalhe desmontado não altera seleção global', async () => {
  const pending = deferred();
  const harness = createHarness({ remove: () => pending.promise });
  const deleting = harness.remove();
  harness.unmount();
  pending.resolve();
  await deleting;
  assert.deepEqual(harness.selected(), ['old']);
  assert.equal(harness.changes.length, 0);
});

test('exclusão de outra linha não altera seleção global', async () => {
  const pending = deferred();
  const harness = createHarness({ remove: () => pending.promise });
  const deleting = harness.remove();
  harness.line('line-b');
  pending.resolve();
  await deleting;
  assert.deepEqual(harness.selected(), ['old']);
  assert.equal(harness.changes.length, 0);
});

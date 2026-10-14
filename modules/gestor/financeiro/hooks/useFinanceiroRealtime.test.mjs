import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

const fixtureName = '__otherCreditsRealtimeFixture';
const root = ['financeiro', 'outros-creditos'];
const list = polo => [...root, 'list', polo];
const summary = polo => [...root, 'summary', { poloId: polo }];
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./useFinanceiroRealtime.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'realtime-fixture', setup(builder) {
    const mocks = {
      react: `export const useEffect = callback => { globalThis.${fixtureName}.cleanup = callback(); };`,
      '@tanstack/react-query': `export const useQueryClient = () => globalThis.${fixtureName}.client;`,
      supabase: `export const supabase = { channel: name => globalThis.${fixtureName}.channel(name), removeChannel: channel => globalThis.${fixtureName}.removeChannel(channel) };`,
      caixa: "export const caixaQueryKeys = { dashboards: ['caixa', 'dashboards'] };",
    };
    builder.onResolve({ filter: /^(react|@tanstack\/react-query)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
    builder.onResolve({ filter: /caixa\/caixa.service$/ }, () => ({ path: 'caixa', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const { useFinanceiroRealtime } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function setup(t, poloId = 'polo-a') {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  const counts = new Map();
  const subscriptions = [];
  const observers = [];
  let onStatus;
  let removed = 0;
  const channel = {
    on(_kind, config, callback) { subscriptions.push({ config, callback }); return this; },
    subscribe(callback) { onStatus = callback; return this; },
  };
  const fixture = {
    client,
    channel() { return channel; },
    removeChannel(value) { assert.equal(value, channel); removed++; },
  };
  globalThis[fixtureName] = fixture;
  const keys = [list('polo-a'), list('polo-b'), summary('polo-a'), summary('polo-b'), ['outro-modulo']];
  for (const queryKey of keys) {
    const id = JSON.stringify(queryKey);
    client.setQueryData(queryKey, []);
    const observer = new QueryObserver(client, {
      queryKey,
      queryFn: async () => { counts.set(id, (counts.get(id) || 0) + 1); return []; },
    });
    observers.push(observer.subscribe(() => {}));
  }
  useFinanceiroRealtime(poloId);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    fixture.cleanup();
  };
  t.after(() => {
    dispose();
    observers.forEach(unsubscribe => unsubscribe());
    client.clear();
    globalThis.window = previousWindow;
    delete globalThis[fixtureName];
  });
  return {
    subscribed: () => onStatus('SUBSCRIBED'),
    status: value => onStatus(value),
    event: row => subscriptions.find(item => item.config.table === 'finance_realtime_events').callback({ new: row }),
    eventFilter: subscriptions.find(item => item.config.table === 'finance_realtime_events').config.filter,
    count: key => counts.get(JSON.stringify(key)) || 0,
    dispose, removed: () => removed,
  };
}

test('conexão e reconexão recuperam lista e resumo ativos somente do polo visível', async t => {
  const s = setup(t);
  assert.equal(s.eventFilter, 'polo_id=eq.polo-a');
  s.subscribed(); await settle();
  assert.equal(s.count(list('polo-a')), 1);
  assert.equal(s.count(summary('polo-a')), 1);
  assert.equal(s.count(list('polo-b')), 0);
  assert.equal(s.count(summary('polo-b')), 0);
  assert.equal(s.count(['outro-modulo']), 0);
  s.status('CHANNEL_ERROR'); await settle();
  assert.equal(s.count(list('polo-a')), 1);
  s.subscribed(); await settle();
  assert.equal(s.count(list('polo-a')), 2);
  assert.equal(s.count(summary('polo-a')), 2);
});

test('mudança de recebível atualiza automaticamente com debounce e ignora outro polo ou fonte', async t => {
  const s = setup(t);
  s.event({ source_table: 'contas_receber', polo_id: 'polo-b' });
  s.event({ source_table: 'fonte_desconhecida', polo_id: 'polo-a' });
  t.mock.timers.tick(500); await settle();
  assert.equal(s.count(list('polo-a')), 0);
  for (let i = 0; i < 3; i++) s.event({ source_table: 'contas_receber', polo_id: 'polo-a' });
  t.mock.timers.tick(499); await settle();
  assert.equal(s.count(list('polo-a')), 0);
  t.mock.timers.tick(1); await settle();
  assert.equal(s.count(list('polo-a')), 1);
  assert.equal(s.count(summary('polo-a')), 1);
  assert.equal(s.count(list('polo-b')), 0);
});

test('visão de todos os polos recupera ambos e desmontagem cancela leitura agendada', async t => {
  const s = setup(t, 'todos');
  assert.equal(s.eventFilter, undefined);
  s.subscribed(); await settle();
  assert.equal(s.count(list('polo-a')), 1);
  assert.equal(s.count(list('polo-b')), 1);
  s.event({ source_table: 'contas_receber', polo_id: 'polo-b' });
  s.dispose();
  t.mock.timers.tick(500); await settle();
  assert.equal(s.count(list('polo-a')), 1);
  assert.equal(s.count(list('polo-b')), 1);
  assert.equal(s.removed(), 1);
});

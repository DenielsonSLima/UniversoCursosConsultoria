import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query';
import { build } from 'esbuild';
import { createBaneseRealtimeRefresh, baneseReadInterval } from './banese-realtime-refresh.ts';

const root = ['configuracoes', 'consulta-api-banese'];
const key = [...root, 'error-summary'];
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const step = async (t, ms) => { t.mock.timers.tick(ms); await settle(); };

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: 300_000, gcTime: Infinity },
  } });
  client.setQueryData(key, { generation: 0 });
  const requests = [];
  let active = 0;
  let maxActive = 0;
  const options = { queryKey: key, queryFn: ({ signal }) => {
    active++;
    maxActive = Math.max(maxActive, active);
    let end;
    const promise = new Promise((resolve, reject) => {
      let done = false;
      end = (error) => {
        if (done) return;
        done = true;
        active--;
        if (error) reject(error);
        else resolve({ generation: requests.length });
      };
      signal.addEventListener('abort', () => end(new globalThis.DOMException('Aborted', 'AbortError')), { once: true });
    });
    requests.push({ signal, end });
    return promise;
  } };
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  const refresh = createBaneseRealtimeRefresh(client);
  t.after(() => { refresh.dispose(); unsubscribe(); client.clear(); });
  return { client, observer, refresh, requests, unsubscribe, maxActive: () => maxActive };
}

test('dez eventos no mesmo burst geram uma consulta, sem concorrência', async t => {
  const s = setup(t);
  for (let i = 0; i < 10; i++) { s.refresh.notify(key); await step(t, 3); }
  await step(t, 719);
  assert.equal(s.requests.length, 0);
  await step(t, 1);
  assert.equal(s.requests.length, 1);
  s.requests[0].end(); await settle();
  assert.equal(s.maxActive(), 1);
  await step(t, 1_000);
  assert.equal(s.requests.length, 1);
});

test('eventos contínuos não adiam indefinidamente a primeira leitura', async t => {
  const s = setup(t);
  for (let i = 0; i < 8; i++) { s.refresh.notify(key); await step(t, 100); }
  assert.equal(s.requests.length, 1, 'a janela original termina apesar dos novos eventos');
  s.refresh.notify(key);
  s.requests[0].end(); await settle();
  await step(t, 750);
  assert.equal(s.requests.length, 2, 'evento durante a leitura recebe uma passagem final');
  s.requests[1].end(); await settle();
  assert.equal(s.maxActive(), 1);
});

test('evento durante fetch existente aguarda e relê no fim, sem cancelar nem perder atualização', async t => {
  const s = setup(t);
  const initial = s.observer.refetch(); await settle();
  for (let i = 0; i < 10; i++) s.refresh.notify(key);
  await step(t, 750);
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].signal.aborted, false);
  s.refresh.notify(key);
  s.requests[0].end(); await initial; await settle();
  await step(t, 750);
  assert.equal(s.requests.length, 2);
  s.requests[1].end(); await settle();
  await step(t, 1_000);
  assert.equal(s.requests.length, 2);
  assert.equal(s.maxActive(), 1);
});

test('erro usa backoff de 30/60s, ignora tempestade e recupera sem novo evento', async t => {
  const s = setup(t);
  s.refresh.notify(key); await step(t, 750);
  s.requests[0].end(new Error('temporariamente indisponível')); await settle();
  for (let i = 0; i < 10; i++) s.refresh.notify(root);
  await step(t, 29_999);
  assert.equal(s.requests.length, 1);
  await step(t, 1);
  assert.equal(s.requests.length, 2);
  s.requests[1].end(new Error('ainda indisponível')); await settle();
  await step(t, 59_999);
  assert.equal(s.requests.length, 2);
  await step(t, 1);
  assert.equal(s.requests.length, 3);
  s.requests[2].end(); await settle();
  await step(t, 60_000);
  assert.equal(s.requests.length, 3);
  assert.equal(s.observer.getCurrentResult().status, 'success');
  assert.equal(s.maxActive(), 1);
});

test('prefixos sobrepostos atualizam cada query uma vez e páginas inativas só ficam stale', async t => {
  const s = setup(t);
  const inactive = [...root, 'attempts', 'errors', 4];
  s.client.setQueryData(inactive, { items: [] });
  s.refresh.notify(root); s.refresh.notify(key); s.refresh.notify([...root, 'attempts']);
  await step(t, 750);
  assert.equal(s.requests.length, 1);
  assert.equal(s.client.getQueryState(inactive).isInvalidated, true);
  assert.equal(s.client.getQueryState(inactive).fetchStatus, 'idle');
  s.requests[0].end(); await settle();
});

test('erro de uma query não bloqueia outra query saudável do mesmo prefixo', async t => {
  const s = setup(t);
  s.refresh.notify(key); await step(t, 750);
  s.requests[0].end(new Error('indisponível')); await settle();
  const healthyKey = [...root, 'attempts', 'queries', 1];
  s.client.setQueryData(healthyKey, []);
  let healthyCalls = 0;
  const observer = new QueryObserver(s.client, {
    queryKey: healthyKey, queryFn: async () => { healthyCalls++; return []; },
  });
  const unsubscribe = observer.subscribe(() => {});
  t.after(unsubscribe);
  s.refresh.notify(root);
  await step(t, 750);
  assert.equal(healthyCalls, 1);
  assert.equal(s.requests.length, 1, 'erro continua em backoff enquanto a consulta saudável atualiza');
  await step(t, 29_250);
  assert.equal(s.requests.length, 2);
  s.requests[1].end(); await settle();
});

test('dispose e saída da tela cancelam sinal e não deixam releitura tardia', async t => {
  const s = setup(t);
  const initial = s.observer.refetch(); await settle();
  s.refresh.notify(key); await step(t, 750);
  s.refresh.dispose(); s.unsubscribe(); await initial; await settle();
  assert.equal(s.requests[0].signal.aborted, true);
  await step(t, 120_000);
  assert.equal(s.requests.length, 1);
  s.refresh.notify(key); await step(t, 1_000);
  assert.equal(s.requests.length, 1);
});

test('offline pausa recuperação sem loop de 750ms e retoma quando a conexão volta', async t => {
  const s = setup(t);
  s.client.mount();
  t.after(() => { onlineManager.setOnline(true); s.client.unmount(); });
  const refetch = t.mock.method(s.client, 'refetchQueries');
  s.refresh.notify(key); await step(t, 750);
  s.requests[0].end(new Error('indisponível')); await settle();
  onlineManager.setOnline(false);
  await step(t, 30_000);
  assert.equal(s.client.getQueryState(key).fetchStatus, 'paused');
  await step(t, 60_000);
  assert.equal(refetch.mock.callCount(), 2);
  assert.equal(s.requests.length, 1);
  onlineManager.setOnline(true); await settle();
  assert.equal(s.requests.length, 2);
  s.requests[1].end(); await settle();
  assert.equal(s.observer.getCurrentResult().status, 'success');
});

test('dispose antes da janela evita qualquer request; backoff de polling permanece limitado', async t => {
  const s = setup(t);
  s.refresh.notify(key); s.refresh.dispose(); await step(t, 750);
  assert.equal(s.requests.length, 0);
  assert.equal(baneseReadInterval({ state: { status: 'success', errorUpdateCount: 100 } }), 30_000);
  assert.equal(baneseReadInterval({ state: { status: 'error', errorUpdateCount: 1 } }), 30_000);
  assert.equal(baneseReadInterval({ state: { status: 'error', errorUpdateCount: 100 } }), 60_000);
});

test('serviço propaga AbortSignal aos cinco RPCs de leitura e rejeita conclusão após abort', async () => {
  const calls = [];
  let hold = false;
  const pending = [];
  globalThis.__baneseReadRpc = { rpc(name) {
    const call = { name, signal: undefined };
    calls.push(call);
    const promise = hold ? new Promise(resolve => pending.push(resolve)) : Promise.resolve({ data: {}, error: null });
    return { abortSignal(signal) { call.signal = signal; return this; }, then: promise.then.bind(promise) };
  } };
  try {
    const result = await build({
      entryPoints: [fileURLToPath(new URL('./consulta-api-banese.service.ts', import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
      plugins: [{ name: 'fake-supabase', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export const supabase = globalThis.__baneseReadRpc;', loader: 'js',
        }));
      } }],
    });
    const { consultaApiBaneseService: service } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const controller = new AbortController();
    await service.getDashboard(controller.signal);
    await service.getErrorSummary(controller.signal);
    await service.getAttemptsPage('errors', 1, 20, controller.signal);
    await service.getRunsPage({ page: 1, errorsOnly: false }, controller.signal);
    assert.equal(calls.length, 5);
    assert.ok(calls.every(call => call.signal === controller.signal));
    await service.getDashboard({ signal: controller.signal });
    assert.equal(calls.length, 7, 'consumidor queryFn direto mantém o mesmo contrato de sinal');
    assert.ok(calls.every(call => call.signal === controller.signal));
    hold = true;
    const late = service.getDashboard(controller.signal);
    controller.abort();
    for (const resolve of pending) resolve({ data: {}, error: null });
    await assert.rejects(late, { name: 'AbortError' });
    const count = calls.length;
    await assert.rejects(service.getErrorSummary(controller.signal), { name: 'AbortError' });
    assert.equal(calls.length, count, 'sinal já cancelado não inicia RPC');
  } finally { delete globalThis.__baneseReadRpc; }
});

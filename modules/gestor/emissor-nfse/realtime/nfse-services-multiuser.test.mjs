import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { build } from 'esbuild';
const base = fileURLToPath(new URL('../../../../', import.meta.url));

test('services application cache + sanitized realtime refresh both actors without waiting staleTime; reconnect recovers gaps', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-multiuser-'));
  const output = resolve(temp, 'api.mjs');
  const compiled = await build({ stdin: { contents: `
    export {applicationReadCachePolicy} from './lib/query-cache-policy';
    export {nfseSummaryCacheOptions} from './modules/gestor/emissor-nfse/queries/nfse-summary-cache';
    export {nfsePartnerServicesKeys} from './modules/gestor/emissor-nfse/parceiros/queries/nfse-partner-services.keys';
    export {nfseRealtimeTargets} from './modules/gestor/emissor-nfse/realtime/nfse.realtime';
    export {subscribeNfseChanges} from './modules/gestor/emissor-nfse/realtime/nfse-subscription';`, loader: 'ts', resolveDir: base },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', outfile: output });
  await writeFile(output, compiled.outputFiles[0].contents);
  const api = await import(pathToFileURL(output).href);
  assert.equal(api.nfseSummaryCacheOptions, api.applicationReadCachePolicy, 'Not an isolated NFSe duration');
  assert((await readFile(resolve(base, 'index.tsx'), 'utf8')).includes('...applicationReadCachePolicy'));
  const hooks = await readFile(resolve(base, 'modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerServices.ts'), 'utf8');
  assert(hooks.includes('...applicationReadCachePolicy'));
  assert(!hooks.includes('gcTime: 0'));
  const poloId = '11111111-1111-4111-8111-111111111111';
  const scope = { contextKey: 'actor-a', poloId, environment: 'PRODUCAO', month: '2026-11' };
  let databaseValue = 1;
  const sessions = [];
  function session(contextKey, polo = poloId) {
    const current = { ...scope, contextKey, poloId: polo };
    const client = new QueryClient(); let reads = 0;
    const key = [...api.nfsePartnerServicesKeys.scope(current), "list", 1];
    const observer = new QueryObserver(client, { ...api.nfseSummaryCacheOptions, retry: false, queryKey: key,
      queryFn: async () => { reads++; return { total: databaseValue, contextKey }; } });
    const unobserve = observer.subscribe(() => {});
    let event, status;
    const channel = { on(_type, _filter, fn) { event = fn; return channel; }, subscribe(fn) { status = fn; return channel; } };
    const cleanup = api.subscribeNfseChanges({ channel: () => channel, removeChannel: () => Promise.resolve('ok') }, client, contextKey,
      [{ table: 'nfse_change_events', filter: `polo_id=eq.${polo}`, targets: p => api.nfseRealtimeTargets(p, current) }], [key]);
    const s = { client, key, cleanup, unobserve, emit: p => event(p), status: s => status(s), reads: () => reads, data: () => client.getQueryData(key) };
    sessions.push(s); return s;
  }
  try {
    const a = session('actor-a'), b = session('actor-b'), other = session('actor-c', '22222222-2222-4222-8222-222222222222');
    await wait(20); assert.equal(a.reads(), 1); assert.equal(b.reads(), 1);
    databaseValue = 2;
    const payload = { new: { version: 1, polo_id: poloId, environment: scope.environment, month: scope.month, resource: 'services' } };
    sessions.forEach(s => s.emit(payload)); await wait(180);
    assert.equal(a.data().total, 2); assert.equal(b.data().total, 2); assert.equal(other.data().total, 1);
    assert.equal(a.data().contextKey, 'actor-a'); assert.equal(b.data().contextKey, 'actor-b');
    assert.equal(a.reads(), 2, 'Realtime bypasses fresh cache immediately');
    a.status('CHANNEL_ERROR'); databaseValue = 3; await wait(180);
    assert.equal(a.reads(), 2, 'No retry polling after channel error');
    assert.equal(a.data().total, 2, 'Keep last projection during network gap');
    a.status('SUBSCRIBED'); await wait(180); assert.equal(a.data().total, 3);
    a.cleanup(); databaseValue = 4; a.emit(payload); a.status('SUBSCRIBED'); await wait(180);
    assert.equal(a.data().total, 3, 'Disposed callbacks cannot affect cache after navigation');
  } finally { sessions.forEach(s => { s.cleanup(); s.unobserve(); s.client.clear(); }); await rm(temp, { recursive: true, force: true }); }
});

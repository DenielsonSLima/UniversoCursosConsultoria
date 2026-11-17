import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { build } from 'esbuild';
const base = fileURLToPath(new URL('../../../../', import.meta.url));

test('background refresh retains health, serializes bursts and retains the last event', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-stability-'));
  const output = resolve(temp, 'api.mjs');
  await build({ stdin: { contents: `
    export {subscribeNfseChanges} from './modules/gestor/emissor-nfse/realtime/nfse-subscription';
    export {describeNfseEnvironmentStatus} from './modules/gestor/emissor-nfse/components/NfseEnvironmentStatus';
    export {NfseAccessError} from './modules/gestor/emissor-nfse/services/nfse.errors';
  `, loader: 'ts', resolveDir: base }, bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: output });
  const api = await import(pathToFileURL(output).href);
  const now = Date.now(), query = { error: null, isPending: false, isFetching: false };
  const props = { enabled: true, workspace: query, queue: query, health: {
    data: { state: 'AVAILABLE', reason: 'NATIONAL_QUERY_OK', checkedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60000).toISOString() }, error: null, isFetching: false } };
  assert.equal(api.describeNfseEnvironmentStatus(props, now).state, 'ok');
  assert.equal(api.describeNfseEnvironmentStatus({ ...props, workspace: { ...query, isFetching: true } }, now).state, 'ok');
  assert.equal(api.describeNfseEnvironmentStatus({ ...props, workspace: { ...query, isPending: true, isFetching: true } }, now).state, 'unknown');
  assert.equal(api.describeNfseEnvironmentStatus(props, now + 60001).state, 'unknown');
  assert.equal(api.describeNfseEnvironmentStatus({ ...props, queue: { ...query, error: new Error('network') } }, now).state, 'error');
  assert.equal(api.describeNfseEnvironmentStatus({ ...props, health: { ...props.health, data: { ...props.health.data, state: 'UNAVAILABLE' } } }, now).state, 'error');
  assert.equal(api.describeNfseEnvironmentStatus({ ...props, queue: { ...query, error: new api.NfseAccessError(), isFetching: true } }, now).state, 'unknown');
  const client = new QueryClient(), key = ['nfse-stability', 'actor-a'];
  let reads = 0, aborted = 0, database = 1, release, holdNext = false;
  const observer = new QueryObserver(client, { queryKey: key, retry: false, staleTime: Infinity, queryFn: async ({signal}) => {
    reads++; const snapshot = database;
    signal.addEventListener('abort', () => aborted++);
    if (reads === 2 || holdNext) { holdNext = false; await new Promise(resolve => { release = resolve; }); }
    return snapshot;
  } });
  const unobserve = observer.subscribe(() => {});
  let emit;
  const channel = { on(_type, _filter, fn) { emit = fn; return channel; }, subscribe() { return channel; } };
  const cleanup = api.subscribeNfseChanges({ channel: () => channel, removeChannel: async () => 'ok' },
    client, 'test', [{ table: 'events', filter: 'polo', targets: () => [key] }], [key]);
  try {
    await wait(20);
    database = 2; emit({});
    await wait(180); assert.equal(reads, 2);
    database = 3; emit({}); emit({});
    await wait(180);
    assert.equal(reads, 2, 'No cancel/restart during slow read');
    assert.equal(client.getQueryData(key), 1, 'Existing data stays visible');
    release(); await wait(200);
    assert.equal(aborted, 0);
    assert.equal(reads, 3, 'Only one follow-up for pending burst');
    assert.equal(client.getQueryData(key), 3, 'Latest database state is not dropped');
    holdNext = true; database = 4;
    const earlierRead = observer.refetch();
    await wait(10); database = 5; emit({});
    await wait(180); assert.equal(reads, 4, 'Existing focus/manual read is not cancelled');
    release(); await earlierRead; await wait(30);
    assert.equal(reads, 5, 'A pre-event read gets one post-event refresh');
    assert.equal(client.getQueryData(key), 5);
    assert.equal(aborted, 0);
    database = 6; emit({}); cleanup(); await wait(180);
    assert.equal(client.getQueryData(key), 5, 'Navigation disposes pending updates');
  } finally {
    release?.(); cleanup(); unobserve(); client.clear();
    await rm(temp, { recursive: true, force: true });
  }
});

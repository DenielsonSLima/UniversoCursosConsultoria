import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { build } from 'esbuild';
const { JSDOM } = await import(process.env.NFSE_TEST_JSDOM_MODULE ? pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const scope = { contextKey: 'person-a-context', poloId: '11111111-1111-4111-8111-111111111111', environment: 'PRODUCAO', month: '2026-11' };

test('summary queries retain same-key data on return/revalidation but isolate context, polo, environment and month', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-summary-cache-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const pending = []; let calls = 0;
  globalThis.__summaryRead = (s, kind) => { calls++; return new Promise(resolveRead => pending.push(() => resolveRead({ marker: `${s.contextKey}/${s.poloId}/${s.environment}/${s.month}/${kind}` }))); };
  const output = resolve(temp, 'hooks.mjs');
  const compiled = await build({ stdin: { contents: `export {useNfseWorkspace,useNfseDocuments} from './modules/gestor/emissor-nfse/hooks/useNfseQueries';
    export {useNfseQueue} from './modules/gestor/emissor-nfse/fila/useNfseQueue';
    export {nfseQueryKeys} from './modules/gestor/emissor-nfse/queries/nfse.queryKeys';
    export {nfseQueueKeys} from './modules/gestor/emissor-nfse/fila/nfse-queue.types';`, loader: 'tsx', resolveDir: base },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', outfile: output,
    plugins: [{ name: 'read-only-fixture', setup(b) {
      b.onResolve({ filter: /\/nfse\.service$/ }, () => ({ path: 'workspace', namespace: 'fixture' }));
      b.onResolve({ filter: /\/nfse-queue\.service$/ }, () => ({ path: 'queue', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'workspace'
        ? 'export const nfseService={workspace:s=>globalThis.__summaryRead(s,"workspace"),documents:s=>globalThis.__summaryRead(s,"documents")};'
        : 'export const nfseQueueService={list:s=>globalThis.__summaryRead(s,"queue")};', loader: 'js' }));
    } }] });
  await writeFile(output, compiled.outputFiles[0].contents);
  const api = await import(pathToFileURL(output).href);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.getElementById('root'));
  const filters = { status: 'EMITIDA', issuedState: 'ACTIVE', page: 1 };
  function View({ current }) {
    const results = [api.useNfseWorkspace(current), api.useNfseDocuments(current, filters), api.useNfseQueue(current)];
    return React.createElement('div', null, results.map((q, i) => React.createElement('output', { key: i, 'data-fetching': q.isFetching }, q.data?.marker ?? 'empty')));
  }
  const render = current => act(async () => { root.render(React.createElement(QueryClientProvider, { client }, current ? React.createElement(View, { current }) : null)); });
  const settle = () => act(async () => { pending.splice(0).forEach(resolveRead => resolveRead()); await new Promise(r => setTimeout(r, 10)); });
  try {
    await render(scope); assert.equal(document.querySelectorAll('output')[0].textContent, 'empty');
    await settle(); assert.equal(calls, 3);
    const initial = document.body.textContent;
    await render(null); await new Promise(r => setTimeout(r, 10));
    assert(client.getQueryData(api.nfseQueryKeys.workspace(scope)), 'Unmount must not immediately discard summary');
    await render(scope); assert.equal(document.body.textContent, initial); assert.equal(calls, 3, 'Fresh remount reuses cache');
    await act(async () => { void client.invalidateQueries({ queryKey: api.nfseQueryKeys.scope(scope) }); void client.invalidateQueries({ queryKey: api.nfseQueueKeys.scope(scope) }); });
    assert.equal(document.body.textContent, initial, 'Realtime/refetch retains same-key projection');
    assert.equal(calls, 6); await settle();
    for (const next of [{ ...scope, contextKey: 'person-b-context' }, { ...scope, poloId: '22222222-2222-4222-8222-222222222222' },
      { ...scope, environment: 'HOMOLOGACAO' }, { ...scope, month: '2026-12' }]) {
      await render(next); assert([...document.querySelectorAll('output')].every(e => e.textContent === 'empty'), 'Never show another key’s cached data');
      await settle(); assert(document.body.textContent.includes(next.contextKey));
    }
    await render(null); client.clear(); await render(scope);
    assert([...document.querySelectorAll('output')].every(e => e.textContent === 'empty'), 'Session clear removes retained projections');
    await settle();
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); delete globalThis.__summaryRead; await rm(temp, { recursive: true, force: true }); }
});

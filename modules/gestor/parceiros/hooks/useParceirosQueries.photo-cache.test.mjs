import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider, focusManager } = require('@tanstack/react-query');
const jsdomPath = process.env.LGPD_JSDOM_PATH;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath, 'lib/api.js')).href : 'jsdom');
const directory = dirname(fileURLToPath(import.meta.url));

async function components() {
  const bundle = await build({
    stdin: { contents: `export { useParceirosQueries } from './useParceirosQueries';
      export { parceirosService } from '../parceiros.service';
      export { parceirosQueryKeys } from '../parceiros.query-keys';
      export { alunosStatusService } from '../../alunos-status/alunos-status.service';`, resolveDir: directory, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' },
    define: { 'import.meta': JSON.stringify({ env: {} }) },
    plugins: [{ name: 'deny-remote', setup(plugin) {
      plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'denied' }));
      plugin.onLoad({ filter: /.*/, namespace: 'denied' }, () => ({ contents: 'export const supabase=new Proxy({}, {get(){throw Error("I/O bloqueado no teste")}}); export const requestPublicPortalAuth=()=>{throw Error("Auth bloqueado no teste")};' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

test('cache de fotos revalida lista na remontagem sem perder escopo nem criar polling', async context => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://synthetic.invalid' });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
  const previous = new Map(names.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let network = 0;
  names.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'fetch' ? async () => { network++; throw Error('Rede bloqueada'); } : key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] }));
  const originalNow = Date.now;
  let clock = 1_800_000_000_000;
  Date.now = () => clock;
  const { createRoot } = await import('react-dom/client');
  const { useParceirosQueries, parceirosService, parceirosQueryKeys, alunosStatusService } = await components();
  const calls = [];
  parceirosService.getAll = async (type, scope) => { calls.push({ type, ...scope }); return [{ id: 'student-demo', foto: `signed-${calls.length}` }]; };
  parceirosService.getTurmasDisponiveis = async () => { throw Error('Turmas não solicitadas'); };
  alunosStatusService.getKpis = async () => ({});
  let root, client;
  function Harness({ scope }) {
    const { allPartners } = useParceirosQueries({ ...scope, enableTurmas: false });
    return React.createElement('output', null, allPartners[0]?.foto || 'empty');
  }
  const settle = async () => act(async () => { await new Promise(done => setTimeout(done, 20)); });
  const unmount = async () => { if (root) await act(async () => root.unmount()); root = null; };
  const mount = async scope => {
    await unmount();
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { scope }))));
    await settle();
  };
  const reset = async () => {
    await unmount(); client?.clear(); calls.length = 0;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } } });
  };
  try {
    await context.test('cache com 3min permanece e remontagem após 4min renova a URL', async () => {
      await reset(); const key = parceirosQueryKeys.list('polo-a', false);
      client.setQueryData(key, [{ id: 'student-demo', foto: 'signed-old' }], { updatedAt: clock - 180_000 });
      await mount({ poloId: 'polo-a', includeGlobal: false }); assert.equal(calls.length, 0);
      assert.equal(document.querySelector('output').textContent, 'signed-old');
      await unmount(); clock += 60_001;
      await mount({ poloId: 'polo-a', includeGlobal: false });
      assert.equal(calls.length, 1); assert.equal(document.querySelector('output').textContent, 'signed-1');
      assert.deepEqual(calls[0], { type: 'todos', poloId: 'polo-a', includeGlobal: false });
    });
    await context.test('invalidação ativa preserva polo/global e não refaz consultas inativas', async () => {
      await reset(); const local = parceirosQueryKeys.list('polo-a', false), other = parceirosQueryKeys.list('polo-b', false);
      client.setQueryData(local, [{ foto: 'local-cached' }]); client.setQueryData(other, [{ foto: 'other-cached' }]);
      await mount({ poloId: 'polo-a', includeGlobal: false }); assert.equal(calls.length, 0);
      await act(async () => { await client.invalidateQueries({ queryKey: other }); }); await settle();
      assert.equal(calls.length, 0);
      await act(async () => { await client.invalidateQueries({ queryKey: parceirosQueryKeys.all }); }); await settle();
      assert.equal(calls.length, 1); assert.equal(client.getQueryData(other)[0].foto, 'other-cached');
      await mount({ poloId: 'polo-a', includeGlobal: true }); assert.equal(calls.length, 2);
      assert.deepEqual(calls[1], { type: 'todos', poloId: 'polo-a', includeGlobal: true });
      assert.notDeepEqual(local, parceirosQueryKeys.list('polo-a', true));
    });
    await context.test('tempo ativo não cria polling e lista desabilitada não consulta', async () => {
      await reset(); await mount({ poloId: 'polo-a', includeGlobal: false }); assert.equal(calls.length, 1);
      clock += 600_000; await settle(); assert.equal(calls.length, 1);
      await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); }); await settle();
      assert.equal(calls.length, 2, 'somente foco explícito revalida lista stale sem polling');
      await reset(); await mount({ poloId: 'polo-a', includeGlobal: false, enablePartners: false });
      assert.equal(calls.length, 0);
    });
    assert.equal(network, 0);
  } finally {
    await unmount(); client?.clear(); focusManager.setFocused(undefined); Date.now = originalNow; dom.window.close();
    previous.forEach((descriptor, key) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key));
  }
});

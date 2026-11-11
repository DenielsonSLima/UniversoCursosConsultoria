import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };

test('numbering panel distinguishes authorization and DPS, stays readonly and clears scope on environment switch or error', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-numbering-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseNumberingPanel.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    plugins: [{ name: 'block-live-supabase', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden")}});', loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { default: Panel } = await import(pathToFileURL(bundle).href);
  const calls = []; let fail = false;
  const service = { get: async target => { calls.push({ ...target }); if (fail) throw new Error('Synthetic failure'); return {
    checkedAt: '2026-11-11T00:00:00Z', lastAuthorized: target.environment === 'PRODUCAO' ? { number: '123', authorizedAt: '2026-11-10T20:00:00Z', state: 'CANCELLED' } : null,
    dps: target.environment === 'PRODUCAO' ? { series: '49998', lastAllocated: '2', nextNumber: '10', nextNumberIsEstimate: true, allocatorScope: 'SHARED_DATABASE_IDENTITY' } : null,
  }; } };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const render = target => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Panel, { scope: target, service })));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  const refresh = () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Atualizar numeração'));
  try {
    await act(async () => render(scope)); await settle();
    assert(document.body.textContent.includes('123')); assert(document.body.textContent.includes('49998'));
    assert(document.body.textContent.includes('Cancelada · autorização histórica preservada'));
    assert(document.body.textContent.includes('estimativa da sequência compartilhada'));
    assert.equal(document.querySelector('input,select,textarea'), null); assert.equal(calls.length, 1);
    await act(async () => render({ ...scope, environment: 'HOMOLOGACAO' })); await settle();
    assert(document.body.textContent.includes('Ainda sem nota confirmada neste sistema'));
    assert(!document.body.textContent.includes('49998')); assert.equal(calls.at(-1).environment, 'HOMOLOGACAO');
    fail = true; await act(async () => refresh().click()); await settle();
    assert(document.querySelector('[role="alert"]').textContent.includes('Não foi possível consultar'));
    assert(!document.body.textContent.includes('Ainda sem nota confirmada neste sistema'), 'Read failure is not an empty authorized history');
    fail = false; await act(async () => refresh().click()); await settle();
    assert.equal(document.querySelector('[role="alert"]'), null); assert(document.body.textContent.includes('Ainda sem nota confirmada neste sistema'));
    assert.equal(document.querySelector('input,select,textarea'), null);
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
});

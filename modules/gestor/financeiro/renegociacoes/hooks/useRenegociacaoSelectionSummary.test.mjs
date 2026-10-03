import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina RENEGOCIACAO_JSDOM_PATH.');
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('resumo usa consulta real, agrupa cliques, cancela anterior e nunca mostra total de seleção antiga', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'universo-renegociacao-summary-'));
  const bundle = join(directory, 'summary.cjs');
  await build({
    stdin: { contents: `
      import React, { act, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { useRenegociacaoSelectionSummary } from './useRenegociacaoSelectionSummary.ts';
      const client = new QueryClient();
      let root, updateState, latest;
      function Harness() {
        const [input, setInput] = useState({ ids: ['r1'], alunoId: 'a1' });
        updateState = setInput;
        latest = useRenegociacaoSelectionSummary({ poloId: 'p1', alunoId: input.alunoId,
          matriculaId: 'm1', turmaId: 't1' }, input.ids, '2026-10-03');
        return null;
      }
      export const result = () => latest;
      export const interact = async (fn) => { await act(async () => { fn(); }); };
      export const wait = async () => { await act(async () => { await new Promise(r => setTimeout(r, 185)); }); };
      export const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
      export const update = async (value) => { await act(async () => { updateState(value); }); };
      export const mount = async (container) => {
        root = createRoot(container);
        await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>));
      };
      export const unmount = async () => { await act(async () => root.unmount()); client.clear(); };
    `, loader: 'tsx', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'summary-transport-only', setup(api) {
      api.onResolve({ filter: /renegociacoes\.selection-summary\.service$/ }, () => ({ path: 'summary-service', namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
        export const getRenegociacaoSelectionSummary = (identity, ids, asOf, signal) => new Promise((resolve, reject) => {
          const request = { identity, ids, asOf, resolve, reject, aborted: false };
          globalThis.__summaryRequests.push(request);
          signal.addEventListener('abort', () => { request.aborted = true; reject(new Error('aborted')); }, { once: true });
        });
      ` }));
    } }],
  });
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://universo.test/', pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true, __summaryRequests: [] };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const harness = require(bundle);
  try {
    await harness.mount(document.getElementById('root'));
    assert.equal(harness.result().loading, true);
    assert.equal(globalThis.__summaryRequests.length, 0);
    await harness.update({ ids: ['r1', 'r2'], alunoId: 'a1' });
    await harness.wait();
    assert.equal(globalThis.__summaryRequests.length, 1, 'cliques rápidos formam uma consulta');
    assert.deepEqual(globalThis.__summaryRequests[0].ids, ['r1', 'r2']);
    await harness.interact(() => globalThis.__summaryRequests[0].resolve({ marker: 'original' }));
    await harness.settle();
    assert.equal(harness.result().data.marker, 'original');
    await harness.update({ ids: ['r1'], alunoId: 'a1' });
    assert.equal(harness.result().data, undefined, 'não exibe total anterior durante debounce');
    await harness.wait();
    assert.equal(globalThis.__summaryRequests.length, 2);
    await harness.update({ ids: ['r3'], alunoId: 'a1' });
    assert.equal(globalThis.__summaryRequests[1].aborted, true);
    await harness.wait();
    await harness.interact(() => globalThis.__summaryRequests[2].resolve({ marker: 'nova' }));
    await harness.settle();
    assert.equal(harness.result().data.marker, 'nova');
    await harness.update({ ids: ['r3'], alunoId: 'outro' });
    assert.equal(harness.result().data, undefined);
    await harness.wait();
    assert.equal(globalThis.__summaryRequests[3].identity.alunoId, 'outro');
    await harness.interact(() => globalThis.__summaryRequests[3].reject(new Error('Falha de leitura')));
    await harness.settle();
    assert.equal(harness.result().loading, false);
    assert.equal(harness.result().data, undefined);
    assert.match(harness.result().error.message, /Falha de leitura/);
    await harness.update({ ids: [], alunoId: 'outro' });
    await harness.wait();
    assert.equal(globalThis.__summaryRequests.length, 4, 'seleção vazia não consulta');
    assert.equal(harness.result().loading, false);
  } finally {
    await harness.unmount();
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});

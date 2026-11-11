import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));

test('environment indicator preserves scope and never turns internal reads into fiscal health', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-environment-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const fixture = { environment: 'PRODUCAO', scopes: [], query: { data: {
    summary: { errorCount: 1 }, readiness: { status: 'BLOCKED' } }, error: null, isPending: false, isFetching: false },
    queue: { data: { summary: { preparedCount: 0 } }, error: null, isPending: false, isFetching: false } };
  globalThis.__nfseEnvironmentFixture = fixture;
  const output = resolve(temp, 'page.mjs');
  const mocks = {
    useNfseEnvironment: 'export const useNfseEnvironment=()=>[globalThis.__nfseEnvironmentFixture.environment,()=>{throw new Error("Must not change environment") }];',
    useNfseQueries: 'export const useNfseWorkspace=(scope)=>{const f=globalThis.__nfseEnvironmentFixture;f.scopes.push(scope);return f.query;};',
    useNfseQueue: 'export const useNfseQueue=()=>globalThis.__nfseEnvironmentFixture.queue;',
    useNfseRealtime: 'export const useNfseRealtime=()=>{};',
    useNfseQueueRealtime: 'export const useNfseQueueRealtime=()=>{};',
    'nfse.scope': 'export const getNfseCurrentMonth=()=>"2026-11";export const isNfseScopeValid=s=>Boolean(s?.poloId && s?.contextKey && s?.month);',
    NfseTabContext: 'import {createContext} from "react";export const NfseTabContext=createContext(null);',
    NfsePreparationDraft: 'export const NfsePreparationDraftProvider=({children})=>children;',
    ToastNotification: 'export const useToast=()=>({toasts:[],removeToast:()=>{},toast:{success:()=>{}}});export default ()=>null;',
    'nfse.presentation': 'export const formatNfseMoney=()=>"—";',
    FinancialUnderlineTabs: 'export default ()=>null;',
    NfseDataState: 'export default ()=>null;',
    NfseMonthPicker: 'export default ()=>null;',
  };
  const compiled = await build({
    stdin: { contents: 'export { default } from "./modules/gestor/emissor-nfse/EmissorNfsePage";export { NfseAccessError } from "./modules/gestor/emissor-nfse/services/nfse.errors";',
      resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    outfile: output, loader: { '.css': 'empty' },
    plugins: [{ name: 'isolated-environment-fixture', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const name = args.path.split('/').at(-1);
        if (Object.hasOwn(mocks, name)) return { path: name, namespace: 'fixture' };
        if (/NfseTab$/.test(name)) return { path: 'tab', namespace: 'fixture' };
        if (args.path.endsWith('.css')) return { path: 'css', namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: mocks[args.path] ?? (args.path === 'css' ? '' : 'export default ()=>null;'), loader: 'js', resolveDir: base,
      }));
    } }],
  });
  await writeFile(output, compiled.outputFiles[0].contents);
  const { default: Page, NfseAccessError } = await import(pathToFileURL(output).href);
  const root = createRoot(document.getElementById('root'));
  const render = async (extra = {}) => {
    await act(async () => root.render(React.createElement(Page, {
      poloId: 'synthetic-polo', contextKey: 'synthetic-context', isMatriz: true, ...extra,
    })));
    return document.querySelector('[role="status"]');
  };
  try {
    let badge = await render();
    assert.equal(badge.textContent, 'Produção');
    assert.equal(document.querySelector('[role="combobox"],select'), null);
    assert.equal(badge.dataset.nfseHealth, 'unknown', 'Old rejected notes/readiness do not mean an outage');
    assert.match(badge.getAttribute('aria-label'), /não verificada/);
    assert.equal(badge.querySelector('circle').getAttribute('fill'), '#94a3b8');
    assert.equal(fixture.scopes.at(-1).environment, 'PRODUCAO');
    fixture.query.data = { summary: { errorCount: 0 }, readiness: { status: 'READY' } };
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'unknown', 'Even READY is eligibility, not a live provider check');

    fixture.environment = 'HOMOLOGACAO';
    badge = await render();
    assert.equal(badge.textContent, 'Homologação');
    assert.equal(fixture.scopes.at(-1).environment, 'HOMOLOGACAO');
    assert.match(badge.title, /configurações fiscais/);

    fixture.query.error = new Error('Synthetic internal read failure');
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'error');
    assert.equal(badge.querySelector('circle').getAttribute('fill'), '#dc2626');
    assert.match(badge.title, /Falha na última consulta/);
    assert(!badge.title.includes('Synthetic'), 'Do not expose raw error payloads');

    fixture.query.isFetching = true;
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'unknown');
    fixture.query.error = null; fixture.query.isFetching = false;
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'unknown', 'Recovery of internal reads cannot prove fiscal health');

    fixture.queue.error = new Error('Queue unavailable');
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'error');
    fixture.queue.error = new NfseAccessError();
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'unknown', 'Access denied is not an outage');
    assert.match(badge.title, /Acesso/);
    fixture.queue.error = Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'unknown', 'Cancelled reads are not outages');
    fixture.queue.error = null; fixture.query.isPending = true;
    badge = await render();
    assert.equal(badge.dataset.nfseHealth, 'unknown');
    assert.match(badge.title, /Verificando/);
    fixture.query.isPending = false;
    badge = await render({ poloId: null });
    assert.equal(badge.dataset.nfseHealth, 'unknown');
    assert.match(badge.title, /Selecione uma unidade/);

    const source = await readFile(resolve(base, 'modules/gestor/emissor-nfse/EmissorNfsePage.tsx'), 'utf8');
    assert(!source.includes('setEnvironment'), 'Removing a picker must not change the saved environment');
    assert(source.includes('useNfseEnvironment({ poloId, contextKey })'));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__nfseEnvironmentFixture;
    await rm(temp, { recursive: true, force: true });
  }
});

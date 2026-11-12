import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act, useState } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const scope = { contextKey: 'synthetic-context', poloId: 'synthetic-polo', environment: 'PRODUCAO', month: '2026-11' };

test('issued list keeps three horizontal rows per note, visible actions and server filters with page-scoped ZIP selection', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true }); const temp = await mkdtemp(resolve(base, 'tmp/nfse-issued-list-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client'); const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const output = resolve(temp, 'test.mjs'), requested = [], actions = [];
  const rows = [2, 3].map(number => ({ id: `synthetic-note-${number}`, studentName: 'PARCEIRO SINTÉTICO', classLabel: 'Turma sintética', modelLabel: 'MODELO SINTÉTICO', amount: '260.00',
    recipientDocument: '00100203000100', recipientCity: 'Canhoba', recipientState: 'SE', status: 'EMITIDA', state: number === 2 ? 'CANCELLED' : 'AUTHORIZED', number: String(number), accessKey: String(number).repeat(50),
    emittedAt: '2026-11-11T01:00:00Z', dateSource: 'NFSE_DH_PROC', origin: 'SERVICO', courseTypeLabel: null }));
  globalThis.__issuedQuery = (_scope, filters) => { requested.push(filters); if (globalThis.__issuedFail) return { data: undefined, error: new Error('Synthetic query failure'), isPending: false, isFetching: false, refetch: async () => {} }; const serverRows = filters.issuedState === 'CANCELLED' ? rows.filter(row => row.state === 'CANCELLED') : filters.issuedState === 'ACTIVE' ? rows.filter(row => row.state !== 'CANCELLED') : rows; return { data: { rows: serverRows, page: filters.page, pageSize: 25, totalItems: 26,
    supportsFilters: true, courseTypes: [{ value: 'TECNICO', label: 'Técnico' }, { value: 'EAD', label: 'EAD' }] }, error: null, isPending: false, isFetching: false, refetch: async () => {} }; };
  const compiled = await build({ stdin: { contents: `export {default as List} from './modules/gestor/emissor-nfse/components/NfseDocumentsList';
    export {default as Actions} from './modules/gestor/emissor-nfse/emitidas/NfseDocumentActions';
    export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: output, loader: { '.css': 'empty' },
    plugins: [{ name: 'issued-read-fixture', setup(builder) {
      builder.onResolve({ filter: /useNfseQueries$/ }, () => ({ path: 'query', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'query' ? 'export const useNfseDocuments=(...args)=>globalThis.__issuedQuery(...args);'
        : 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden")}});', loader: 'js' }));
    } }] });
  await writeFile(output, compiled.outputFiles[0].contents); const { List, Actions, NfseTabContext } = await import(pathToFileURL(output).href);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 }, mutations: { gcTime: 0 } } });
  function App({ issuedState } = {}) { const [ids, setIds] = useState(new Set()); return React.createElement(QueryClientProvider, { client }, React.createElement(NfseTabContext.Provider, { value: { scope, canRead: true, unavailable: false, loading: false } },
    React.createElement(List, { status: 'EMITIDA', issuedState, title: issuedState === 'CANCELLED' ? 'Notas canceladas' : 'Notas emitidas', description: '', emptyTitle: '', emptyDescription: '', selection: { ids, disabled: false,
      onReset: () => setIds(new Set()), onTogglePage: (items, value) => setIds(new Set(value ? items.map(item => item.id) : [])),
      onToggle: (item, checked) => setIds(previous => { const next = new Set(previous); if (checked) next.add(item.id); else next.delete(item.id); return next; }) },
      selectionActions: items => React.createElement('button', { onClick: () => actions.push({ action: 'ZIP', ids: items.map(item => item.id) }) }, `ZIP (${items.length})`),
      documentActions: (item, available) => React.createElement(Actions, { number: item.number, disabled: !available,
        onPreview: () => actions.push({ action: 'PREVIEW', id: item.id }), onPdf: () => actions.push({ action: 'PDF', id: item.id }), onXml: () => actions.push({ action: 'XML', id: item.id }) }) }))); }
  const root = createRoot(document.getElementById('root'));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const button = text => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text || item.getAttribute('aria-label') === text);
  const click = async item => { assert(item); await act(async () => item.click()); await settle(); };
  const setValue = async (input, value, blur = true) => { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await settle();
    if (blur) { await act(async () => input.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))); await settle(); } };
  const choose = async (label, text) => { await click(document.querySelector(`input[aria-label="${label}"]`)); await click([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === text)); };
  try {
    await act(async () => root.render(React.createElement(App))); await settle();
    assert.equal(document.querySelector('.nfse-issued-panel h2'), null);
    assert.equal(document.querySelectorAll('.nfse-issued-filterline > .nfse-field').length, 5);
    assert(document.querySelector('.nfse-issued-utility input[type="checkbox"]'));
    assert.equal(document.querySelectorAll('.nfse-issued-note').length, 2);
    assert(document.body.textContent.includes('CNPJ 00.100.203/0001-00'));
    assert(document.body.textContent.includes('Canhoba / SE')); assert.equal(document.querySelectorAll('.nfse-issued-line').length, 6);
    assert(document.querySelector('[aria-label="NFS-e 2"]').textContent.includes('Cancelada'));
    assert.equal(document.querySelector('[aria-haspopup="menu"]'), null);
    await click(button('Visualizar')); await click(button('PDF')); await click(button('XML'));
    assert.deepEqual(actions.map(item => item.action), ['PREVIEW', 'PDF', 'XML']);
    await click(document.querySelector('input[aria-label="Selecionar todas as notas desta página"]')); await click(button('ZIP (2)'));
    assert.deepEqual(actions.at(-1).ids, ['synthetic-note-2', 'synthetic-note-3']);
    const beforePartial = requested.length;
    await setValue(document.querySelector('input[aria-label="Data inicial de emissão"]'), '0002-11-10', false);
    assert.equal(requested.length, beforePartial, 'Native date partial year stays in local draft');
    await act(async () => document.querySelector('input[aria-label="Data inicial de emissão"]').dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))); await settle();
    assert.equal(requested.length, beforePartial); assert(document.body.textContent.includes('1900 e 2199'));
    assert.equal(document.querySelector('input[aria-label="Data inicial de emissão"]').disabled, false);
    await setValue(document.querySelector('input[aria-label="Data inicial de emissão"]'), '2026-11-01');
    await setValue(document.querySelector('input[aria-label="Data final de emissão"]'), '2026-11-10');
    await choose('Tipo de curso das notas', 'EAD'); await choose('Origem das notas', 'Aluno');
    assert.equal(requested.at(-1).courseType, 'EAD'); assert.equal(requested.at(-1).origin, 'ALUNO');
    assert.equal(requested.at(-1).dateFrom, '2026-11-01'); assert.equal(requested.at(-1).dateTo, '2026-11-10');
    assert(button('ZIP (0)')); assert.equal(document.querySelectorAll('.nfse-issued-note').length, 2, 'UI trusts server rows instead of filtering only this page');
    await click(button('Próxima página')); assert.equal(requested.at(-1).page, 2); assert.equal(requested.at(-1).courseType, 'EAD');
    globalThis.__issuedFail = true;
    await setValue(document.querySelector('input[aria-label="Data final de emissão"]'), '2026-11-09');
    assert(document.body.textContent.includes('Exibindo a última lista carregada'));
    assert.equal(document.querySelectorAll('.nfse-issued-note').length, 2);
    assert(document.body.textContent.includes('CNPJ 00.100.203/0001-00'));
    assert(document.body.textContent.includes('Canhoba / SE'));
    for (const label of ['Data inicial de emissão', 'Data final de emissão', 'Tipo de curso das notas', 'Origem das notas', 'Buscar registros']) assert.equal(document.querySelector(`input[aria-label="${label}"]`).disabled, false);
    globalThis.__issuedFail = false;
    await setValue(document.querySelector('input[aria-label="Data final de emissão"]'), '2026-11-10');
    assert(!document.body.textContent.includes('Não foi possível atualizar esta consulta'));
    await setValue(document.querySelector('input[aria-label="Data inicial de emissão"]'), '2026-11-11');
    assert(document.querySelector('[role="alert"]').textContent.includes('data inicial'));
    assert.equal(document.querySelector('select,datalist'), null);
    await act(async () => root.render(React.createElement(App, { key: 'cancelled', issuedState: 'CANCELLED' }))); await settle();
    assert.equal(requested.at(-1).issuedState, 'CANCELLED'); assert.equal(requested.at(-1).page, 1);
    assert.equal(document.querySelectorAll('.nfse-issued-note').length, 1);
    assert(document.querySelector('[aria-label="NFS-e 2"]').textContent.includes('Cancelada'));
    await click(document.querySelector('input[aria-label="Selecionar todas as notas desta página"]')); await click(button('ZIP (1)'));
    assert.deepEqual(actions.at(-1).ids, ['synthetic-note-2']);
    await click(button('Visualizar')); await click(button('PDF')); await click(button('XML'));
    rows[1].state = 'CANCELLATION_PENDING';
    await act(async () => root.render(React.createElement(App, { key: 'active', issuedState: 'ACTIVE' }))); await settle();
    assert.equal(requested.at(-1).issuedState, 'ACTIVE'); assert(button('ZIP (0)'));
    assert.equal(document.querySelectorAll('.nfse-issued-note').length, 1);
    assert(document.querySelector('[aria-label="NFS-e 3"]').textContent.includes('Cancelamento em consulta'));
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); delete globalThis.__issuedQuery; delete globalThis.__issuedFail; await rm(temp, { recursive: true, force: true }); }
});

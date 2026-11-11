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
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('daily workspace has seven operational tabs and preserves cancelled authorization without another dispatch', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-daily-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const scopes = [], opened = [];
  const serviceRow = { id: id(10), partnerName: 'PARCEIRO SINTÉTICO', modelName: 'MODELO SINTÉTICO', serviceDescription: 'SERVIÇO SINTÉTICO', serviceDate: '2026-11-10',
    amount: '260.00', receivableAction: 'NONE', state: 'CANCELLED', operationId: id(20), requestId: id(21), cancelPreviewId: id(22), number: '1' };
  const documentRow = { ...serviceRow, id: id(20), studentName: serviceRow.partnerName, classLabel: 'Serviço', modelLabel: serviceRow.modelName,
    status: 'EMITIDA', accessKey: '1'.repeat(50), sourceKind: 'PARTNER_SERVICE', sourceId: serviceRow.id, retryable: false, message: 'Cancelamento confirmado.' };
  const query = data => ({ data, error: null, isPending: false, isFetching: false, refetch: async () => {} });
  globalThis.__dailyWorkspace = scope => { scopes.push(scope); return query({ summary: {}, capabilities: {}, classes: [], models: [], readiness: { status: 'BLOCKED', message: '' } }); };
  globalThis.__dailyServices = scope => { scopes.push(scope); return query({ rows: [serviceRow], totalAmount: '260.00', totalItems: 1, pageSize: 25 }); };
  globalThis.__dailyDocuments = () => query({ rows: [documentRow], page: 1, pageSize: 25, totalItems: 1 });
  globalThis.__dailyOpened = props => { opened.push(props); };
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Page} from './modules/gestor/emissor-nfse/EmissorNfsePage';
    export {default as Documents} from './modules/gestor/emissor-nfse/components/NfseDocumentsList';
    export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle, loader: { '.css': 'empty' },
    plugins: [{ name: 'isolated-daily-flow', setup(builder) {
      builder.onResolve({ filter: /useNfseQueries$/ }, () => ({ path: 'queries', namespace: 'fixture' }));
      builder.onResolve({ filter: /useNfseQueue$/ }, () => ({ path: 'queue', namespace: 'fixture' }));
      builder.onResolve({ filter: /useNfsePartnerServices$/ }, () => ({ path: 'services', namespace: 'fixture' }));
      builder.onResolve({ filter: /(?:useNfseRealtime|useNfseQueueRealtime|useNfsePartnerServicesRealtime)$/ }, () => ({ path: 'realtime', namespace: 'fixture' }));
      builder.onResolve({ filter: /(?:PrepararNfseTab|PendentesNfseTab|EmitidasNfseTab|CanceladasNfseTab|ErrosNfseTab|ModelosNfseTab|NfsePartnerServiceModal)$/ }, () => ({ path: 'empty', namespace: 'fixture' }));
      builder.onResolve({ filter: /NfseSourceEmissionModal$/ }, () => ({ path: 'modal', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: base, contents: ({
        queries: 'export const useNfseWorkspace=(s)=>globalThis.__dailyWorkspace(s); export const useNfseDocuments=()=>globalThis.__dailyDocuments();',
        queue: 'export const useNfseQueue=()=>({data:{summary:{preparedCount:0}},error:null});',
        services: 'export const useNfsePartnerServices=(s)=>globalThis.__dailyServices(s);',
        realtime: 'export const useNfseRealtime=()=>{}; export const useNfseQueueRealtime=()=>{}; export const useNfsePartnerServicesRealtime=()=>{};',
        empty: 'export default function Empty(){return null;}',
        modal: 'import React from "react"; export default function Modal(p){globalThis.__dailyOpened(p); return React.createElement("div",{role:"dialog"},p.source.kind,React.createElement("button",{onClick:p.onClose},"Fechar origem"));}',
        blocked: 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden")}});',
      })[args.path] }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { Page, Documents, NfseTabContext } = await import(pathToFileURL(bundle).href);
  const root = createRoot(document.getElementById('root'));
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 }, mutations: { gcTime: 0 } } });
  const wrap = children => React.createElement(QueryClientProvider, { client }, children);
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const click = async element => { assert(element); await act(async () => element.click()); await settle(); };
  try {
    await act(async () => root.render(wrap(React.createElement(Page, { poloId: id(2), contextKey: id(1), isMatriz: true })))); await settle();
    assert.equal(document.querySelectorAll('[role="tab"]').length, 7);
    assert([...document.querySelectorAll('[role="tab"]')].some(tab => tab.textContent === 'Canceladas'));
    assert.equal(document.querySelector('[role="tab"][aria-label="Homologação"]'), null);
    await click([...document.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === 'Serviços'));
    assert(document.body.textContent.includes('Cancelada')); assert(document.body.textContent.includes('260,00'));
    await click([...document.querySelectorAll('button')].find(button => button.textContent === 'Consultar NFS-e'));
    assert.deepEqual(opened.at(-1).source, { kind: 'PARTNER_SERVICE', id: serviceRow.id });
    assert.equal(opened.at(-1).operation.cancelPreviewId, id(22));
    await click([...document.querySelectorAll('button')].find(button => button.textContent === 'Fechar origem'));
    await click(document.querySelector('input[aria-label="Ambiente fiscal"]'));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'Homologação'));
    assert.equal(scopes.at(-1).environment, 'HOMOLOGACAO');
    assert.equal(document.querySelector('[role="dialog"]'), null, 'Environment change resets selected operation');
    const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
    await act(async () => root.render(wrap(React.createElement(NfseTabContext.Provider, { value: { scope, canRead: true } },
      React.createElement(Documents, { status: 'EMITIDA', title: 'Notas emitidas', description: '', emptyTitle: '', emptyDescription: '' }))))); await settle();
    assert(document.querySelector('[aria-label="NFS-e 1"]').textContent.includes('Cancelada'));
    assert(document.querySelector('[aria-label="NFS-e 1"]').textContent.includes('Autorização histórica preservada'));
    await click(document.querySelector('button[aria-label="Mais ações da NFS-e 1"]'));
    assert.equal([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'Cancelar'), undefined);
    await click([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'Consultar'));
    assert.equal(opened.at(-1).intent, 'CONSULT');
    assert.equal(opened.at(-1).operation.state, 'CANCELLED'); assert.equal(opened.at(-1).source.id, serviceRow.id);
    assert.equal(document.querySelector('select,datalist'), null);
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const key of ['__dailyWorkspace', '__dailyServices', '__dailyDocuments', '__dailyOpened']) delete globalThis[key];
    await rm(temp, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { build } from 'esbuild';
import React, { act } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('error archiving is scoped, confirmed, reversible and retry-safe; blocked outcomes cannot be selected', async () => {
  const base = process.cwd(); await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-errors-archive-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
  const rows = [10, 11, 12, 13].map((n, i) => ({ id: id(n), operationId: id(n), requestId: id(n + 100), sourceKind: 'PARTNER_SERVICE', sourceId: id(n + 200),
    studentName: `PESSOA SINTÉTICA ${i + 1}`, classLabel: 'Serviço', modelLabel: 'MODELO', amount: '1.00', status: 'ERRO',
    state: i === 1 ? 'BLOCKED' : 'REJECTED', number: null, accessKey: null, errorCode: i === 1 ? null : 'E0120', errorMessage: 'Resultado sintético.', retryable: false }));
  rows[0].sourceKind = null; rows[0].sourceId = null; // Eligible legacy rejection without a navigable preparation.
  const archived = new Set(), requests = [], reads = []; let releaseFailure;
  globalThis.__errorsRpc = async (name, args) => {
    assert.equal(args.p_context_key, scope.contextKey); assert.equal(args.p_polo_id, scope.poloId);
    assert.equal(args.p_environment, scope.environment); assert.equal(args.p_month, scope.month);
    if (name === 'get_nfse_documents_secure') {
      reads.push(args); assert.equal(args.p_status, 'ERRO');
      const current = rows.filter(row => args.p_error_archive_mode === 'ARCHIVED' ? archived.has(row.id) : !archived.has(row.id));
      const visible = current.slice((args.p_page - 1) * 3, args.p_page * 3).map(row => ({ ...row,
        archivedAt: archived.has(row.id) ? '2026-11-11T00:00:00Z' : null,
        canArchive: row.state === 'REJECTED' && !archived.has(row.id), canRestore: row.state === 'REJECTED' && archived.has(row.id) }));
      return { data: { version: 1, scope, data: { rows: visible, page: args.p_page, pageSize: 3, totalItems: current.length } }, error: null };
    }
    assert.equal(name, 'archive_nfse_errors_secure', 'No fiscal dispatch or unrelated RPC may run');
    requests.push(args);
    if (requests.length === 1) return new Promise(resolveFailure => { releaseFailure = () => resolveFailure({ data: null, error: { code: 'SYNTHETIC_FAILURE' } }); });
    for (const operationId of args.p_operation_ids) {
      assert(rows.some(row => row.id === operationId && row.state === 'REJECTED'));
      if (args.p_action === 'ARCHIVE') archived.add(operationId); else archived.delete(operationId);
    }
    return { data: { version: 1, scope, data: { action: args.p_action, operationIds: [...args.p_operation_ids], changedCount: args.p_operation_ids.length } }, error: null };
  };
  const output = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { resolveDir: base, loader: 'tsx', contents: `
    export {default as Errors} from './modules/gestor/emissor-nfse/erros/ErrosNfseTab';
    export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';` },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: output, loader: { '.css': 'empty' },
    plugins: [{ name: 'scoped-rpc-fixture', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'rpc', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents:
        'export const supabase={rpc:(...args)=>{const pending=globalThis.__errorsRpc(...args);pending.abortSignal=()=>pending;return pending;}};' }));
    } }] });
  await writeFile(output, compiled.outputFiles[0].contents);
  const { Errors, NfseTabContext } = await import(pathToFileURL(output).href);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const render = (value = scope, canRead = true) => root.render(React.createElement(QueryClientProvider, { client },
    React.createElement(NfseTabContext.Provider, { value: { scope: value, canRead, unavailable: false, loading: false } }, React.createElement(Errors))));
  const settle = async () => act(async () => { await wait(20); });
  const button = text => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text || item.getAttribute('aria-label') === text);
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  const pageSelection = () => document.querySelector('input[aria-label="Selecionar erros desta página"]');
  const choose = async value => { await click(document.querySelector('input[aria-label="Mostrar erros"]'));
    await click([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === value)); };
  try {
    await act(async () => render()); await settle();
    assert.equal(document.querySelector('input[aria-label="Selecionar erro de PESSOA SINTÉTICA 2"]').disabled, true);
    await click(pageSelection()); assert.equal(document.querySelectorAll('tbody input:checked').length, 2);
    await click(button('Remover da lista (2)')); await click(button('Voltar')); assert.equal(requests.length, 0);
    await click(button('Remover da lista (2)'));
    const confirm = button('Remover da lista'); await act(async () => { confirm.click(); confirm.click(); }); await settle();
    assert.equal(requests.length, 1); assert.deepEqual(requests[0].p_operation_ids, [id(10), id(12)]);
    await act(async () => releaseFailure()); await settle();
    assert.equal(document.querySelectorAll('tbody input:checked').length, 2, 'Failure preserves selection');
    const notifications = document.querySelector('[aria-label="Notificações"]'); assert(notifications.className.includes('sm:right-6'));
    assert(notifications.textContent.includes('Atualização não confirmada'));
    await click(button('Remover da lista'));
    assert.equal(requests.length, 2); assert.equal(requests[1].p_request_id, requests[0].p_request_id);
    assert.equal(archived.size, 2); assert.equal(rows.length, 4, 'Archiving never deletes fiscal history');
    await choose('Arquivados'); assert.equal(reads.at(-1).p_error_archive_mode, 'ARCHIVED'); assert.equal(reads.at(-1).p_page, 1);
    assert.equal(document.querySelectorAll('tbody tr').length, 2); assert(document.body.textContent.includes('histórico preservado'));
    await click(document.querySelector('tbody tr button[aria-haspopup="menu"]'));
    assert.equal([...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent === 'Consultar'), false);
    await click([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'Restaurar'));
    await click(button('Restaurar')); assert.equal(requests.at(-1).p_action, 'RESTORE'); assert.deepEqual(requests.at(-1).p_operation_ids, [id(10)]);
    assert.equal(archived.size, 1);
    await click(pageSelection()); await click(button('Restaurar (1)')); await click(button('Restaurar'));
    assert.equal(archived.size, 0); assert(document.body.textContent.includes('Nenhum erro arquivado'));
    await choose('Ativos'); await click(button('Próxima página'));
    assert.equal(reads.at(-1).p_page, 2); assert.equal(document.querySelectorAll('tbody tr').length, 1);
    await click(pageSelection()); await click(button('Remover da lista (1)')); await click(button('Remover da lista'));
    assert.equal(reads.at(-1).p_page, 1, 'Removing the last page safely returns to the current last page');
    assert.equal(document.querySelectorAll('tbody input:checked').length, 0);
    const requestCount = requests.length;
    await act(async () => render({ ...scope, poloId: id(99) }, false)); await settle();
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(requests.length, requestCount); assert.equal(document.querySelector('select,datalist'), null);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close(); delete globalThis.__errorsRpc;
    await rm(temp, { recursive: true, force: true });
  }
});

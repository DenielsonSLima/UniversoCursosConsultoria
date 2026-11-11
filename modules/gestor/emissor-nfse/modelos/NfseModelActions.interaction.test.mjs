import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import React, { act } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');

const base = fileURLToPath(new URL('../../../../', import.meta.url));
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
const model = { id: id(3), version: 7, name: 'Modelo local sintético', active: true,
  nationalServiceCode: '080201', nbsCode: '122020000', operationIndicatorCode: '',
  serviceDescription: 'Descrição sintética', issTreatment: 'TRIBUTAVEL', immunityType: null,
  technicalResponsibilityDocument: '', referenceDocument: '', complementaryInfo: '', orderReference: '',
  sourcePoloId: scope.poloId, sourcePoloName: 'Filial sintética', inherited: false, canManage: true };

test('model menu, retries, inherited ownership and navigation use only fixture services', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-model-actions-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">Fora</button>',
    { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `export { default as Section } from './modules/gestor/emissor-nfse/modelos/NfseEmissionModelsSection';
    export { NfseTabContext } from './modules/gestor/emissor-nfse/components/NfseTabContext';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    loader: { '.css': 'empty' }, plugins: [{ name: 'synthetic-only', setup(builder) {
      builder.onResolve({ filter: /nfse-models\.service$/ }, () => ({ path: 'models', namespace: 'fixture' }));
      builder.onResolve({ filter: /NfseModelForm$/ }, () => ({ path: 'form', namespace: 'fixture' }));
      builder.onResolve({ filter: /NfseModelExportModal$/ }, () => ({ path: 'export', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'live', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === 'models'
        ? 'export const nfseModelsService={list:(s)=>globalThis.__modelList(s),mutate:(...args)=>globalThis.__modelMutate(...args)};'
        : args.path === 'live' ? 'throw new Error("Live client forbidden");'
          : 'export default function Stub(){return null;}' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { Section, NfseTabContext } = await import(pathToFileURL(bundle).href);
  const inherited = { ...model, id: id(4), name: 'Modelo da matriz sintético', sourcePoloId: id(9),
    sourcePoloName: 'Matriz sintética', inherited: true, canManage: false };
  const inactive = { ...model, id: id(5), name: 'Modelo inativo sintético', active: false };
  let rows = [model, inherited, inactive];
  globalThis.__modelList = async () => ({ rows: structuredClone(rows), totalItems: rows.length, pageSize: 100, page: 1 });
  const calls = [];
  let finish;
  globalThis.__modelMutate = async (captured, input) => {
    calls.push({ scope: captured, input });
    return await new Promise((resolve, reject) => { finish = { resolve, reject }; });
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  const render = async (currentScope = scope) => {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client },
      React.createElement(NfseTabContext.Provider, { value: { scope: currentScope, unavailable: false, canRead: true, loading: false, onPrepared() {} } }, React.createElement(Section)))));
    await settle();
  };
  const click = async control => { assert(control, 'Missing button'); await act(async () => control.click()); await settle(); };
  const label = text => [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === text);
  const button = text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
  const key = async (target, keyName) => { await act(async () => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }))); await settle(); };
  try {
    await render();
    assert.match(document.body.textContent, /Da matriz · Matriz sintética/);
    assert(label(`Editar modelo ${model.name}`));
    assert.equal(label(`Editar modelo ${inherited.name}`), undefined);
    const localTrigger = label(`Mais ações do modelo ${model.name}`);
    await click(localTrigger);
    assert.equal(document.activeElement.textContent.trim(), 'Clonar');
    await key(document.activeElement, 'ArrowDown');
    assert.equal(document.activeElement.textContent.trim(), 'Inativar');
    await key(document.activeElement, 'Escape');
    assert.equal(document.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, localTrigger);
    await click(localTrigger);
    await act(async () => document.getElementById('outside').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })));
    assert.equal(document.querySelector('[role="menu"]'), null);
    await click(localTrigger); await click(button('Inativar'));
    assert(document.querySelector('[role="alertdialog"]'));
    assert.equal(document.activeElement.textContent.trim(), 'Cancelar');
    await key(document.activeElement, 'Tab');
    assert.equal(document.activeElement.textContent.trim(), 'Inativar modelo');
    await key(document.activeElement, 'Tab');
    assert.equal(document.activeElement.textContent.trim(), 'Cancelar');
    await click(button('Cancelar'));
    assert.equal(calls.length, 0);
    assert.equal(document.activeElement, localTrigger);
    assert.equal(document.getElementById('root').getAttribute('aria-hidden'), null);
    await click(localTrigger); await click(button('Inativar'));
    const confirm = button('Inativar modelo');
    await act(async () => { confirm.click(); confirm.click(); }); await settle();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].scope, scope);
    assert.equal(calls[0].input.expectedVersion, 7);
    assert.equal(calls[0].input.action, 'DEACTIVATE');
    await key(document.activeElement, 'Escape');
    assert(document.querySelector('[role="alertdialog"]'), 'Cannot close a pending request');
    await act(async () => finish.reject(new Error('Synthetic lost response'))); await settle();
    assert(document.querySelector('[role="alert"]'));
    await click(button('Cancelar')); await click(localTrigger);
    await click(button('Inativar')); await click(button('Inativar modelo'));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].input.requestId, calls[0].input.requestId, 'Retry after closing keeps immutable request');
    rows = [{ ...model, active: false, version: 8 }, inherited, inactive];
    await act(async () => finish.resolve({ id: model.id, version: 8, message: 'Modelo inativado.' })); await settle();
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    await click(label(`Mais ações do modelo ${inactive.name}`));
    assert.equal(button('Inativar').disabled, true);
    await key(button('Clonar'), 'Escape');
    await click(label(`Mais ações do modelo ${inherited.name}`));
    assert.equal(button('Inativar'), undefined);
    await click(button('Clonar')); await click(button('Clonar modelo'));
    assert.equal(calls[2].input.id, inherited.id);
    assert.equal(calls[2].input.action, 'CLONE');
    assert.equal(calls[2].scope.poloId, scope.poloId);
    const copied = { ...model, id: id(10), version: 1, name: `${inherited.name} (cópia)` };
    rows = [...rows, copied];
    await act(async () => finish.resolve({ id: copied.id, version: 1, message: 'Modelo clonado.' })); await settle();
    assert(label(`Editar modelo ${copied.name}`));
    assert.equal(rows.find(row => row.id === inherited.id).version, 7);
    await click(label(`Mais ações do modelo ${inherited.name}`)); await click(button('Clonar'));
    await render({ ...scope, poloId: id(20) });
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    assert.equal(calls.length, 3);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    delete globalThis.__modelList; delete globalThis.__modelMutate;
    await rm(temp, { recursive: true, force: true });
  }
});

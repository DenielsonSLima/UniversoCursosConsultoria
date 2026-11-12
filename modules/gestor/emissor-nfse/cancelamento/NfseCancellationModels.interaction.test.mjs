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
const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };

test('formal cancellation models copy, edit, deactivate and select a canonical version without any fiscal dispatch', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true }); const temp = await mkdtemp(resolve(base, 'tmp/nfse-cancel-models-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client'); const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const output = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Section} from './modules/gestor/emissor-nfse/cancelamento/NfseCancellationModelsSection';
    export {default as Picker} from './modules/gestor/emissor-nfse/cancelamento/NfseCancellationTemplatePicker';
    export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: output, loader: { '.css': 'empty' },
    plugins: [{ name: 'block-live', setup(builder) { builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden")}});', loader: 'js' })); } }] });
  await writeFile(output, compiled.outputFiles[0].contents); const { Section, Picker, NfseTabContext } = await import(pathToFileURL(output).href);
  const system = { id: 'SYSTEM:ERROR_AMOUNT', source: 'SYSTEM', version: 1, category: 'VALOR', reasonCode: '1', eventCode: '101101', active: true,
    name: 'Erro no valor', textTemplate: 'Solicito cancelar por erro no valor: {{detalhe}}.', requiresDetail: true };
  const rows = [system], saves = [], selected = [];
  const service = { list: async () => [...rows], save: async (target, input) => {
    saves.push({ target, input }); const model = { ...input.definition, id: input.modelId || id(3), source: 'CUSTOM', version: input.expectedVersion === null ? 1 : input.expectedVersion + 1,
      requiresDetail: input.definition.textTemplate.includes('{{detalhe}}') };
    const index = rows.findIndex(row => row.id === model.id); if (index < 0) rows.push(model); else rows[index] = model; return model;
  } };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const render = picker => root.render(React.createElement(QueryClientProvider, { client }, picker
    ? React.createElement(Picker, { key: String(picker), applyOnSelect: picker === 'direct', scope, service, disabled: false, onApply: model => selected.push(model) })
    : React.createElement(NfseTabContext.Provider, { value: { scope } }, React.createElement(Section, { service }))));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  const button = text => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  const click = async item => { assert(item); await act(async () => item.click()); await settle(); };
  const setValue = async (input, value) => { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await settle(); };
  try {
    await act(async () => render(false)); await settle(); assert(document.body.textContent.includes('Padrão do sistema'));
    await click(button('Usar como base')); await setValue(document.querySelector('input[aria-label="Nome do modelo de cancelamento"]'), 'Modelo sintético personalizado');
    await click(button('Salvar modelo de cancelamento')); assert.equal(saves.length, 1); assert.equal(saves[0].input.modelId, null); assert.equal(saves[0].input.expectedVersion, null);
    assert(document.body.textContent.includes('Nenhuma nota foi cancelada')); assert.equal(document.querySelector('[role="dialog"]'), null);
    await click(button('Editar')); const active = [...document.querySelectorAll('label')].find(item => item.textContent.includes('Modelo ativo')).querySelector('input'); await click(active);
    await click(button('Salvar modelo de cancelamento')); assert.equal(saves[1].input.modelId, id(3)); assert.equal(saves[1].input.expectedVersion, 1); assert.equal(saves[1].input.definition.active, false);
    assert(document.body.textContent.includes('Inativo'));
    await act(async () => render(true)); await settle();
    await click(document.querySelector('input[aria-label="Modelo de justificativa para cancelar"]'));
    assert.equal(document.querySelectorAll('[role="option"]').length, 1, 'Inactive custom model cannot be chosen for a new cancellation');
    await click(document.querySelector('[role="option"]')); await click(button('Usar modelo selecionado'));
    assert.equal(selected.length, 1); assert.equal(selected[0].id, system.id); assert.equal(selected[0].version, 1);
    assert.equal(document.querySelector('select,datalist'), null); assert.equal(saves.length, 2);
    await act(async () => render('direct')); await settle();
    assert.equal(button('Usar modelo selecionado'), undefined);
    await click(document.querySelector('input[aria-label="Modelo de justificativa para cancelar"]'));
    await click(document.querySelector('[role="option"]'));
    assert.equal(selected.length, 2, 'Direct mode applies the model from a single selection');
    assert.equal(selected[1].id, system.id); assert.equal(saves.length, 2, 'Selection never dispatches fiscal action');
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
});

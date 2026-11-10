import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;

test('partner preparation preserves the selected 2000-character model description without creating finance', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-partner-model-description-'));
  const dom = new JSDOM('<!doctype html><button id="opener">Adicionar serviço</button><div id="root"></div>',
    { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    loader: { '.css': 'empty' }, plugins: [{ name: 'synthetic-partner-services', setup(builder) {
      builder.onResolve({ filter: /nfse-models\.service$/ }, () => ({ path: 'models', namespace: 'fixture' }));
      builder.onResolve({ filter: /nfse-partner-services\.service$/ }, () => ({ path: 'partners', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'live-blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'models'
        ? `export const nfseModelsService={list:async()=>({rows:[globalThis.__partnerModel]}),
          previewDescription:async(_scope,description)=>({description,monthLabel:'novembro de 2026',usesReferenceMonth:false})};`
        : args.path === 'partners' ? `export const nfsePartnerServices={options:async()=>globalThis.__partnerOptions,
          save:(...args)=>globalThis.__partnerSave(...args)};`
          : 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden in UI smoke")}});', loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { default: Modal } = await import(pathToFileURL(bundle).href);
  const description = 'SERVIÇO SINTÉTICO '.padEnd(2000, 'x');
  globalThis.__partnerModel = { id: id(3), version: 2, name: 'Modelo sintético 2000', active: true, serviceDescription: description };
  globalThis.__partnerOptions = { partners: [{ id: id(4), name: 'Parceiro sintético', tradeName: null, document: null, type: 'PJ' }],
    categories: [], existingReceivables: [], capabilities: { canGenerateReceivable: false } };
  const calls = [], messages = [];
  globalThis.__partnerSave = async (scope, input) => {
    calls.push({ scope, input });
    return { id: id(5), receivableId: null, receivableAction: 'NONE', message: 'Serviço preparado.' };
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  document.getElementById('opener').focus();
  const root = createRoot(document.getElementById('root'));
  const settle = async (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  const setValue = async (input, value) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    }); await settle();
  };
  try {
    const scope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
    await act(async () => root.render(React.createElement(QueryClientProvider, { client },
      React.createElement(Modal, { scope, onClose() {}, onSaved: message => messages.push(message) }))));
    await settle();
    await click(document.getElementById('nfse-service-partner')); await click(document.querySelector('[role="option"]'));
    await click(document.getElementById('nfse-service-model')); await click(document.querySelector('[role="option"]'));
    const textarea = document.querySelector('textarea');
    assert.equal(textarea.maxLength, 2000); assert.equal(textarea.value, description);
    await setValue(document.querySelector('input[type="date"]'), '2026-11-10');
    await setValue(document.querySelector('input[inputmode="decimal"]'), '1,00');
    await settle(350); await settle();
    const submit = document.querySelector('button[type="submit"]');
    assert.equal(submit.disabled, false); await click(submit);
    assert.equal(calls.length, 1); assert.equal(calls[0].input.serviceDescription, description);
    assert.equal(calls[0].input.generateReceivable, false); assert.equal(calls[0].input.amount, '1.00');
    assert.equal(calls[0].input.modelId, id(3)); assert.equal(calls[0].input.modelVersion, 2);
    assert.equal(messages.length, 1); assert.equal(document.querySelector('select, datalist'), null);
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    delete globalThis.__partnerModel; delete globalThis.__partnerOptions; delete globalThis.__partnerSave;
    await rm(temp, { recursive: true, force: true });
  }
});

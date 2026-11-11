import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../../', import.meta.url));

test('fiscal review uses the authorized model picker, explicit dates and same-intent retry, while emission stays unavailable', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-fiscal-review-ui-'));
  const dom = new JSDOM('<!doctype html><button id="opener">Revisar</button><div id="root"></div>',
    { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Modal} from './modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal';
    export * from './modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.fixture';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    loader: { '.css': 'empty' }, plugins: [{ name: 'synthetic-model-service', setup(builder) {
      builder.onResolve({ filter: /nfse-models\.service$/ }, () => ({ path: 'model-fixture', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'live-blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'model-fixture'
        ? 'export const nfseModelsService={list:async()=>({rows:globalThis.__fiscalModels})};'
        : 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden in UI smoke")}});', loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { Modal, fiscalReview, fiscalScope, fiscalId } = await import(pathToFileURL(bundle).href);
  globalThis.__fiscalModels = [
    { id: fiscalId(4), version: 1, active: true, name: 'Modelo anterior', nationalServiceCode: '080101' },
    { id: fiscalId(6), version: 2, active: true, name: 'Ensino técnico revisado', nationalServiceCode: '080201' },
  ];
  const calls = [], savedMessages = [];
  let revision = 0, savedDefinition, pending, closed = 0;
  const service = {
    get: async (_scope, _documentId, modelId) => ({ ...globalThis.structuredClone(fiscalReview), revision,
      reviewStatus: revision ? 'CONFIRMED' : 'NOT_REVIEWED', reviewComplete: Boolean(revision),
      recipient: { ...fiscalReview.recipient, confirmed: Boolean(revision) },
      savedAt: revision ? '2026-11-10T20:00:00Z' : null, savedBy: revision ? fiscalId(10) : null,
      service: { ...fiscalReview.service, ...(modelId === fiscalId(6) ? { modelId, modelVersion: 2,
        nationalServiceCode: '080201', description: 'Descrição fiscal revisada sintética' } : {}),
        competenceDate: savedDefinition?.competenceDate || null, serviceDate: savedDefinition?.serviceDate || null } }),
    save: async (scope, documentId, input) => {
      calls.push({ scope, documentId, input });
      await new Promise((resolve, reject) => { pending = { resolve, reject }; });
      revision++; savedDefinition = input.definition;
      return { documentId, revision, reviewId: fiscalId(9), message: 'Conferência fiscal salva, sem transmissão.' };
    },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  document.getElementById('opener').focus();
  const root = createRoot(document.getElementById('root'));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  const button = text => [...document.querySelectorAll('button')].find(control => control.textContent.includes(text));
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  const setValue = async (input, value) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    }); await settle();
  };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client },
      React.createElement(Modal, { scope: fiscalScope, documentId: fiscalReview.documentId, service,
        onClose: () => closed++, onSaved: message => savedMessages.push(message) }))));
    await settle();
    assert(document.querySelector('[role="dialog"]'));
    assert.equal(document.querySelector('input[aria-label="Competência fiscal"]').value, '');
    assert.equal(document.querySelector('input[aria-label="Data da prestação do serviço"]').value, '');
    assert.equal(button('Salvar revisão').disabled, true);
    const combobox = document.querySelector('[role="combobox"]');
    await click(combobox);
    assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    assert(document.querySelector('[role="option"]').textContent.includes('080201'));
    assert.equal(document.querySelector('select'), null);
    await click(document.querySelector('[role="option"]'));
    assert(document.body.textContent.includes('Descrição fiscal revisada sintética'));
    assert(document.body.textContent.includes('Modelo anterior'));
    assert.equal(button('Salvar revisão').disabled, true);
    await setValue(document.querySelector('input[aria-label="Competência fiscal"]'), '2026-11-10');
    await setValue(document.querySelector('input[aria-label="Data da prestação do serviço"]'), '2026-11-09');
    for (const checkbox of document.querySelectorAll('input[type="checkbox"]')) await click(checkbox);
    assert.equal(button('Salvar revisão').disabled, false);
    const submit = button('Salvar revisão');
    await act(async () => { submit.click(); submit.click(); }); await settle();
    assert.equal(calls.length, 1); assert.equal(button('Salvando revisão').disabled, true);
    await act(async () => pending.reject(new Error('Resposta não confirmada.'))); await settle();
    assert(document.querySelector('[role="alert"]').textContent.includes('Resposta não confirmada'));
    assert.equal(document.querySelector('input[aria-label="Competência fiscal"]').value, '2026-11-10');
    await click(button('Salvar revisão'));
    assert.equal(calls.length, 2); assert.equal(calls[0].input.requestId, calls[1].input.requestId);
    assert.equal('amount' in calls[1].input.definition, false); assert.equal('cnpj' in calls[1].input.definition, false);
    await act(async () => pending.resolve()); await settle(); await settle();
    assert.equal(savedMessages.length, 1); assert(document.body.textContent.includes('Revisão fiscal salva'));
    assert(document.body.textContent.includes('serão conferidos novamente antes da transmissão'));
    assert.equal(button('Salvar revisão').disabled, true); assert.equal(button('Emitir'), undefined);
    assert.equal(closed, 0);
  } finally {
    await act(async () => root.unmount()); client.clear();
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.activeElement.id, 'opener');
    dom.window.close(); delete globalThis.__fiscalModels;
    await rm(temp, { recursive: true, force: true });
  }
});

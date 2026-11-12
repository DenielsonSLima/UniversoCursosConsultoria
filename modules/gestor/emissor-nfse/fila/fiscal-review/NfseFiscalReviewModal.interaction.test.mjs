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

for (const scenario of [
  { name: 'missing fiscal day blocks save', paymentDates: undefined, preconfigured: false, expectedDate: null },
  { name: 'last payment among different days, not month end', paymentDates: ['2026-10-09', '2026-10-08'], preconfigured: true, expectedDate: '2026-10-09' },
  { name: 'old saved dates require a new confirmation', paymentDates: ['2026-10-09', '2026-10-08'], preconfigured: true, expectedDate: '2026-10-09', oldSavedDate: '2026-10-08' },
  { name: 'automatic payment month', paymentDates: ['2026-10-09'], preconfigured: false, expectedDate: '2026-10-09' },
  { name: 'shared model reused without opening the picker', modelType: 'AMBOS', paymentDates: ['2026-10-09'], preconfigured: true, expectedDate: '2026-10-09' },
]) test(`optional fiscal editor: ${scenario.name}; canonical validation without checkboxes or issue`, async () => {
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
    { id: fiscalId(4), version: 1, active: true, name: 'Modelo anterior', modelType: 'ALUNO', nationalServiceCode: '080101' },
    { id: fiscalId(6), version: 2, active: true, name: 'Ensino técnico revisado', modelType: scenario.modelType || 'ALUNO', nationalServiceCode: '080201' },
    { id: fiscalId(12), version: 1, active: true, name: 'Somente serviços', modelType: 'SERVICO', nationalServiceCode: '080201' },
    { id: fiscalId(13), version: 1, active: true, name: 'Legado sem classificação', nationalServiceCode: '080201' },
  ];
  const calls = [], savedMessages = [];
  let revision = scenario.oldSavedDate ? 1 : 0;
  let savedDefinition = scenario.oldSavedDate ? { competenceDate: scenario.oldSavedDate, serviceDate: scenario.oldSavedDate } : undefined;
  let pending, closed = 0;
  const service = {
    get: async (_scope, _documentId, modelId) => ({ ...globalThis.structuredClone(fiscalReview), revision,
      preparation: { ...fiscalReview.preparation, paymentDates: scenario.paymentDates, receiptCount: Math.max(1, scenario.paymentDates?.length || 0) },
      reviewStatus: revision ? 'CONFIRMED' : 'NOT_REVIEWED', reviewComplete: Boolean(revision),
      validationSource: revision && !scenario.oldSavedDate ? 'SYSTEM_VALIDATED' : null,
      recipient: { ...fiscalReview.recipient, confirmed: Boolean(revision) },
      savedAt: revision ? '2026-11-10T20:00:00Z' : null, savedBy: revision ? fiscalId(10) : null,
      service: { ...fiscalReview.service, ...((modelId === fiscalId(6) || scenario.preconfigured) ? { modelId: fiscalId(6), modelVersion: 2,
        nationalServiceCode: '080201', description: 'Descrição fiscal revisada sintética' } : {}),
        competenceDate: savedDefinition?.competenceDate || null, serviceDate: savedDefinition?.serviceDate || null } }),
    save: async () => { throw Error('Human confirmations must not be fabricated'); },
    validate: async (scope, documentId, input) => {
      calls.push({ scope, documentId, input });
      await new Promise((resolve, reject) => { pending = { resolve, reject }; });
      revision++; savedDefinition = { competenceDate: scenario.expectedDate, serviceDate: scenario.expectedDate };
      return { documentId, revision, reviewId: fiscalId(9), message: 'Ajustes validados, sem transmissão.' };
    },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  document.getElementById('opener').focus();
  const root = createRoot(document.getElementById('root'));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  const button = text => [...document.querySelectorAll('button')].find(control => control.textContent.includes(text));
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client },
      React.createElement(Modal, { scope: fiscalScope, documentId: fiscalReview.documentId, service,
        onClose: () => closed++, onSaved: message => savedMessages.push(message) }))));
    await settle(); await settle();
    assert(document.querySelector('[role="dialog"]'));
    assert.equal(document.querySelectorAll('details[open]').length, 0);
    assert.equal(document.querySelectorAll('details').length, 2);
    assert(document.body.textContent.includes('000.000.000-00'));
    assert(document.body.textContent.includes('00.000.000/0000-00'));
    const origin = document.querySelector('details');
    await click(origin.querySelector('summary'));
    assert.equal(origin.open, true);
    assert(origin.textContent.includes('Modelo anterior'));
    await click(origin.querySelector('summary'));
    assert.equal(origin.open, false);
    assert.equal(document.querySelector('input[type="date"]'), null);
    assert.equal(document.querySelector('output[aria-label="Competência fiscal"]').textContent, 'Outubro de 2026');
    assert.equal(button('Salvar ajustes').disabled, !scenario.expectedDate || !scenario.preconfigured);
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 0);
    assert(document.body.textContent.includes('Automática pelo mês dos pagamentos.'));
    if (scenario.expectedDate) assert(document.body.textContent.includes('Último pagamento: 09/10/2026.'));
    if (scenario.oldSavedDate) assert(document.body.textContent.includes('Atualizar revisão'));
    if (scenario.preconfigured) {
      assert.equal(document.querySelector('[role="combobox"]'), null);
      await click(button('Alterar modelo'));
    }
    const combobox = document.querySelector('[role="combobox"]');
    await click(combobox);
    assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    assert(document.querySelector('[role="option"]').textContent.includes('080201'));
    assert(![...document.querySelectorAll('[role="option"]')].some(option => /Somente serviços|Legado sem classificação/.test(option.textContent)), 'Service-only and unclassified models must not become academic options');
    assert.equal(document.querySelector('select'), null);
    await click(document.querySelector('[role="option"]'));
    assert(document.body.textContent.includes('Descrição fiscal revisada sintética'));
    assert(document.body.textContent.includes('Modelo anterior'));
    if (scenario.preconfigured) await click(button('Concluir seleção'));
    assert.equal(document.querySelector('[role="combobox"]'), null);
    await click(button('Alterar modelo'));
    assert(document.querySelector('[role="combobox"]'));
    await click(button('Concluir seleção'));
    assert.equal(document.querySelector('[role="combobox"]'), null);
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 0);
    if (!scenario.expectedDate) {
      assert(document.querySelector('[role="alert"]').textContent.includes('Não foi possível determinar as datas fiscais'));
      assert.equal(calls.length, 0);
      return;
    }
    assert.equal(button('Salvar ajustes').disabled, false);
    const submit = button('Salvar ajustes');
    await act(async () => { submit.click(); submit.click(); }); await settle();
    assert.equal(calls.length, 1); assert.equal(button('Salvando ajustes').disabled, true);
    assert.equal(calls[0].input.expectedRevision, scenario.oldSavedDate ? 1 : 0);
    assert.equal(calls[0].input.modelId, fiscalId(6)); assert.equal(calls[0].input.modelVersion, 2);
    assert.equal('definition' in calls[0].input, false, 'No invented date, identity or human confirmation is sent');
    await act(async () => pending.reject(new Error('Resposta não confirmada.'))); await settle();
    assert(document.querySelector('[role="alert"]').textContent.includes('Resposta não confirmada'));
    assert.equal(document.querySelector('output[aria-label="Competência fiscal"]').textContent, 'Outubro de 2026');
    await click(button('Salvar ajustes'));
    assert.equal(calls.length, 2); assert.equal(calls[0].input.requestId, calls[1].input.requestId);
    assert.equal('amount' in calls[1].input, false); assert.equal('cnpj' in calls[1].input, false);
    await act(async () => pending.resolve()); await settle(); await settle();
    assert.equal(document.querySelector('output[aria-label="Competência fiscal"]').textContent, 'Outubro de 2026');
    assert.equal(document.querySelector('input[type="date"]'), null);
    assert.equal(savedMessages.length, 1); assert(document.body.textContent.includes('Ajustes validados'));
    assert(document.body.textContent.includes('serão conferidos novamente antes da transmissão'));
    assert.equal(button('Salvar ajustes').disabled, true); assert.equal(button('Emitir'), undefined);
    assert.equal(closed, 0);
  } finally {
    await act(async () => root.unmount()); client.clear();
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.activeElement.id, 'opener');
    dom.window.close(); delete globalThis.__fiscalModels;
    await rm(temp, { recursive: true, force: true });
  }
});


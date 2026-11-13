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

test('partner preparation preserves the selected 2000-character model description and reviews the mandatory financial plan before saving', async () => {
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
          searchPartners:(...args)=>globalThis.__partnerSearch(...args),
          save:(...args)=>globalThis.__partnerSave(...args),previewFinancialPlan:(...args)=>globalThis.__partnerPreview(...args)};`
          : 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden in UI smoke")}});', loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { default: Modal } = await import(pathToFileURL(bundle).href);
  const description = 'SERVIÇO SINTÉTICO '.padEnd(2000, 'x');
  globalThis.__partnerModel = { id: id(3), version: 2, modelType: 'AMBOS', name: 'Modelo sintético 2000', active: true, serviceDescription: description };
  const student = { id: id(4), name: 'Parceiro sintético', tradeName: null, document: '00000000191', type: 'ALUNO' };
  const company = { id: id(7), name: 'MUNICIPIO SINTETICO', tradeName: 'Prefeitura sintética', document: '12.345.678/0001-95', type: 'PJ' };
  globalThis.__partnerOptions = { partners: [student, company],
    categories: [{id:id(6),name:'Serviços sintéticos'}], existingReceivables: [], capabilities: { canGenerateReceivable: true,canLinkExistingReceivable:false,canIssueBolePix:false } };
  const calls = [], messages = [], previews = [];
  globalThis.__partnerPreview = async (scope,partnerId,amount,description,plan) => {
    previews.push({scope,partnerId,amount,description,plan});
    return {financialPlan:{...plan,previewToken:'synthetic-preview'},token:'synthetic-preview',preview:{versao:1,input:{},quantidadeParcelas:3,totalParcelas:1,totalTaxas:0,totalNominal:1,totalComDesconto:1,
      parcelas:[0.34,0.33,0.33].map((valor,index)=>({ordem:index+1,papel:'PARCELA',numero:index+1,valor,dataVencimento:`2026-${index+10}-30`,valorComDesconto:valor,financialTerms:{nominalAmount:valor,dueDate:`2026-${index+10}-30`,discount:null,penalty:null,interest:null}}))}};
  };
  const searches = []; let late;
  globalThis.__partnerSearch = async (scope, query, selectedId, signal) => {
    searches.push({ scope, query, selectedId, signal });
    if (selectedId) return [student, company].filter(partner => partner.id === selectedId);
    if (query === 'lenta') return new Promise(resolve => { late = resolve; });
    if (query === 'erro') throw new Error('Busca sintética indisponível.');
    return query === 'Parceiro' ? [student] : ['Prefeitura', '12.345.678/0001-95', '23'].includes(query) ? [company] : [];
  };
  globalThis.__partnerSave = async (scope, input) => {
    calls.push({ scope, input });
    return { id: id(5), receivableId: null, receivableAction: 'PENDING', message: 'Serviço preparado.' };
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
    assert.equal(document.querySelector('input[type="search"]'), null, 'There is no duplicated partner search input');
    const partnerInput = document.getElementById('nfse-service-partner');
    await click(partnerInput); assert(document.body.textContent.includes('Digite ao menos 2 caracteres'));
    await setValue(partnerInput, 'Parceiro'); await settle(250); await settle();
    await click(document.querySelector('[role="option"]'));
    assert.equal(partnerInput.value, `${student.name} · ${student.document}`);
    await click(document.getElementById('nfse-service-model')); await click(document.querySelector('[role="option"]'));
    const textarea = document.querySelector('textarea');
    assert.equal(textarea.maxLength, 2000); assert.equal(textarea.value, description);
    await setValue(document.querySelector('input[type="date"]'), '2026-11-10');
    await setValue(document.querySelector('input[inputmode="decimal"]'), '1,00');
    await settle(350); await settle();
    await click(partnerInput); await setValue(partnerInput, 'lenta'); await settle(250); await settle();
    assert(late); assert.equal(document.querySelectorAll('[role="option"]').length, 0);
    const slow = searches.find(row => row.query === 'lenta');
    await setValue(partnerInput, 'Prefeitura'); await settle(250); await settle();
    assert.equal(slow.signal.aborted, true, 'Changing the search cancels the old scoped request');
    assert(document.querySelector('[role="option"]').textContent.includes(company.tradeName));
    await act(async () => late([student])); await settle();
    assert(![...document.querySelectorAll('[role="option"]')].some(option => option.textContent.includes(student.name)), 'A late response cannot replace the current server result');
    await setValue(partnerInput, 'erro'); await settle(250); await settle();
    assert(document.body.textContent.includes('Não foi possível consultar os parceiros'));
    assert.equal(document.querySelector('textarea').value, description); assert.equal(document.querySelector('input[inputmode="decimal"]').value, '1,00');
    assert.equal([...document.querySelectorAll('button')].find(button=>button.textContent==='Financeiro').disabled,true);
    await setValue(partnerInput, '23'); await settle(250); await settle();
    assert(document.querySelector('[role="option"]'), 'The server result is not subjected to a second local text filter');
    await act(async () => partnerInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await act(async () => partnerInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))); await settle();
    assert.equal(partnerInput.value, `${company.tradeName} · ${company.document}`);
    await click(partnerInput); await setValue(partnerInput, '12.345.678/0001-95'); await settle(250); await settle();
    assert(document.querySelector('[role="option"]').textContent.includes(company.tradeName));
    await act(async () => partnerInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await settle();
    assert.equal(partnerInput.value, `${company.tradeName} · ${company.document}`);
    const button = label => [...document.querySelectorAll('button')].find(button=>button.textContent===label);
    assert.equal(button('Financeiro').disabled,false); await click(button('Financeiro'));
    assert.equal(button('Revisar').disabled,true,'The financial obligation cannot be skipped');
    assert.equal(document.querySelector('input[name="nfse-partner-generate"]'),null);
    assert.equal(document.querySelectorAll('input[name="nfse-service-charge"]')[1].disabled,true,'BolePix requires the backend capability');
    await setValue(document.querySelector('[aria-label="Quantidade de parcelas"]'),'3');
    await setValue(document.querySelector('[aria-label="Primeiro vencimento"]'),'2026-11-30');
    await click(document.getElementById('nfse-partner-category'));await click(document.querySelector('[role="option"]'));
    await click(button('Revisar'));
    assert.equal(previews.length,1);assert.equal(previews[0].plan.installments,3);
    assert(document.body.textContent.includes('0,34'),'The review displays canonical backend rounding');
    let submit = document.querySelector('button[type="submit"]');
    assert.equal(submit.disabled, false); await click(submit);
    assert.equal(calls.length, 1); assert.equal(calls[0].input.serviceDescription, description);
    assert.equal(calls[0].input.generateReceivable, true);assert.equal(calls[0].input.financialPlan.previewToken,'synthetic-preview'); assert.equal(calls[0].input.amount, '1.00');
    assert.equal(calls[0].input.modelId, id(3)); assert.equal(calls[0].input.modelVersion, 2);
    assert.equal(calls[0].input.partnerId, company.id); assert(searches.every(row => row.scope.poloId === scope.poloId && row.scope.environment === scope.environment));
    assert.equal(messages.length, 1); assert.equal(document.querySelector('select, datalist'), null);
    globalThis.__partnerOptions.capabilities.canIssueBolePix=true;
    await act(async()=>{await client.invalidateQueries();});await settle();
    await click(button('Voltar'));
    const bolepix=document.querySelectorAll('input[name="nfse-service-charge"]')[1];
    assert.equal(bolepix.disabled,false);await click(bolepix);
    await click(button('Voltar'));
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'SERVIÇO NO PERÍODO DE {{periodo}}, CONFORME RELATÓRIO.');
      textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }); await settle(350);
    assert.equal(button('Financeiro').disabled,true, 'Missing period never silently falls back to service date');
    const dates = [...document.querySelectorAll('fieldset:not([hidden]) input[type="date"]')];
    assert.equal(dates.length, 3);
    assert.equal(dates[1].value, ''); assert.equal(dates[2].value, '');
    await setValue(dates[1], '2026-09-09'); await setValue(dates[2], '2026-09-08');
    assert.equal(button('Financeiro').disabled, true);
    assert(document.body.textContent.includes('não pode ser anterior'));
    await setValue(dates[2], '2026-10-08'); await settle(350); await settle();
    assert(document.body.textContent.includes('09/09/2026 ATÉ 08/10/2026'));
    await click(button('Financeiro'));await click(button('Revisar'));
    submit=document.querySelector('button[type="submit"]');assert.equal(submit.disabled,false);await click(submit);
    assert.equal(previews[1].description,'SERVIÇO NO PERÍODO DE 09/09/2026 ATÉ 08/10/2026, CONFORME RELATÓRIO.');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].input.serviceDescription, 'SERVIÇO NO PERÍODO DE {{periodo}}, CONFORME RELATÓRIO.');
    assert.equal(calls[1].input.servicePeriodStart, '2026-09-09');
    assert.equal(calls[1].input.servicePeriodEnd, '2026-10-08');
    assert.equal(calls[1].input.serviceDate, '2026-11-10');
    assert.equal(calls[1].input.financialPlan.issueBolePix,true,'The approved BolePix intent is preserved in the canonical plan');
    assert.notEqual(calls[0].input.requestId, calls[1].input.requestId);

  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    delete globalThis.__partnerPreview; delete globalThis.__partnerModel; delete globalThis.__partnerOptions; delete globalThis.__partnerSave; delete globalThis.__partnerSearch;
    await rm(temp, { recursive: true, force: true });
  }
});

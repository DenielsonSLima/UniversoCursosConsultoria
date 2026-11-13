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

test('model list shows registered fiscal descriptions, preserves selection and reviews the mandatory financial plan', async () => {
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
        ? `export const nfseModelsService={list:async()=>({rows:globalThis.__partnerModels}),
          previewDescription:async(_scope,description)=>({description,monthLabel:'novembro de 2026',usesReferenceMonth:false})};`
        : args.path === 'partners' ? `export const nfsePartnerServices={options:async()=>globalThis.__partnerOptions,
          searchPartners:(...args)=>globalThis.__partnerSearch(...args),
          save:(...args)=>globalThis.__partnerSave(...args),previewFinancialPlan:(...args)=>globalThis.__partnerPreview(...args)};`
          : 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden in UI smoke")}});', loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { default: Modal } = await import(pathToFileURL(bundle).href);
  const description = 'SERVIÇO SINTÉTICO '.padEnd(2000, 'x');
  globalThis.__partnerModels = [
    { id: id(3), version: 2, modelType: 'AMBOS', name: 'Palestra — recebimento antecipado', active: true, serviceDescription: description,
      nbsCode: '122051900', operationIndicatorCode: '100301', serviceOptions: { operationType: '4' } },
    { id: id(8), version: 7, modelType: 'SERVICO', name: 'Palestra — pagamento posterior', active: true, serviceDescription: 'Descrição posterior sintética',
      nbsCode: '122051900', operationIndicatorCode: '100301', serviceOptions: { operationType: '1' } },
    { id: id(9), version: 1, modelType: 'SERVICO', name: 'Modelo histórico sem classificação conhecida', active: true, serviceDescription: 'Descrição histórica',
      nbsCode: '999999999', operationIndicatorCode: '' },
    { id: id(10), version: 1, modelType: 'SERVICO', name: 'Modelo inativo', active: false },
  ];
  const student = { id: id(4), name: 'Parceiro sintético', tradeName: null, document: '00000000191', type: 'ALUNO' };
  const company = { id: id(7), name: 'MUNICIPIO SINTETICO', tradeName: 'Prefeitura sintética', document: '12.345.678/0001-95', type: 'PJ' };
  globalThis.__partnerOptions = { partners: [student, company],
    categories: [{id:id(6),name:'Serviços NFS-e'}, {id:id(12),name:'Cursos EAD'}], existingReceivables: [], capabilities: { canGenerateReceivable: true,canLinkExistingReceivable:false,canIssueBolePix:false } };
  const calls = [], messages = [], previews = [];
  globalThis.__partnerPreview = async (scope,partnerId,amount,description,plan) => {
    previews.push({scope,partnerId,amount,description,plan});
    return {financialPlan:{...plan,previewToken:'synthetic-preview'},token:'synthetic-preview',preview:{versao:1,input:{},quantidadeParcelas:3,totalParcelas:1,totalTaxas:0,totalNominal:1,totalComDesconto:1,
      parcelas:[0.34,0.33,0.33].map((valor,index)=>({ordem:index+1,papel:'PARCELA',numero:index+1,valor,dataVencimento:`2026-${index+10}-30`,valorComDesconto:valor,financialTerms:{nominalAmount:valor,dueDate:`2026-${index+10}-30`,discount:null,
        penalty:plan.penaltyPercent?{type:'percentage',value:plan.penaltyPercent,startsOn:'2026-12-01'}:null,
        interest:plan.monthlyInterestPercent?{type:'monthly-percentage',value:plan.monthlyInterestPercent,startsOn:'2026-12-01'}:null}}))}};
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
  const typeDigits = async (input, digits) => { await setValue(input, ''); for (const digit of digits) await setValue(input, `${input.value}${digit}`); };
  const paste = async (input, text) => {
    const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    await act(async () => input.dispatchEvent(event)); await settle();
    assert.equal(event.defaultPrevented, true);
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
    assert(!document.querySelector('[role="option"]').className.includes('bg-'), 'Ordinary select options keep their existing appearance');
    await click(document.querySelector('[role="option"]'));
    assert.equal(partnerInput.value, `${student.name} · ${student.document}`);
    const modelInput = document.getElementById('nfse-service-model');
    await click(modelInput);
    const modelList = document.querySelector('[role="listbox"]');
    assert.equal(modelList.getAttribute('class'), null, 'The dropdown is a single ordinary list at every viewport');
    assert.equal(modelList.querySelectorAll('[role="option"]').length, 3, 'Only active service/shared models are offered');
    assert.deepEqual([...modelList.querySelectorAll('[role="option"]')].map(option =>
      option.classList.contains('bg-slate-100') ? 'alternate' : option.classList.contains('bg-white') ? 'base' : 'missing'),
    ['base','alternate','base'], 'The three list rows alternate their backgrounds');
    const firstOption = modelList.querySelector('[role="option"]');
    assert(!/\bborder\b|\bgrid\b/.test(firstOption.className), 'There is no individual card border or grid');
    assert.equal(firstOption.querySelector('span > span').textContent, 'Palestra — recebimento antecipado');
    assert.match(firstOption.querySelector('small').textContent, /NBS 122051900 · Outros serviços de educação/);
    assert.match(firstOption.querySelector('small').textContent, /\| Operação 100301 · Demais serviços, em operações onerosas/);
    const summary = firstOption.querySelector('small').textContent;
    assert(summary.endsWith('.') && !summary.endsWith('..'), 'The summary ends in exactly one full stop');
    const fiscalCatalogQuery = client.getQueryCache().find({ queryKey: ['nfse-fiscal-catalogs'], exact: false });
    const fiscalCatalogs = fiscalCatalogQuery.state.data;
    await act(async () => client.setQueryData(fiscalCatalogQuery.queryKey, { ...fiscalCatalogs,
      operationIndicators: fiscalCatalogs.operationIndicators.map(option => option.code === '100301'
        ? { ...option, description: `${option.description}.` } : option) })); await settle();
    assert.equal(firstOption.querySelector('small').textContent, summary, 'An existing catalog full stop is not duplicated');
    assert(!firstOption.textContent.includes('Fornecimento com pagamento'), 'The operation indicator is not confused with the operation type');
    await setValue(modelInput, 'domicílio principal');
    assert.equal(document.querySelectorAll('[role="option"]').length, 2, 'Search includes the real fiscal descriptions');
    await setValue(modelInput, 'posterior');
    await click(document.querySelector('[role="option"]'));
    assert.equal(modelInput.value, 'Palestra — pagamento posterior');
    assert.equal(document.querySelector('textarea').value, 'Descrição posterior sintética');
    await click(modelInput);
    assert.equal(document.querySelector('[role="option"][aria-selected="true"]').textContent.startsWith('Palestra — pagamento posterior'),true);
    await setValue(modelInput, '999999999');
    assert.match(document.querySelector('[role="option"] small').textContent, /999999999 · Descrição indisponível no catálogo/);
    assert.match(document.querySelector('[role="option"] small').textContent, /Operação Não informado no modelo/);
    await setValue(modelInput, 'antecipado');
    await act(async () => modelInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await act(async () => modelInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))); await settle();
    assert.equal(modelInput.value, 'Palestra — recebimento antecipado');
    assert.equal(document.querySelector('[role="listbox"]'), null);
    const textarea = document.querySelector('textarea');
    assert.equal(textarea.maxLength, 2000); assert.equal(textarea.value, description);
    await setValue(document.querySelector('input[type="date"]'), '2026-11-10');
    const serviceAmount = document.querySelector('input[inputmode="decimal"]');
    await typeDigits(serviceAmount, '123456'); assert.equal(serviceAmount.value, '1.234,56');
    await setValue(serviceAmount, '1.234,5'); assert.equal(serviceAmount.value, '123,45');
    await setValue(serviceAmount, ''); assert.equal(serviceAmount.value, '');
    await paste(serviceAmount, 'R$ 1.234,56'); assert.equal(serviceAmount.value, '1.234,56');
    await paste(serviceAmount, '12,5'); assert.equal(serviceAmount.value, '12,50');
    await paste(serviceAmount, '-1,00'); assert.equal(serviceAmount.value, '12,50', 'Negative paste does not become positive');
    await setValue(serviceAmount, '1,00');
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
    assert.equal(document.getElementById('nfse-partner-category'), null, 'The financial category is no longer selectable');
    assert(!document.body.textContent.includes('Categoria financeira'), 'The category field and label are removed from the form');
    await click(document.querySelector('details[aria-label="Condições de parcelas"] summary'));
    const interest = document.querySelector('[aria-label="Juros ao mês de parcelas (%)"]');
    const penalty = document.querySelector('[aria-label="Multa de parcelas (%)"]');
    assert.equal(interest.value, '0,00'); assert.equal(penalty.value, '0,00');
    await typeDigits(interest, '123'); assert.equal(interest.value, '1,23');
    await setValue(interest, '1,2'); assert.equal(interest.value, '0,12');
    await setValue(interest, ''); assert.equal(interest.value, '');
    await paste(interest, '12,5'); assert.equal(interest.value, '12,50');
    await paste(interest, '1.25'); assert.equal(interest.value, '1,25');
    await paste(interest, '-2,00'); assert.equal(interest.value, '1,25');
    await typeDigits(penalty, '200'); assert.equal(penalty.value, '2,00');
    const fixedDiscount = document.querySelector('[aria-label="Desconto de parcelas (R$)"]');
    await typeDigits(fixedDiscount, '123456'); assert.equal(fixedDiscount.value, '1.234,56');
    await paste(fixedDiscount, 'R$ 0,10'); assert.equal(fixedDiscount.value, '0,10');
    await click(button('Percentual (%)'));
    const discount = document.querySelector('[aria-label="Desconto de parcelas (%)"]');
    assert.equal(discount.value, '0,00', 'Changing the discount kind clears the old monetary amount');
    await typeDigits(discount, '250'); assert.equal(discount.value, '2,50');
    await paste(discount, '12,5%'); assert.equal(discount.value, '12,50');
    await typeDigits(discount, '500'); assert.equal(discount.value, '5,00');
    await click(button('Revisar'));
    assert.equal(previews.length,1);assert.equal(previews[0].plan.installments,3);
    assert.equal(previews[0].plan.categoryId,id(6));
    assert.equal(previews[0].plan.monthlyInterestPercent,1.25); assert.equal(previews[0].plan.penaltyPercent,2);
    assert.equal(previews[0].plan.discountType,'PERCENTUAL'); assert.equal(previews[0].plan.discountValue,5);
    assert(document.body.textContent.includes('1,25% ao mês') && document.body.textContent.includes('2,00%'));
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
    await click(button('Em reais (R$)'));
    await paste(document.querySelector('[aria-label="Desconto de parcelas (R$)"]'), 'R$ 0,10');
    assert.equal(document.querySelector('[aria-label="Desconto de parcelas (R$)"]').value, '0,10');
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
    assert.equal(calls[1].input.financialPlan.discountType,'FIXO'); assert.equal(calls[1].input.financialPlan.discountValue,0.1);
    assert.notEqual(calls[0].input.requestId, calls[1].input.requestId);
    await click(button('Voltar'));
    globalThis.__partnerOptions.categories=[{id:id(12),name:'Categoria arbitrária'}];
    await act(async()=>{await client.invalidateQueries();});await settle();
    assert.equal(button('Revisar').disabled,true,'An absent canonical category cannot silently fall back to another category');
    assert(document.body.textContent.includes('A categoria SERVIÇOS NFS-E está indisponível'));
    globalThis.__partnerOptions.categories=[{id:id(6),name:'Serviços NFS-e'}, {id:id(13),name:' SERVIÇOS NFS-E '}];
    await act(async()=>{await client.invalidateQueries();});await settle();
    assert.equal(button('Revisar').disabled,true,'Multiple canonical category candidates remain ambiguous');
    globalThis.__partnerOptions.categories=[{id:id(6),name:'Serviços NFS-e'}, {id:id(12),name:'Cursos EAD'}];
    await act(async()=>{await client.invalidateQueries();});await settle();
    assert.equal(button('Revisar').disabled,false,'A legacy cache containing other categories can still identify the unique canonical service category');
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    delete globalThis.__partnerPreview; delete globalThis.__partnerModels; delete globalThis.__partnerOptions; delete globalThis.__partnerSave; delete globalThis.__partnerSearch;
    await rm(temp, { recursive: true, force: true });
  }
});

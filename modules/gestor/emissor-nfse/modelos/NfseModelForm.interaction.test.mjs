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

test('pre-model steps preserve reusable people/service choices and save without issuing', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-model-steps-'));
  const dom = new JSDOM('<!doctype html><button id="opener">Novo pré-modelo</button><div id="root"></div>',
    { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Form} from './modules/gestor/emissor-nfse/modelos/NfseModelForm';
    export {NfseTabContext} from './modules/gestor/emissor-nfse/components/NfseTabContext';
    export {createDefaultNfseModelPeopleOptions} from './modules/gestor/emissor-nfse/modelos/services/nfse-model-people-options';`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    loader: { '.css': 'empty' }, plugins: [{ name: 'synthetic-model-services', setup(builder) {
      builder.onResolve({ filter: /nfse-models\.service$/ }, () => ({ path: 'models', namespace: 'fixture' }));
      builder.onResolve({ filter: /nfse-fiscal-catalogs\.service$/ }, () => ({ path: 'catalogs', namespace: 'fixture' }));
      builder.onResolve({ filter: /person-reference-catalog\.service$/ }, () => ({ path: 'locations', namespace: 'fixture' }));
      builder.onResolve({ filter: /configuration\.service$/ }, () => ({ path: 'configuration', namespace: 'fixture' }));
      builder.onResolve({ filter: /nfse-model-partners\.service$/ }, () => ({ path: 'partners', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'live-blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'models'
        ? 'export const nfseModelsService={save:(...args)=>globalThis.__modelSave(...args),previewDescription:async(_scope,description)=>({description,monthLabel:"novembro de 2026",usesReferenceMonth:false})};'
        : args.path === 'catalogs' ? 'export const loadNfseFiscalCatalogs=async()=>globalThis.__modelCatalogs;'
          : args.path === 'locations' ? `export const searchNationalityCatalog=async()=>[{metadata:{codigoIso3:'BRA',pais:'BRASIL'}},{metadata:{codigoIso3:'PRT',pais:'PORTUGAL'}}];
            export const searchMunicipalityCatalog=async()=>[{label:'MUNICÍPIO SINTÉTICO/SE',metadata:{codigoIbge:'2803401'}}];`
            : args.path === 'configuration' ? `export const nfseConfigurationService={get:async()=>({cnpj:'00000000000000',municipalityCode:'2803401',municipalRegistration:'IM sintética',opSimpNac:'3',regApTribSN:'1',regEspTrib:'0'})};`
              : args.path === 'partners' ? 'export const nfseModelPartnersService={search:async()=>[]};'
          : 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden in UI smoke")}});', loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { Form, NfseTabContext, createDefaultNfseModelPeopleOptions } = await import(pathToFileURL(bundle).href);
  const scope = { contextKey: id(1), poloId: id(2), month: '2026-11', environment: 'HOMOLOGACAO' };
  const model = { id: id(3), version: 2, name: 'Modelo educacional sintético', active: true,
    nationalServiceCode: '080201', nbsCode: '122020000', operationIndicatorCode: '',
    serviceDescription: 'Descrição sintética revisável', issTreatment: 'TRIBUTAVEL', immunityType: null,
    technicalResponsibilityDocument: 'ART sintética', referenceDocument: 'Referência sintética',
    complementaryInfo: 'Complemento sintético', orderReference: 'Pedido sintético',
    peopleOptions: createDefaultNfseModelPeopleOptions(), serviceOptions: null };
  globalThis.__modelCatalogs = { nationalServices: [{ code: '080201', description: 'Ensino técnico' }],
    nbs: [{ code: '122020000', description: 'Educação técnica' }], operationIndicators: [{ code: '100301', description: 'Operação sintética' }] };
  const calls = [], messages = [];
  let pending;
  globalThis.__modelSave = async (receivedScope, input) => {
    calls.push({ scope: receivedScope, input });
    await new Promise((resolve, reject) => { pending = { resolve, reject }; });
    return { id: model.id, version: 3, message: 'Pré-modelo salvo.' };
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  document.getElementById('opener').focus();
  const root = createRoot(document.getElementById('root'));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  const button = text => [...document.querySelectorAll('button')].find(control => control.textContent.trim() === text);
  const step = name => [...document.querySelectorAll('nav button')].find(control => control.textContent.endsWith(name));
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  const setValue = async (input, value) => {
    await act(async () => {
      const prototype = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    }); await settle();
  };
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client },
      React.createElement(NfseTabContext.Provider, { value: { scope, unavailable: false, canRead: true, loading: false, onPrepared() {} } },
        React.createElement(Form, { model, onClose() {}, onSaved: message => messages.push(message) })))));
    await settle(); await settle();
    assert.equal(document.querySelectorAll('nav button').length, 4);
    assert.equal(step('Pessoas').getAttribute('aria-current'), 'step');
    assert.equal(button('Voltar').disabled, true);
    assert.equal(button('Salvar pré-modelo').disabled, true, 'Legacy locations and IBS/CBS choices must not be inferred');
    assert(document.body.textContent.includes('Emitente da NFS-e'));
    assert([...document.querySelectorAll('input[readonly]')].some(input => input.value === 'IM sintética'));
    await click(document.querySelector('input[name="nfse-model-ibs-cbs"]'));
    await click(button('Continuar'));
    assert.equal(step('Serviço').getAttribute('aria-current'), 'step');
    await click(document.getElementById('nfse-model-country'));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('BRASIL')));
    assert.equal(button('Salvar pré-modelo').disabled, true, 'Brazil must require an explicit municipality');
    await click(document.getElementById('nfse-model-municipality'));
    await click(document.querySelector('[role="option"]'));
    assert.equal(button('Salvar pré-modelo').disabled, false);
    await click(document.getElementById('nfse-model-country'));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('PORTUGAL')));
    assert.equal(document.getElementById('nfse-model-municipality'), null);
    await click(step('Pessoas'));
    const recipientLocation = document.querySelector('input[aria-label="Onde está localizado o estabelecimento/domicílio do tomador?"]');
    await click(recipientLocation);
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'Exterior'));
    await click(document.querySelectorAll('input[name="nfse-model-ibs-cbs"]')[1]);
    await click(document.querySelectorAll('input[name="nfse-model-government"]')[1]);
    assert.equal(recipientLocation.value, 'Brasil');
    assert(document.body.textContent.includes('Em compras governamentais, o tomador deve estar localizado no Brasil'));
    await click(recipientLocation);
    assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    await click(document.querySelector('[role="option"]'));
    await click(document.getElementById('nfse-model-government-entity'));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'Município'));
    await click(document.querySelector('input[aria-label="Para fins de apuração do IBS/CBS, o destinatário é o próprio adquirente?"]'));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'Sim'));
    await click(step('Serviço'));
    assert(document.getElementById('nfse-model-operation-code'));
    await click(document.getElementById('nfse-model-operation-code'));
    await click(document.querySelector('[role="option"]'));
    await click(document.getElementById('nfse-model-operation-type'));
    assert.equal(document.querySelectorAll('[role="option"]').length, 5);
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('concomitantes')));
    await click(step('Pessoas'));
    await act(async () => {
      document.querySelector('input[name="nfse-model-ibs-cbs"]').click();
      step('Serviço').click();
    }); await settle();
    assert.equal(document.getElementById('nfse-model-operation-code'), null);
    assert.equal(document.getElementById('nfse-model-operation-type'), null);
    assert.equal(button('Salvar pré-modelo').disabled, false, 'Central cleanup must work even when the People step unmounts in the same update');
    const textareas = document.querySelectorAll('textarea');
    assert.equal(textareas.length, 2);
    assert.equal(textareas[1].value, model.complementaryInfo);
    assert.equal(document.querySelector('details'), null, 'Complementary fields stay visible');
    assert.equal(document.querySelector('select, datalist'), null);
    const revised = 'Descrição sintética mantida entre etapas';
    await setValue(textareas[0], revised);
    await click(step('Valores'));
    assert(document.body.textContent.includes('Aguardando a referência da etapa 3'));
    assert.equal(document.querySelectorAll('input').length, 2);
    await click(button('Continuar'));
    assert(document.body.textContent.includes('Aguardando a referência da etapa 4'));
    assert.equal(button('Continuar').disabled, true);
    await click(step('Serviço'));
    assert.equal(document.querySelector('textarea').value, revised);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); }); await settle();
    await click(step('Revisão'));
    await click(button('Salvar pré-modelo'));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].scope, scope);
    assert.equal(calls[0].input.serviceDescription, revised);
    assert.equal(calls[0].input.complementaryInfo, model.complementaryInfo);
    assert.equal(calls[0].input.serviceOptions.countryCode, 'PRT');
    assert.equal(calls[0].input.serviceOptions.municipalityCode, null);
    assert.equal(calls[0].input.serviceOptions.includeIbsCbs, false);
    assert.equal(calls[0].input.serviceOptions.governmentPurchase, null);
    assert.equal(calls[0].input.serviceOptions.governmentEntityType, null);
    assert.equal(calls[0].input.serviceOptions.operationType, null);
    assert.equal(calls[0].input.operationIndicatorCode, '');
    assert.equal(calls[0].input.peopleOptions.competenceMode, model.peopleOptions.competenceMode);
    assert.equal(calls[0].input.peopleOptions.recipientIsDestination, null);
    assert.equal(calls[0].input.peopleOptions.destinationPartnerId, null);
    assert.equal('cnpj' in calls[0].input.peopleOptions, false);
    assert.equal(calls[0].input.id, model.id);
    assert.equal(calls[0].input.expectedVersion, model.version);
    assert.equal('recipient' in calls[0].input, false);
    assert.equal('competenceDate' in calls[0].input, false);
    assert.equal(button('Salvando…').disabled, true);
    assert([...document.querySelectorAll('nav button')].every(control => control.disabled));
    await act(async () => pending.reject(new Error('Resposta não confirmada.'))); await settle();
    assert(document.querySelector('[role="alert"]').textContent.includes('Não foi possível salvar o pré-modelo'));
    await click(button('Salvar pré-modelo'));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].input.requestId, calls[0].input.requestId);
    await act(async () => pending.resolve()); await settle();
    assert.equal(messages.length, 1);
    assert.equal([...document.querySelectorAll('button')].some(control => control.textContent.includes('Emitir')), false);
  } finally {
    await act(async () => root.unmount()); client.clear();
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.activeElement.id, 'opener');
    dom.window.close(); delete globalThis.__modelSave; delete globalThis.__modelCatalogs;
    await rm(temp, { recursive: true, force: true });
  }
});

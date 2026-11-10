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

test('additional Web fields use official choices, preserve explicit origins and review without transmission', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-additional-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `
    export {default as People} from './modules/gestor/emissor-nfse/modelos/NfseModelAdditionalPeopleFields';
    export {default as Service} from './modules/gestor/emissor-nfse/modelos/NfseModelAdditionalServiceFields';
    export {default as Review} from './modules/gestor/emissor-nfse/modelos/NfseModelPresetReview';
    export {createDefaultNfseModelPeopleOptionsV2} from './modules/gestor/emissor-nfse/modelos/services/nfse-model-people-options';
    export {createDefaultNfseModelAdditionalOptions,normalizeNfseModelAdditionalOptions} from './modules/gestor/emissor-nfse/modelos/services/nfse-model-additional-options';`,
    resolveDir: base, loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    plugins: [{ name: 'deny-live-service', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => { throw new Error('Live service forbidden in isolated additional fields smoke'); });
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { People, Service, Review, createDefaultNfseModelPeopleOptionsV2, createDefaultNfseModelAdditionalOptions, normalizeNfseModelAdditionalOptions } = await import(pathToFileURL(bundle).href);
  let value = createDefaultNfseModelAdditionalOptions();
  let context = { environment: 'HOMOLOGACAO', nationalServiceCode: '080201', nbsCode: '122020000', operationIndicatorCode: '', issTreatment: 'TRIBUTAVEL',
    peopleOptions: createDefaultNfseModelPeopleOptionsV2(), issuerSimpleNationalOption: '3', issuerSimpleNationalAssessment: '1',
    serviceOptions: { version: 1, countryCode: 'BRA', municipalityCode: '2803401', includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null, exportResultCountryCode: null } };
  let section = 'service', disabled = false;
  const edits = [], root = createRoot(document.getElementById('root'));
  const render = () => root.render(section === 'review' ? React.createElement(Review, { fields: { name: 'Modelo sintético', active: false,
    nationalServiceCode: '080201', nbsCode: '122020000', issTreatment: 'TRIBUTAVEL', serviceDescription: 'DESCRIÇÃO SINTÉTICA', peopleOptions: context.peopleOptions,
    serviceOptions: context.serviceOptions, additionalOptions: value }, onEditStep: step => edits.push(step),
    catalogs: { nationalServices: [{ code: '080201', description: 'Ensino técnico' }], nbs: [{ code: '122020000', description: 'Educação técnica' }], operationIndicators: [] } })
    : React.createElement(section === 'people' ? People : Service, { value, context, disabled, onChange: next => { value = next; render(); } }));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  const button = text => [...document.querySelectorAll('button')].find(control => control.textContent.trim() === text);
  const input = label => document.querySelector(`input[aria-label="${label}"]`);
  const choose = async (label, text) => {
    await click(input(label)); await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === text || option.textContent.startsWith(text)));
  };
  const setValue = async (label, next) => { await act(async () => {
    const control = input(label); assert(control, label);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(control, next);
    control.dispatchEvent(new dom.window.Event('input', { bubbles: true })); control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }); await settle(); };
  const updateContext = async change => { context = { ...context, ...change }; value = normalizeNfseModelAdditionalOptions(value, context); await act(async () => render()); await settle(); };
  const show = async next => { section = next; await act(async () => render()); await settle(); };
  try {
    await show('service');
    assert.equal(document.querySelector('select,datalist'), null);
    await click(input('Origem: Código complementar municipal'));
    const fixed = [...document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'Definir neste pré-modelo');
    assert.equal(fixed.getAttribute('aria-disabled'), 'true');
    await click(fixed); assert.equal(value.service.municipalServiceCode, null);
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'Definir na emissão'));
    assert.equal(value.service.municipalServiceCode.source, 'AT_ISSUANCE');
    await choose('Origem: Código interno do contribuinte', 'Definir neste pré-modelo'); await setValue('Código interno do contribuinte', 'EDU-SINTÉTICO');
    assert.equal(value.service.internalContributorCode.value, 'EDU-SINTÉTICO');
    await updateContext({ nationalServiceCode: '070201' });
    await choose('Origem: Informações da obra', 'Definir neste pré-modelo');
    await choose('Identificação da obra', 'Cadastro Imobiliário Brasileiro (CIB)'); await setValue('CIB da obra', 'SINT0001');
    assert.equal(value.service.construction.value.identification.cib, 'SINT0001');
    await choose('Identificação da obra', 'Endereço da obra');
    assert.equal(value.service.construction.value.identification.cib, null);
    assert(input('CEP do local')); assert.equal(input('Cidade no exterior'), null);
    await updateContext({ nationalServiceCode: '120101' });
    assert.equal(value.service.construction, null);
    await choose('Origem: Atividade de evento', 'Definir neste pré-modelo');
    await setValue('Descrição da atividade de evento', 'EVENTO SINTÉTICO'); await setValue('Data inicial do evento', '2026-11-10'); await setValue('Data final do evento', '2026-11-11');
    await choose('Identificação do local do evento', 'Identificador municipal do evento'); await setValue('Identificador municipal do evento', 'EVENTO-TESTE');
    assert.equal(value.service.event.value.endDate, '2026-11-11');
    await updateContext({ nationalServiceCode: '080201', serviceOptions: { ...context.serviceOptions, countryCode: 'PRT', municipalityCode: null } });
    await show('people');
    assert.equal(document.querySelectorAll('input').length, 0, 'No participant identity, location, address or NIF controls belong to the pre-model');
    assert.deepEqual(value.people.nif.recipient, { policy: 'FROM_PARTNER', absenceReason: null });
    await show('service'); await click(button('Configurar comércio exterior'));
    await click(input('Moeda da transação (Banco Central)'));
    assert.equal(document.querySelectorAll('[role="option"]').length, 249);
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent.startsWith('220 ·')));
    await click(input('Apoio/fomento utilizado pelo prestador')); assert.equal(document.querySelectorAll('[role="option"]').length, 8); await click(document.querySelector('[role="option"]'));
    await click(input('Apoio/fomento utilizado pelo tomador')); assert.equal(document.querySelectorAll('[role="option"]').length, 26); await click(document.querySelector('[role="option"]'));
    await choose('Vínculo à movimentação temporária de bens', 'Vinculada à declaração');
    assert.deepEqual(value.service.foreignTrade.importDeclaration, { source: 'AT_ISSUANCE', value: null });
    assert.equal(input('Número DI/DSI/DA/DRI-E'), null);
    await choose('Vínculo à movimentação temporária de bens', 'Vinculada ao registro');
    assert.equal(value.service.foreignTrade.importDeclaration, null); assert.equal(input('Origem: Registro de exportação averbado'), null); assert.equal(value.service.foreignTrade.exportRegistration.source, 'AT_ISSUANCE');
    await updateContext({ peopleOptions: { ...context.peopleOptions, simpleNationalOption: '3', simpleNationalAssessment: '1' },
      serviceOptions: { ...context.serviceOptions, countryCode: 'BRA', municipalityCode: '2803401', includeIbsCbs: true, governmentPurchase: true, governmentEntityType: '4', operationType: '2' }, operationIndicatorCode: '020101' });
    assert(value.service.foreignTrade, 'Conditional comex rule survives until operation parties are selected'); assert.equal(value.people.nif.recipient.policy, 'FROM_PARTNER');
    await click(button('Configurar imóvel')); await choose('Origem: Identificação do imóvel', 'Definir neste pré-modelo');
    await choose('Identificação do imóvel', 'Cadastro Imobiliário Brasileiro (CIB)'); await setValue('CIB do imóvel', 'SINT0002');
    assert.equal(value.service.operationReferences.source, 'AT_ISSUANCE');
    assert.equal(input('Origem: NFS-e com fornecimento ou pagamento já realizado'), null, 'Per-invoice references cannot be fixed in a pre-model');
    await choose('Origem: Itens do pedido', 'Definir neste pré-modelo'); await click(button('Adicionar item do pedido')); await setValue('Item do pedido 1', 'ITEM SINTÉTICO');
    assert.deepEqual(value.service.orderItems.value, ['ITEM SINTÉTICO']);
    await show('review'); assert(document.body.textContent.includes('Revisão do pré-modelo'));
    assert(document.body.textContent.includes('080201 · Ensino técnico')); assert(document.body.textContent.includes('3 · Optante · ME/EPP'));
    assert(document.body.textContent.includes('4 · Município')); assert(document.body.textContent.includes('SINT0002'));
    await click(button('Editar regras')); await click(button('Editar serviço')); await click(button('Editar valores'));
    assert.deepEqual(edits, ['people', 'service', 'values']);
    assert(![...document.querySelectorAll('button')].some(control => /Emitir/.test(control.textContent)));
    value.service.municipalServiceCode = { source: 'FIXED', value: '123' }; await show('service');
    assert(document.body.textContent.includes('Código municipal salvo: 123')); assert.equal(input('Código complementar municipal'), null);
    disabled = true; await act(async () => render()); await click(input('Origem: Itens do pedido'));
    assert.equal(document.querySelector('[role="listbox"]'), null, 'Disabled fieldset cannot open selector portal');
  } finally { await act(async () => root.unmount()); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
});

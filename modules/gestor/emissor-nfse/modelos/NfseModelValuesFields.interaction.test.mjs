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

test('Valores exposes Web choices, exact money strings and dependent catalog branches without live access', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-values-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `
    export {default as Fields} from './modules/gestor/emissor-nfse/modelos/NfseModelValuesFields';
    export {serializeNfseModelValuesOptions,validateNfseModelValuesOptions} from './modules/gestor/emissor-nfse/modelos/services/nfse-model-values-options';
    export {nfseIbsCbsClassifications,nfsePresumedCredits} from './modules/gestor/emissor-nfse/modelos/catalogs/nfse-ibscbs.catalog';`,
    resolveDir: base, loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node',
    packages: 'external', jsx: 'automatic', outfile: bundle, loader: { '.css': 'empty' } });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { Fields, serializeNfseModelValuesOptions, validateNfseModelValuesOptions,
    nfseIbsCbsClassifications, nfsePresumedCredits } = await import(pathToFileURL(bundle).href);
  const catalogs = { classifications: nfseIbsCbsClassifications, credits: nfsePresumedCredits };
  let value = null, contextValue, updateContext, updateValues;
  const supplierId = '00000000-0000-0000-0000-000000000001';
  function Harness() {
    const [fields, setFields] = React.useState(null);
    const [context, setContext] = React.useState({ includeIbsCbs: false, simpleNationalOption: '3', simpleNationalAssessment: '1',
      issuerRole: 'PROVIDER', recipientAvailable: true, intermediaryAvailable: false, issTreatment: 'TRIBUTAVEL',
      profile: 'PRODUCTION_20260209', competenceDate: '2026-11-10' });
    updateContext = change => setContext(current => ({ ...current, ...change }));
    updateValues = change => setFields(current => change(current));
    value = fields;
    contextValue = context;
    return React.createElement(Fields, { value: fields, onChange: setFields, context, catalogs });
  }
  const root = createRoot(document.getElementById('root'));
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const button = text => [...document.querySelectorAll('button')].find(control => control.textContent.trim() === text);
  const click = async control => { assert(control, 'Expected visible control'); await act(async () => control.click()); await settle(); };
  const input = label => document.querySelector(`input[aria-label="${label}"]`);
  const choose = async (label, text) => {
    await click(input(label));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === text || option.textContent.startsWith(text)));
  };
  const field = label => [...document.querySelectorAll('label')].find(node => node.querySelector('span')?.textContent.replace(/\s*\*$/, '') === label)?.querySelector('input');
  const type = async (control, text) => {
    assert(control, 'Expected value input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(control, text);
      control.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    }); await settle();
  };
  const key = async (control, name) => {
    await act(async () => control.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true })));
    await settle();
  };
  const warnings = [], originalError = console.error;
  console.error = (...args) => { warnings.push(args.join(' ')); originalError(...args); };
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await click(button('Configurar valores e tributação'));
    assert.equal(value.iss.retention, null);
    assert.equal(value.transparency.mode, null);
    assert.equal(value.ibscbs, null);
    assert.equal(document.querySelector('select, datalist'), null);
    assert(!document.body.textContent.includes('copropriedade'), 'API-only rental has no invented Web UI');
    assert(!document.body.textContent.includes('Conferência dos valores'), 'Per-invoice calculation belongs to issuance, not the preset');
    await choose('Origem do valor do serviço', 'Valor fixo definido no modelo');
    await type(field('Valor fixo do serviço (R$)'), '1234');
    assert.equal(value.serviceAmount.fixedAmount, '12.34');
    assert.equal(field('Valor fixo do serviço (R$)').value, '12,34');
    await choose('A exigibilidade do ISSQN está suspensa?', 'Não');
    await choose('Retenção do ISSQN', 'Não retido');
    await click(input('Aplicar benefício municipal?'));
    assert.equal([...document.querySelectorAll('[role="option"]')].find(option => option.textContent.startsWith('Sim')).getAttribute('aria-disabled'), 'true');
    await key(input('Aplicar benefício municipal?'), 'Escape');
    await act(async () => updateValues(current => ({ ...current, iss: { ...current.iss, benefitId: '00000000000001' } }))); await settle();
    assert.equal(field('Identificação do benefício municipal').readOnly, true);
    assert.equal(field('Identificação do benefício municipal').value, '00000000000001');
    assert(document.body.textContent.includes('Para salvar agora, remova-o'));
    await choose('Aplicar benefício municipal?', 'Não');
    assert.equal(value.iss.benefitId, null);
    await click(input('Origem dos tributos federais'));
    const explicit = [...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('Configurar PIS/COFINS'));
    assert.equal(explicit.getAttribute('aria-disabled'), 'true');
    await act(async () => input('Origem dos tributos federais').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await choose('Como informar a estimativa tributária?', 'Percentuais');
    for (const suffix of ['federais', 'estaduais', 'municipais']) await type(field(`Percentual aproximado de tributos ${suffix} (%)`), '0');
    await choose('Dedução ou redução da base de cálculo', 'Documentos vinculados');
    await click(button('Adicionar regra documental'));
    await choose('Categoria do documento', '02 · Materiais');
    assert.equal(value.deduction.documents[0].supplierSource, 'DOCUMENT');
    assert.equal(value.deduction.documents[0].supplierPartnerId, null);
    await click(input('Fornecedor do documento'));
    assert.equal(document.querySelectorAll('[role="option"]').length, 2, 'New rules offer only document/omit strategies');
    assert(!document.body.textContent.includes('Vincular fornecedor do cadastro'));
    await key(input('Fornecedor do documento'), 'Escape');
    for (const label of ['Chave de acesso do documento', 'Data de emissão do documento', 'Valor original do documento',
      'Valor dedutível disponível', 'Parcela utilizada nesta emissão', 'Identificação e endereço do fornecedor']) assert.equal(field(label), undefined);
    assert.equal(input('Fornecedor cadastrado'), null);
    assert.equal(document.querySelector('input[type="search"]'), null);
    await act(async () => updateValues(current => ({ ...current, deduction: { ...current.deduction, documents: current.deduction.documents.map((rule, index) => index === 0
      ? { ...rule, supplierSource: 'FIXED_PARTNER', supplierPartnerId: supplierId, supplierPartnerLabel: 'Fornecedor sintético' } : rule) } }))); await settle();
    assert.equal(value.deduction.documents[0].supplierPartnerId, supplierId, 'Loading a historical fixed reference does not erase it');
    assert(document.body.textContent.includes('referência fixa de versão anterior'));
    assert(!document.body.textContent.includes('Fornecedor sintético'), 'The preset does not expose a concrete supplier record');
    assert(validateNfseModelValuesOptions(value, contextValue, catalogs).some(issue => issue.includes('fornecedor do documento ao emitir')));
    await click(input('Fornecedor do documento'));
    assert.equal([...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('versão anterior')).getAttribute('aria-disabled'), 'true');
    await key(input('Fornecedor do documento'), 'Escape');
    await choose('Fornecedor do documento', 'Usar fornecedor identificado no documento ao emitir');
    assert.equal(value.deduction.documents[0].supplierPartnerId, null);
    assert.equal(value.deduction.documents[0].categoryCode, '02', 'Changing only the supplier strategy preserves the fiscal document rule');
    assert.equal('invoiceKey' in value.deduction.documents[0], false);
    assert.equal(serializeNfseModelValuesOptions(value).deduction.documents[0].supplierPartnerLabel, undefined);
    await act(async () => updateContext({ includeIbsCbs: true })); await settle();
    await type(input('Situação tributária IBS/CBS'), '999');
    assert.equal(document.querySelectorAll('[role="option"]').length, 0);
    await key(input('Situação tributária IBS/CBS'), 'Enter');
    assert.equal(value.ibscbs, null, 'An unknown CST query must not be persisted');
    await key(input('Situação tributária IBS/CBS'), 'Escape');
    await choose('Situação tributária IBS/CBS', '200 ·');
    await type(input('Classificação tributária IBS/CBS'), '200999');
    assert.equal(document.querySelectorAll('[role="option"]').length, 0);
    await key(input('Classificação tributária IBS/CBS'), 'Enter');
    assert.equal(value.ibscbs.classificationCode, '', 'An unknown classification query must not become a code');
    await key(input('Classificação tributária IBS/CBS'), 'Escape');
    await choose('Classificação tributária IBS/CBS', '200004 ·');
    assert.equal(value.ibscbs.classificationCode, '200004');
    assert.equal(value.ibscbs.presumedCreditCode, null);
    assert.equal(value.ibscbs.deferral, null);
    await act(async () => updateContext({ includeIbsCbs: false })); await settle();
    assert(document.body.textContent.includes('essas informações estão desativadas'));
    await click(button('Remover regras de IBS/CBS'));
    assert.equal(value.ibscbs, null);
    await act(async () => updateContext({ simpleNationalOption: '1' })); await settle();
    await choose('Origem dos tributos federais', 'Configurar PIS/COFINS e retenções');
    await choose('Retenção IRRF', 'Valor fixo');
    await type(field('Retenção IRRF · valor (R$)'), '123');
    assert.equal(value.federal.pisCofinsCst, null, 'CP/IRRF do not invent a PIS/COFINS group');
    assert.equal(value.federal.withheldIrrf.value, '1.23');
    await choose('Situação tributária de PIS/COFINS', '01 ·');
    await choose('Base de cálculo PIS/COFINS', 'Percentual da base');
    await type(field('Base de cálculo PIS/COFINS · percentual'), '100');
    await type(field('Alíquota PIS (%)'), '1,65');
    await type(field('Alíquota COFINS (%)'), '7,60');
    await choose('Retenção de PIS/COFINS/CSLL', 'PIS, COFINS e CSLL não retidos');
    assert.equal(serializeNfseModelValuesOptions(value).federal.pisRatePercent, '1.65');
    await act(async () => updateContext({ simpleNationalOption: '3', simpleNationalAssessment: '2' })); await settle();
    assert(document.body.textContent.includes('não é compatível com o enquadramento atual'));
    await click(button('Usar enquadramento da unidade'));
    assert.equal(value.federal.mode, 'FROM_ESTABLISHMENT');
    assert.equal(value.federal.withheldIrrf.source, 'NONE');
    assert.equal(warnings.length, 0, warnings.join('\n'));
  } finally {
    console.error = originalError;
    await act(async () => root.unmount());
    dom.window.close();
    await rm(temp, { recursive: true, force: true });
    for (const key of ['window', 'document', 'HTMLElement', 'MutationObserver', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
  }
});

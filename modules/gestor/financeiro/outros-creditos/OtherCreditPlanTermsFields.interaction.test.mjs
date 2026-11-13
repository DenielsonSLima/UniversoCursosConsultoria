import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act, useState } from 'react';

const base = fileURLToPath(new URL('../../../../', import.meta.url));
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE || process.env.FINANCIAL_PAYMENT_JSDOM_PATH;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');

test('two decimal service fields are opt-in and keep the existing other-credit typing contract', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/other-credit-terms-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  let root;
  try {
    const output = resolve(temp, 'terms.mjs');
    const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/financeiro/outros-creditos/OtherCreditPlanTermsFields.tsx')],
      bundle: true, write: false, outfile: output, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
    await writeFile(output, compiled.outputFiles[0].contents);
    const { OtherCreditPlanTermsFields } = await import(pathToFileURL(output).href);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    function Harness({ twoDecimalInputs }) {
      const [terms, setTerms] = useState({ interest: '0', penalty: '0', discountType: 'FIXO', discount: '', discountDays: '0' });
      return React.createElement(OtherCreditPlanTermsFields, { label: 'parcelas', terms, twoDecimalInputs,
        onChange: patch => setTerms(current => ({ ...current, ...patch })) });
    }
    const field = label => document.querySelector(`[aria-label="${label}"]`);
    const setValue = async (input, value) => act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => root.render(React.createElement(Harness)));
    assert.equal(field('Juros ao mês de parcelas (%)').value, '0');
    await setValue(field('Juros ao mês de parcelas (%)'), '2,5');
    assert.equal(field('Juros ao mês de parcelas (%)').value, '2,5', 'Default percentages retain their existing free decimal entry');
    await setValue(field('Desconto de parcelas (R$)'), '1234');
    assert.equal(field('Desconto de parcelas (R$)').value, '12,34', 'Default money keeps the canonical cent mask');
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Percentual (%)').click());
    assert.equal(field('Desconto de parcelas (%)').value, '', 'The default discount-kind change still clears the input');
    await setValue(field('Desconto de parcelas (%)'), '12,5');
    assert.equal(field('Desconto de parcelas (%)').value, '12,5');
    const paste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '1.25' } });
    await act(async () => field('Desconto de parcelas (%)').dispatchEvent(paste));
    assert.equal(paste.defaultPrevented, false, 'The service-only paste handler is absent by default');
    assert.equal(document.querySelector('select, datalist'), null);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temp, { recursive: true, force: true });
  }
});

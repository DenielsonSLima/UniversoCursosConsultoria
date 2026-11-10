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

test('location picker searches existing catalog, selects canonical codes and contains keyboard/disabled state', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-location-picker-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">Fora</button>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { contents: `import React from 'react';
    import Picker from './modules/gestor/emissor-nfse/modelos/NfseModelLocationPicker';
    export function Fixture({disabled=false}){const [selected,setSelected]=React.useState({value:'',label:''});
      return <fieldset disabled={disabled}><Picker id="country" label="País" kind="country" value={selected.value}
        selectedLabel={selected.label} onChange={option=>{globalThis.__locationSelected.push(option);setSelected(option)}}/></fieldset>}`, resolveDir: base, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle,
    loader: { '.css': 'empty' }, plugins: [{ name: 'synthetic-location-catalog', setup(builder) {
      builder.onResolve({ filter: /person-reference-catalog\.service$/ }, () => ({ path: 'catalog', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const searchNationalityCatalog=(query)=>globalThis.__locationSearch(query);
        export const searchMunicipalityCatalog=()=>{throw new Error('Unexpected municipal query')};`, loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { Fixture } = await import(pathToFileURL(bundle).href);
  const calls = []; let fail = false;
  globalThis.__locationSelected = [];
  globalThis.__locationSearch = async query => {
    calls.push(query); if (fail) throw new Error('Synthetic outage');
    const options = [{ metadata: { codigoIso3: 'BRA', pais: 'BRASIL' } }, { metadata: { codigoIso3: 'PRT', pais: 'PORTUGAL' } }];
    return query ? options.filter(option => option.metadata.pais.includes(query.toUpperCase())) : options;
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const root = createRoot(document.getElementById('root'));
  const settle = async (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  const render = async disabled => { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Fixture, { disabled })))); await settle(); };
  const key = async value => { await act(async () => document.getElementById('country').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true }))); await settle(); };
  const search = async value => {
    await act(async () => {
      const input = document.getElementById('country');
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }); await settle(300); await settle();
  };
  try {
    await render(false);
    const input = document.getElementById('country');
    await act(async () => input.focus()); await settle();
    assert(calls.includes('')); assert.equal(document.querySelectorAll('[role="option"]').length, 2);
    assert.equal(document.querySelector('select, datalist'), null);
    await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
    assert.equal(globalThis.__locationSelected[0].value, 'PRT'); assert.equal(input.value, 'PORTUGAL');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    await act(async () => input.click()); await settle();
    await search('BRAS'); assert(calls.includes('BRAS')); assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    await key('Escape'); assert.equal(input.value, 'PORTUGAL');
    await act(async () => input.click()); await settle();
    await search('INEXISTENTE'); assert.equal(document.querySelectorAll('[role="option"]').length, 0);
    assert(document.querySelector('.institutional-select-panel').textContent.includes('Nenhum resultado'));
    assert.equal(globalThis.__locationSelected.length, 1, 'Search text must not become the canonical selection');
    fail = true; await search('FALHA');
    assert(document.querySelector('[role="alert"]').textContent.includes('Não foi possível consultar'));
    fail = false;
    await act(async () => document.querySelector('.institutional-select-panel button').click()); await settle();
    assert.equal(document.querySelector('[role="alert"]'), null);
    await render(true); assert.equal(input.matches(':disabled'), true); assert.equal(document.querySelector('.institutional-select-panel'), null);
    await render(false); await act(async () => input.click()); await settle();
    await act(async () => document.getElementById('outside').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }))); await settle();
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    await act(async () => input.click()); await settle(); await key('Tab');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    delete globalThis.__locationSelected; delete globalThis.__locationSearch;
    await rm(temp, { recursive: true, force: true });
  }
});

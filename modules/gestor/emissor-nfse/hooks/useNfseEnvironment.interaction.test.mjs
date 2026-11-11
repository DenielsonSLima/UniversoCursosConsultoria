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
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('issuer/configuration share scoped fiscal environment across navigation and render only current history', async t => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-environment-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const output = resolve(temp, 'test.mjs');
  const compiled = await build({ stdin: { resolveDir: base, loader: 'tsx', contents: `
    export {useNfseEnvironment} from './modules/gestor/emissor-nfse/hooks/useNfseEnvironment';
    export {nfseEnvironmentPreferenceKey} from './modules/gestor/emissor-nfse/hooks/nfse-environment.store';
    export {nfseQueryKeys} from './modules/gestor/emissor-nfse/queries/nfse.queryKeys';
    export {nfseMetadataKeys} from './modules/gestor/emissor-nfse/queries/nfse-cache';
    export {default as CompanyPanel} from './modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCompanyPanel';` },
  outfile: output, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
  loader: { '.css': 'empty' }, plugins: [{ name: 'isolated-environment-boundaries', setup(builder) {
    for (const [filter, path] of [
      [/useNfseConfigurationMetadata$/, 'configuration'], [/useNfseNumbering$/, 'numbering'],
      [/useNfseRealtime$/, 'realtime'], [/useNfseQueueRealtime$/, 'queue-realtime'],
      [/NfseConfigurationForm$/, 'form'], [/lib\/supabase$/, 'blocked'],
    ]) builder.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', resolveDir: base, contents: {
      configuration: 'export const useNfseConfigurationMetadata=(scope)=>globalThis.__environmentConfig(scope);',
      numbering: 'export const useNfseNumbering=(scope)=>globalThis.__environmentNumbering(scope);',
      realtime: 'export const useNfseRealtime=()=>{};',
      'queue-realtime': 'export const useNfseQueueRealtime=()=>{};',
      form: 'import React from "react";export default function Form({scope}){return React.createElement("div",{"data-testid":"configuration-form","data-environment":scope.environment});}',
      blocked: 'export const supabase=new Proxy({},{get(){throw new Error("Live Supabase/Auth/fiscal calls forbidden")}});',
    }[args.path] }));
  } }] });
  await writeFile(output, compiled.outputFiles[0].contents);
  const api = await import(pathToFileURL(output).href);
  const root = createRoot(document.getElementById('root'));
  const scope = { contextKey: id(1), poloId: id(2) };
  const render = async content => act(async () => root.render(content));
  const click = async button => { assert(button); await act(async () => button.click()); };
  const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
  function Consumer({ name, target = scope }) {
    const [environment, setEnvironment] = api.useNfseEnvironment(target);
    return React.createElement('section', { 'aria-label': name },
      React.createElement('output', { 'data-consumer': name }, environment),
      React.createElement('button', { onClick: () => setEnvironment('HOMOLOGACAO') }, `${name} HOMO`),
      React.createElement('button', { onClick: () => setEnvironment('PRODUCAO') }, `${name} PROD`));
  }
  const consumers = (...names) => React.createElement(React.Fragment, null,
    ...names.map(name => React.createElement(Consumer, { key: name, name })));
  const environment = name => document.querySelector(`[data-consumer="${name}"]`)?.textContent;
  try {
    await t.test('two consumers synchronize in both directions and keep the choice on unmount/remount', async () => {
      await render(consumers('Emissor', 'Config'));
      assert.equal(environment('Emissor'), 'PRODUCAO'); assert.equal(environment('Config'), 'PRODUCAO');
      await click(button('Emissor HOMO'));
      assert.equal(environment('Emissor'), 'HOMOLOGACAO'); assert.equal(environment('Config'), 'HOMOLOGACAO');
      await render(null); await render(consumers('Config'));
      assert.equal(environment('Config'), 'HOMOLOGACAO');
      await click(button('Config PROD')); await render(null); await render(consumers('Emissor'));
      assert.equal(environment('Emissor'), 'PRODUCAO');
      assert.equal(window.sessionStorage.getItem(api.nfseEnvironmentPreferenceKey(scope)), 'PRODUCAO');
      await render(consumers('Emissor', 'Config')); await click(button('Config HOMO'));
      assert.equal(environment('Emissor'), 'HOMOLOGACAO');
    });
    await t.test('another context or establishment stays isolated; persisted preference and query keys are scoped', async () => {
      const otherContext = { ...scope, contextKey: id(3) }, otherPolo = { ...scope, poloId: id(4) };
      window.sessionStorage.setItem(api.nfseEnvironmentPreferenceKey(otherPolo), 'HOMOLOGACAO');
      await render(React.createElement(React.Fragment, null,
        React.createElement(Consumer, { name: 'Original' }),
        React.createElement(Consumer, { name: 'Outro contexto', target: otherContext }),
        React.createElement(Consumer, { name: 'Outro polo', target: otherPolo })));
      assert.equal(environment('Original'), 'HOMOLOGACAO'); assert.equal(environment('Outro contexto'), 'PRODUCAO');
      assert.equal(environment('Outro polo'), 'HOMOLOGACAO');
      await click(button('Outro polo PROD')); assert.equal(environment('Original'), 'HOMOLOGACAO');
      const production = { ...scope, month: '2026-11', environment: 'PRODUCAO' };
      const homologation = { ...production, environment: 'HOMOLOGACAO' };
      for (const key of [api.nfseQueryKeys.workspace, api.nfseMetadataKeys.configuration, api.nfseMetadataKeys.numbering]) {
        assert.notDeepEqual(key(production), key(homologation));
        assert.notDeepEqual(key(production), key({ ...production, ...otherContext }));
        assert.notDeepEqual(key(production), key({ ...production, ...otherPolo }));
      }
      assert.notDeepEqual(api.nfseQueryKeys.documents(production, { status: 'EMITIDA' }),
        api.nfseQueryKeys.documents(homologation, { status: 'EMITIDA' }));
    });
    await t.test('denied sessionStorage does not break the controls or tab-local navigation', async () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
      const unavailable = { contextKey: id(5), poloId: id(6) };
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
      try {
        await render(React.createElement(React.Fragment, null,
          React.createElement(Consumer, { name: 'Emissor privado', target: unavailable }),
          React.createElement(Consumer, { name: 'Config privada', target: unavailable })));
        assert.equal(environment('Emissor privado'), 'PRODUCAO');
        await click(button('Emissor privado HOMO')); assert.equal(environment('Config privada'), 'HOMOLOGACAO');
        await render(null); await render(React.createElement(Consumer, { name: 'Retorno privado', target: unavailable }));
        assert.equal(environment('Retorno privado'), 'HOMOLOGACAO');
      } finally { Object.defineProperty(window, 'sessionStorage', descriptor); }
    });
    await t.test('real CompanyPanel separates cancelled production history, empty homologation and failed stale reads', async () => {
      const panelScope = { contextKey: id(7), poloId: id(8) }, calls = [];
      let fail = false;
      const productionData = { checkedAt: '2026-11-11T00:00:00Z',
        lastAuthorized: { number: '3', authorizedAt: '2026-11-10T20:00:00Z', state: 'CANCELLED' },
        dps: { series: '49998', lastAllocated: '3', nextNumber: '4' } };
      const configuration = { readiness: { status: 'BLOCKED', message: 'Configuração sem prova de habilitação.' } };
      const query = data => ({ data, error: fail ? new Error('Synthetic read failure') : null, isError: fail,
        isLoading: false, isPending: false, isFetching: false, refetch: async () => {} });
      globalThis.__environmentConfig = target => { calls.push({ resource: 'configuration', ...target });
        return query(target.environment === 'PRODUCAO'
          ? { readiness: { status: 'READY', message: 'Synthetic stale READY must not replace cancelled history.' } } : configuration); };
      globalThis.__environmentNumbering = target => { calls.push({ resource: 'numbering', ...target });
        return query(fail || target.environment === 'PRODUCAO' ? productionData : { checkedAt: productionData.checkedAt, lastAuthorized: null, dps: null }); };
      const polo = { id: panelScope.poloId, nome: 'ESTABELECIMENTO SINTÉTICO', cnpj: '00.000.000/0000-00', cidade: 'Cidade fictícia', estado: 'SE', status: 'ativo', is_matriz: true };
      const panel = () => React.createElement(api.CompanyPanel, { polo, contextKey: panelScope.contextKey });
      const choose = async label => {
        await click(document.querySelector('[aria-label="Ambiente fiscal consultado"]'));
        await click([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === label));
      };
      await render(panel());
      assert(document.body.textContent.includes('Histórico de emissão autorizada'));
      assert(document.body.textContent.includes('A última NFS-e nº 3 está cancelada'));
      assert(document.body.textContent.includes('Cancelada · autorização histórica preservada'));
      assert(!document.body.textContent.includes('Habilitado no ambiente')); assert(!document.body.textContent.includes('READY'));
      await choose('Homologação · testes');
      assert(document.body.textContent.includes('Ainda sem nota confirmada neste sistema'));
      assert(!document.body.textContent.includes('NFS-e nº 3')); assert(!document.body.textContent.includes('49998'));
      assert.equal(document.querySelector('[data-testid="configuration-form"]').dataset.environment, 'HOMOLOGACAO');
      await render(null); await render(panel());
      assert.equal(document.querySelector('[aria-label="Ambiente fiscal consultado"]').value, 'Homologação · testes');
      await choose('Produção'); assert(document.body.textContent.includes('NFS-e nº 3 está cancelada'));
      fail = true; await render(panel());
      assert(document.querySelector('[role="alert"]'));
      for (const old of ['Histórico de emissão autorizada', 'NFS-e nº 3', 'Cancelada · autorização histórica preservada', '49998']) {
        assert(!document.body.textContent.includes(old), `Failed reads must not retain ${old}`);
      }
      assert(calls.some(call => call.environment === 'PRODUCAO') && calls.some(call => call.environment === 'HOMOLOGACAO'));
      assert(calls.every(call => call.contextKey === panelScope.contextKey && call.poloId === panelScope.poloId));
    });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    delete globalThis.__environmentConfig; delete globalThis.__environmentNumbering;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temp, { recursive: true, force: true });
  }
});

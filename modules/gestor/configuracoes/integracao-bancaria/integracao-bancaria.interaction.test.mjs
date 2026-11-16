import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createBankingFixture, bankingFixturePlugin } from './integracao-bancaria.fixture.mjs';
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('banking controls retain the selected scope and environment while blocking unhomologated methods with fictional data', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/banking-interaction-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'MutationObserver', 'MouseEvent', 'Event', 'Node',
    'navigator', 'MessageChannel', 'IS_REACT_ACT_ENVIRONMENT', '__bankingFixture', 'fetch']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'MessageChannel' ? TestMessageChannel : key === 'fetch'
        ? () => { throw new Error('Network forbidden in fictional fixture'); } : dom.window[key] });
  }
  const f = globalThis.__bankingFixture = createBankingFixture();
  let root, client;
  try {
    const bundle = resolve(temp, 'workspace.mjs');
    await build({ entryPoints: [resolve(base, 'modules/gestor/configuracoes/integracao-bancaria/IntegracaoBancariaConfig.tsx')],
      outfile: bundle, bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
      loader: { '.css': 'empty' }, plugins: [bankingFixturePlugin(base)] });
    const { default: Config } = await import(pathToFileURL(bundle).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000 }, mutations: { retry: false, gcTime: 0 } } });
    root = createRoot(document.getElementById('root'));
    const wait = (ms = 30) => act(async () => { await new Promise(done => setTimeout(done, ms)); });
    const exact = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    const click = async label => { const node = exact(label); assert(node, label); await act(async () => node.click()); await wait(); };
    const toggle = async label => {
      const node = document.querySelector(`[role="switch"][aria-label="${label}"]`); assert(node, label); assert(!node.disabled, label);
      await act(async () => node.click()); await wait(); await wait();
    };
    const select = async label => {
      const input = document.querySelector('[aria-label="Escopo que será configurado"]'); assert(input);
      await act(async () => input.click()); await wait();
      const option = [...document.querySelectorAll('[role="option"]')].find(node => node.textContent.trim() === label);
      assert(option, label); await act(async () => option.click()); await wait();
      assert.equal(input.value, label);
    };
    const method = async label => {
      const node = [...document.querySelectorAll('button')].find(button => button.textContent.includes(label)
        && button.textContent.includes('Hoje usa'));
      assert(node, label); await act(async () => node.click()); await wait();
    };
    const route = modalidade => f.overview.routes.find(row => row.modalidade === modalidade && row.environment === 'production' && row.paymentMethod === 'BOLETO');
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Config))));
    await wait(); await wait();
    assert(!document.body.textContent.includes('OAuth validado'));
    assert(document.body.textContent.includes('Último teste sem sucesso'));
    assert(!document.body.textContent.includes('Produção bloqueada'));
    await click('Técnico'); await click('Resumo');
    assert.equal(document.querySelector('[aria-label="Escopo que será configurado"]').value, 'Técnico');
    const technicalBefore = globalThis.structuredClone(route('TECNICO'));
    await select('Cursos EAD'); await toggle('Desativar Boleto');
    assert.equal(f.routeWrites.at(-1).modalidade, 'EAD'); assert.equal(f.routeWrites.at(-1).environment, 'production');
    assert.equal(f.routeWrites.at(-1).enabled, false); assert.deepEqual(route('TECNICO'), technicalBefore);
    await toggle('Ativar Boleto'); assert.equal(route('EAD').enabled, true);
    await select('Outros Créditos'); await toggle('Desativar Boleto');
    assert.equal(f.routeWrites.at(-1).modalidade, 'OUTROS_CREDITOS');
    assert.equal(f.routeWrites.at(-1).paymentMethod, 'BOLETO'); assert.equal(f.routeWrites.at(-1).providerCode, 'banese_card');
    await toggle('Ativar Boleto');
    const routesBeforeRuntime = globalThis.structuredClone(f.overview.routes);
    await toggle('Desativar integração bancária');
    assert.deepEqual(f.runtimeWrites.at(-1), { enabled: false, activeEnvironment: 'production' });
    await toggle('Ativar integração bancária');
    assert.deepEqual(f.runtimeWrites.at(-1), { enabled: true, activeEnvironment: 'production' });
    assert.deepEqual(f.overview.routes, routesBeforeRuntime);
    assert(document.querySelector('[aria-label="Ativar Pix avulso"]').disabled);
    assert(document.querySelector('[aria-label="Ativar Cartão"]').disabled);
    for (const modalidade of ['Livres', 'Especialização']) {
      await select(modalidade); assert(document.querySelector('[aria-label="Ativar Boleto"]').disabled);
    }
    await click('Técnico'); const runtimeCount = f.runtimeWrites.length;
    await click('Sandbox teste');
    assert.equal(f.runtimeWrites.length, runtimeCount, 'Editing a sandbox route never changes the global runtime');
    assert.equal(f.overview.activeEnvironment, 'production');
    assert(exact('Ativar rota').disabled, 'Technical sandbox stays blocked');
    await click('Produção');
    await method('Pix'); assert(exact('Ativar rota').disabled, 'Standalone Pix stays blocked in production');
    await method('Cartão'); assert(exact('Ativar rota').disabled, 'Mercado Pago stays blocked');
    assert.equal(f.runtimeWrites.length, runtimeCount); assert.deepEqual(route('TECNICO'), technicalBefore);
    await click('Resumo'); await select('Cursos EAD');
    assert.equal(document.querySelector('[aria-label="Escopo que será configurado"]').value, 'Cursos EAD');
    const beforeRealtime = f.reads;
    f.overview = { ...f.overview, integrationEnabled: false };
    await act(async () => f.channels[0].status('SUBSCRIBED')); await wait(180); await wait();
    assert.equal(f.reads, beforeRealtime + 1, 'The first subscription catches changes made after the initial snapshot');
    assert(document.querySelector('[aria-label="Ativar integração bancária"]'));
    assert.deepEqual(f.channels[0].events.map(event => event.config.table).sort(), [
      'payment_gateway_credentials', 'payment_gateway_issuer_config', 'payment_gateway_routes', 'payment_gateway_runtime_config',
    ]);
    f.overview = { ...f.overview, integrationEnabled: true };
    await act(async () => f.channels[0].events.forEach(event => event.callback())); await wait(180); await wait();
    assert.equal(f.reads, beforeRealtime + 2, 'A burst of configuration events is debounced to one read');
    assert(document.querySelector('[aria-label="Desativar integração bancária"]'));
    f.overview = { ...f.overview, integrationEnabled: false };
    await act(async () => { f.channels[0].status('CHANNEL_ERROR'); f.channels[0].status('SUBSCRIBED'); }); await wait(180); await wait();
    assert(document.querySelector('[aria-label="Ativar integração bancária"]'), 'Reconnection catches the lost event interval');
    assert.equal(f.runtimeWrites.length, runtimeCount, 'Realtime receives configuration without writing it');
  } finally {
    if (root) await act(async () => root.unmount()); client?.clear(); dom.window.close(); await rm(temp, { recursive: true, force: true });
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

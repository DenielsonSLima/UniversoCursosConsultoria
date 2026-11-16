import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createServiceCacheFixture, serviceCacheFixturePlugin, serviceFixtureId as id } from './service-receivables.fixture.mjs';

const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../../', import.meta.url));
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('service tabs retain fresh scoped cache and filters, recover hidden events and never call a real payment endpoint', async () => {
  const temp = await mkdtemp(resolve(base, 'tmp/service-cache-regression-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'MutationObserver', 'MouseEvent', 'Event', 'Node',
    'navigator', 'MessageChannel', 'IS_REACT_ACT_ENVIRONMENT', '__serviceCacheFixture', 'fetch']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'MessageChannel' ? TestMessageChannel : key === 'fetch'
        ? () => { throw new Error('Network forbidden in fictional fixture'); } : dom.window[key] });
  }
  const f = globalThis.__serviceCacheFixture = createServiceCacheFixture();
  let root, client;
  try {
    const bundle = resolve(temp, 'workspace.mjs');
    await build({ entryPoints: [resolve(base, 'modules/gestor/financeiro/receber/ReceberTab.tsx')], outfile: bundle,
      bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
      plugins: [serviceCacheFixturePlugin(base)] });
    const { default: ReceberTab } = await import(pathToFileURL(bundle).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 30 * 60_000 }, mutations: { retry: false, gcTime: 0 } } });
    root = createRoot(document.getElementById('root'));
    const wait = (ms = 25) => act(async () => { await new Promise(done => setTimeout(done, ms)); });
    const render = poloId => act(async () => root.render(React.createElement(QueryClientProvider, { client },
      React.createElement(ReceberTab, { poloId, isMatriz: true }))));
    const button = (label, selector = 'button') => [...document.querySelectorAll(selector)]
      .find(node => node.textContent.trim() === label || node.textContent.trim().startsWith(label));
    const click = async (label, selector) => { const node = button(label, selector); assert(node, label);
      await act(async () => node.click()); await wait(); };
    const search = async value => {
      const node = document.querySelector('[aria-label="Buscar serviços"]'); assert(node);
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(node, value);
        node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      await wait(330); await wait();
    };
    const emit = async (channel, polo = id(2)) => {
      await act(async () => channel.event({ new: { source_table: 'contas_receber', polo_id: polo } }));
      await wait(180); await wait();
    };
    await render(id(2)); await click('Serviços', '[role="tab"]'); await wait();
    assert.equal(f.channels.length, 1);
    assert.equal(f.accountsUsage.at(-1).accounts, true, 'Account preloading is preserved before opening a payment');
    await act(async () => f.channels[0].status('SUBSCRIBED')); await wait(180); await wait();
    await search('fictício');
    assert.equal(f.reads.at(-1).filters.search, 'fictício');
    await click('Todos', '[role="tab"]');
    await act(async () => document.querySelector('[title="Cards"]').click()); await wait();
    const group = [...document.querySelectorAll('button[aria-expanded]')].find(node => node.textContent.includes('Parceiro fictício'));
    assert(group); await act(async () => group.click()); await wait();
    assert(document.body.textContent.includes('Serviço fictício revisão 1'));
    await click('Receber'); assert(document.querySelector('[role="dialog"]'));
    const beforeSwitch = f.reads.length;
    await click('Técnico', '[role="tab"]');
    assert.equal(f.accountsUsage.at(-1).accounts, false, 'Hidden service accounts stop observing reads');
    assert.equal(document.querySelector('[role="dialog"]'), null, 'A hidden tab cannot keep a payment modal open');
    assert(!document.body.textContent.includes('EXTRATO PDF'), 'The service report action must leave the shared toolbar');
    await click('Serviços', '[role="tab"]');
    assert.equal(f.accountsUsage.at(-1).accounts, true, 'Account preloading resumes before the payment opens');
    assert.equal(f.channels.length, 1, 'Changing tabs keeps the original subscription');
    assert.equal(f.reads.length, beforeSwitch, 'Returning to fresh cache does not read again');
    assert.equal(document.querySelector('[aria-label="Buscar serviços"]').value, 'fictício');
    assert.equal(document.querySelector('[title="Cards"]').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(), 'Serviços');
    assert(button('Todos', '[role="tab"]').getAttribute('aria-selected') === 'true');
    assert(document.querySelector('.financial-data-card'), 'Expanded partner and cards remain visible');
    assert.equal(document.querySelector('[role="dialog"]'), null, 'Closed payment is not restored on return');

    f.hold = true;
    await emit(f.channels[0]);
    assert(f.pending.length > 0);
    assert(document.body.textContent.includes('50,00'), 'Canonical cached totals remain visible during background read');
    assert(!document.body.textContent.includes('Carregando'), 'Background fetching must not erase populated content');
    f.hold = false; await act(async () => f.pending.splice(0).forEach(done => done())); await wait();

    await click('Técnico', '[role="tab"]');
    const beforeHidden = f.reads.length; f.revision = 2;
    await emit(f.channels[0]);
    assert.equal(f.reads.length, beforeHidden, 'Hidden service queries remain paused');
    await click('Serviços', '[role="tab"]'); await wait();
    assert(f.reads.length > beforeHidden, 'An event received while hidden refreshes on return');
    assert(document.body.textContent.includes('Serviço fictício revisão 2'));
    const beforeForeign = f.reads.length; await emit(f.channels[0], id(99));
    assert.equal(f.reads.length, beforeForeign, 'Other-polo events do not invalidate this cache');

    const beforeReconnect = f.reads.length; f.revision = 3;
    await act(async () => f.channels[0].status('CHANNEL_ERROR'));
    await act(async () => f.channels[0].status('SUBSCRIBED')); await wait(180); await wait();
    assert(f.reads.length > beforeReconnect, 'Reconnection recovers the event gap');
    assert(document.body.textContent.includes('Serviço fictício revisão 3'));

    await click('Receber'); const beforePayment = f.reads.filter(row => row.kind === 'groups').length;
    await click('Confirmar fictício'); await wait();
    assert.equal(f.payments.length, 1); assert.equal(f.payments[0].kind, 'RECEIVABLE');
    assert.equal(f.payments[0].input.sourceId, id(1));
    assert.equal(f.reads.filter(row => row.kind === 'groups').length, beforePayment + 1,
      'Synthetic confirmation causes one canonical group read without overlapping invalidation');

    const beforePolo = f.reads.length;
    await render(id(3)); await wait();
    assert.equal(document.querySelector('[aria-label="Buscar serviços"]').value, '', 'A different polo starts with its own filters');
    assert.equal(document.querySelector('[title="Tabela"]').getAttribute('aria-pressed'), 'true');
    assert(document.body.textContent.includes('Parceiro fictício 3'));
    assert(f.reads.slice(beforePolo).every(row => row.filters.poloId === id(3)), 'New reads use only the new polo');
    assert.equal(f.channels.length, 2); assert.equal(f.removed, 1, 'Old polo subscription is removed');
    const newCount = f.reads.length;
    await emit(f.channels[0]); assert.equal(f.reads.length, newCount, 'Disposed old-polo callback has no effect');
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear(); dom.window.close(); await rm(temp, { recursive: true, force: true });
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

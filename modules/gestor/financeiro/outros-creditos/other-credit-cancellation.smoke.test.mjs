import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const rootDirectory = fileURLToPath(new URL('../../../../', import.meta.url));

test('React DOM: seleção, dupla confirmação, lote disjunto e retomada idempotente após remontagem', async () => {
  const jsdomPath = process.env.OTHER_CREDIT_JSDOM_PATH;
  const { JSDOM } = require(jsdomPath ? resolve(jsdomPath) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'other-credit-cancellation-smoke-'));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const previousGlobals = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', '__otherCreditSmokeClient']) {
    previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const fake = { calls: [], resolve: null, auth: {
    getSession: async () => ({ data: { session: { user: { id: '00000000-0000-4000-8000-000000000009' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  }, functions: { invoke: async (_name, { body }) => {
    fake.calls.push(body);
    return new Promise(resolveResult => { fake.resolve = resolveResult; });
  } } };
  globalThis.__otherCreditSmokeClient = fake;
  const output = join(temporary, 'components.cjs');
  let reactRoot;
  let act;
  const clients = [];
  try {
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      export { useOtherCreditCancellation } from './modules/gestor/financeiro/outros-creditos/useOtherCreditCancellation';
      export { OtherCreditCancellationModal } from './modules/gestor/financeiro/outros-creditos/OtherCreditCancellationModal';
      export { OtherCreditRow } from './modules/gestor/financeiro/outros-creditos/OtherCreditRow';
    `, resolveDir: rootDirectory, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{
      name: 'synthetic-financial-client', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'synthetic-client', namespace: 'smoke' }));
        builder.onLoad({ filter: /.*/, namespace: 'smoke' }, () => ({ contents: 'export const supabase = globalThis.__otherCreditSmokeClient;', loader: 'js' }));
      },
    }] });
    const components = require(output);
    const { React, createRoot, QueryClient, QueryClientProvider, useOtherCreditCancellation, OtherCreditCancellationModal, OtherCreditRow } = components;
    act = components.act;
    const h = React.createElement;
    const ids = [1, 2, 3].map(value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`);
    const credits = ids.map((id, index) => ({ id, poloId: 'polo', descricao: `Crédito ${index + 1}`, categoria: 'OUTROS_CREDITOS', valor: 269.9,
      dataVencimento: '2026-10-31', status: 'PENDENTE', otherCreditCancellationEligible: true, gatewayProvider: 'banese_card', formaPagamento: 'BOLETO', asaasPaymentId: `bank-${id}` }));
    const rowModel = { syncMutation: { isPending: false, mutate() {} }, copyLink() {}, openReceiveModal() {}, openPaymentModal() {} };
    let current;
    function Harness() {
      const model = useOtherCreditCancellation(credits, 'polo', credits, 'polo');
      current = model;
      return h(React.Fragment, null,
        h('button', { 'data-testid': 'select', onClick: () => model.toggle(credits.slice(0, 2)) }, 'Selecionar dois'),
        h('button', { 'data-testid': 'open', onClick: () => model.open() }, 'Cancelar selecionados'),
        h('button', { 'data-testid': 'resume', onClick: () => model.resume() }, 'Retomar'),
        h('table', null, h('tbody', null, credits.map((item, index) => h(OtherCreditRow, { key: item.id, item, index, model: rowModel, cancellation: model })))),
        h(OtherCreditCancellationModal, { model }));
    }
    const container = document.createElement('div'); document.body.appendChild(container);
    const flush = () => new Promise(resolveTick => setTimeout(resolveTick, 0));
    const mount = async () => {
      reactRoot = createRoot(container);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
      await act(async () => { reactRoot.render(h(QueryClientProvider, { client }, h(Harness))); await flush(); });
    };
    const click = async element => { assert.ok(element); await act(async () => { element.click(); await flush(); }); };
    const button = (label, parent = document) => [...parent.querySelectorAll('button')].find(element => element.textContent.trim() === label);
    const enterReason = async value => {
      await act(async () => {
        const textarea = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, value);
        textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
        textarea.dispatchEvent(new window.Event('change', { bubbles: true }));
        await flush();
      });
      assert.equal(current.reason, value);
    };
    const finish = async results => {
      await act(async () => { fake.resolve({ data: { operationId: fake.calls.at(-1).idempotencyKey, results }, error: null }); await flush(); });
    };
    await mount();
    await click(document.querySelector('[data-testid="select"]'));
    assert.equal(current.selectedItems.length, 2);
    await click(document.querySelector('[data-testid="open"]'));
    assert.equal(document.querySelectorAll('[role="dialog"] li').length, 2);
    await enterReason('Emissão indevida dos dois boletos');
    const confirm = button('Confirmar cancelamento');
    await act(async () => { confirm.click(); confirm.click(); await flush(); });
    assert.equal(fake.calls.length, 1, 'duplo clique não duplica request');
    const first = { ...fake.calls[0] };
    await finish([{ receivableId: ids[0], status: 'CANCELED' }, { receivableId: ids[1], status: 'PROCESSING' }]);
    assert.equal(current.savedAttempts.length, 1);
    assert.match(document.body.textContent, /Em processamento/);
    await click(button('Fechar'));
    const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')];
    assert.equal(checkboxes[0].disabled, true); assert.equal(checkboxes[1].disabled, true); assert.equal(checkboxes[2].disabled, false);
    await click(button('Cancelar', document.querySelectorAll('tr')[2]));
    assert.equal(current.reviewItems[0].id, ids[2]);
    await enterReason('Crédito avulso emitido incorretamente');
    await click(button('Confirmar cancelamento'));
    assert.equal(fake.calls.length, 2);
    await finish([{ receivableId: ids[2], status: 'CANCELED' }]);
    assert.equal(current.savedAttempts.length, 1, 'lote disjunto preserva a primeira operação');
    await click(button('Fechar'));
    await act(async () => reactRoot.unmount()); reactRoot = null;
    await mount();
    assert.equal(current.savedAttempts.length, 1, 'remontagem recupera a tentativa da sessão');
    await click(document.querySelector('[data-testid="resume"]'));
    assert.equal(current.reviewItems.length, 2);
    assert.equal(current.reason, first.reason);
    assert.equal(document.querySelector('textarea').disabled, true);
    await click(button('Conferir cancelamento'));
    assert.deepEqual(fake.calls[2], first, 'retomada preserva chave, IDs e motivo');
    await finish(ids.slice(0, 2).map(receivableId => ({ receivableId, status: 'CANCELED' })));
    assert.equal(current.savedAttempts.length, 0);
    assert.match(document.body.textContent, /Todos os créditos selecionados foram cancelados/);
  } finally {
    if (reactRoot && act) await act(async () => reactRoot.unmount());
    for (const client of clients) client.clear();
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

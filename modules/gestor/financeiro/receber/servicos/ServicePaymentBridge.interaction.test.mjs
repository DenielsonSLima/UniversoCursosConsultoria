import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const base = fileURLToPath(new URL('../../../../../', import.meta.url));
const id = value => `22222222-2222-4222-8222-${String(value).padStart(12, '0')}`;
const jsdomPath = process.env.FINANCIAL_PAYMENT_JSDOM_PATH || process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');

test('service bridge opens the real receivable payment modal and keeps fiscal blocks read-only without any settlement', async () => {
  const temporary = await mkdtemp(resolve(base, 'tmp/service-payment-bridge-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'MutationObserver', 'MouseEvent', 'Event', 'Node',
    'navigator', 'IS_REACT_ACT_ENVIRONMENT', '__servicePaymentClient']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const requests = [];
  let confirmations = 0, historyStatus = 'PENDENTE';
  const history = () => ({ summary: { originalAmount: '260.00', previouslyPaid: historyStatus === 'PAGO' ? '260.00' : '60.00',
    remainingBefore: historyStatus === 'PAGO' ? '0.00' : '200.00', status: historyStatus, hasEvents: true },
  events: [{ id: id(7), paymentDate: '2026-11-12', paymentAmount: historyStatus === 'PAGO' ? '260.00' : '60.00',
    principalPaid: historyStatus === 'PAGO' ? '260.00' : '60.00', discount: '0.00', interest: '0.00', penalty: '0.00',
    addition: '0.00', remainingAfter: historyStatus === 'PAGO' ? '0.00' : '200.00',
    components: [{ accountId: id(2), accountName: 'CAIXA DA UNIDADE', method: 'DINHEIRO', amount: historyStatus === 'PAGO' ? '260.00' : '60.00' }] }] });
  globalThis.__servicePaymentClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: id(9) } } } }) },
    functions: { invoke: () => { confirmations++; assert.fail('No Edge settlement may be invoked by this read-only smoke'); } },
    rpc: async (name, args) => {
      requests.push({ name, args });
      assert.equal(args.p_source_kind, 'RECEIVABLE'); assert.equal(args.p_source_id, id(1));
      if (name === 'get_financial_payment_history_secure') return { data: history(), error: null };
      assert.equal(name, 'preview_financial_payment_secure', 'Only canonical history and preview reads are allowed');
      assert.equal(args.p_input.sourceId, id(1));
      assert.match(args.p_input.requestId, /^[0-9a-f-]{36}$/i);
      const summary = history().summary;
      return { data: { ...summary, sourceKind: 'RECEIVABLE', sourceId: id(1), paymentAmount: summary.remainingBefore,
        principalPaid: summary.remainingBefore, remainingAfter: '0.00', status: 'PAGO', components: args.p_input.components,
        interest: '0.00', penalty: '0.00', addition: '0.00', discount: '0.00', fingerprint: 'synthetic-server-fingerprint' }, error: null };
    },
  };
  let root;
  try {
    const output = resolve(temporary, 'bridge.mjs');
    const compiled = await build({ stdin: { contents: `
      export { FinancialPaymentModal } from './modules/gestor/financeiro/settlements/FinancialPaymentModal';
      export { canReceiveService } from './modules/gestor/financeiro/receber/servicos/service-receivable.presentation';
    `, resolveDir: base, loader: 'tsx' }, outfile: output, write: false, bundle: true, platform: 'node', format: 'esm',
    packages: 'external', jsx: 'automatic', logLevel: 'silent', plugins: [{ name: 'synthetic-service-client', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const supabase=globalThis.__servicePaymentClient;', loader: 'js',
      }));
    } }] });
    await writeFile(output, compiled.outputFiles[0].contents);
    const { FinancialPaymentModal, canReceiveService } = await import(pathToFileURL(output).href);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const account = (n, poloId, ativo = true) => ({ id: id(n), banco: `CAIXA ${n}`, conta: String(n), agencia: '001',
      titular: 'Unidade sintética', tipo: 'CORRENTE', natureza: 'CAIXA_INTERNO', poloId, polosUso: [poloId], ativo });
    const accounts = [account(2, id(5)), account(3, id(6)), account(4, id(5), false)];
    const item = { id: id(1), poloId: id(5), status: 'PENDENTE', nfseNumber: '7', nfseFiscalCancelledAt: null,
      nfseCancellationState: null, descricao: 'Serviço sintético · NFS-e 7', clienteNome: 'Parceiro sintético',
      operationCapabilities: { canSettle: true } };
    const settle = async (ms = 0) => act(async () => { await new Promise(done => setTimeout(done, ms)); });
    const mount = async (value, key) => {
      historyStatus = value.status;
      await act(async () => root.render(React.createElement(FinancialPaymentModal, {
        key, sourceKind: 'RECEIVABLE', sourceId: value.id, poloId: value.poloId, description: value.descricao,
        partnerName: value.clienteNome, accounts, readOnly: !canReceiveService(value), historyOnly: !canReceiveService(value), onClose() {},
        onConfirm: async () => { confirmations++; assert.fail('The smoke never confirms a payment'); },
      })));
      await settle(); await settle(300);
    };
    await mount(item, 'active');
    assert.equal(document.getElementById('financial-payment-title').textContent, 'Confirmar recebimento');
    assert(document.getElementById('financial-payment-description').textContent.includes(item.descricao));
    assert.equal(document.querySelector('input[aria-label="Valor do pagamento 1"]').value, '200,00');
    const confirm = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Confirmar quitação');
    assert(confirm && !confirm.disabled, 'The canonical preview makes the action available, without clicking it');
    const accountPicker = document.querySelector('[role="group"][aria-label="Pagamento 1"] [role="combobox"]');
    await act(async () => accountPicker.click()); await settle();
    const options = [...document.querySelectorAll('[role="option"]')];
    assert(options.some(option => option.textContent.includes('CAIXA 2')));
    assert(!options.some(option => /CAIXA 3|CAIXA 4/.test(option.textContent)), 'Other-polo and inactive accounts remain unavailable');
    assert(requests.some(request => request.name === 'preview_financial_payment_secure'));
    for (const [name, changes] of [['fiscal-cancelled', { nfseFiscalCancelledAt: '2026-11-12T18:00:00Z' }],
      ['under-review', { nfseCancellationState: 'REVIEW_REQUIRED' }], ['cancelling', { nfseCancellationState: 'PENDING' }],
      ['paid', { status: 'PAGO' }], ['no-capability', { operationCapabilities: undefined }]]) {
      const blocked = { ...item, ...changes };
      assert.equal(canReceiveService(blocked), false, name);
      const previousPreviews = requests.filter(request => request.name === 'preview_financial_payment_secure').length;
      await mount(blocked, name);
      assert.equal(requests.filter(request => request.name === 'preview_financial_payment_secure').length, previousPreviews,
        `${name}: historical viewing must not request a new settlement preview`);
      assert.equal(document.getElementById('financial-payment-title').textContent, 'Histórico de pagamentos', name);
      assert.equal(document.querySelector('input[aria-label="Valor do pagamento 1"]'), null, name);
      assert(![...document.querySelectorAll('button')].some(button => /Confirmar quitação|Confirmar baixa parcial/.test(button.textContent)), name);
      assert(document.body.textContent.includes('Histórico'), name);
    }
    const storageKey = `universo:financial-payment:v1:${id(9)}:RECEIVABLE:${id(1)}`;
    const stored = JSON.stringify({ fingerprint: 'prior-canonical-intent', input: { requestId: id(11), sourceId: id(1),
      paymentDate: '2026-11-12', components: [{ accountId: id(2), method: 'DINHEIRO', amount: '200.00' }],
      interest: '0.00', penalty: '0.00', addition: '0.00', discount: '0.00', notes: 'Synthetic pending intent' } });
    window.sessionStorage.setItem(storageKey, stored);
    const previewsBeforeRecovery = requests.filter(request => request.name === 'preview_financial_payment_secure').length;
    await mount(item, 'pending-recovery');
    const recovery = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Conferir pagamento');
    assert(recovery && !recovery.disabled, 'Eligible existing intent keeps its explicit recovery action, without clicking it');
    await mount({ ...item, nfseFiscalCancelledAt: '2026-11-12T18:00:00Z' }, 'readonly-recovery');
    assert.equal(document.getElementById('financial-payment-title').textContent, 'Histórico de pagamentos');
    assert(![...document.querySelectorAll('button')].some(button => /Conferir pagamento|Confirmar quitação|Confirmar baixa parcial/.test(button.textContent)));
    assert.equal(window.sessionStorage.getItem(storageKey), stored, 'Read-only viewing preserves the immutable pending intent');
    assert.equal(requests.filter(request => request.name === 'preview_financial_payment_secure').length, previewsBeforeRecovery);
    assert.equal(confirmations, 0);
    assert(requests.every(request => ['get_financial_payment_history_secure', 'preview_financial_payment_secure'].includes(request.name)));
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

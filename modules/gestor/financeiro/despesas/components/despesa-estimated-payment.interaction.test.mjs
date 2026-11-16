import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const rootDirectory = fileURLToPath(new URL('../../../../../', import.meta.url));
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('baixa estimada: prévia real, parcial e retomada atômica preservam o valor confirmado', async t => {
  const { JSDOM } = require(process.env.FINANCIAL_PAYMENT_JSDOM_PATH
    ? resolve(process.env.FINANCIAL_PAYMENT_JSDOM_PATH) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'estimated-expense-payment-'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://universo.test/' });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
    navigator: dom.window.navigator, MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true,
    __estimatedExpenseClient: undefined };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let root;
  let act;
  try {
    const bundle = join(temporary, 'payment.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { default as DespesaBaixaModal } from './modules/gestor/financeiro/despesas/components/DespesaBaixaModal';
      export { FinancialPaymentModal } from './modules/gestor/financeiro/settlements/FinancialPaymentModal';
      export { confirmEstimatedExpensePayment, getExpenseEstimatePayment } from './modules/gestor/financeiro/despesas/despesas-estimativas-pagamento.service';
      export { normalizePaymentDraft, draftFromCanonical, isStoredFinancialPayment } from './modules/gestor/financeiro/settlements/financial-payment.form';
    `, resolveDir: rootDirectory, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs',
    logLevel: 'silent', plugins: [{ name: 'synthetic-estimated-expense', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'synthetic' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({
        contents: 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__estimatedExpenseClient[key] });', loader: 'js',
      }));
    } }] });
    const components = require(bundle);
    const { React, createRoot, DespesaBaixaModal, FinancialPaymentModal, confirmEstimatedExpensePayment,
      getExpenseEstimatePayment, normalizePaymentDraft, draftFromCanonical, isStoredFinancialPayment } = components;
    act = components.act;
    const calls = [];
    const confirmations = [];
    let committed = false;
    let unknownOnce = true;
    const summary = () => ({ originalAmount: committed ? '347.82' : '300.00',
      previouslyPaid: committed ? '100.00' : '0.00', remainingBefore: committed ? '247.82' : '300.00',
      status: 'PENDENTE', hasEvents: committed });
    const preview = (kind, params, estimated) => {
      const input = params.p_input;
      const original = estimated ? params.p_valor_real : '300.00';
      const paid = input.automaticAmount ? original : input.components[0].amount;
      const remaining = (Number(original) - Number(paid)).toFixed(2);
      return { sourceKind: kind, sourceId: input.sourceId, originalAmount: original,
        previouslyPaid: '0.00', remainingBefore: original, paymentAmount: paid, principalPaid: paid,
        remainingAfter: remaining, status: remaining === '0.00' ? 'PAGO' : 'PENDENTE',
        interest: '0.00', penalty: '0.00', addition: '0.00', discount: '0.00',
        components: input.components.map(component => ({ ...component, amount: paid })),
        fingerprint: JSON.stringify({ real: original, paid, version: params.p_versao }),
        ...(estimated ? { estimatedExpense: { originalEstimate: '300.00', realBase: original, version: params.p_versao } } : {}) };
    };
    globalThis.__estimatedExpenseClient = {
      auth: { getSession: async () => ({ data: { session: { user: { id: id(9) } } } }) },
      rpc: async (name, params) => {
        calls.push({ name, params: structuredClone(params) });
        if (name === 'get_financial_payment_history_secure') return { data: { summary: summary(), events: [] }, error: null };
        if (name === 'preview_estimated_expense_payment_secure') {
          assert.equal(params.p_valor_real, '347.82');
          assert.equal(params.p_versao, 0);
          assert.deepEqual(params.p_input.expenseEstimate, { realAmount: '347.82', version: 0 });
          return { data: preview('EXPENSE', params, true), error: null };
        }
        if (name === 'preview_financial_payment_secure') {
          assert.equal(params.p_input.expenseEstimate, undefined);
          return { data: preview(params.p_source_kind, params, false), error: null };
        }
        assert.equal(name, 'confirm_estimated_expense_payment_secure', 'não pode editar valor e pagar em requisições separadas');
        confirmations.push(structuredClone(params));
        committed = true;
        if (unknownOnce) { unknownOnce = false; return { data: null, error: { message: 'transport interrupted' } }; }
        assert.deepEqual(params, confirmations[0], 'retomada deve repetir request, fingerprint, valor real e versão');
        return { data: { success: true, paymentId: id(8), replayed: true, preview: preview('EXPENSE', params, true) }, error: null };
      },
    };
    const account = { id: id(2), banco: 'CAIXA DA UNIDADE', natureza: 'CAIXA_INTERNO', conta: '1',
      agencia: '001', titular: 'Conta sintética', tipo: 'CORRENTE', saldoInicial: 0,
      poloId: id(5), polosUso: [id(5)], ativo: true };
    const item = { id: id(1), poloId: id(5), descricao: 'ENERGIA SINTÉTICA', status: 'PENDENTE',
      valorBase: 300, valorEstimado: true, valorEstimadoOriginal: 300, valorEstimadoVersao: 0 };
    const tick = ms => new Promise(done => setTimeout(done, ms));
    const settle = async (ms = 0) => act(async () => { await tick(ms); });
    const mount = async (Component, props) => {
      root = createRoot(document.getElementById('root'));
      await act(async () => { root.render(React.createElement(Component, props)); await tick(0); });
      await settle();
    };
    const close = async () => { await act(async () => root.unmount()); root = null; };
    const click = async element => {
      assert.ok(element);
      await act(async () => { element.click(); await tick(0); });
    };
    const input = async (label, value) => {
      const element = document.querySelector(`[aria-label="${label}"]`);
      assert.ok(element);
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        await tick(0);
      });
    };
    const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
    const props = { item, contas: [account], poloId: id(5), onConfirm: confirmEstimatedExpensePayment,
      onClose() {}, onReversed: async () => {}, isPending: false };

    await t.test('valor real obrigatório muda a prévia; parcial usa o principal real sem desconto fictício', async () => {
      await mount(DespesaBaixaModal, props);
      await settle(300);
      assert.equal(calls.filter(call => call.name.startsWith('preview_')).length, 0);
      assert.equal(button('Confirmar baixa parcial').disabled, true);
      assert.match(document.body.textContent, /Estimativa original: R\$\s*300,00/);
      await input('Valor real da conta', '34782');
      await settle(350);
      assert.equal(document.querySelector('[aria-label="Valor do pagamento 1"]').value, '347,82');
      assert.equal(button('Confirmar quitação').disabled, false);
      await input('Valor do pagamento 1', '10000');
      await settle(350);
      assert.equal(button('Confirmar baixa parcial').disabled, false);
      const last = calls.at(-1);
      assert.equal(last.params.p_input.components[0].amount, '100.00');
      assert.equal(last.params.p_input.discount, '0.00');
      assert.equal(last.params.p_input.interest, '0.00');
      assert.match(document.body.textContent, /247,82/);
    });

    await t.test('falha ambígua congela e persiste tentativa completa; reabre confirmada e retoma a mesma operação', async () => {
      await click(button('Confirmar baixa parcial'));
      assert.equal(confirmations.length, 1);
      assert.equal(document.querySelector('[aria-label="Valor real da conta"]').disabled, true);
      assert.ok(button('Conferir pagamento'));
      const key = `universo:financial-payment:v1:${id(9)}:EXPENSE:${id(1)}`;
      const saved = JSON.parse(window.sessionStorage.getItem(key));
      assert.deepEqual(saved.input.expenseEstimate, { realAmount: '347.82', version: 0 });
      assert.equal(isStoredFinancialPayment(saved, id(1)), true);
      assert.deepEqual(normalizePaymentDraft(draftFromCanonical(saved.input)).expenseEstimate, saved.input.expenseEstimate);
      assert.throws(() => getExpenseEstimatePayment({ ...saved.input, expenseEstimate: { realAmount: '347.82', version: -1 } }));
      const previewCalls = calls.filter(call => call.name.startsWith('preview_')).length;
      await close();
      await mount(DespesaBaixaModal, { ...props, item: { ...item, valorEstimado: false, valorConfirmadoEm: '2026-11-15T00:00:00Z' } });
      assert.ok(button('Conferir pagamento'));
      await settle(300);
      assert.equal(calls.filter(call => call.name.startsWith('preview_')).length, previewCalls, 'retomada não recalcula prévia');
      await click(button('Conferir pagamento'));
      assert.equal(confirmations.length, 2);
      assert.equal(window.sessionStorage.getItem(key), null);
      await close();
    });

    await t.test('EXPENSE normal, RECEIVABLE e PAYABLE mantêm a prévia canônica sem campo estimado', async () => {
      for (const sourceKind of ['EXPENSE', 'RECEIVABLE', 'PAYABLE']) {
        await mount(FinancialPaymentModal, { sourceKind, sourceId: id(3), poloId: id(5), description: 'Título sintético',
          accounts: [account], onClose() {}, onConfirm: () => assert.fail('nenhum pagamento normal será confirmado') });
        await settle(350);
        assert.equal(document.querySelector('[aria-label="Valor real da conta"]'), null);
        assert.equal(calls.at(-1).name, 'preview_financial_payment_secure');
        assert.equal(calls.at(-1).params.p_source_kind, sourceKind);
        await close();
      }
    });
  } finally {
    if (root && act) await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

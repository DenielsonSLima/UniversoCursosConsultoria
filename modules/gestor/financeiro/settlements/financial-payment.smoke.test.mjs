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
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

test('React DOM: saldo do servidor, múltiplas formas, preview atual, dupla confirmação e retomada imutável', async () => {
  const jsdomPath = process.env.FINANCIAL_PAYMENT_JSDOM_PATH || process.env.OTHER_CREDIT_JSDOM_PATH;
  const { JSDOM } = require(jsdomPath ? resolve(jsdomPath) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'financial-payment-smoke-'));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const previousGlobals = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', '__paymentSmokeClient']) {
    previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const summary = { originalAmount: '100.00', previouslyPaid: '0.00', remainingBefore: '100.00', status: 'PENDENTE', hasEvents: false };
  const fake = { confirmations: [], previews: [], reversals: [], events: [], finish: null, auth: {
    getSession: async () => ({ data: { session: { user: { id: id(9) } } } }),
  }, rpc: async (name, params) => {
    if (name === 'get_financial_payment_history_secure') return { data: { summary, events: fake.events }, error: null };
    if (name === 'confirm_expense_payment_secure') { fake.confirmations.push(params.p_input); return new Promise(done => { fake.finish = done; }); }
    if (name === 'reverse_expense_payment_secure') { fake.reversals.push(params); return new Promise(done => { fake.finish = done; }); }
    assert.equal(name, 'preview_financial_payment_secure');
    fake.previews.push(params);
    const split = params.p_input.components.length === 2;
    return { data: { ...summary, sourceKind: params.p_source_kind, sourceId: params.p_source_id,
      paymentAmount: split ? '70.00' : '100.00', principalPaid: split ? '70.00' : '100.00', remainingAfter: split ? '30.00' : '0.00',
      interest: '0.00', penalty: '0.00', addition: '0.00', discount: '0.00', status: split ? 'PENDENTE' : 'PAGO',
      components: params.p_input.components, fingerprint: `preview-${fake.previews.length}`, requiresRemoteCancellation: true }, error: null };
  }, functions: { invoke: async (name, params) => {
    assert.equal(name, 'financial-receivable-payment'); fake.confirmations.push(params.body);
    return new Promise(resolveResult => { fake.finish = resolveResult; });
  } } };
  globalThis.__paymentSmokeClient = fake;
  let reactRoot;
  let act;
  try {
    const output = join(temporary, 'components.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { renderToStaticMarkup } from 'react-dom/server';
      export { OtherCreditRow } from './modules/gestor/financeiro/outros-creditos/OtherCreditRow';
      export { ReceivableActionButtons } from './modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation';
      export { default as DespesaTable } from './modules/gestor/financeiro/despesas/components/DespesaTable';
      export { FinancialPaymentModal } from './modules/gestor/financeiro/settlements/FinancialPaymentModal';
      export { ReceivablePaymentModal } from './modules/gestor/financeiro/settlements/ReceivablePaymentModal';
      export { confirmFinancialPayment } from './modules/gestor/financeiro/settlements/financial-payment.service';
      export { canonicalPaymentAmount, normalizePaymentDraft, isStoredFinancialPayment } from './modules/gestor/financeiro/settlements/financial-payment.form';
    `, resolveDir: rootDirectory, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{
      name: 'synthetic-financial-client', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'synthetic-client', namespace: 'smoke' }));
        builder.onLoad({ filter: /.*/, namespace: 'smoke' }, () => ({ contents: 'export const supabase = globalThis.__paymentSmokeClient;', loader: 'js' }));
      },
    }] });
    const components = require(output);
    const { React, createRoot, renderToStaticMarkup, OtherCreditRow, ReceivableActionButtons, DespesaTable, FinancialPaymentModal, ReceivablePaymentModal, confirmFinancialPayment, canonicalPaymentAmount, isStoredFinancialPayment } = components;
    act = components.act;
    assert.equal(canonicalPaymentAmount('1.234,56'), '1234.56');
    assert.equal(canonicalPaymentAmount('1,999'), null);
    assert.equal(canonicalPaymentAmount('-1'), null);
    assert.equal(isStoredFinancialPayment({ input: { sourceId: id(1), components: [{ amount: 20 }] } }, id(1)), false);
    const h = React.createElement;
    const partialSummary = { ...summary, previouslyPaid: '70.00', remainingBefore: '30.00', hasEvents: true };
    const item = { id: id(1), descricao: 'Título sintético', valor: 100, valorBase: 100, valorPago: 70, jurosValor: 0, multaValor: 0, descontoValor: 0,
      status: 'PENDENTE', dataVencimento: '2026-10-31', dataLancamento: '2026-10-01', totalParcelas: 1, paymentSummary: partialSummary };
    const noop = () => {};
    const creditMarkup = renderToStaticMarkup(h('table', null, h('tbody', null, h(OtherCreditRow, { item, index: 0,
      model: { syncMutation: { isPending: false, mutate: noop }, copyLink: noop, openReceiveModal: noop, openPaymentModal: noop } }))));
    assert.match(creditMarkup, /Baixa parcial/); assert.match(creditMarkup, /Receber saldo/); assert.match(creditMarkup, /Histórico/);
    const paidMarkup = renderToStaticMarkup(h(ReceivableActionButtons, { item: { ...item, status: 'PAGO' }, actions: { onOpenPayment: noop } }));
    assert.match(paidMarkup, /Histórico de pagamentos/); assert.doesNotMatch(paidMarkup, /Recibo Universo|Estornar baixa/);
    const expenseMarkup = renderToStaticMarkup(h(DespesaTable, { items: [item], contas: [], onPagar: noop, onEditar: noop, onExcluir: noop, onCancelar: noop, onImprimir: noop }));
    assert.match(expenseMarkup, /Pagar saldo/); assert.match(expenseMarkup, /Histórico/); assert.doesNotMatch(expenseMarkup, />Editar<|>Excluir<|>Estornar<|>Prévia</);

    const container = document.createElement('div'); document.body.appendChild(container);
    const accounts = [{ id: id(2), banco: 'Caixa A', conta: '1', titular: 'Universo', poloId: id(5), polosUso: [id(5)], ativo: true },
      { id: id(3), banco: 'Banco B', conta: '2', titular: 'Universo', poloId: id(5), polosUso: [id(5)], ativo: true }];
    const tick = (ms = 0) => new Promise(resolveTick => setTimeout(resolveTick, ms));
    const settle = async (ms = 0) => { await act(async () => { await tick(ms); }); };
    let completed = 0;
    let reversed = 0;
    const mount = async (sourceKind = 'RECEIVABLE', readOnly = false) => {
      reactRoot = createRoot(container);
      await act(async () => { reactRoot.render(h(FinancialPaymentModal, { sourceKind, readOnly, sourceId: id(1), poloId: id(5),
        description: 'Título sintético', accounts, onClose() {}, onReversed: async () => { reversed += 1; }, onConfirm: async ({ input, fingerprint }) => {
          const result = await confirmFinancialPayment(sourceKind, input, fingerprint); completed += 1; return result;
        } })); await tick(); });
      await settle();
    };
    const button = label => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
    const byLabel = label => document.querySelector(`[aria-label="${label}"]`);
    const change = async (label, value) => {
      await act(async () => {
        const element = byLabel(label); assert.ok(element, label);
        Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(element, value);
        element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        await tick();
      });
    };
    const click = async element => { assert.ok(element); await act(async () => { element.click(); await tick(); }); };
    await mount();
    assert.equal(byLabel('Valor do pagamento 1').value, '100,00', 'saldo sugerido veio do histórico backend');
    await settle(300);
    assert.equal(button('Confirmar quitação').disabled, false);
    await change('Valor do pagamento 1', '30,00');
    assert.equal(button('Confirmar baixa parcial').disabled, true, 'input alterado não pode confirmar preview anterior');
    await click(button('Adicionar forma de pagamento'));
    assert.equal(document.querySelectorAll('[aria-label^="Valor do pagamento"]').length, 2);
    await change('Valor do pagamento 2', '40,00');
    await change('Conta do pagamento 2', id(3));
    await settle(300);
    const preview = fake.previews.at(-1).p_input;
    assert.deepEqual(preview.components.map(({ method, amount }) => ({ method, amount })), [{ method: 'DINHEIRO', amount: '30.00' }, { method: 'PIX', amount: '40.00' }]);
    assert.match(document.body.textContent, /Saldo restanteR\$\s*30,00/);
    assert.match(document.body.textContent, /boleto atual será cancelado/);
    const confirm = button('Confirmar baixa parcial');
    await act(async () => { confirm.click(); confirm.click(); await tick(); });
    assert.equal(fake.confirmations.length, 1, 'duplo clique envia uma única chamada');
    const first = structuredClone(fake.confirmations[0]);
    assert.equal(document.querySelector('fieldset').disabled, true);
    await act(async () => { fake.finish({ data: null, error: { message: 'Resposta de rede indisponível' } }); await tick(); });
    assert.ok(button('Conferir pagamento'));
    assert.equal(document.querySelector('fieldset').disabled, true, 'após envio não altera valores ou requestId');
    await act(async () => reactRoot.unmount()); reactRoot = null;
    await mount('RECEIVABLE', true);
    assert.equal(byLabel('Valor do pagamento 1').value, '30,00', 'tentativa pendente continua conferível quando lista já está somente leitura');
    assert.equal(byLabel('Valor do pagamento 2').value, '40,00');
    const previewCount = fake.previews.length;
    await settle(300);
    assert.equal(fake.previews.length, previewCount, 'retomada não cria preview ou fingerprint novo');
    await click(button('Conferir pagamento'));
    assert.deepEqual(fake.confirmations[1], first, 'reload retoma IDs, meios, valores e fingerprint idênticos');
    await act(async () => { fake.finish({ data: { success: true, replayed: true, paymentId: id(7), preview: { ...summary, status: 'PENDENTE', remainingAfter: '30.00', paymentAmount: '70.00' } }, error: null }); await tick(); });
    assert.equal(completed, 1);
    assert.equal(window.sessionStorage.length, 0, 'resultado confirmado encerra retomada');
    await act(async () => reactRoot.unmount()); reactRoot = null;
    await mount(); await settle(300);
    await click(button('Confirmar quitação'));
    const academicAttempt = structuredClone(fake.confirmations.at(-1));
    const academicResult = { success: true, replayed: false, paymentId: id(6),
      preview: { ...summary, status: 'PAGO', remainingAfter: '0.00', paymentAmount: '100.00' },
      academicSyncWarning: 'Ativação acadêmica pendente' };
    await act(async () => { fake.finish({ data: academicResult, error: null }); await tick(); });
    assert.match(document.body.textContent, /Pagamento já registrado.*ativação acadêmica está pendente/);
    assert.equal(completed, 1, 'pagamento registrado com ativação pendente não encerra a tentativa');
    assert.equal(window.sessionStorage.length, 1, 'aviso acadêmico mantém a solicitação salva');
    assert.equal(document.querySelector('fieldset').disabled, true, 'aviso acadêmico mantém dados imutáveis');
    assert.ok(button('Conferir pagamento'));
    await act(async () => reactRoot.unmount()); reactRoot = null;
    await mount('RECEIVABLE', true);
    await click(button('Conferir pagamento'));
    assert.deepEqual(fake.confirmations.at(-1), academicAttempt, 'ativação pendente retoma a mesma chave e fingerprint após remontagem');
    await act(async () => { fake.finish({ data: { ...academicResult, replayed: true, academicSyncWarning: null }, error: null }); await tick(); });
    assert.equal(completed, 2);
    assert.equal(window.sessionStorage.length, 0, 'ativação sincronizada encerra somente a tentativa original');

    await act(async () => reactRoot.unmount()); reactRoot = null;
    await mount(); await settle(300);
    await click(button('Confirmar quitação'));
    const staleAttempt = fake.confirmations.at(-1);
    await act(async () => { fake.finish({ data: null, error: { context: new Response(JSON.stringify({ error: 'O saldo mudou. Confira os valores.', safeToEdit: true }), { status: 409, headers: { 'Content-Type': 'application/json' } }) } }); await tick(); });
    assert.equal(window.sessionStorage.length, 0, 'prévia recusada antes de efeitos não mantém tentativa pendente');
    assert.equal(document.querySelector('fieldset').disabled, false, 'resposta segura explícita libera edição');
    assert.equal(button('Confirmar baixa parcial').disabled, true, 'resposta segura exige outra prévia');
    await settle(300);
    assert.notEqual(fake.previews.at(-1).p_input.requestId, staleAttempt.requestId, 'tentativa recusada renova requestId');

    await act(async () => reactRoot.unmount()); reactRoot = null;
    await mount('EXPENSE');
    await settle(300);
    assert.ok([...byLabel('Forma do pagamento 1').options].some(option => option.value === 'TED'));
    await click(button('Confirmar quitação'));
    assert.equal(fake.confirmations.length, 6, 'despesa confirma via RPC com os mesmos inputs');
    await act(async () => { fake.finish({ data: { success: true, replayed: false, paymentId: id(8), preview: { ...summary, status: 'PAGO', remainingAfter: '0.00', paymentAmount: '100.00' } }, error: null }); await tick(); });
    await act(async () => reactRoot.unmount()); reactRoot = null;
    summary.status = 'PAGO'; summary.hasEvents = true; summary.previouslyPaid = '100.00'; summary.remainingBefore = '0.00';
    fake.events = [{ id: id(8), paymentDate: '2026-10-14', paymentAmount: '100.00', principalPaid: '100.00', discount: '0.00', interest: '0.00', penalty: '0.00', addition: '0.00', components: first.components }];
    await mount('EXPENSE', true);
    assert.match(document.body.textContent, /Histórico de pagamentos/);
    assert.equal(document.querySelector('fieldset'), null, 'pago abre histórico sem formulário de nova baixa');
    document.querySelector('details').open = true;
    await click(button('Estornar este pagamento'));
    await change('Motivo do estorno', 'Pagamento sintético lançado na conta incorreta');
    const reverse = button('Confirmar estorno');
    await act(async () => { reverse.click(); reverse.click(); await tick(); });
    assert.equal(fake.reversals.length, 1);
    assert.equal(fake.reversals[0].p_payment_id, id(8));
    assert.equal(fake.reversals[0].p_source_kind, 'EXPENSE');
    await act(async () => { fake.finish({ data: null, error: { message: 'Resposta interrompida' } }); await tick(); });
    await click(button('Conferir estorno'));
    assert.deepEqual(fake.reversals[1], fake.reversals[0], 'estorno retoma mesmo evento, motivo e requestId');
    await act(async () => { fake.finish({ data: { success: true, replayed: true, paymentId: id(8) }, error: null }); await tick(); });
    assert.equal(reversed, 1);
    await act(async () => reactRoot.unmount()); reactRoot = null;
    const beforeLegacyPreviews = fake.previews.length;
    const legacyCalls = [];
    const legacyItem = { ...item, paymentSummary: undefined, gatewayProvider: 'banese_card',
      operationCapabilities: { sourceSystem: 'BANESE', provenanceKind: 'BANESE_LEGACY_IMPORTED', canSettle: true } };
    const renderRouted = async routedItem => {
      reactRoot = createRoot(container);
      await act(async () => { reactRoot.render(h(ReceivablePaymentModal, { item: routedItem, accounts, initialAccountId: id(2),
        legacyPending: false, legacyError: new Error('Falha legada sem troca de fluxo'), onClose: noop,
        onLegacyConfirm: payload => legacyCalls.push(payload), onConfirm: () => assert.fail('Título importado não usa novo endpoint') })); await tick(); });
    };
    await renderRouted(legacyItem);
    assert.match(document.body.textContent, /Confirmar recebimento/);
    assert.doesNotMatch(document.body.textContent, /Adicionar forma de pagamento/);
    const legacyConfirm = [...document.querySelectorAll('button')].find(element => /^Confirmar R\$/.test(element.textContent.trim()));
    await click(legacyConfirm);
    assert.equal(legacyCalls.length, 1);
    assert.equal(legacyCalls[0].contaBancariaId, id(2));
    assert.equal(fake.previews.length, beforeLegacyPreviews, 'erro legado não faz fallback para prévia nova');
    await act(async () => reactRoot.unmount()); reactRoot = null;
    await renderRouted({ ...legacyItem, paymentSummary: partialSummary });
    assert.doesNotMatch(document.body.textContent, /Confirmar recebimento/);
    assert.match(document.body.textContent, /Histórico de pagamentos/, 'ledger permanece no fluxo novo mesmo com proveniência legada');


  } finally {
    if (reactRoot && act) await act(async () => reactRoot.unmount());
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { MessageChannel } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const rootDirectory = fileURLToPath(new URL('../../../../', import.meta.url));
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

test('modal real: contas, saldo, rolagem e retomada sem confirmar pagamento', async t => {
  const jsdomPath = process.env.FINANCIAL_PAYMENT_JSDOM_PATH;
  const { JSDOM } = require(jsdomPath ? resolve(jsdomPath) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'payment-account-interaction-'));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const ancestorScrolls = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () { ancestorScrolls.push(this.id); };
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    const listbox = this.getAttribute('role') === 'listbox' ? this : this.closest('[role="listbox"]');
    let top = 160;
    let height = 40;
    if (listbox) {
      top = 200;
      height = 160;
      if (this.getAttribute('role') === 'option') {
        const index = [...listbox.querySelectorAll('[role="option"]')].indexOf(this);
        top += index * 64 - listbox.scrollTop;
        height = 64;
      }
    }
    return { left: 100, right: 600, top, bottom: top + height, width: 500, height, x: 100, y: top, toJSON() {} };
  };
  const previousGlobals = new Map();
  const channels = [];
  previousGlobals.set('MessageChannel', Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel'));
  globalThis.MessageChannel = class extends MessageChannel {
    constructor() { super(); channels.push(this); }
  };
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', '__accountPaymentClient']) {
    previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const summary = { originalAmount: '120.00', previouslyPaid: '0.00', remainingBefore: '120.00', status: 'PENDENTE', hasEvents: false };
  const previews = [];
  globalThis.__accountPaymentClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: id(9) } } } }) },
    rpc: async (name, params) => {
      if (name === 'get_financial_payment_history_secure') return { data: { summary, events: [] }, error: null };
      assert.equal(name, 'preview_financial_payment_secure', 'nenhuma confirmação ou estorno deve ser enviado');
      previews.push(params.p_input);
      return { data: { ...summary, sourceKind: params.p_source_kind, sourceId: params.p_source_id,
        paymentAmount: '120.00', principalPaid: '120.00', remainingAfter: '0.00', interest: '0.00', penalty: '0.00',
        addition: '0.00', discount: '0.00', status: 'PAGO', components: params.p_input.components,
        fingerprint: `preview-${previews.length}` }, error: null };
    },
  };
  let reactRoot;
  let act;
  try {
    const output = join(temporary, 'components.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { FinancialPaymentModal } from './modules/gestor/financeiro/settlements/FinancialPaymentModal';
    `, resolveDir: rootDirectory, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs',
    logLevel: 'silent', plugins: [{
      name: 'synthetic-account-client', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'synthetic' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({
          contents: 'export const supabase = globalThis.__accountPaymentClient;', loader: 'js',
        }));
      },
    }] });
    const components = require(output);
    const { React, createRoot, FinancialPaymentModal } = components;
    act = components.act;
    const account = (value, banco, natureza) => ({ id: id(value), banco, natureza, conta: String(value),
      agencia: '001', titular: 'Conta sintética', tipo: 'CORRENTE', saldoInicial: 0, poloId: id(5), polosUso: [id(5)], ativo: true });
    const accounts = [account(2, 'CAIXA DA UNIDADE', 'CAIXA_INTERNO'), account(3, 'BANESE', 'BANCARIA'),
      account(4, 'CAIXA ECONÔMICA', 'BANCARIA'), account(6, 'PROESC', 'BANCARIA')];
    Object.assign(accounts[0], { saldoAtual: 1234.56 });
    Object.assign(accounts[1], { saldoAtual: -12.34, saldoContabilConta: -12.34, saldoGerencialPolo: 9999, compartilhada: true });
    Object.assign(accounts[2], { saldoAtual: 0 });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const tick = (ms = 0) => new Promise(done => setTimeout(done, ms));
    const settle = async (ms = 0) => { await act(async () => { await tick(ms); }); };
    const close = async () => { await act(async () => reactRoot.unmount()); reactRoot = null; };
    t.afterEach(async () => { if (reactRoot) await close(); });
    let props;
    const mount = async (initialAccountId, sourceKind = 'EXPENSE') => {
      reactRoot = createRoot(container);
      props = { sourceKind, sourceId: id(1), poloId: id(5), description: 'Despesa sintética', accounts, initialAccountId,
        onClose() {}, onConfirm: () => assert.fail('teste não pode confirmar pagamento') };
      await act(async () => { reactRoot.render(React.createElement(FinancialPaymentModal, props)); await tick(); });
      await settle();
    };
    const button = label => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
    const picker = (row, field) => document.querySelector(`[aria-label="Pagamento ${row}"]`).querySelectorAll('[role="combobox"]')[field];
    const click = async element => { assert.ok(element); await act(async () => { element.click(); await tick(); }); };
    const choose = async (row, field, value) => {
      await click(picker(row, field));
      await click([...document.querySelectorAll('[role="option"]')].find(option => option.id.endsWith(`-${value}`)));
    };
    const key = async value => {
      await act(async () => { picker(1, 0).dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true })); await tick(); });
    };
    await t.test('abertura e teclado revelam a opção só na rolagem interna da lista', async () => {
      await mount(id(4));
      ancestorScrolls.length = 0;
      await click(picker(1, 0));
      const listbox = document.querySelector('[role="listbox"]');
      assert.equal(listbox.scrollTop, 32, 'a conta selecionada deve aparecer ao abrir');
      await key('ArrowDown');
      assert.equal(listbox.scrollTop, 96, 'a próxima conta deve aparecer ao navegar pelo teclado');
      assert.deepEqual(ancestorScrolls, [], 'revelar opção não pode rolar o modal ou a página');
      await close();
    });
    await t.test('hover e atualização de contas preservam a posição escolhida ao rolar', async () => {
      await mount(id(4));
      await click(picker(1, 0));
      const listbox = document.querySelector('[role="listbox"]');
      listbox.scrollTop = 100;
      ancestorScrolls.length = 0;
      await act(async () => {
        listbox.querySelector('[role="option"]').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
        await tick();
      });
      assert.equal(listbox.scrollTop, 100, 'passar o mouse não deve puxar a lista para outra conta');
      assert.deepEqual(ancestorScrolls, [], 'hover não deve disparar rolagem imperativa');
      await act(async () => { reactRoot.render(React.createElement(FinancialPaymentModal, { ...props, accounts: [...accounts] })); await tick(); });
      assert.equal(listbox.scrollTop, 100, 'atualização do saldo não deve reiniciar a rolagem');
      assert.deepEqual(ancestorScrolls, [], 'atualização de props não deve rolar ancestrais');
      await close();
    });
    await t.test('saldo da conta fica ao lado do nome: positivo, negativo, zero e indisponível', async () => {
      for (const sourceKind of ['EXPENSE', 'RECEIVABLE']) {
        await mount(id(3), sourceKind);
        await click(picker(1, 0));
        const expected = ['Saldo R$ 1.234,56', 'Saldo -R$ 12,34', 'Saldo R$ 0,00', 'Saldo indisponível'];
        for (const [index, option] of [...document.querySelectorAll('[role="option"]')].entries()) {
          const leaves = [...option.querySelectorAll('span')].filter(span => span.childElementCount === 0);
          const label = leaves.find(span => span.textContent === `${accounts[index].banco} · ${accounts[index].conta}`);
          const balance = leaves.find(span => span.textContent.replace(/\s/g, ' ') === expected[index]);
          assert.ok(balance, `${sourceKind}: ${expected[index]}`);
          assert.equal(balance.parentElement, label.parentElement, 'saldo e nome devem ocupar a primeira linha');
        }
        assert.doesNotMatch(document.querySelector('[role="listbox"]').textContent, /9\.999,00/, 'a posição gerencial do polo não substitui o saldo da conta');
        await close();
      }
    });
    await mount(id(3));
    assert.equal(picker(1, 1).value, 'Pix', 'Banese inicial deve sugerir Pix');
    await settle(300);
    assert.equal(previews.at(-1).components[0].method, 'PIX');
    await choose(1, 0, id(2));
    assert.equal(picker(1, 1).value, 'Dinheiro', 'caixa físico deve sugerir dinheiro');
    await choose(1, 0, id(4));
    assert.equal(picker(1, 1).value, 'Pix', 'Caixa Econômica não é caixa físico');
    await choose(1, 1, 'TED');
    assert.equal(picker(1, 1).value, 'TED');
    await settle(300);
    assert.equal(previews.at(-1).components[0].method, 'TED', 'prévia respeita edição manual');
    await act(async () => { reactRoot.render(React.createElement(FinancialPaymentModal, { ...props, accounts: [...accounts] })); });
    assert.equal(picker(1, 1).value, 'TED', 'atualização de contas não desfaz edição manual');
    await choose(1, 0, id(4));
    assert.equal(picker(1, 1).value, 'TED', 'selecionar de novo a mesma conta preserva edição');
    await choose(1, 0, id(6));
    assert.equal(picker(1, 1).value, 'TED', 'conta sem regra mantém forma escolhida');
    await choose(1, 0, id(3));
    assert.equal(picker(1, 1).value, 'Pix', 'troca explícita de conta aplica nova sugestão');
    await click(button('Adicionar forma de pagamento'));
    await choose(2, 0, id(2));
    assert.equal(picker(2, 1).value, 'Dinheiro');
    assert.equal(picker(1, 1).value, 'Pix', 'segunda forma não altera primeira');
    await choose(2, 1, 'CARTAO');
    assert.equal(picker(2, 1).value, 'Cartão', 'padrão não restringe outras formas');
    await click(document.querySelector('[aria-label="Remover pagamento 1"]'));
    assert.equal(picker(1, 1).value, 'Cartão', 'remoção preserva forma manual da linha restante');
    await close();
    await mount(id(2));
    assert.equal(picker(1, 1).value, 'Dinheiro', 'reabertura limpa escolha anterior');
    await close();
    await mount(id(4), 'PAYABLE');
    assert.equal(picker(1, 1).value, 'Pix', 'contas a pagar usam mesmo padrão');
    await close();
    await mount(id(3), 'RECEIVABLE');
    assert.equal(picker(1, 1).value, 'Pix', 'recebimentos manuais usam mesmo padrão');
    await close();

    const saved = { input: { requestId: id(8), sourceId: id(1), paymentDate: '2026-10-01',
      components: [{ accountId: id(3), method: 'BOLETO', amount: '120.00' }],
      interest: '0.00', penalty: '0.00', addition: '0.00', discount: '0.00', notes: '' }, fingerprint: 'original-fingerprint' };
    window.sessionStorage.setItem(`universo:financial-payment:v1:${id(9)}:EXPENSE:${id(1)}`, JSON.stringify(saved));
    const previewCount = previews.length;
    await mount(id(2));
    assert.equal(picker(1, 0).value, 'BANESE · 3');
    assert.equal(picker(1, 1).value, 'Boleto', 'retomada não reescreve a forma salva');
    assert.equal(document.querySelector('fieldset').disabled, true);
    assert.ok(button('Conferir pagamento'));
    await settle(300);
    assert.equal(previews.length, previewCount, 'retomada mantém fingerprint e não dispara nova prévia');
    assert.deepEqual(JSON.parse(window.sessionStorage.getItem(`universo:financial-payment:v1:${id(9)}:EXPENSE:${id(1)}`)), saved);
  } finally {
    if (reactRoot && act) await act(async () => reactRoot.unmount());
    dom.window.close();
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

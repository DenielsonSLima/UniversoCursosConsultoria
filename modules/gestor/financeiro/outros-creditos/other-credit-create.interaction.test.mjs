import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const base = fileURLToPath(new URL('../../../../', import.meta.url));
const jsdomPath = process.env.OTHER_CREDIT_JSDOM_PATH;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const officialLink = 'https://universocc.com.br/pagamento/canonical-banese-fixture';
const stateKey = '__OTHER_CREDIT_CREATE_TEST__';
const serviceMocks = {
  '/financeiro.service': `
    export const financeiroService = { createOtherCredit: input => globalThis.${stateKey}.create(input) };
    export const isContaDisponivelNoPolo = (account, polo) => account.poloId === polo;
  `,
  '/asaas.service': `export const asaasIntegrationService = { syncReceivable() { throw new Error('Unexpected synchronization'); } };`,
  '/useFinanceiroRealtime': 'export const useFinanceiroRealtime = () => {};',
  '/useOutrosCreditosQueries': `export const useOutrosCreditosQueries = () => globalThis.${stateKey}.creditQueries;`,
  '/useFinanceiroSharedQueries': `export const useFinanceiroSharedQueries = () => globalThis.${stateKey}.sharedQueries;`,
  '/useCategoriasFinanceirasQuery': `
    export const useCategoriasFinanceirasQuery = () => globalThis.${stateKey}.categoryQuery;
    export const useCreateCategoriaFinanceiraMutation = () => ({ isPending: false, isError: false });
  `,
  '/useLegacyFullReceipt': 'export const useLegacyFullReceipt = () => ({ reset() {}, isPending: false });',
  '/financial-payment.service': 'export const confirmFinancialPayment = () => { throw new Error("Unexpected payment"); };',
};

async function compileHarness(temp) {
  const output = resolve(temp, 'create-harness.mjs');
  const source = `
    import React from 'react';
    import { useOutrosCreditos } from './modules/gestor/financeiro/outros-creditos/useOutrosCreditos';
    import { OtherCreditCreateModal } from './modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal';
    import ToastNotification from './modules/gestor/components/ToastNotification';
    export function Harness() {
      const model = useOutrosCreditos('polo-test');
      return React.createElement(React.Fragment, null,
        React.createElement('button', { onClick: model.openCreateModal }, 'Abrir criação'),
        React.createElement(OtherCreditCreateModal, { model }),
        React.createElement(ToastNotification, { toasts: model.toasts, onRemove: model.removeToast }),
        React.createElement('output', { 'data-testid': 'state' }, JSON.stringify({
          isModalOpen: model.isModalOpen, isPdvOpen: model.isPdvOpen, mode: model.mode,
          paymentMethod: model.paymentMethod, paymentReceivableId: model.paymentReceivableId,
        })),
      );
    }
  `;
  await build({
    stdin: { contents: source, resolveDir: base, sourcefile: 'other-credit-create-harness.tsx', loader: 'tsx' },
    outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
    loader: { '.css': 'empty' },
    plugins: [{ name: 'other-credit-service-fixtures', setup(builder) {
      builder.onResolve({ filter: /./ }, args => {
        if (!args.path.startsWith('.')) return undefined;
        const clean = args.path.replace(/\.(?:tsx?|mjs)$/, '');
        const name = Object.keys(serviceMocks).find(suffix => clean.endsWith(suffix));
        return name ? { path: name, namespace: 'credit-fixture' } : undefined;
      });
      builder.onLoad({ filter: /./, namespace: 'credit-fixture' }, args => ({ contents: serviceMocks[args.path], loader: 'js' }));
    } }],
  });
  return import(pathToFileURL(output).href);
}

function fixture(create) {
  const query = data => ({ data, isLoading: false, isError: false, refetch: async () => ({ data }) });
  return {
    create,
    creditQueries: { creditsQuery: query([]), summaryQuery: query({}) },
    sharedQueries: {
      accountsQuery: query([{ id: 'account-test', poloId: 'polo-test', banco: 'Caixa local', conta: '001', ativo: true, saldoAtual: 0 }]),
      polosQuery: query([{ id: 'polo-test', nome: 'Unidade de teste', cidade: 'Japoatã', estado: 'SE' }]),
      partnersQuery: query([{ id: 'partner-test', tipo: 'PJ', nome: 'Parceiro de teste', cpf_cnpj: '00000000000100' }]),
    },
    categoryQuery: query([{ id: 'category-test', nome: 'Categoria de teste' }]),
  };
}

test('criação de Outros Créditos usa hook, modal, seletores e notificações reais sem rede', async t => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/other-credit-create-'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  const previous = new Map();
  const errors = [];
  const copied = [];
  for (const key of ['window', 'document', 'HTMLElement', 'Event', 'Node', 'navigator', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', stateKey]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value = key === 'IS_REACT_ACT_ENVIRONMENT' ? true
      : key === 'fetch' ? () => { throw new Error('Network must remain disabled in this smoke'); }
      : dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { copied.push(value); } } });
  dom.window.addEventListener('error', event => { errors.push(event.error); });
  let root;
  let client;
  try {
    const { Harness } = await compileHarness(temp);
    const { createRoot } = await import('react-dom/client');
    const settle = async () => act(async () => { await new Promise(done => setTimeout(done, 0)); });
    const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    const click = async element => {
      assert(element, 'O controle deve estar presente');
      await act(async () => element.click());
      await settle();
    };
    const input = async (element, value) => {
      assert(element, 'O campo deve estar presente');
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    };
    const choose = async (label, option) => {
      await click(document.querySelector(`[role="combobox"][aria-label="${label}"]`));
      await click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent.trim() === option));
    };
    const fill = async () => {
      await input(document.querySelector('input[placeholder^="Ex.:"]'), '  Serviço eventual de teste  ');
      await input(document.querySelector('input[placeholder="0,00"]'), '123,45');
      await input(document.querySelector('input[type="date"]'), '2026-11-30');
    };
    const partner = async () => {
      await choose('Tipo de parceiro', 'Pessoa Jurídica');
      await click([...document.querySelectorAll('button')].find(node => node.textContent.includes('Selecionar entre 1...')));
      await click([...document.querySelectorAll('button')].find(node => node.textContent.includes('Parceiro de teste')));
    };
    const notification = title => [...document.querySelectorAll('[role="status"], [role="alert"]')]
      .find(node => node.textContent.includes(title));
    const waitFor = async predicate => {
      for (let i = 0; i < 40 && !predicate(); i++) await settle();
      assert(predicate(), 'O estado esperado deve aparecer após a mutation');
    };
    const mount = async create => {
      if (root) await act(async () => root.unmount());
      client?.clear();
      globalThis[stateKey] = fixture(create);
      client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
      root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness))));
      await click(button('Abrir criação'));
      assert(document.querySelector('[role="dialog"]'));
    };
    const selectMode = async label => click([...document.querySelectorAll('[role="dialog"] button')]
      .find(node => node.querySelector('p')?.textContent === label));

    await t.test('valida descrição, valor e parceiro antes de criar; cópia usa somente URL retornada pelo serviço', async () => {
      const calls = [];
      let release;
      await mount(input => { calls.push(input); return new Promise(done => { release = done; }); });
      await selectMode('Link bancário');
      await click(button('Gerar link bancário'));
      assert(notification('Descrição obrigatória'));
      assert.equal(calls.length, 0);
      await input(document.querySelector('input[placeholder^="Ex.:"]'), 'Teste');
      await input(document.querySelector('input[placeholder="0,00"]'), '0,00');
      await click(button('Gerar link bancário'));
      assert(notification('Valor inválido'));
      await fill();
      await click(button('Gerar link bancário'));
      assert(notification('Parceiro obrigatório'));
      assert.equal(calls.length, 0);
      await partner();
      await choose('Categoria financeira', 'Categoria de teste');
      await click(button('Gerar link bancário'));
      assert.equal(calls.length, 1);
      assert.equal(document.querySelector('fieldset').disabled, true);
      assert.equal(button('Salvando...').disabled, true);
      await click(button('Salvando...'));
      assert.equal(calls.length, 1, 'Clique duplicado durante envio não duplica criação');
      assert.match(calls[0].idempotencyKey, /^[a-f\d-]{36}$/i);
      assert.deepEqual({ ...calls[0], idempotencyKey: 'request' }, {
        idempotencyKey: 'request', poloId: 'polo-test', descricao: 'Serviço eventual de teste', valor: 123.45,
        dataVencimento: '2026-11-30', clienteId: 'partner-test', categoriaFinanceiraId: 'category-test',
        formaPagamento: 'BOLETO', contaBancariaId: undefined, mode: 'GATEWAY',
      });
      await act(async () => release({ id: 'credit-test', asaasInvoiceUrl: officialLink }));
      await waitFor(() => button('Copiar link do pagador'));
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert(notification('O link bancário está pronto'));
      assert.equal(JSON.parse(document.querySelector('output').textContent).paymentReceivableId, null);
      await click(button('Copiar link do pagador'));
      assert.deepEqual(copied, [officialLink]);
      assert(notification('Link copiado'));
    });

    await t.test('erro visível permite retry com mesma chave e ausência de URL não cria ação de link', async () => {
      const calls = [];
      await mount(async input => {
        calls.push(input);
        if (calls.length === 1) throw new Error('Banese indisponível para este teste');
        return { id: 'saved-without-url' };
      });
      await selectMode('Link bancário');
      await fill();
      await partner();
      await click(button('Gerar link bancário'));
      await waitFor(() => notification('Banese indisponível para este teste'));
      assert(notification('Erro ao criar crédito').matches('[role="alert"]'));
      assert(document.querySelector('[role="dialog"]'));
      assert.equal(document.querySelector('input[placeholder="0,00"]').value, '123,45');
      await click(button('Gerar link bancário'));
      await waitFor(() => notification('O link ainda não está disponível'));
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1], calls[0]);
      assert.equal(button('Copiar link do pagador'), undefined);
      assert.deepEqual(copied, [officialLink], 'Ausência de URL não inventa um destino para copiar');
    });

    await t.test('recebimento local exige conta e mantém forma, data e conta canônicas', async () => {
      const calls = [];
      await mount(async input => { calls.push(input); return { id: 'local-paid' }; });
      await fill();
      await click(button('Salvar crédito'));
      assert(notification('Conta obrigatória'));
      assert.equal(calls.length, 0);
      await choose('Conta / caixa de entrada', 'Caixa local - 001 - Saldo: R$ 0,00');
      await choose('Forma de recebimento', 'Dinheiro');
      await click(button('Salvar crédito'));
      await waitFor(() => notification('Crédito registrado'));
      assert.equal(calls.length, 1);
      assert.equal(calls[0].mode, 'LOCAL_PAGO');
      assert.equal(calls[0].contaBancariaId, 'account-test');
      assert.equal(calls[0].formaPagamento, 'DINHEIRO');
      assert.equal(calls[0].dataVencimento, '2026-11-30');
      assert.equal(button('Copiar link do pagador'), undefined);
    });

    await t.test('a receber local não envia conta nem forma; abrir PDV mantém modo bancário sem criar cobrança', async () => {
      const calls = [];
      await mount(async input => { calls.push(input); return { id: 'local-pending' }; });
      await selectMode('A receber local');
      await fill();
      await click(button('Salvar crédito'));
      await waitFor(() => notification('Crédito registrado'));
      assert.equal(calls[0].mode, 'LOCAL_RECEBER');
      assert.equal(calls[0].contaBancariaId, undefined);
      assert.equal(calls[0].formaPagamento, undefined);
      await click(button('Abrir criação'));
      await selectMode('Receber na tela');
      assert.deepEqual(JSON.parse(document.querySelector('output').textContent), {
        isModalOpen: false, isPdvOpen: true, mode: 'GATEWAY', paymentMethod: 'BOLETO', paymentReceivableId: null,
      });
      assert.equal(calls.length, 1);
    });
    assert.deepEqual(errors, [], 'Não deve haver exceção em eventos, inclusive chamadas inválidas ao toast');
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
    await rm(temp, { recursive: true, force: true });
  }
});

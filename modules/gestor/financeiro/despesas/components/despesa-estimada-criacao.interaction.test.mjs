import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const fixture = {
  requestId: 'test-request', poloId: 'test-polo', tipo: 'DESPESA_FIXA',
  descricao: 'ENERGIA', valor: 300, dataLancamento: '2027-01-01', dataVencimento: '2027-01-10',
};
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}
const stubs = [
  [/lib\/supabase$/, 'export const supabase = { rpc: (...args) => globalThis.__estimatedCreate.rpc(...args) };'],
  [/financial-payment\.service$/, 'export const confirmFinancialPayment = () => { throw new Error("Pagamento fora do escopo"); };'],
  [/despesas-anexos\.service$/, `
    export const uploadDespesaAnexo = async () => { globalThis.__estimatedCreate.uploads++; return null; };
    export const cleanupDespesaAnexoIfRequestFailed = async () => { globalThis.__estimatedCreate.cleanups++; };
    export const getDespesaAnexoUrl = async () => '';
  `],
  [/financeiro\.service$/, 'export const isContaDisponivelNoPolo = () => true;'],
  [/useCategoriasFinanceirasQuery$/, `export const useCategoriasFinanceirasQuery = () => ({
    data: [], isSuccess: true, isPending: false, isError: false,
  });`],
  [/useDespesaSugestao$/, `
    import { useState } from 'react';
    export const useDespesaSugestao = () => {
      const [descricao, setDescricao] = useState('ENERGIA');
      const [valor, setValor] = useState('300,00');
      const [categoriaId, setCategoriaId] = useState('');
      return { descricao, setDescricao, valor, setValor, categoriaId, setCategoriaId, message: '', failed: false };
    };
  `],
  [/useDespesaProfessorTurma$/, `export const useDespesaProfessorTurma = () => ({
    turmaEnabled: false, setTurmaEnabled() {}, turmaId: '', setTurmaId() {},
    turmaModalidade: '', setTurmaModalidade() {}, message: '',
  });`],
  [/useConveniosQueries$/, 'export const useConveniosListQuery = () => ({ data: { itens: [] }, isPending: false });'],
  [/convenios\.cache$/, 'export const invalidateConveniosScope = async () => {};'],
  [/DespesaNovoCredorModal$/, 'export default function Modal() { return null; }'],
  [/CategoriaFinanceiraInlineModal$/, 'export default function Modal() { return null; }'],
];

test('criação estimada preserva contrato, escolhas do formulário e replay', async t => {
  const { JSDOM } = require(process.env.FINANCIAL_PAYMENT_JSDOM_PATH
    ? resolve(process.env.FINANCIAL_PAYMENT_JSDOM_PATH) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'despesa-estimada-criacao-'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://universo.test/', pretendToBeVisual: true,
  });
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
    MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), __estimatedCreate: undefined,
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root;
  let queryClient;
  let act;
  try {
    const bundle = join(temporary, 'creation.cjs');
    await build({
      stdin: { contents: `
        export { default as DespesaForm } from './modules/gestor/financeiro/despesas/components/DespesaForm';
        export { createDespesa } from './modules/gestor/financeiro/despesas/despesas-lancamentos.service';
        export { act, default as React } from 'react';
        export { createRoot } from 'react-dom/client';
        export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      `, loader: 'tsx', resolveDir: projectRoot },
      outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      loader: { '.css': 'empty' },
      plugins: [{ name: 'creation-isolated-services', setup(builder) {
        stubs.forEach(([filter, contents], index) => {
          builder.onResolve({ filter }, () => ({ path: String(index), namespace: 'stub' }));
          builder.onLoad({ filter: new RegExp(`^${index}$`), namespace: 'stub' }, () => ({ contents, resolveDir: projectRoot }));
        });
      } }],
    });
    const components = require(bundle);
    const { React, createRoot, QueryClient, QueryClientProvider, DespesaForm, createDespesa } = components;
    act = components.act;
    const resetClient = () => {
      const state = { calls: [], uploads: 0, cleanups: 0, failure: null };
      state.rpc = async (name, params) => {
        state.calls.push([name, params]);
        return state.failure ? { data: null, error: state.failure } : {
          data: [{ id: 'created-expense', valor: 300, valor_base: 300, status: 'PENDENTE' }], error: null,
        };
      };
      globalThis.__estimatedCreate = state;
      return state;
    };
    const settle = async () => { await act(async () => { await new Promise(done => setTimeout(done, 0)); }); };
    const close = async () => {
      if (root) await act(async () => root.unmount());
      root = null;
      queryClient?.clear();
      queryClient = null;
    };
    t.afterEach(close);
    const mount = async (tipo = 'DESPESA_FIXA') => {
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
      root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(DespesaForm, { tipo, poloId: 'test-polo', polos: [], contas: [], parceiros: [],
          turmas: [], onClose() {}, onSuccess() {} }))));
      await settle();
    };
    const byText = text => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
    const click = async element => {
      assert.ok(element, 'controle esperado');
      await act(async () => element.click());
      await settle();
    };
    const checkbox = () => document.querySelector('[aria-label="Valor estimado"]');
    const submit = async () => {
      await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      await settle();
    };
    const changeNumber = async (element, value) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      await settle();
    };

    await t.test('checkbox e repetição mensal usam a RPC estimada e mantêm a requisição ao tentar novamente', async () => {
      const state = resetClient();
      await mount();
      await click(checkbox());
      assert.equal(checkbox().checked, true);
      assert.equal([...document.querySelectorAll('details input')].every(input => input.disabled), true,
        'encargos de baixa não podem ser antecipados na estimativa');
      await click(byText('Parcelado'));
      const numbers = document.querySelectorAll('input[type="number"]');
      assert.equal(numbers[1].value, '1', 'intervalo inicial é um mês');
      await changeNumber(numbers[0], '12');
      state.failure = new Error('Resposta temporariamente indisponível');
      await submit();
      assert.match(document.body.textContent, /Resposta temporariamente indisponível/);
      state.failure = null;
      await submit();
      assert.equal(state.calls.length, 2);
      assert.deepEqual(state.calls[0], state.calls[1], 'retentativa conserva payload e request id');
      const [name, payload] = state.calls[1];
      assert.equal(name, 'criar_despesa_estimada_secure');
      assert.equal(payload.p_rateada, false);
      assert.equal(payload.p_input.p_total_parcelas, 12);
      assert.equal(payload.p_input.p_intervalo_quantidade, 1);
      assert.equal(payload.p_input.p_intervalo_unidade, 'MESES');
      assert.equal(payload.p_input.p_valor_base, 300);
      assert.equal(payload.p_input.p_baixa_imediata, false);
      assert.equal(payload.p_input.p_conta_bancaria_id, null);
    });
    await t.test('baixa imediata e desdobramento desmarcam e bloqueiam estimativa', async () => {
      resetClient();
      await mount();
      await click(checkbox());
      await click(byText('Dar Baixa'));
      assert.equal(checkbox().checked, false);
      assert.equal(checkbox().disabled, true);
      await click(byText('Parcelado'));
      await click(checkbox());
      const split = [...document.querySelectorAll('input[type="checkbox"]')].find(item => item.closest('label')?.textContent.includes('Desdobrar valor total'));
      await click(split);
      assert.equal(checkbox().checked, false);
      assert.equal(checkbox().disabled, true);
    });
    await t.test('Outros Débitos não oferece estimativa', async () => {
      resetClient();
      await mount('OUTRO_DEBITO');
      assert.equal(checkbox(), null);
    });
    await t.test('rateio envia somente os dados canônicos para a wrapper de estimativa', async () => {
      const state = resetClient();
      await createDespesa({ ...fixture, valorEstimado: true, totalParcelas: 12,
        rateio: { modo: 'SELECIONADOS', poloIds: ['test-polo-b'] } });
      const [name, payload] = state.calls[0];
      assert.equal(name, 'criar_despesa_estimada_secure');
      assert.equal(payload.p_rateada, true);
      assert.equal(payload.p_input.p_valor_base, 300);
      assert.deepEqual(payload.p_input.p_rateio_polo_ids, ['test-polo-b']);
      assert.equal(payload.p_input.p_rateio_modo, 'SELECIONADOS');
    });
    await t.test('combinações incompatíveis são rejeitadas antes de enviar ou anexar arquivo', async () => {
      for (const override of [{ markAsPaid: true }, { splitTotal: true }, { convenioMesId: 'test-convenio' },
        { tipo: 'OUTRO_DEBITO' }, { jurosValor: 1 }, { multaValor: 1 }, { descontoValor: 1 }]) {
        const state = resetClient();
        await assert.rejects(createDespesa({ ...fixture, valorEstimado: true, ...override }));
        assert.equal(state.calls.length, 0);
        assert.equal(state.uploads, 0);
      }
    });
    await t.test('valor conhecido mantém a criação legada', async () => {
      const state = resetClient();
      await createDespesa({ ...fixture, valorEstimado: false });
      assert.equal(state.calls[0][0], 'criar_despesa_secure');
      assert.equal(state.calls[0][1].p_valor_base, 300);
      assert.equal(state.calls[0][1].p_input, undefined);
    });
  } finally {
    if (root && act) await act(async () => root.unmount());
    queryClient?.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

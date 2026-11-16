import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('mês sem cobrança encerra previsão sem pagamento e permite conferir a mesma tentativa', async t => {
  const { JSDOM } = require(process.env.FINANCIAL_PAYMENT_JSDOM_PATH
    ? resolve(process.env.FINANCIAL_PAYMENT_JSDOM_PATH) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'despesa-sem-cobranca-'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://universo.test/' });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
    navigator: dom.window.navigator, MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true,
    __withoutChargeClient: undefined };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let root;
  let queryClient;
  let act;
  try {
    const bundle = join(temporary, 'without-charge.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      export { default as DespesaBaixaModal } from './modules/gestor/financeiro/despesas/components/DespesaBaixaModal';
    `, resolveDir: projectRoot, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs',
    logLevel: 'silent', plugins: [{ name: 'no-charge-synthetic-client', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'synthetic' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({
        contents: 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__withoutChargeClient[key] });', loader: 'js',
      }));
    } }] });
    const { React, createRoot, QueryClient, QueryClientProvider, DespesaBaixaModal, act: reactAct } = require(bundle);
    act = reactAct;
    const account = { id: id(2), banco: 'CAIXA SINTÉTICA', natureza: 'CAIXA_INTERNO', conta: '1',
      agencia: '001', titular: 'Conta de teste', tipo: 'CORRENTE', saldoInicial: 0,
      poloId: id(5), polosUso: [id(5)], ativo: true };
    const item = { id: id(1), poloId: id(5), descricao: 'ENERGIA SINTÉTICA', status: 'PENDENTE',
      valorBase: 300, valorEstimado: true, valorEstimadoOriginal: 300, valorEstimadoVersao: 2 };
    const key = `universo:expense-without-charge:v1:${id(9)}:${id(1)}`;
    let state;
    const reset = ({ unknownOnce = false, hasEvents = false } = {}) => {
      window.sessionStorage.clear();
      state = { calls: [], resolved: 0, unknownOnce, userId: id(9), status: 'PENDENTE', hasEvents };
      globalThis.__withoutChargeClient = {
        auth: { getSession: async () => ({ data: { session: { user: { id: state.userId } } } }) },
        rpc: async (name, params) => {
          state.calls.push({ name, params: globalThis.structuredClone(params) });
          if (name === 'get_financial_payment_history_secure') return { data: {
            summary: { originalAmount: '300.00', previouslyPaid: '0.00', remainingBefore: '300.00',
              status: state.status, hasEvents: state.hasEvents }, events: [],
          }, error: null };
          assert.equal(name, 'resolve_estimated_expense_without_charge_secure', 'sem cobrança não deve chamar prévia ou confirmação de pagamento');
          state.status = 'CANCELADO';
          if (state.unknownOnce) { state.unknownOnce = false; return { data: null, error: { message: 'resposta interrompida' } }; }
          return { data: { id: id(1), status: 'CANCELADO', valor: 300, valor_estimado: true,
            valor_estimado_original: 300, valor_confirmado_em: null,
            valor_sem_cobranca_em: '2026-11-15T23:00:00Z', valor_sem_cobranca_por: id(9) }, error: null };
        },
      };
    };
    const tick = (milliseconds = 0) => new Promise(done => setTimeout(done, milliseconds));
    const settle = async () => act(async () => { await tick(5); await tick(5); });
    const close = async () => {
      if (root) await act(async () => root.unmount());
      root = null;
      queryClient?.clear(); queryClient = null;
    };
    t.afterEach(close);
    const mount = async (changes = {}) => {
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity } } });
      root = createRoot(document.getElementById('root'));
      const props = { item: { ...item, ...changes }, contas: [account], poloId: id(5),
        onConfirm: () => assert.fail('encerramento sem cobrança não confirma pagamento'),
        onReversed: async () => { state.resolved++; }, onClose() {}, isPending: false };
      await act(async () => { root.render(React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(DespesaBaixaModal, props))); await tick(); });
      await settle();
      await settle();
    };
    const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
    const checkbox = () => document.querySelector('[aria-label="Não houve cobrança neste mês"]');
    const reason = () => document.querySelector('[aria-label="Motivo do mês sem cobrança"]');
    const click = async element => {
      assert.ok(element, 'controle esperado');
      await act(async () => { element.click(); await tick(); });
      await settle();
    };
    const writeReason = async value => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(reason(), value);
        reason().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      await settle();
    };
    const resolutions = () => state.calls.filter(call => call.name === 'resolve_estimated_expense_without_charge_secure');

    await t.test('encerra com valor real vazio, preserva estimativa e não registra baixa', async () => {
      reset();
      await mount();
      assert.equal(document.querySelector('[aria-label="Valor real da conta"]').value, '');
      await click(checkbox());
      assert.equal(document.querySelector('[aria-label="Valor real da conta"]'), null);
      assert.equal(document.querySelector('[aria-label="Valor do pagamento 1"]'), null);
      assert.match(document.body.textContent, /Estimativa original/);
      assert.match(document.body.textContent, /300,00/);
      assert.match(document.body.textContent, /Cobrança deste mês/);
      assert.match(document.body.textContent, /0,00/);
      assert.equal(button('Encerrar mês sem cobrança').disabled, false);
      await click(button('Encerrar mês sem cobrança'));
      assert.equal(state.resolved, 1);
      assert.equal(resolutions().length, 1);
      assert.equal(resolutions()[0].params.p_versao, 2);
      assert.equal(resolutions()[0].params.p_motivo, null);
      assert.equal(resolutions()[0].params.p_despesa_id, id(1));
      assert.equal(window.sessionStorage.getItem(key), null);
    });
    await t.test('resposta perdida congela motivo e retoma requisição idêntica mesmo com mês já encerrado', async () => {
      reset({ unknownOnce: true });
      await mount();
      await click(checkbox());
      await writeReason('  A concessionária não emitiu cobrança nesta competência.  ');
      await click(button('Encerrar mês sem cobrança'));
      const original = resolutions()[0].params;
      assert.equal(reason().disabled, true);
      assert.equal(button('Voltar à baixa').disabled, true);
      assert.ok(button('Conferir encerramento'));
      const saved = JSON.parse(window.sessionStorage.getItem(key));
      assert.equal(saved.version, 2);
      assert.equal(saved.reason, 'A concessionária não emitiu cobrança nesta competência.');
      await close();
      await mount({ status: 'CANCELADO', valorSemCobrancaEm: '2026-11-15T23:00:00Z', valorEstimadoVersao: 3 });
      assert.ok(button('Conferir encerramento'), 'tentativa salva é recuperada antes de oferecer nova resolução');
      await click(button('Conferir encerramento'));
      assert.equal(resolutions().length, 2);
      assert.deepEqual(resolutions()[1].params, original, 'replay mantém request, versão e motivo originais');
      assert.equal(state.resolved, 1);
      assert.equal(window.sessionStorage.getItem(key), null);
    });
    await t.test('valor confirmado, despesa normal e cancelada sem tentativa não oferecem encerramento', async () => {
      for (const changes of [{ valorEstimado: false }, { valorConfirmadoEm: '2026-11-15T22:00:00Z' },
        { status: 'CANCELADO', valorSemCobrancaEm: '2026-11-15T23:00:00Z' }]) {
        reset();
        await mount(changes);
        assert.equal(checkbox(), null);
        assert.equal(button('Encerrar mês sem cobrança'), undefined);
        await close();
      }
    });
    await t.test('sessão trocada impede enviar encerramento com o usuário anterior', async () => {
      reset();
      await mount();
      await click(checkbox());
      state.userId = id(10);
      await click(button('Encerrar mês sem cobrança'));
      assert.equal(resolutions().length, 0);
      assert.match(document.body.textContent, /A sessão mudou/);
      assert.equal(state.resolved, 0);
    });
    await t.test('qualquer histórico de evento impede oferecer mês sem cobrança', async () => {
      reset({ hasEvents: true });
      await mount();
      assert.equal(checkbox(), null);
      assert.equal(resolutions().length, 0);
    });
    await t.test('mês encerrado sem tentativa salva abre somente seu histórico sem nova RPC', async () => {
      reset();
      await mount({ status: 'CANCELADO', valorSemCobrancaEm: '2026-11-16T01:00:00Z',
        cancelamentoMotivo: 'Não houve cobrança nesta competência. Fatura não emitida.' });
      assert.match(document.body.textContent, /Histórico do mês sem cobrança/);
      assert.match(document.body.textContent, /Encerrado em 15\/11\/2026/,
        'timestamp UTC deve aparecer na data civil de Maceió');
      assert.match(document.body.textContent, /Fatura não emitida/);
      assert.equal(reason(), null);
      assert.equal(button('Voltar à baixa'), undefined);
      assert.equal(button('Encerrar mês sem cobrança'), undefined);
      assert.equal(button('Conferir encerramento'), undefined);
      assert.equal(button('Fechar').disabled, false);
      assert.equal(state.calls.length, 0);
    });
  } finally {
    if (root && act) await act(async () => root.unmount());
    queryClient?.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { makeCaixaReportFixture } from './caixa-report.fixture';
import { caixaReportQueryOptions } from './caixa-report.service';

const competencia = '2026-08-01';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

// Reutiliza os dados sintéticos do relatório no formato de transporte da RPC.
const toRpcFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(toRpcFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), toRpcFields(item),
  ]));
};

const successfulPayload = () => {
  const report = makeCaixaReportFixture();
  report.resumo.meta.escopoTipo = 'GLOBAL';
  const restricted = { disponivel: false, motivo: 'ACESSO_RESTRITO' } as const;
  report.financiamento = restricted;
  report.patrimonio = restricted;
  report.posicaoLiquida = restricted;
  report.convenios = restricted;
  const payload = toRpcFields(report) as Record<string, unknown>;
  payload.posicao_total = {
    versao: 1, competencia, data_corte: '2026-08-06', escopo_tipo: 'GLOBAL',
    polo_id: null, ...restricted, observacao: 'Escopo complementar indisponível.',
  };
  return payload;
};

test('relatório não repete timeout SQL apesar do retry global e preserva o erro', async t => {
  const timeout = { code: '57014', message: 'canceling statement due to statement timeout' };
  const logged = t.mock.method(console, 'error', () => undefined);
  const signals: AbortSignal[] = [];
  const rpc = t.mock.method(supabase, 'rpc', () => ({
    abortSignal(signal: AbortSignal) { signals.push(signal); return this; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: null, error: timeout }).then(resolve);
    },
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
  try {
    await assert.rejects(client.fetchQuery(caixaReportQueryOptions(null, competencia, true)),
      error => error === timeout);
    assert.equal(rpc.mock.callCount(), 1);
    assert.ok(signals[0] instanceof AbortSignal);
    assert.equal(signals[0].aborted, false);
    assert.equal(logged.mock.callCount(), 1);
    assert.equal(client.getQueryData(['caixa-report', 'monthly', 'todos', competencia]), undefined);
  } finally { client.clear(); }
});

test('relatório recupera falha transitória de rede com uma repetição', async t => {
  t.mock.method(console, 'error', () => undefined);
  const rpc = t.mock.method(supabase, 'rpc', () => ({
    abortSignal() { return this; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(rpc.mock.callCount() === 1
        ? { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } }
        : { data: successfulPayload(), error: null }).then(resolve);
    },
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  try {
    const report = await client.fetchQuery(caixaReportQueryOptions(null, competencia, true));
    assert.equal(rpc.mock.callCount(), 2);
    assert.equal(report.completo, true);
    assert.equal(report.resumo.meta.competencia, competencia);
    assert.equal(report.recebimentos[0].valorRecebido, 0.9);
  } finally { client.clear(); }
});

test('cancelar a query do relatório aborta o transporte RPC pendente sem repetir', async t => {
  t.mock.method(console, 'error', () => undefined);
  let signal: AbortSignal | undefined;
  let rejectRequest!: (reason: unknown) => void;
  const request = new Promise((_resolve, reject) => { rejectRequest = reject; });
  const rpc = t.mock.method(supabase, 'rpc', () => ({
    abortSignal(nextSignal: AbortSignal) {
      signal = nextSignal;
      signal.addEventListener('abort', () => rejectRequest(
        new globalThis.DOMException('Aborted', 'AbortError'),
      ), { once: true });
      return this;
    },
    then: request.then.bind(request),
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
  const options = caixaReportQueryOptions(null, competencia, true);
  const result = client.fetchQuery(options).then(() => null, error => error);
  try {
    await tick();
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    await client.cancelQueries({ queryKey: options.queryKey });
    assert.equal(signal.aborted, true);
    assert.equal((await result).constructor.name, 'CancelledError');
    await tick();
    assert.equal(rpc.mock.callCount(), 1);
    assert.equal(client.getQueryData(options.queryKey), undefined);
  } finally { client.clear(); }
});

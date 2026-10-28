import assert from 'node:assert/strict';
import test from 'node:test';
import { progressRuntime } from './manual-cycle-progress-runtime.mjs';
import { QueryClient } from '@tanstack/react-query';

const { ui, cleanup } = await progressRuntime();
test.after(cleanup);
const identity = { matriculaId: 'enrollment', turmaId: 'class', cicloNumero: 2, requestId: 'request' };
const never = () => new Promise(() => {});
const progress = (issued = 13, review = 0) => ({
  ...identity, versao: 1, encontrado: true, observadoEm: '2026-10-27T16:33:36Z',
  ciclo: { numero: 2, status: 'LOCAL_CREATED', quantidadeItens: 13, quantidadeBancaria: 13, quantidadeLocal: 0,
    total: '3458.80', emitidosBanese: issued, pendentesEmissao: 13 - issued - review, emRevisao: review,
    recebiveis: Array.from({ length: 13 }, (_, index) => ({ id: `receipt-${index}`, chave: `item-${index}`,
      tipo: index === 0 ? 'REMATRICULA' : 'PARCELA', numero: index, descricao: 'Cobrança sintética',
      valor: index === 0 ? '100.00' : '279.90', vencimento: '2026-10-30', status: 'PENDENTE',
      destinoCobranca: 'BANESE', emissaoBanese: index < issued ? 'EMITIDO' : index < issued + review ? 'REVISAO_MANUAL' : 'PENDENTE' })),
  },
});

test('successful bank result finishes independently of a pending POST and workspace invalidation >4min', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let sends = 0; let reads = 0; let invalidations = 0;
  globalThis.sendCycle = () => { sends++; return never(); };
  globalThis.progressQueryClient = {
    fetchQuery: async () => { reads++; return ui.requireManualCycleObservation(progress(), identity); },
    invalidateQueries: () => { invalidations++; return never(); },
  };
  const mutation = ui.useGerarCicloFinanceiroTecnicoManual();
  const result = await mutation.mutationFn(identity);
  assert.equal(result.confirmadoPorConsulta, true);
  assert.equal(result.ciclo.emitidosBanese, 13);
  assert.equal(mutation.onSettled(result, null, identity), undefined);
  t.mock.timers.tick(240_001);
  assert.equal(sends, 1); assert.equal(reads, 1); assert.ok(invalidations > 0);
  assert.equal(ui.isManualCycleObservationActive(identity.turmaId), false);
  ui.forgetPendingCycleObservation(identity, null);
});

test('read failure preserves progress and never becomes a second bank POST', async () => {
  let sends = 0; let reads = 0;
  const result = await ui.observeManualCycleIssuance(() => { sends++; return never(); }, async () => {
    reads++;
    if (reads === 1) return progress(4);
    if (reads === 2) throw new Error('workspace/status 500');
    return progress();
  }, { intervalMs: 1, failureIntervalMs: 1, timeoutMs: 200 });
  assert.equal(result.ciclo.emitidosBanese, 13); assert.equal(sends, 1); assert.equal(reads, 3);
});

test('deadline reports uncertain outcome, not failure or success; never retries issuance', async () => {
  let sends = 0;
  await assert.rejects(ui.observeManualCycleIssuance(() => { sends++; return never(); }, never,
    { timeoutMs: 5 }), (error) => error.code === 'MANUAL_CYCLE_OUTCOME_UNCONFIRMED'
      && error.remoteOutcomeUnknown && /pode ter continuado/.test(error.message));
  assert.equal(sends, 1);
});

test('POST error after bank commit is reconciled only by a read', async () => {
  let sends = 0;
  const result = await ui.observeManualCycleIssuance(async () => { sends++; throw new Error('response lost'); },
    async () => progress(), { timeoutMs: 100 });
  assert.equal(result.ciclo.emitidosBanese, 13); assert.equal(sends, 1);
});

test('partial/review and unrelated operation never count as completed', () => {
  assert.equal(ui.observedCycleCompletion(progress(12, 1)), null);
  assert.equal(ui.observedCycleCompletion(progress(12)), null);
  assert.throws(() => ui.requireManualCycleObservation({ ...progress(), requestId: 'other' }, identity));
  assert.throws(() => ui.requireManualCycleObservation({ ...progress(), matriculaId: 'other' }, identity));
  const forged = progress(); forged.ciclo.recebiveis[0].emissaoBanese = 'PENDENTE';
  assert.equal(ui.observedCycleCompletion(forged), null);
});

const render = (props) => ui.renderToStaticMarkup(ui.React.createElement(ui.Progress, {
  alunoNome: 'Aluno sintético', matriculaExibicao: 'SYNTHETIC', cicloNumero: 2,
  quantidadeItens: 13, quantidadeBancaria: 13, emitidosBanese: 0, preparacaoConcluida: false,
  total: '3458.80', ...props,
}));

test('unknown progress is not displayed as zero; read failure keeps last confirmation and offers safe exit', () => {
  const unknown = render({ progressConfirmed: false, readError: 'Consulta indisponível', onClose() {} });
  assert.doesNotMatch(unknown.replace(/<[^>]+>/g, ''), /0\/13|0%/);
  assert.doesNotMatch(unknown, /aria-valuenow=/);
  assert.match(unknown, /Aguardando confirmação|Consulta indisponível/);
  const partial = render({ progressConfirmed: true, emitidosBanese: 4, pendingCount: 8, reviewCount: 1,
    observedAt: '2026-10-27T16:30:56Z', readError: 'Consulta falhou; últimos dados preservados', onClose() {} });
  assert.match(partial, /4\/13 títulos emitidos/); assert.match(partial, /8 títulos pendentes/);
  assert.match(partial, /1 em revisão/); assert.match(partial, /Última consulta confirmada/);
  assert.match(partial, /Sair do acompanhamento/); assert.match(partial, /não cancela nem repete/);
  assert.match(partial, /Tempo restante indisponível/);
});

test('read-only progress remount recovers completion without generation or resume', async () => {
  let sends = 0; let reads = 0;
  globalThis.sendCycle = () => { sends++; return never(); };
  globalThis.readProgressTransport = async (args) => {
    reads++; assert.equal(args[0], 'obter_progresso_ciclo_financeiro_tecnico_manual_secure');
    return { data: progress(), error: null };
  };
  globalThis.progressQueryState = { data: undefined, isError: false, isFetching: true, refetch() {} };
  let closed = 0;
  const props = { ...identity, alunoNome: 'Aluno', matriculaExibicao: 'TEST', quantidadeItens: 13,
    quantidadeBancaria: 13, total: '3458.80', onClose() { closed++; } };
  ui.renderToStaticMarkup(ui.React.createElement(ui.LiveProgress, props));
  const data = await globalThis.progressQueryOptions.queryFn();
  globalThis.progressQueryState = { data, isError: false, isFetching: false, refetch() {} };
  const remounted = ui.renderToStaticMarkup(ui.React.createElement(ui.LiveProgress, props));
  assert.match(remounted, /13\/13 títulos emitidos/); assert.match(remounted, /Emissão concluída/);
  assert.equal(typeof globalThis.progressViewProps.onClose, 'function');
  globalThis.progressViewProps.onClose();
  assert.equal(closed, 1);
  assert.equal(sends, 0); assert.equal(reads, 1);
});

test('LOCAL exclusivo não vira boleto nem percentual bancário', () => {
  const local = render({ cicloNumero: 1, quantidadeItens: 1, quantidadeBancaria: 0,
    emitidosBanese: 0, preparacaoConcluida: true, progressConfirmed: true,
    completionConfirmed: true, pendingCount: 0, reviewCount: 0 });
  assert.match(local, /Registro local confirmado; sem boleto bancário/);
  assert.match(local, /não é um boleto nem confirma pagamento/);
  assert.doesNotMatch(local.replace(/<[^>]+>/g, ''), /0\/0|0%|100%/);
  assert.doesNotMatch(local, /aria-valuenow=/);
});

test('revisão e prazo preservam contagem confirmada sem apresentar emissão ativa', () => {
  for (const state of [
    { reviewCount: 1, expected: /ciclo em revisão/ },
    { automaticCheckPaused: true, expected: /Acompanhamento do ciclo pausado/ },
  ]) {
    const paused = render({ emitidosBanese: 4, progressConfirmed: true,
      pendingCount: 8, reviewCount: 0, onCheck() {}, onClose() {}, ...state });
    assert.match(paused, /4\/13 títulos emitidos/);
    assert.match(paused, state.expected);
    assert.match(paused, /Consultar progresso/);
    assert.match(paused, /Sair do acompanhamento/);
    assert.doesNotMatch(paused, /Gerando e emitindo|animate-spin|Emissão concluída/);
  }
});

test('session recovery preserves only operation identity and refuses another operation/400 without POST', async () => {
  const entries = new Map();
  const port = { getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  ui.rememberPendingCycleObservation({ ...identity, revisao: { valor: 'not-to-be-persisted' } }, port);
  const recovered = ui.loadPendingCycleObservation(identity.turmaId, port);
  assert.equal(recovered.requestId, identity.requestId);
  assert.deepEqual(Object.keys(recovered).sort(), [...Object.keys(identity), 'startedAt'].sort());
  let sends = 0; globalThis.sendCycle = () => { sends++; return never(); };
  globalThis.readProgressTransport = async () => ({ data: { ...progress(), requestId: 'different-operation' }, error: null });
  await assert.rejects(ui.readManualCycleProgress(recovered), /não confirmou o progresso/);
  globalThis.readProgressTransport = async () => ({ data: null, error: { status: 400 } });
  await assert.rejects(ui.readManualCycleProgress(recovered), /não significa que a emissão falhou/);
  ui.forgetPendingCycleObservation({ ...identity, requestId: 'different-operation' }, port);
  assert.equal(ui.loadPendingCycleObservation(identity.turmaId, port).requestId, identity.requestId);
  assert.equal(sends, 0);
  ui.forgetPendingCycleObservation(identity, port);
  assert.equal(ui.loadPendingCycleObservation(identity.turmaId, port), null);
});

test('concurrent progress observers share one read and an aborted read cannot issue a bank command', async (t) => {
  const client = new QueryClient(); let reads = 0;
  let complete;
  globalThis.readProgressTransport = () => { reads++; return new Promise((resolve) => { complete = resolve; }); };
  const first = client.fetchQuery(ui.manualCycleProgressOptions(identity));
  const second = client.fetchQuery(ui.manualCycleProgressOptions(identity));
  assert.equal(reads, 1);
  complete({ data: progress(), error: null });
  assert.equal((await first).ciclo.emitidosBanese, 13);
  assert.equal((await second).ciclo.emitidosBanese, 13);
  client.clear();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  globalThis.readProgressTransport = (_args, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('read deadline')); });
  });
  const read = ui.readManualCycleProgress(identity);
  t.mock.timers.tick(12_000);
  await assert.rejects(read, /read deadline/);
  assert.equal(aborted, true);
});


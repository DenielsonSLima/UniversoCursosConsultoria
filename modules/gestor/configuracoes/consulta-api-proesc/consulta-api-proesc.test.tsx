import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import React from 'react';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { proescConsolePollingInterval, proescConsoleQueryPolicy } from './consulta-api-proesc.query-policy';
import { proescConsolePeriod, proescConsoleErrorMessage } from './consulta-api-proesc.filters';
import ProescOperationsFeed from './ProescOperationsFeed';
import ProescConsoleOverview, { ProescConsoleHeader } from './ProescConsoleOverview';
import type { ProescDashboard, ProescFeedPage, ProescObservation, ProescRun, ProescSettlement } from './consulta-api-proesc.types';

export const dashboardFixture: ProescDashboard = {
  available: true, configured: true, canViewReceivableDetails: true, historyStartedAt: '2026-09-12T22:00:00Z',
  selectedPoloId: null, polos: [{ id: 'polo-demo', name: 'Matriz' }],
  period: { startedFrom: '2026-09-01T00:00:00Z', startedTo: '2026-09-12T23:00:00Z' },
  monitor: { enabled: true, schedule: '*/2 * * * *', running: false, lastStartedAt: '2026-09-12T22:10:00Z', lastFinishedAt: '2026-09-12T22:10:19Z', lastDurationMs: 19000, lastCounts: { consulted: 60, applied: 2, unchanged: 58, review: 0, failed: 0 } },
  totals: { monitored: 6417, autoEnabled: 6417, observations: 120, appliedAuto: 2, appliedImport: 30, review: 4, failedRuns: 1, httpRequests: 8 },
};
export const observationFixture: ProescObservation = { id: 'observation-demo', observedAt: '2026-09-12T22:10:00Z', recordedAt: '2026-09-12T22:10:00Z', classId: 'class-demo', classCode: 'ENF-DEMO', className: 'Turma demonstrativa', poloId: 'polo-demo', poloName: 'Matriz', sourceStatus: 'UNKNOWN', verification: 'REVIEW', reviewReasons: ['PAYMENT_HISTORY_INCOMPLETE'], principalAmount: 279.9, receivedAmount: 0, paymentDate: null };
const makePage = <T,>(items: T[], page = 1, totalPages = 1): ProescFeedPage<T> => ({ items, page, pageSize: 20, totalCount: 41, totalPages });
const renderFeed = (context: 'observations' | 'settlements' | 'runs' | 'errors', data: ProescFeedPage, allowed = true) => renderToStaticMarkup(<ProescOperationsFeed context={context} data={data} loading={false} canViewReceivableDetails={allowed} onPageChange={() => {}} />);

test('overview uses server counters, distinguishes automatic and imported payments, and has no mutation controls', () => {
  const html = renderToStaticMarkup(<><ProescConsoleHeader /><ProescConsoleOverview data={dashboardFixture} /></>);
  assert.match(html, /Baixas automáticas/); assert.match(html, /Importações e correções/);
  assert.match(html, /6\.417/); assert.match(html, /19\.000 ms/);
  assert.doesNotMatch(html, /<button|token de acesso|Executar agora|Importar alunos/);
});
test('UNKNOWN remains in review and restricted financial details are not rendered', () => {
  const html = renderFeed('observations', makePage([observationFixture]), false);
  assert.match(html, /Em conferência/); assert.match(html, /Situação em conferência/);
  assert.doesNotMatch(html, /279,90|Valor principal|Em aberto na origem|Vencido/);
});
test('settlements explicitly preserve AUTO, IMPORT and CORRECTION provenance', () => {
  const rows = ['AUTO', 'IMPORT', 'CORRECTION'].map((mode) => ({ ...observationFixture, id: mode, mode, result: 'APPLIED', receivedAmount: 260, paymentDate: '2026-09-08' } as ProescSettlement));
  const html = renderFeed('settlements', makePage(rows));
  assert.match(html, /Baixa por Automação/); assert.match(html, /Baixa por Importação/); assert.match(html, /Baixa por Correção/);
  assert.match(html, /260,00/); assert.match(html, /08\/09\/2026/);
});
test('pagination uses RPC page and totalPages, and requests the next page without filtering items', () => {
  let requestedPage = 0;
  const tree = ProescOperationsFeed({ context: 'observations', data: makePage([observationFixture], 2, 8), loading: false, canViewReceivableDetails: false, onPageChange: (page) => { requestedPage = page; } });
  const findNext = (node: React.ReactNode): React.ReactElement<{ onClick: () => void }> | undefined => {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement<{ children?: React.ReactNode; 'aria-label'?: string; onClick: () => void }>(child)) continue;
      if (child.props['aria-label'] === 'Próxima página') return child;
      const found = findNext(child.props.children); if (found) return found;
    }
  };
  findNext(tree)?.props.onClick(); assert.equal(requestedPage, 3);
  assert.match(renderToStaticMarkup(tree), /Página 2 de 8/);
});
test('polo HTTP counters are explicitly unavailable for the selected scope', () => {
  const row: ProescRun = { id: 'run-demo', startedAt: '2026-09-12T22:10:00Z', finishedAt: null, status: 'RUNNING', durationMs: null, claimed: 6, consulted: 6, applied: 0, unchanged: 6, review: 0, failed: 0, httpRequests: null, httpFailed: null, errorCode: null, errorMessage: null, stage: null, telemetryComplete: false, metricsScope: 'POLO_ITEMS_SHARED_EXECUTION' };
  const html = renderFeed('runs', makePage([row]));
  assert.match(html, /Não disponível por polo/); assert.match(html, /Registro operacional incompleto/);
});
test('errors remain distinct from empty data, with canonical error message escaped', () => {
  const html = renderToStaticMarkup(<ProescOperationsFeed context="errors" loading={false} error="Falha na leitura" canViewReceivableDetails={false} onPageChange={() => {}} />);
  assert.match(html, /role="alert"/); assert.doesNotMatch(html, /Nenhum registro/);
  const row = { id: 'error-demo', runId: 'run-demo', recordedAt: '2026-09-12T22:10:00Z', stage: 'ACCOUNTING', errorCode: 'TIMEOUT', errorMessage: '<script>not executable</script>', httpStatus: 504 };
  const rendered = renderFeed('errors', makePage([row]));
  assert.match(rendered, /&lt;script&gt;/); assert.match(rendered, /HTTP 504/);
});


test('date conversion rejects invalid input before toISOString and preserves the default period', () => {
  assert.deepEqual(proescConsolePeriod('', ''), { startedFrom: null, startedTo: null });
  assert.throws(() => proescConsolePeriod('data inválida', ''), /Informe datas válidas/);
  assert.throws(() => proescConsolePeriod('', '999999-99-99'), /Informe datas válidas/);
  assert.equal(proescConsolePeriod('2026-09-12T10:00:00Z', '').startedFrom, '2026-09-12T10:00:00.000Z');
});
test('RPC errors use fixed local messages instead of raw server exceptions', () => {
  assert.match(proescConsoleErrorMessage('42501'), /Seu acesso não permite/);
  assert.match(proescConsoleErrorMessage('22023'), /até 31 dias/);
  assert.equal(proescConsoleErrorMessage('secret-token-and-database-details'), proescConsoleErrorMessage());
});
test('unknown received amount supplied as null by RPC is never displayed as zero', () => {
  const html = renderFeed('observations', makePage([{ ...observationFixture, receivedAmount: null }]));
  assert.match(html, /Não informado/);
  assert.doesNotMatch(html, /R\$[^<]*0,00/);
});


test('student and obligation identities are shown only with financial detail permission', () => {
  const item = { ...observationFixture, studentName: 'Aluno demonstrativo', description: 'Cobrança demonstrativa', externalKey: 'REF-DEMO' };
  const visible = renderFeed('observations', makePage([item]), true);
  const restricted = renderFeed('observations', makePage([item]), false);
  assert.match(visible, /Aluno demonstrativo/);
  assert.match(visible, /Cobrança demonstrativa/);
  assert.match(visible, /REF-DEMO/);
  assert.doesNotMatch(restricted, /Aluno demonstrativo|Cobrança demonstrativa|REF-DEMO/);
});


test('RPC failure suspends automatic polling, focus, reconnect and retry on remount', () => {
  assert.equal(proescConsolePollingInterval({ state: { status: 'error' } }), false);
  assert.equal(proescConsolePollingInterval({ state: { status: 'success' } }), 30_000);
  assert.equal(proescConsoleQueryPolicy.retry, false);
  assert.equal(proescConsoleQueryPolicy.retryOnMount, false);
  assert.equal(proescConsoleQueryPolicy.refetchOnWindowFocus, false);
  assert.equal(proescConsoleQueryPolicy.refetchOnReconnect, false);
});


test('successful cached data followed by error does not trigger a request on remount', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const queryKey = ['proesc-console', 'synthetic-remount-regression'];
  let calls = 0;
  let shouldFail = false;
  const options = {
    queryKey,
    queryFn: async () => {
      calls += 1;
      if (shouldFail) throw new Error('synthetic-failure');
      return { available: true };
    },
    ...proescConsoleQueryPolicy,
  };
  const first = new QueryObserver(client, options);
  const unsubscribe = first.subscribe(() => {});
  let unsubscribeRemount: (() => void) | undefined;
  try {
    await first.refetch();
    assert.equal(calls, 1);
    assert.equal(first.getCurrentResult().status, 'success');
    shouldFail = true;
    await first.refetch();
    assert.equal(calls, 2);
    assert.equal(first.getCurrentResult().status, 'error');
    assert.deepEqual(first.getCurrentResult().data, { available: true });
    unsubscribe();
    // O prazo expirado deve reproduzir a montagem com dados antigos.
    const remounted = new QueryObserver(client, { ...options, staleTime: 0 });
    unsubscribeRemount = remounted.subscribe(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(calls, 2, 'Montar novamente não pode repetir a consulta que falhou.');
    assert.equal(remounted.getCurrentResult().status, 'error');
    await remounted.refetch();
    assert.equal(calls, 3, 'Uma tentativa explícita do usuário continua disponível.');
  } finally {
    unsubscribe();
    unsubscribeRemount?.();
    client.clear();
  }
});


test('legacy global execution keeps missing HTTP metrics unrecorded, not unavailable by polo', () => {
  const row: ProescRun = {
    id: 'global-legacy-demo', startedAt: '2026-09-12T22:10:00Z',
    finishedAt: '2026-09-12T22:10:19Z', status: 'SUCCEEDED', durationMs: 19000,
    claimed: 6, consulted: 6, applied: 0, unchanged: 6, review: 0, failed: 0,
    httpRequests: null, httpFailed: null, errorCode: null, errorMessage: null,
    stage: null, telemetryComplete: false, metricsScope: 'GLOBAL',
  };
  const html = renderFeed('runs', makePage([row]));
  assert.match(html, /Não registrado/);
  assert.match(html, /Registro operacional incompleto/);
  assert.doesNotMatch(html, /Não disponível por polo/);
});

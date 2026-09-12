import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { financeiroQueryKeys } from '../../../financeiro.queryKeys';
import { ReceivablesPeriodFilter } from './ReceivablesPeriodFilter';
import { ReceivablesSummaryCards } from './ReceivablesSummaryCards';
import { useModalidadeReceberReport, type ModalidadeReceberReport } from './useModalidadeReceberReport';
import type { ReceivablesScope } from './receivables-period';

const period = { preset: 'CUSTOM' as const, start: '2026-09-01', end: '2026-09-30' };
const summary = {
  pendingCount: 43, pendingValue: 12000, receivedCount: 5, receivedValue: 1300,
  overdueCount: 0, overdueValue: 0, canceledCount: 3, canceledValue: 780,
  allCount: 52, allValue: 15600,
};

test('Recebidos identifica pagamento no período personalizado e mantém vencimento nas demais situações', () => {
  for (const scope of ['received', 'pending', 'upcoming', 'overdue', 'canceled', 'all'] as ReceivablesScope[]) {
    const html = renderToStaticMarkup(
      <ReceivablesPeriodFilter period={period} scope={scope} error={null} onChange={() => {}} />,
    );
    const label = scope === 'received' ? 'Pagamento' : 'Vencimento';
    assert.ok(html.includes(`aria-label="${label} inicial"`));
    assert.ok(html.includes(`aria-label="${label} final"`));
    assert.ok(html.includes(`Período de ${label.toLowerCase()}`));
    assert.ok(html.includes('value="2026-09-01"'));
    assert.ok(html.includes('value="2026-09-30"'));
  }
});

test('card exibe cinco recebimentos canônicos sem recompor o total pela carteira de vencimentos', () => {
  const state = { data: summary, loading: false, error: false };
  const html = renderToStaticMarkup(
    <ReceivablesSummaryCards summary={state} upcoming={state} scope="received" disabled={false} onScopeChange={() => {}} />,
  );
  assert.match(html, /Recebido no período/);
  assert.match(html, /5 cobrança\(s\)/);
  assert.match(html, /1\.300,00/);
  assert.match(html, /Pela data do pagamento/);
  assert.match(html, /As demais situações consideram o vencimento/);
});

const readReport = (statusScope: 'received' | 'pending') => {
  let report: ModalidadeReceberReport | undefined;
  function ReportProbe() {
    report = useModalidadeReceberReport({
      modality: 'TECNICO', poloId: 'polo-test', title: 'Técnico', search: '', debouncedSearch: '',
      dueStart: period.start, dueEnd: period.end, statusScope, turmaId: '', turmaLabel: '',
      kpis: { total: 15600, recebido: 1300, aReceber: 12000, vencidos: 0 },
      statusCounts: { pending: 43, received: 5, overdue: 0, canceled: 3, all: 52 },
      toast: { error: () => {} },
    });
    return null;
  }
  renderToStaticMarkup(<ReportProbe />);
  assert.ok(report);
  return report;
};

test('relatório de recebidos usa pagamento e valor canônico, sem misturar totais por vencimento', () => {
  const report = readReport('received');
  assert.ok(report.filters.some((filter) => filter.label === 'Pagamento'));
  assert.ok(!report.filters.some((filter) => filter.label === 'Vencimento'));
  assert.equal(report.summaryCards.length, 1);
  assert.equal(report.summaryCards[0].label, 'Recebido pela data do pagamento');
  assert.match(String(report.summaryCards[0].value), /1\.300,00/);
  assert.ok(report.filters.some((filter) => filter.label === 'Registros' && filter.value === '5 cobrança(s)'));

  const pending = readReport('pending');
  assert.ok(pending.filters.some((filter) => filter.label === 'Vencimento'));
  assert.equal(pending.summaryCards[0].label, 'Total previsto por vencimento');
  assert.equal(pending.summaryCards[1].label, 'Recebido pela data do pagamento');
});

test('resumo, grupos e detalhes compartilham nova versão de cache preservando filtros', () => {
  const filters = { poloId: 'polo-test', dueStart: period.start, dueEnd: period.end, statusScope: 'received' as const, groupMode: 'student' as const, page: 1, pageSize: 10 };
  const keys = [
    financeiroQueryKeys.receivablesModalitySummary('TECNICO', filters),
    financeiroQueryKeys.receivablesPageByModality('TECNICO', filters),
    financeiroQueryKeys.receivablesGroupsByModality('TECNICO', filters),
    financeiroQueryKeys.receivablesGroupItems('TECNICO', filters),
  ];
  for (const key of keys) {
    assert.equal(key[3], 'received-payment-period-v1');
    assert.deepEqual(key.at(-1), filters);
  }
});

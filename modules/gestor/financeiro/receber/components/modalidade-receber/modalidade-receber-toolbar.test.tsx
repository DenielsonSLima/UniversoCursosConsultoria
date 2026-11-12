import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalidadeReceberToolbar } from './ModalidadeReceberToolbar';
import { getReceivablesPeriod } from './receivables-period';

const noop = () => {};
const base: React.ComponentProps<typeof ModalidadeReceberToolbar> = {
  modality: 'TECNICO', title: 'Cursos Técnicos', description: 'Descrição genérica redundante',
  icon: null, accentLabel: 'Recebíveis técnicos',
  summary: { loading: false, error: false }, upcoming: { loading: false, error: false },
  period: getReceivablesPeriod('CURRENT_MONTH', new Date('2026-11-06T12:00:00Z')),
  periodError: null, statusCounts: { pending: 0, received: 0, overdue: 0, canceled: 0, all: 0 },
  statusScope: 'pending', search: '', turmaId: 'turma-42', turmasLoading: false,
  turmas: [{ id: 'turma-42', nome: 'Enfermagem', codigo: 'ENF-42' }], viewMode: 'table',
  report: { columns: [], rows: [], filters: [], summaryCards: [], reportPoloId: undefined, loadReceivables: async () => {} },
  isLoading: false, onStatusScopeChange: noop, onSearchChange: noop, onPeriodChange: noop,
  onTurmaIdChange: noop, onViewModeChange: noop, onClearFilters: noop,
};
const render = (changes: Partial<typeof base> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><ModalidadeReceberToolbar {...base} {...changes} /></QueryClientProvider>);
  client.clear();
  return html;
};

test('turma usa combobox canônico e preserva período, avisos e ações sem cabeçalho repetido', () => {
  const html = render();
  assert.match(html, /role="combobox"[^>]*aria-label="Filtrar por turma ativa"/);
  assert.match(html, /value="Enfermagem · ENF-42"/);
  assert.doesNotMatch(html, /<select|Recebíveis técnicos|Descrição genérica redundante|<h4/);
  assert.match(html, /Recebido considera o vencimento da parcela/);
  assert.match(html, /Situação das contas a receber/);
  assert.match(html, /Redefinir filtros/);
  assert.doesNotMatch(html, /Este mês|Mês anterior|Últimos 30 dias|Todo o período|Personalizado|Vencimentos de/);
  assert.match(html, /<input[^>]*type="date"[^>]*aria-label="Data inicial"[^>]*value="2026-11-01"/);
  assert.match(html, /<input[^>]*type="date"[^>]*aria-label="Data final"[^>]*value="2026-11-30"/);
});

test('mantém indicadores antes das situações e ações, seguidos de busca, datas e turma', () => {
  const html = render();
  const markers = [
    'Pago das parcelas do período',
    'Em aberto, vence hoje ou depois',
    'Parcelas vencidas no período',
    'aria-label="Situação das contas a receber"',
    'title="Tabela"',
    'title="Cards"',
    'placeholder="Aluno, turma, CPF ou cobrança..."',
    'aria-label="Data inicial"',
    'aria-label="Data final"',
    'aria-label="Filtrar por turma ativa"',
  ];
  let previousPosition = -1;
  for (const marker of markers) {
    const position = html.indexOf(marker);
    assert.ok(position > previousPosition, `Ordem incorreta ou elemento ausente: ${marker}`);
    previousPosition = position;
  }
});

test('intervalo inválido identifica os dois campos e mantém alerta sem exibir total', () => {
  const message = 'A data inicial não pode ser posterior à data final.';
  const html = render({
    period: { preset: 'CUSTOM', start: '2026-11-30', end: '2026-11-01' },
    periodError: message,
  });
  const dateInputs = html.match(/<input[^>]*type="date"[^>]*>/g) || [];
  assert.equal(dateInputs.length, 2);
  const alertId = html.match(/<p id="([^"]+)" role="alert"/);
  assert.ok(alertId);
  assert.match(html, new RegExp(`role="alert"[^>]*>${message}</p>`));
  for (const input of dateInputs) {
    assert.match(input, /aria-invalid="true"/);
    assert.ok(input.includes(`aria-describedby="${alertId[1]}"`));
  }
  assert.doesNotMatch(html, /<p role="status"|cobrança\(s\) no filtro|Atualizando total/);
});

test('carregamento das turmas bloqueia apenas o seletor e mantém aviso operacional', () => {
  const html = render({ turmaId: '', turmasLoading: true });
  assert.match(html, /<input[^>]*role="combobox"[^>]*disabled=""/);
  assert.match(html, /Carregando turmas/);
  assert.match(html, /Recebido considera o vencimento da parcela/);
});

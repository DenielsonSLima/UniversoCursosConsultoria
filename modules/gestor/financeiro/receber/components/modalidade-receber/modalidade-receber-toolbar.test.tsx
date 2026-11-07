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
  assert.match(html, /Situação das contas a receber|Redefinir filtros/);
  assert.match(html, /Este mês/);
});

test('carregamento das turmas bloqueia apenas o seletor e mantém aviso operacional', () => {
  const html = render({ turmaId: '', turmasLoading: true });
  assert.match(html, /<input[^>]*role="combobox"[^>]*disabled=""/);
  assert.match(html, /Carregando turmas/);
  assert.match(html, /Recebido considera o vencimento da parcela/);
});

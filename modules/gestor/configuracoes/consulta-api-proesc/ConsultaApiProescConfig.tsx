import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ProescConsoleOverview, {
  ProescConsoleHeader,
  proescDateTime,
} from './ProescConsoleOverview';
import ProescOperationsFeed from './ProescOperationsFeed';
import { consultaApiProescService, proescConsoleKey } from './consulta-api-proesc.service';
import { proescConsoleQueryPolicy } from './consulta-api-proesc.query-policy';
import { proescConsolePeriod } from './consulta-api-proesc.filters';
import type { ProescConsoleFilters, ProescConsoleTab } from './consulta-api-proesc.types';

export const proescConsoleTabs: Array<{ id: ProescConsoleTab; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'runs', label: 'Execuções' },
  { id: 'observations', label: 'Consultas' },
  { id: 'settlements', label: 'Baixas' },
  { id: 'errors', label: 'Erros' },
];

export const proescConsoleInitialFilters: ProescConsoleFilters = {
  poloId: null,
  startedFrom: null,
  startedTo: null,
};

export default function ConsultaApiProescConfig() {
  const [tab, setTab] = useState<ProescConsoleTab>('overview');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(proescConsoleInitialFilters);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);

  const dashboard = useQuery({
    queryKey: [...proescConsoleKey, 'dashboard', filters],
    queryFn: () => consultaApiProescService.dashboard(filters),
    ...proescConsoleQueryPolicy,
  });
  const context = tab === 'overview' ? 'runs' : tab;
  const feed = useQuery({
    queryKey: [...proescConsoleKey, 'feed', context, filters, page],
    queryFn: () => consultaApiProescService.feed(context, filters, page),
    enabled: tab !== 'overview' && dashboard.data?.available === true && !dashboard.isError,
    ...proescConsoleQueryPolicy,
  });

  const changeFilters = (value: ProescConsoleFilters) => {
    setFilters(value);
    setPage(1);
    setFilterError(null);
  };
  const changeTab = (value: ProescConsoleTab) => {
    setTab(value);
    setPage(1);
  };
  const applyPeriod = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      changeFilters({ ...filters, ...proescConsolePeriod(draftFrom, draftTo) });
    } catch {
      setFilterError('Informe datas válidas para filtrar o período.');
    }
  };
  const resetPeriod = () => {
    changeFilters(proescConsoleInitialFilters);
    setDraftFrom('');
    setDraftTo('');
    if (!filters.poloId && !filters.startedFrom && !filters.startedTo) {
      void dashboard.refetch();
    }
  };

  return (
    <div className="min-w-0 space-y-6">
      <ProescConsoleHeader />
      {dashboard.isError ? (
        <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          <p>{dashboard.error.message}</p>
          <button
            type="button"
            onClick={resetPeriod}
            className="mt-3 min-h-11 rounded-xl border border-rose-200 px-4 font-bold"
          >
            Retornar ao período padrão
          </button>
        </div>
      ) : !dashboard.data ? (
        <p role="status" className="p-6 text-sm text-slate-500">Carregando acompanhamento…</p>
      ) : !dashboard.data.available ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          O acompanhamento Proesc não está disponível para este acesso.
        </p>
      ) : (
        <>
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seções da consulta Proesc">
            {proescConsoleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={tab === item.id}
                onClick={() => changeTab(item.id)}
                className={`min-h-11 shrink-0 rounded-xl px-4 text-[10px] font-black uppercase tracking-wider ${
                  tab === item.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'border border-slate-200 text-slate-500 hover:text-blue-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <form
            onSubmit={applyPeriod}
            className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <label className="min-w-0 text-xs font-bold text-slate-600">
              Polo
              <select
                value={filters.poloId || ''}
                onChange={(event) => changeFilters({ ...filters, poloId: event.target.value || null })}
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
              >
                <option value="">Todos os polos</option>
                {dashboard.data.polos.map((polo) => (
                  <option key={polo.id} value={polo.id}>{polo.name}</option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-xs font-bold text-slate-600">
              Início do período
              <input
                type="datetime-local"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
                className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
              />
            </label>
            <label className="min-w-0 text-xs font-bold text-slate-600">
              Fim do período
              <input
                type="datetime-local"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
                className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 self-end rounded-xl bg-[#001a33] px-4 text-xs font-bold text-white"
            >
              Filtrar registros
            </button>
            {filterError && (
              <p role="alert" className="text-sm text-rose-700 sm:col-span-2 xl:col-span-4">
                {filterError}
              </p>
            )}
            <p className="text-xs leading-relaxed text-slate-500 sm:col-span-2 xl:col-span-4">
              Período de até 31 dias. Exibindo {proescDateTime(dashboard.data.period.startedFrom)} a{' '}
              {proescDateTime(dashboard.data.period.startedTo)}.
            </p>
          </form>
          <aside className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-relaxed text-blue-900">
            {dashboard.data.historyStartedAt
              ? `Histórico detalhado de execuções e requisições disponível a partir de ${proescDateTime(dashboard.data.historyStartedAt)}. `
              : 'O histórico detalhado começará com as próximas execuções registradas. '}
            Observações e baixas anteriores podem aparecer nas respectivas abas.
            Os registros são atualizados automaticamente.
          </aside>
          {tab === 'overview' ? (
            <ProescConsoleOverview data={dashboard.data} />
          ) : (
            <ProescOperationsFeed
              context={context}
              data={feed.data}
              loading={feed.isFetching}
              error={feed.error?.message}
              canViewReceivableDetails={dashboard.data.canViewReceivableDetails}
              onPageChange={setPage}
              onRetry={() => { void feed.refetch(); }}
            />
          )}
        </>
      )}
    </div>
  );
}

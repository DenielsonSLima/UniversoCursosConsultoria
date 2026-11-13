import React from 'react';
import { LayoutGrid, Search, Table2 } from 'lucide-react';
import FinancialUnderlineTabs from '../../components/FinancialUnderlineTabs';
import { ReceivablesSummaryCards, ReceivablesResultTotal } from '../components/modalidade-receber/ReceivablesSummaryCards';
import { ReceivablesPeriodFilter } from '../components/modalidade-receber/ReceivablesPeriodFilter';
import type { ReceivablesScope } from '../components/modalidade-receber/receivables-period';
import type { ServiceStatusScope } from './servicos-receber.contract';
import type { useServicosReceber } from './useServicosReceber';
import { ReceberActions } from '../components/ReceberActions';
import FinancialReportExportButton from '../../components/FinancialReportPreview';
import { serviceReportColumns, useServiceReceivablesReport } from './useServiceReceivablesReport';

const uiScope: Record<ServiceStatusScope, ReceivablesScope> = {
  PENDING: 'pending', UPCOMING: 'upcoming', RECEIVED: 'received', OVERDUE: 'overdue', CANCELLED: 'canceled', ALL: 'all',
};
const serviceScope: Record<ReceivablesScope, ServiceStatusScope> = {
  pending: 'PENDING', upcoming: 'UPCOMING', received: 'RECEIVED', overdue: 'OVERDUE', canceled: 'CANCELLED', all: 'ALL',
};

export function ServiceReceivablesToolbar({ model: m }: { model: ReturnType<typeof useServicosReceber> }) {
  const pendingSearch = m.search.trim() !== m.debouncedSearch;
  const summary = { data: m.summary.data, loading: m.summary.isPending || m.summary.isFetching || pendingSearch, error: m.summary.isError };
  const upcoming = { data: m.upcoming.data, loading: m.upcoming.isPending || m.upcoming.isFetching || pendingSearch, error: m.upcoming.isError };
  const counts = m.summary.data, activeScope = uiScope[m.statusScope];
  const unavailable = summary.loading || summary.error || Boolean(m.periodError);
  const report = useServiceReceivablesReport({ poloId: m.poloId,
    search: m.debouncedSearch, dueStart: m.period.start, dueEnd: m.period.end, statusScope: m.statusScope });
  return <>
    <ReceivablesSummaryCards summary={summary} upcoming={upcoming} scope={activeScope}
      disabled={Boolean(m.periodError)} onScopeChange={scope => m.setStatusScope(serviceScope[scope])}
      filterDescription="parceiro, serviço e vencimento" />
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <FinancialUnderlineTabs compact value={m.statusScope} onChange={m.setStatusScope} ariaLabel="Situação financeira dos serviços"
          indicatorClassName="bg-emerald-600" activeIconClassName="text-emerald-600" items={[
            { id: 'PENDING', label: 'Pendentes', badge: unavailable ? undefined : counts?.pendingCount },
            { id: 'UPCOMING', label: 'A vencer', badge: upcoming.loading || upcoming.error || m.periodError ? undefined : upcoming.data?.pendingCount },
            { id: 'RECEIVED', label: 'Recebidos', badge: unavailable ? undefined : counts?.receivedCount },
            { id: 'OVERDUE', label: 'Vencidos', badge: unavailable ? undefined : counts?.overdueCount },
            { id: 'CANCELLED', label: 'Cancelados', badge: unavailable ? undefined : counts?.canceledCount },
            { id: 'ALL', label: 'Todos', badge: unavailable ? undefined : counts?.allCount },
          ]} />
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ReceberActions><FinancialReportExportButton title="Extrato de Cobranças - Serviços"
          subtitle="Serviços NFS-e, parcelas e recebimentos conforme os filtros selecionados."
          rightTitle="Extrato de Cobranças" rightType="Serviços"
          fileName={`extrato-cobrancas-servicos-${new Date().toISOString().slice(0, 10)}`}
          columns={serviceReportColumns} rows={report.rows} filters={report.filters} summaryCards={report.summaryCards}
          footerNote="Valores e situações provenientes do snapshot financeiro canônico."
          poloId={report.poloId} issuedAt={report.issuedAt} tone="emerald"
          disabled={m.list.isPending || Boolean(m.periodError) || summary.loading || summary.error || !summary.data
            || (m.statusScope === 'UPCOMING' && (upcoming.loading || upcoming.error || !upcoming.data))}
          onBeforeOpen={async () => {
            try { await report.load(); }
            catch (failure) { m.toast.error('Erro ao preparar o extrato', failure instanceof Error ? failure.message : 'Não foi possível carregar o extrato completo.'); throw failure; }
          }} /></ReceberActions>
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Apresentação dos serviços">
        <button type="button" onClick={() => m.setViewMode('table')} title="Tabela" aria-pressed={m.viewMode === 'table'}
          className={`rounded-lg p-2 transition-all ${m.viewMode === 'table' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><Table2 size={15} /></button>
        <button type="button" onClick={() => m.setViewMode('cards')} title="Cards" aria-pressed={m.viewMode === 'cards'}
          className={`rounded-lg p-2 transition-all ${m.viewMode === 'cards' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={15} /></button>
      </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" aria-label="Buscar serviços" maxLength={200} placeholder="Parceiro, serviço ou NFS-e..."
          value={m.search} onChange={event => m.setSearch(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500" />
      </div>
      <ReceivablesPeriodFilter period={m.period} error={m.periodError} onChange={m.setPeriod} />
      {m.search || m.period.preset !== 'CURRENT_MONTH' || m.statusScope !== 'PENDING' ? <button type="button" onClick={m.clearFilters}
        className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase text-slate-500 transition-colors hover:bg-slate-200">Redefinir filtros</button> : null}
    </div>
    {!m.periodError ? <ReceivablesResultTotal scope={activeScope} state={activeScope === 'upcoming' ? upcoming : summary} /> : null}
  </>;
}

import FinancialSelect from '../../../components/FinancialSelect';
import { ReceberActions } from '../ReceberActions';
import React, { type ReactNode } from 'react';
import { LayoutGrid, Search, Table2 } from 'lucide-react';
import FinancialReportExportButton from '../../../components/FinancialReportPreview';
import type {
  CourseModality,
  ReceivableStatusCounts,
  ViewMode,
} from './modalidade-receber.types';
import type { ModalidadeReceberReport } from './useModalidadeReceberReport';
import FinancialUnderlineTabs from '../../../components/FinancialUnderlineTabs';
import { ReceivablesPeriodFilter } from './ReceivablesPeriodFilter';
import { ReceivablesSummaryCards, ReceivablesResultTotal, type ReceivablesSummaryState } from './ReceivablesSummaryCards';
import type { ReceivablesPeriod, ReceivablesScope } from './receivables-period';

interface ModalidadeReceberToolbarProps {
  modality: CourseModality;
  title: string;
  description: string;
  icon: ReactNode;
  accentLabel: string;
  summary: ReceivablesSummaryState;
  upcoming: ReceivablesSummaryState;
  period: ReceivablesPeriod;
  periodError: string | null;
  statusCounts: ReceivableStatusCounts;
  statusScope: ReceivablesScope;
  search: string;
  turmaId: string;
  turmas: Array<{ id: string; nome: string; codigo?: string | null }>;
  turmasLoading: boolean;
  viewMode: ViewMode;
  report: ModalidadeReceberReport;
  isLoading: boolean;
  onStatusScopeChange: (statusScope: ReceivablesScope) => void;
  onSearchChange: (search: string) => void;
  onPeriodChange: (period: ReceivablesPeriod) => void;
  onTurmaIdChange: (turmaId: string) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
  onClearFilters: () => void;
}

export const ModalidadeReceberToolbar: React.FC<ModalidadeReceberToolbarProps> = ({
  modality,
  title,
  summary,
  upcoming,
  period,
  periodError,
  statusCounts,
  statusScope,
  search,
  turmaId,
  turmas,
  turmasLoading,
  viewMode,
  report,
  isLoading,
  onStatusScopeChange,
  onSearchChange,
  onPeriodChange,
  onTurmaIdChange,
  onViewModeChange,
  onClearFilters,
}) => (
  <>
    <ReceivablesSummaryCards
      summary={summary}
      upcoming={upcoming}
      scope={statusScope}
      disabled={Boolean(periodError)}
      onScopeChange={onStatusScopeChange}
    />

    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <FinancialUnderlineTabs
          compact
          items={[
            { id: 'pending' as const, label: 'Pendentes', badge: summary.loading || summary.error || periodError ? undefined : statusCounts.pending },
            { id: 'upcoming' as const, label: 'A vencer', badge: upcoming.loading || upcoming.error || periodError ? undefined : upcoming.data?.pendingCount },
            { id: 'received' as const, label: 'Recebidos', badge: summary.loading || summary.error || periodError ? undefined : statusCounts.received },
            { id: 'overdue' as const, label: 'Vencidos', badge: summary.loading || summary.error || periodError ? undefined : statusCounts.overdue },
            { id: 'canceled' as const, label: 'Cancelados', badge: summary.loading || summary.error || periodError ? undefined : statusCounts.canceled },
            { id: 'all' as const, label: 'Todos', badge: summary.loading || summary.error || periodError ? undefined : statusCounts.all },
          ]}
          value={statusScope}
          onChange={onStatusScopeChange}
          ariaLabel="Situação das contas a receber"
          indicatorClassName="bg-emerald-600"
          activeIconClassName="text-emerald-600"
        />
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ReceberActions>
          <FinancialReportExportButton
            title={`Extrato de Cobranças - ${title}`}
            subtitle="Cobranças, parcelas e recebimentos conforme os filtros selecionados."
            rightTitle="Extrato de Cobranças"
            rightType={title}
            fileName={`extrato-cobrancas-${modality.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`}
            columns={report.columns}
            rows={report.rows}
            filters={report.filters}
            summaryCards={report.summaryCards}
            poloId={report.reportPoloId}
            tone="emerald"
            onBeforeOpen={report.loadReceivables}
            disabled={isLoading || Boolean(periodError) || summary.loading || summary.error || !summary.data || (statusScope === 'upcoming' && (upcoming.loading || upcoming.error || !upcoming.data))}
          />
        </ReceberActions>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => onViewModeChange('table')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'table' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            title="Tabela"
          >
            <Table2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('cards')}
            className={`rounded-lg p-2 transition-all ${viewMode === 'cards' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            title="Cards"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Aluno, turma, CPF ou cobrança..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <ReceivablesPeriodFilter period={period} error={periodError} onChange={onPeriodChange} />

      <FinancialSelect
        value={turmaId}
        onValueChange={onTurmaIdChange}
        options={[{ value: '', label: turmasLoading ? 'Carregando turmas...' : 'Todas as turmas' }, ...turmas.map(turma => ({ value: turma.id, label: turma.codigo ? `${turma.nome} · ${turma.codigo}` : turma.nome, keywords: `${turma.id} ${turma.codigo || ''}` }))]}
        ariaLabel="Filtrar por turma ativa"
        placeholder="Todas as turmas"
        disabled={turmasLoading}
        loading={turmasLoading}
        className="w-full min-w-0 sm:w-[280px]"
      />

      {search || period.preset !== 'CURRENT_MONTH' || turmaId || statusScope !== 'pending' ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase text-slate-500 transition-colors hover:bg-slate-200"
        >
          Redefinir filtros
        </button>
      ) : null}
    </div>

    {!periodError ? <ReceivablesResultTotal scope={statusScope} state={statusScope === 'upcoming' ? upcoming : summary} /> : null}
  </>
);

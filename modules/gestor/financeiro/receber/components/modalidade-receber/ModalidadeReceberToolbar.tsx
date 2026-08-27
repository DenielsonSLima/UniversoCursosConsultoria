import React, { type ReactNode } from 'react';
import { LayoutGrid, Search, Table2 } from 'lucide-react';
import FinancialReportExportButton from '../../../components/FinancialReportPreview';
import type {
  CourseModality,
  GroupMode,
  ReceivableKpis,
  ReceivableStatusCounts,
  StatusScope,
  ViewMode,
} from './modalidade-receber.types';
import type { ModalidadeReceberReport } from './useModalidadeReceberReport';
import { formatCurrency } from './modalidade-receber.utils';
import FinancialUnderlineTabs from '../../../components/FinancialUnderlineTabs';

interface ModalidadeReceberToolbarProps {
  modality: CourseModality;
  title: string;
  description: string;
  icon: ReactNode;
  accentLabel: string;
  kpis: ReceivableKpis;
  statusCounts: ReceivableStatusCounts;
  statusScope: StatusScope;
  search: string;
  dueStart: string;
  dueEnd: string;
  groupMode: GroupMode;
  viewMode: ViewMode;
  report: ModalidadeReceberReport;
  isLoading: boolean;
  onStatusScopeChange: (statusScope: StatusScope) => void;
  onSearchChange: (search: string) => void;
  onDueStartChange: (date: string) => void;
  onDueEndChange: (date: string) => void;
  onGroupModeChange: (groupMode: GroupMode) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
  onClearFilters: () => void;
}

export const ModalidadeReceberToolbar: React.FC<ModalidadeReceberToolbarProps> = ({
  modality,
  title,
  description,
  icon,
  accentLabel,
  kpis,
  statusCounts,
  statusScope,
  search,
  dueStart,
  dueEnd,
  groupMode,
  viewMode,
  report,
  isLoading,
  onStatusScopeChange,
  onSearchChange,
  onDueStartChange,
  onDueEndChange,
  onGroupModeChange,
  onViewModeChange,
  onClearFilters,
}) => (
  <>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-emerald-600">
          {icon}
          <span className="text-xs font-black uppercase tracking-[0.18em]">{accentLabel}</span>
        </div>
        <h4 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">{title}</h4>
        <p className="text-xs font-medium text-slate-500">{description}</p>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: 'Total Previsto', value: formatCurrency(kpis.total), color: 'text-[#001a33]' },
        { label: 'Recebido', value: formatCurrency(kpis.recebido), color: 'text-emerald-600' },
        { label: 'A Receber', value: formatCurrency(kpis.aReceber), color: 'text-amber-600' },
        { label: 'Vencidos', value: `${kpis.vencidos}`, color: 'text-rose-600' },
      ].map((kpi) => (
        <div key={kpi.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="mb-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{kpi.label}</p>
          <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
        </div>
      ))}
    </div>

    <FinancialUnderlineTabs
      items={[
        { id: 'pending' as const, label: 'Pendentes', badge: statusCounts.pending, badgeClassName: 'bg-emerald-50 text-emerald-700' },
        { id: 'received' as const, label: 'Recebidos', badge: statusCounts.received, badgeClassName: 'bg-emerald-50 text-emerald-700' },
        { id: 'overdue' as const, label: 'Vencidos', badge: statusCounts.overdue, badgeClassName: 'bg-emerald-50 text-emerald-700' },
        { id: 'canceled' as const, label: 'Cancelados', badge: statusCounts.canceled, badgeClassName: 'bg-emerald-50 text-emerald-700' },
        { id: 'all' as const, label: 'Todos', badge: statusCounts.all, badgeClassName: 'bg-emerald-50 text-emerald-700' },
      ]}
      value={statusScope}
      onChange={onStatusScopeChange}
      ariaLabel="Situação das contas a receber"
      indicatorClassName="bg-emerald-600"
      activeIconClassName="text-emerald-600"
    />

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Aluno, turma, CPF ou cobrança..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <input
        type="date"
        value={dueStart}
        onChange={(event) => onDueStartChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none transition-all focus:ring-2 focus:ring-emerald-500"
        title="Vencimento Inicial"
      />
      <input
        type="date"
        value={dueEnd}
        onChange={(event) => onDueEndChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none transition-all focus:ring-2 focus:ring-emerald-500"
        title="Vencimento Final"
      />
      <select
        value={groupMode}
        onChange={(event) => onGroupModeChange(event.target.value as GroupMode)}
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none transition-all focus:ring-2 focus:ring-emerald-500"
      >
        <option value="student">Agrupar por aluno</option>
        <option value="class">Agrupar por turma</option>
        <option value="none">Sem agrupamento</option>
      </select>

      {search || dueStart || dueEnd ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase text-slate-500 transition-colors hover:bg-slate-200"
        >
          Limpar
        </button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
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
          disabled={isLoading}
        />
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
  </>
);

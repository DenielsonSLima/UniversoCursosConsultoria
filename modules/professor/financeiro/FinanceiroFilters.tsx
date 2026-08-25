import React from 'react';
import {
  CalendarDays,
  Filter,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';
import type {
  ProfessorFinancialListPayload,
  ProfessorFinancialStatus,
  ProfessorFinancialViewMode,
} from './financeiro.types';

interface FinanceiroFiltersProps {
  search: string;
  startDate: string;
  endDate: string;
  category: string;
  status: ProfessorFinancialStatus;
  viewMode: ProfessorFinancialViewMode;
  categories: string[];
  counts: ProfessorFinancialListPayload['filters']['counts'];
  onSearchChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: ProfessorFinancialStatus) => void;
  onViewModeChange: (value: ProfessorFinancialViewMode) => void;
}

const statusTabs: Array<{ key: ProfessorFinancialStatus; label: string }> = [
  { key: 'ABERTO', label: 'Em aberto' },
  { key: 'ATRASADO', label: 'Atrasado' },
  { key: 'PAGO', label: 'Pagos' },
  { key: 'TODOS', label: 'Todos' },
];

const FinanceiroFilters: React.FC<FinanceiroFiltersProps> = ({
  search,
  startDate,
  endDate,
  category,
  status,
  viewMode,
  categories,
  counts,
  onSearchChange,
  onStartDateChange,
  onEndDateChange,
  onCategoryChange,
  onStatusChange,
  onViewModeChange,
}) => (
  <>
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">
          Histórico de honorários
        </h3>
        <p className="mt-1 text-[10px] font-medium text-slate-400">
          Filtros, totais e paginação processados no servidor.
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
        <button
          type="button"
          title="Visualização em tabela"
          onClick={() => onViewModeChange('table')}
          className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
            viewMode === 'table'
              ? 'bg-[#001a33] text-white shadow'
              : 'border border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          title="Visualização em cards"
          onClick={() => onViewModeChange('cards')}
          className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
            viewMode === 'cards'
              ? 'bg-[#001a33] text-white shadow'
              : 'border border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          <LayoutGrid size={16} />
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      <div className="md:col-span-2">
        <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
          <span className="inline-flex items-center gap-1"><Search size={12} /> Buscar</span>
        </label>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Descrição, polo, status ou forma de pagamento"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
        />
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
          <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data inicial</span>
        </label>
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
        />
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
          <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data final</span>
        </label>
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
        />
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
          <span className="inline-flex items-center gap-1"><Filter size={12} /> Categoria</span>
        </label>
        <select
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
        >
          <option value="TODOS">Todas</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      {statusTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onStatusChange(tab.key)}
          className={`rounded-full px-3 py-2.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
            status === tab.key
              ? 'bg-[#001a33] text-white shadow'
              : 'border border-slate-200 bg-slate-100 text-slate-600'
          }`}
        >
          <span className="inline-flex items-center gap-1">
            {tab.label}
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-black">
              {counts[tab.key]}
            </span>
          </span>
        </button>
      ))}
    </div>
  </>
);

export default FinanceiroFilters;

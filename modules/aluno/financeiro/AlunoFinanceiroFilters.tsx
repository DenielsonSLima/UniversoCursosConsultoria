import React from 'react';
import {
  BadgeAlert,
  CalendarDays,
  CheckCircle,
  Clock,
  Filter,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
} from 'lucide-react';

import FinancialUnderlineTabs from '../../gestor/financeiro/components/FinancialUnderlineTabs';
import type {
  AlunoFinancialListPayload,
  AlunoFinancialModality,
  AlunoFinancialStatus,
  AlunoFinancialViewMode,
} from './financeiro.types';

interface AlunoFinanceiroFiltersProps {
  search: string;
  startDate: string;
  endDate: string;
  modality: AlunoFinancialModality;
  status: AlunoFinancialStatus;
  viewMode: AlunoFinancialViewMode;
  showMobileFilters: boolean;
  counts: AlunoFinancialListPayload['filters']['counts'];
  onSearchChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onModalityChange: (value: AlunoFinancialModality) => void;
  onStatusChange: (value: AlunoFinancialStatus) => void;
  onViewModeChange: (value: AlunoFinancialViewMode) => void;
  onToggleMobileFilters: () => void;
  onClearAdvancedFilters: () => void;
}

const modalityOptions: Array<{ value: AlunoFinancialModality; label: string }> = [
  { value: 'TODOS', label: 'Todos os tipos' },
  { value: 'DISCIPLINA', label: 'Disciplina' },
  { value: 'EAD', label: 'EAD' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'LIVRE', label: 'Livre' },
  { value: 'ESPECIALIZACAO', label: 'Especialização' },
];

const AlunoFinanceiroFilters: React.FC<AlunoFinanceiroFiltersProps> = ({
  search,
  startDate,
  endDate,
  modality,
  status,
  viewMode,
  showMobileFilters,
  counts,
  onSearchChange,
  onStartDateChange,
  onEndDateChange,
  onModalityChange,
  onStatusChange,
  onViewModeChange,
  onToggleMobileFilters,
  onClearAdvancedFilters,
}) => {
  const hasAdvancedFilters = Boolean(startDate || endDate || modality !== 'TODOS');
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <div className="lg:col-span-4">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
            <span className="inline-flex items-center gap-1"><Search size={12} /> Buscar</span>
          </label>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por descrição, curso ou status"
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm"
          />
        </div>
        <button
          type="button"
          onClick={onToggleMobileFilters}
          className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-600 lg:hidden"
          aria-expanded={showMobileFilters}
        >
          <span className="inline-flex items-center gap-2"><Filter size={15} /> Mais filtros</span>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] text-blue-700">
            {hasAdvancedFilters ? 'Ativos' : showMobileFilters ? 'Fechar' : 'Abrir'}
          </span>
        </button>
        <div className={`${showMobileFilters ? 'grid' : 'hidden'} grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-3 lg:contents`}>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data inicial</span>
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-700 outline-none md:text-xs lg:bg-slate-50"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data final</span>
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-700 outline-none md:text-xs lg:bg-slate-50"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-500">
              <span className="inline-flex items-center gap-1"><Filter size={12} /> Tipo</span>
            </label>
            <select
              value={modality}
              onChange={(event) => onModalityChange(event.target.value as AlunoFinancialModality)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-700 outline-none md:text-xs lg:bg-slate-50"
            >
              {modalityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="hidden md:block lg:col-span-2">
            <div className="grid h-12 grid-cols-2 gap-2">
              {(['table', 'cards'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={mode === 'table' ? 'Exibir cobranças em tabela' : 'Exibir cobranças em cartões'}
                  onClick={() => onViewModeChange(mode)}
                  className={`inline-flex items-center justify-center rounded-lg ${viewMode === mode ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}
                >
                  {mode === 'table' ? <List size={16} /> : <LayoutGrid size={16} />}
                </button>
              ))}
            </div>
          </div>
          {hasAdvancedFilters ? (
            <button type="button" onClick={onClearAdvancedFilters} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-600 lg:hidden">
              <RotateCcw size={13} /> Limpar filtros
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <FinancialUnderlineTabs
          items={[
            { id: 'ABERTO', label: 'Em aberto', icon: <Clock size={15} />, badge: counts.ABERTO },
            { id: 'ATRASADO', label: 'Atrasado', icon: <BadgeAlert size={15} />, badge: counts.ATRASADO },
            { id: 'PAGO', label: 'Pagos', icon: <CheckCircle size={15} />, badge: counts.PAGO },
            { id: 'TODOS', label: 'Todos', icon: <List size={15} />, badge: counts.TODOS },
          ]}
          value={status}
          onChange={onStatusChange}
          ariaLabel="Filtrar histórico de cobranças por situação"
        />
      </div>
    </>
  );
};

export default AlunoFinanceiroFilters;

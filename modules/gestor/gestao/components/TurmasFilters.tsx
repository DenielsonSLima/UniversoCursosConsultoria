import React from 'react';
import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpAZ, ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react';
import { TurmasSortBy } from '../gestao.types';

interface TurmasFiltersProps {
  search: string;
  dataInicial: string;
  dataFinal: string;
  sortBy: TurmasSortBy;
  page: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  onSearchChange: (value: string) => void;
  onDataInicialChange: (value: string) => void;
  onDataFinalChange: (value: string) => void;
  onSortByChange: (value: TurmasSortBy) => void;
  onApply: () => void;
  onPageChange: (page: number) => void;
}

const TurmasFilters: React.FC<TurmasFiltersProps> = ({
  search, dataInicial, dataFinal, sortBy, page, total, pageSize, loading = false,
  onSearchChange, onDataInicialChange, onDataFinalChange, onSortByChange, onApply, onPageChange,
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const sortOptions: { value: TurmasSortBy; label: string; icon: React.ElementType }[] = [
    { value: 'NOME_ASC', label: 'A-Z', icon: ArrowUpAZ },
    { value: 'NOME_DESC', label: 'Z-A', icon: ArrowDownAZ },
    { value: 'ALUNOS_DESC', label: 'Alunos', icon: ArrowDownWideNarrow },
  ];

  return (
    <div className="mb-5 space-y-3">
      <div className="grid grid-cols-1 items-stretch gap-2 rounded-xl border border-slate-200 bg-white p-3 xl:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto]">
        <div className="relative min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label="Buscar turma ou código" value={search} onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onApply()} placeholder="Buscar turma ou código..."
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-base font-normal outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-100 sm:h-10 sm:text-xs" />
        </div>
        <div role="group" aria-label="Ordenação das turmas" className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-50 p-1 sm:min-h-10">
          {sortOptions.map(option => {
            const Icon = option.icon;
            const active = sortBy === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSortByChange(option.value)}
                title={`Ordenar por ${option.label}`}
                aria-pressed={active}
                className={`flex min-h-9 min-w-16 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-8 ${
                  active
                    ? 'bg-white text-[#001a33] shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                  <Icon size={14} aria-hidden="true" className="shrink-0" />
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="flex min-h-11 min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 sm:min-h-10">
          <span className="block text-[10px] font-normal leading-3 text-slate-500">Início de</span>
          <input type="date" value={dataInicial} onChange={e => onDataInicialChange(e.target.value)}
            className="min-w-0 bg-transparent text-base font-normal leading-5 text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-xs" />
        </label>
        <label className="flex min-h-11 min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 sm:min-h-10">
          <span className="block text-[10px] font-normal leading-3 text-slate-500">Início até</span>
          <input type="date" value={dataFinal} onChange={e => onDataFinalChange(e.target.value)}
            className="min-w-0 bg-transparent text-base font-normal leading-5 text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-xs" />
        </label>
        <button type="button" onClick={onApply} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0c2942] px-4 text-xs font-medium text-white outline-none hover:bg-[#143851] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:min-h-10">
          <Filter size={14} /> Filtrar
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-normal text-slate-500">
        <span role="status" aria-live="polite">{loading ? 'Buscando turmas...' : `${total} turma(s) encontrada(s)`}</span>
        <div className="flex items-center gap-2">
          <button title="Página anterior" onClick={() => onPageChange(page - 1)} disabled={loading || page <= 1} className="rounded-lg border bg-white p-2 disabled:opacity-30"><ChevronLeft size={14}/></button>
          <span>Página {page} de {pages}</span>
          <button title="Próxima página" onClick={() => onPageChange(page + 1)} disabled={loading || page >= pages} className="rounded-lg border bg-white p-2 disabled:opacity-30"><ChevronRight size={14}/></button>
        </div>
      </div>
    </div>
  );
};

export default TurmasFilters;

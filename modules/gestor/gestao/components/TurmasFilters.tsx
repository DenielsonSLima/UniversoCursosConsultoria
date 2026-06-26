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
  onSearchChange: (value: string) => void;
  onDataInicialChange: (value: string) => void;
  onDataFinalChange: (value: string) => void;
  onSortByChange: (value: TurmasSortBy) => void;
  onApply: () => void;
  onPageChange: (page: number) => void;
}

const TurmasFilters: React.FC<TurmasFiltersProps> = ({
  search, dataInicial, dataFinal, sortBy, page, total, pageSize,
  onSearchChange, onDataInicialChange, onDataFinalChange, onSortByChange, onApply, onPageChange,
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const sortOptions: { value: TurmasSortBy; label: string; icon: React.ElementType }[] = [
    { value: 'NOME_ASC', label: 'A-Z', icon: ArrowUpAZ },
    { value: 'NOME_DESC', label: 'Z-A', icon: ArrowDownAZ },
    { value: 'ALUNOS_DESC', label: 'Alunos', icon: ArrowDownWideNarrow },
  ];

  return (
    <div className="mb-6 space-y-3">
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 xl:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onApply()} placeholder="Buscar turma ou código..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {sortOptions.map(option => {
            const Icon = option.icon;
            const active = sortBy === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSortByChange(option.value)}
                title={`Ordenar por ${option.label}`}
                className={`flex min-w-20 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  active
                    ? 'bg-white text-[#001a33] shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon size={14} />
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
          <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400">Início de</span>
          <input type="date" value={dataInicial} onChange={e => onDataInicialChange(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-600 outline-none" />
        </label>
        <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
          <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400">Início até</span>
          <input type="date" value={dataFinal} onChange={e => onDataFinalChange(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-600 outline-none" />
        </label>
        <button onClick={onApply} className="flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase text-white">
          <Filter size={14} /> Filtrar
        </button>
      </div>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <span>{total} turma(s) encontrada(s)</span>
        <div className="flex items-center gap-2">
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="rounded-lg border bg-white p-2 disabled:opacity-30"><ChevronLeft size={14}/></button>
          <span>Página {page} de {pages}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= pages} className="rounded-lg border bg-white p-2 disabled:opacity-30"><ChevronRight size={14}/></button>
        </div>
      </div>
    </div>
  );
};

export default TurmasFilters;

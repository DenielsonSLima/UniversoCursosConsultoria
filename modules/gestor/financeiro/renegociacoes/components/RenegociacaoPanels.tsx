import React from 'react';
import { AlertCircle, FileSearch, Loader2, RefreshCw, Search } from 'lucide-react';
import { renegociacaoErrorMessage, viewLabel } from '../renegociacoes.model';
import type { RenegociacaoView } from '../renegociacoes.types';

export const RenegociacaoViewTabs: React.FC<{
  value: RenegociacaoView;
  onChange: (view: RenegociacaoView) => void;
}> = ({ value, onChange }) => (
  <div
    className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-4"
    role="tablist"
    aria-label="Visões de renegociação"
  >
    {(Object.keys(viewLabel) as RenegociacaoView[]).map((view) => (
      <button
        key={view}
        type="button"
        role="tab"
        aria-selected={value === view}
        onClick={() => onChange(view)}
        className={`min-h-11 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition ${value === view ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
      >
        {viewLabel[view]}
      </button>
    ))}
  </div>
);

export const RenegociacaoSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Buscar aluno, matrícula ou turma...' }) => (
  <label className="relative block flex-1">
    <span className="sr-only">Buscar renegociação</span>
    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
    />
  </label>
);

export const LoadingPanel: React.FC<{ label?: string }> = ({ label = 'Carregando renegociações...' }) => (
  <div className="flex min-h-52 items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white text-sm font-bold text-slate-400">
    <Loader2 size={18} className="animate-spin" /> {label}
  </div>
);

export const ErrorPanel: React.FC<{ error: unknown; onRetry?: () => void }> = ({ error, onRetry }) => (
  <div role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-rose-800">
    <div className="flex items-start gap-3">
      <AlertCircle size={20} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-black">Não foi possível carregar</p>
        <p className="mt-1 text-xs font-medium">{renegociacaoErrorMessage(error)}</p>
      </div>
    </div>
    {onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-wide shadow-sm"
      >
        <RefreshCw size={14} /> Tentar novamente
      </button>
    ) : null}
  </div>
);

export const EmptyPanel: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center">
    <FileSearch size={40} className="mx-auto text-slate-300" />
    <p className="mt-3 text-sm font-black uppercase tracking-wide text-slate-600">{title}</p>
    <p className="mx-auto mt-1 max-w-xl text-xs font-medium leading-relaxed text-slate-400">{description}</p>
  </div>
);

export const Pagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}> = ({ page, pageSize, total, onChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-500">
      <span>
        Página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="min-h-10 rounded-lg border border-slate-200 px-3 disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="min-h-10 rounded-lg border border-slate-200 px-3 disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
};

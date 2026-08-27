import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface ConciliacaoPaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  className?: string;
}

export const ConciliacaoPagination: React.FC<ConciliacaoPaginationProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  if (totalItems === 0) return null;

  // Build page numbers window
  const pageNumbers: (number | 'ellipsis')[] = [];
  const maxButtons = 5;

  if (totalPages <= maxButtons + 2) {
    for (let i = 1; i <= totalPages; i += 1) {
      pageNumbers.push(i);
    }
  } else {
    pageNumbers.push(1);
    let start = Math.max(2, page - 1);
    let end = Math.min(totalPages - 1, page + 1);

    if (page <= 3) {
      start = 2;
      end = 4;
    } else if (page >= totalPages - 2) {
      start = totalPages - 3;
      end = totalPages - 1;
    }

    if (start > 2) {
      pageNumbers.push('ellipsis');
    }

    for (let i = start; i <= end; i += 1) {
      pageNumbers.push(i);
    }

    if (end < totalPages - 1) {
      pageNumbers.push('ellipsis');
    }

    pageNumbers.push(totalPages);
  }

  return (
    <div
      className={`flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs font-semibold text-slate-600 sm:flex-row ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-bold text-slate-500">
          Mostrando <strong className="text-slate-800">{startItem}</strong>–
          <strong className="text-slate-800">{endItem}</strong> de{' '}
          <strong className="text-slate-800">{totalItems}</strong> lançamentos
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-slate-400">Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
            >
              <option value={10}>10 por pág.</option>
              <option value={20}>20 por pág.</option>
              <option value={50}>50 por pág.</option>
              <option value={100}>100 por pág.</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          aria-label="Primeira página"
          title="Primeira página"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronsLeft size={14} />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          title="Página anterior"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex items-center gap-1 px-1">
          {pageNumbers.map((p, idx) => {
            if (p === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="inline-flex h-8 w-6 items-center justify-center text-xs font-bold text-slate-400 select-none"
                >
                  …
                </span>
              );
            }
            const isCurrent = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={isCurrent ? 'page' : undefined}
                className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-xs font-black transition-all ${
                  isCurrent
                    ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Próxima página"
          title="Próxima página"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight size={14} />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="Última página"
          title="Última página"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default ConciliacaoPagination;

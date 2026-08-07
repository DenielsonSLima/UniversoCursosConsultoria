import React from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  History,
  Loader2,
} from 'lucide-react';
import { AcademicMovement } from '../../academic-lifecycle.service';
import TechnicalDataError from '../TechnicalDataError';

interface AcademicMovementsSectionProps {
  movements: AcademicMovement[];
  page: number;
  pageSize: number;
  total: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

const getVisiblePages = (page: number, totalPages: number) => {
  const first = Math.max(1, Math.min(page - 2, totalPages - 4));
  const last = Math.min(totalPages, first + 4);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
};

const AcademicMovementsSection: React.FC<AcademicMovementsSectionProps> = ({
  movements,
  page,
  pageSize,
  total,
  isLoading,
  isError,
  isFetching,
  onPageChange,
  onRetry,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History size={17} className="text-violet-600" />
          <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Histórico de movimentações</h4>
        </div>
        {isFetching && !isLoading && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-violet-600">
            <Loader2 size={12} className="animate-spin" /> Atualizando
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        {isLoading ? (
          <div className="flex justify-center py-14"><Loader2 className="animate-spin text-violet-600" /></div>
        ) : isError ? (
          <div className="p-4">
            <TechnicalDataError
              title="Histórico não carregado"
              message="Não foi possível confirmar as movimentações acadêmicas desta turma."
              retrying={isFetching}
              onRetry={onRetry}
            />
          </div>
        ) : movements.length === 0 ? (
          <p className="py-14 text-center text-sm text-slate-400">Nenhuma movimentação registrada.</p>
        ) : (
          <div className={`divide-y divide-slate-100 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
            {movements.map((movement) => (
              <div key={movement.id} className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-violet-50 p-2 text-violet-600"><Clock3 size={15} /></div>
                  <div>
                    <p className="text-sm font-black text-[#001a33]">{movement.aluno?.nome || 'Aluno'}</p>
                    <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-violet-600">
                      {movement.tipo.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{movement.motivo}</p>
                    {movement.observacao && (
                      <p className="mt-2 flex items-start gap-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                        <FileText size={12} className="mt-0.5 shrink-0 text-slate-400" />
                        {movement.observacao}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <p className="flex items-center gap-1 text-[10px] font-black text-blue-700 md:justify-end">
                    <CalendarDays size={12} />
                    {new Date(`${movement.data_movimentacao}T12:00:00`).toLocaleDateString('pt-BR')}
                  </p>
                  <p className="mt-1 text-[9px] text-slate-400">{movement.status_anterior || 'INÍCIO'} → {movement.status_novo}</p>
                  <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-400 md:justify-end">
                    <Clock3 size={10} /> Registrado em {new Date(movement.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-bold text-slate-500">
              Mostrando <strong className="text-[#001a33]">{firstItem}–{lastItem}</strong> de{' '}
              <strong className="text-[#001a33]">{total}</strong> movimentações
            </p>
            <nav className="flex items-center gap-1" aria-label="Paginação do histórico de movimentações">
              <button
                type="button"
                aria-label="Página anterior"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1 || isFetching}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={15} />
              </button>
              {visiblePages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  aria-label={`Ir para a página ${pageNumber}`}
                  aria-current={pageNumber === page ? 'page' : undefined}
                  onClick={() => onPageChange(pageNumber)}
                  disabled={isFetching}
                  className={`h-8 min-w-8 rounded-lg px-2 text-[10px] font-black transition disabled:cursor-not-allowed ${
                    pageNumber === page
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                aria-label="Próxima página"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages || isFetching}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronRight size={15} />
              </button>
            </nav>
          </div>
        )}
      </div>
    </section>
  );
};

export default AcademicMovementsSection;

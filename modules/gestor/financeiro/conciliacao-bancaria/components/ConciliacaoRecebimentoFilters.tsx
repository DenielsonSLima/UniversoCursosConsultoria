import React from 'react';
import { CalendarDays, Search, X } from 'lucide-react';

interface ConciliacaoRecebimentoFiltersProps {
  searchTerm: string;
  selectedStatus: string;
  settlementStartDate: string;
  settlementEndDate: string;
  totalItems: number;
  onSearchTermChange: (value: string) => void;
  onSelectStatus: (status: string) => void;
  onSettlementStartDateChange: (value: string) => void;
  onSettlementEndDateChange: (value: string) => void;
  onClearSettlementPeriod: () => void;
}

const STATUS_OPTIONS = ['TODOS', 'PAGO', 'PENDENTE', 'VENCIDO'] as const;

const ConciliacaoRecebimentoFilters: React.FC<ConciliacaoRecebimentoFiltersProps> = ({
  searchTerm,
  selectedStatus,
  settlementStartDate,
  settlementEndDate,
  totalItems,
  onSearchTermChange,
  onSelectStatus,
  onSettlementStartDateChange,
  onSettlementEndDateChange,
  onClearSettlementPeriod,
}) => {
  const hasSettlementPeriod = Boolean(settlementStartDate || settlementEndDate);
  const settlementFilterEnabled = selectedStatus === 'PAGO';
  const invalidPeriod = Boolean(
    settlementStartDate
      && settlementEndDate
      && settlementStartDate > settlementEndDate,
  );

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <label className="min-w-[240px] flex-1">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Buscar cobrança
          </span>
          <span className="relative block">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Aluno, CPF, descrição ou nosso número..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-xs outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </span>
        </label>

        <fieldset className="min-w-0">
          <legend className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
            <CalendarDays size={13} aria-hidden="true" />
            Período da baixa
          </legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2">
              <span className="w-7 text-[10px] font-bold uppercase text-slate-400">De</span>
              <input
                type="date"
                value={settlementStartDate}
                max={settlementEndDate || undefined}
                disabled={!settlementFilterEnabled}
                onChange={(event) => onSettlementStartDateChange(event.target.value)}
                aria-invalid={invalidPeriod}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-7 text-[10px] font-bold uppercase text-slate-400">Até</span>
              <input
                type="date"
                value={settlementEndDate}
                min={settlementStartDate || undefined}
                disabled={!settlementFilterEnabled}
                onChange={(event) => onSettlementEndDateChange(event.target.value)}
                aria-invalid={invalidPeriod}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
            {hasSettlementPeriod ? (
              <button
                type="button"
                onClick={onClearSettlementPeriod}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X size={13} aria-hidden="true" />
                Limpar período
              </button>
            ) : null}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-3">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filtrar por situação da cobrança</legend>
          <span aria-hidden="true" className="text-[10px] font-bold uppercase text-slate-400">
            Status:
          </span>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={selectedStatus === status}
              onClick={() => onSelectStatus(status)}
              className={`min-h-8 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                selectedStatus === status
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {status}
            </button>
          ))}
        </fieldset>

        <p aria-live="polite" className="text-[10px] font-bold text-slate-500">
          {totalItems === 1 ? '1 cobrança encontrada' : `${totalItems} cobranças encontradas`}
        </p>
      </div>

      {!settlementFilterEnabled ? (
        <p className="text-[10px] font-medium text-slate-500">
          Selecione o status Pago para filtrar pela data efetiva da baixa.
        </p>
      ) : invalidPeriod ? (
        <p role="alert" className="text-[11px] font-bold text-rose-700">
          A data inicial não pode ser posterior à data final.
        </p>
      ) : hasSettlementPeriod ? (
        <p className="text-[10px] font-medium text-slate-500">
          O período considera a data efetiva da baixa. Cobranças sem baixa não entram neste recorte.
        </p>
      ) : null}
    </div>
  );
};

export default ConciliacaoRecebimentoFilters;

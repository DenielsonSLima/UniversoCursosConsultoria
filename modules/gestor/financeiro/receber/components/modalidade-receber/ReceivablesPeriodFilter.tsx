import React from 'react';
import { formatResumoRange } from '../../../resumo/resumo-period';
import {
  RECEIVABLES_PERIODS,
  getReceivablesPeriod,
  type ReceivablesPeriod,
} from './receivables-period';

interface Props {
  period: ReceivablesPeriod;
  error: string | null;
  onChange: (period: ReceivablesPeriod) => void;
}

export function ReceivablesPeriodFilter({ period, error, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período de vencimento">
        {RECEIVABLES_PERIODS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={period.preset === id}
            onClick={() => onChange(id === 'CUSTOM' ? { ...period, preset: id } : getReceivablesPeriod(id))}
            className={`min-h-10 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${period.preset === id ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {period.preset === 'CUSTOM' ? (
        <div className="flex flex-wrap gap-3">
          {(['start', 'end'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              {key === 'start' ? 'Vencimento de' : 'Até'}
              <input
                type="date"
                aria-label={key === 'start' ? 'Vencimento inicial' : 'Vencimento final'}
                aria-invalid={Boolean(error)}
                value={period[key]}
                onChange={(event) => onChange({ ...period, [key]: event.target.value })}
                className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : (
        <p className="text-xs font-semibold text-slate-500">
          {period.preset === 'ALL' ? 'Vencimentos de todo o período' : `Vencimentos de ${formatResumoRange(period)}`}
        </p>
      )}
    </div>
  );
}

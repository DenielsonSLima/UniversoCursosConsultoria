import React, { useId } from 'react';
import type { ReceivablesPeriod } from './receivables-period';

interface Props {
  period: ReceivablesPeriod;
  error: string | null;
  onChange: (period: ReceivablesPeriod) => void;
}

export function ReceivablesPeriodFilter({ period, error, onChange }: Props) {
  const errorId = useId();

  const changeDate = (key: 'start' | 'end', value: string) => {
    const next = { ...period, [key]: value };
    onChange({ ...next, preset: next.start || next.end ? 'CUSTOM' : 'ALL' });
  };

  return (
    <div className="w-full min-w-0 sm:w-auto" role="group" aria-label="Período de vencimento">
      <div className="grid grid-cols-2 gap-3">
        {(['start', 'end'] as const).map((key) => (
          <input
            key={key}
            type="date"
            aria-label={key === 'start' ? 'Data inicial' : 'Data final'}
            title={key === 'start' ? 'Data inicial' : 'Data final'}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            value={period[key]}
            onChange={(event) => changeDate(key, event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-medium outline-none focus:ring-2 focus:ring-emerald-500 sm:min-h-10 sm:w-[150px] sm:text-xs"
          />
        ))}
      </div>
      {error ? <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

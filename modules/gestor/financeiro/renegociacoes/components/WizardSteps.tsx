import React from 'react';
import {
  formatCandidateAmount,
  formatCentsInput,
  formatRenegociacaoDate,
  parseCurrencyToCents,
} from '../renegociacoes.model';
import type { RenegociacaoCandidateItem } from '../renegociacoes.types';

export const inputClass =
  'min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-[#001a33] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

export const Field: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
    {children}
  </label>
);

export const MoneyField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}> = ({ label, value, onChange, compact }) => (
  <Field label={label}>
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
        R$
      </span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(formatCentsInput(parseCurrencyToCents(event.target.value)))}
        className={`${inputClass} pl-9 ${compact ? 'bg-white' : ''}`}
      />
    </div>
  </Field>
);

export const OverrideField: React.FC<{
  checked: boolean;
  onChecked: (value: boolean) => void;
  label: string;
  inherited: string;
  children: React.ReactNode;
}> = ({ checked, onChecked, label, inherited, children }) => (
  <div className={`rounded-xl border p-3 ${checked ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
    <label className="flex cursor-pointer gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChecked(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded text-blue-600"
      />
      <span>
        <span className="block text-[10px] font-black uppercase text-slate-600">{label}</span>
        <span className="text-xs font-bold text-slate-500">Padrão: {inherited}</span>
      </span>
    </label>
    {checked ? (
      <div className="mt-3">{children}</div>
    ) : (
      <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-blue-600">Manter padrão herdado</p>
    )}
  </div>
);

export const SelectionStep: React.FC<{
  items: RenegociacaoCandidateItem[];
  selected: string[];
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}> = ({ items, selected, allSelected, onToggle, onToggleAll }) => {
  const eligibleCount = items.filter((item) => item.eligibility.eligible).length;
  return (
    <section>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="text-base font-black text-[#001a33]">Escolha qualquer combinação de parcelas</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Vencidas e futuras podem ser combinadas; não é necessário selecionar parcelas consecutivas.
        </p>
      </div>
      <button
        type="button"
        onClick={onToggleAll}
        disabled={!eligibleCount}
        className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {allSelected ? 'Desmarcar todas' : `Marcar elegíveis (${eligibleCount})`}
      </button>
    </div>
    <div className="mt-4 space-y-2">
      {items.map((item) => {
        const checked = selected.includes(item.receivableId);
        const blocked = !item.eligibility.eligible;
        const principal = formatCandidateAmount(item.principalCents);
        const interest = formatCandidateAmount(item.interestCents);
        const penalty = formatCandidateAmount(item.penaltyCents);
        const debt = formatCandidateAmount(item.debtCents);
        return (
          <label
            key={item.receivableId}
            className={`flex gap-3 rounded-2xl border p-4 ${
              blocked
                ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-70'
                : checked
                  ? 'cursor-pointer border-blue-300 bg-blue-50'
                  : 'cursor-pointer border-slate-200 bg-white hover:border-blue-200'
            }`}
          >
            <input
              type="checkbox"
              aria-label={`Selecionar ${item.label}`}
              data-receivable-id={item.receivableId}
              checked={checked}
              disabled={blocked}
              onChange={() => onToggle(item.receivableId)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-slate-800">{item.label}</strong>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.overdue ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}
                >
                  {item.overdue ? `${item.lateDays} dias em atraso` : 'Em aberto'}
                </span>
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Vencimento {formatRenegociacaoDate(item.dueDate)} • Principal {principal} • Juros {interest} • Multa{' '}
                {penalty}
              </span>
              {blocked ? (
                <span className="mt-1 block text-[11px] font-bold text-amber-700">{item.eligibility.reason}</span>
              ) : null}
            </span>
            <strong className="shrink-0 text-sm text-[#001a33]">{debt}</strong>
          </label>
        );
      })}
    </div>
  </section>
  );
};

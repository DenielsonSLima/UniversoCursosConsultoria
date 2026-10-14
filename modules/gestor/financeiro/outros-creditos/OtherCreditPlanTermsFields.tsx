import React from 'react';
import { formatCurrencyInput, normalizeCurrencyInput } from './outros-creditos.presentation';
import type { OtherCreditPlanTermsForm } from './other-credit-plan.model';

const inputClass = 'h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white';
const labelClass = 'block text-[10px] font-black uppercase tracking-wider text-slate-500';

export function OtherCreditPlanTermsFields({ label, terms, onChange }: {
  label: string; terms: OtherCreditPlanTermsForm; onChange: (patch: Partial<OtherCreditPlanTermsForm>) => void;
}) {
  return <details aria-label={`Condições de ${label}`} className="min-w-0 rounded-2xl border border-slate-200 p-4">
    <summary className="cursor-pointer text-sm font-black text-[#001a33]">Juros, multa e desconto · {label}</summary>
    <div className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1"><span className={labelClass}>Juros ao mês (%)</span>
          <input aria-label={`Juros ao mês de ${label} (%)`} type="text" inputMode="decimal" value={terms.interest}
            onChange={event => onChange({ interest: normalizeCurrencyInput(event.target.value) })} className={inputClass} />
        </label>
        <label className="space-y-1"><span className={labelClass}>Multa (%)</span>
          <input aria-label={`Multa de ${label} (%)`} type="text" inputMode="decimal" value={terms.penalty}
            onChange={event => onChange({ penalty: normalizeCurrencyInput(event.target.value) })} className={inputClass} />
        </label>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-bold text-[#001a33]">Desconto por pontualidade</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Tipo de desconto de ${label}`}>
          {([{ id: 'FIXO', label: 'Em reais (R$)' }, { id: 'PERCENTUAL', label: 'Percentual (%)' }] as const).map(option => (
            <button key={option.id} type="button" aria-pressed={terms.discountType === option.id}
              onClick={() => onChange({ discountType: option.id, discount: '' })}
              className={`min-h-11 rounded-xl border px-4 py-2 text-xs font-bold ${terms.discountType === option.id ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1"><span className={labelClass}>Desconto ({terms.discountType === 'FIXO' ? 'R$' : '%'})</span>
            <input aria-label={`Desconto de ${label} (${terms.discountType === 'FIXO' ? 'R$' : '%'})`} type="text" inputMode="decimal"
              value={terms.discount} placeholder="0,00" onChange={event => onChange({ discount: normalizeCurrencyInput(event.target.value) })}
              onBlur={() => { if (terms.discountType === 'FIXO') onChange({ discount: formatCurrencyInput(terms.discount) }); }} className={inputClass} />
          </label>
          <label className="space-y-1"><span className={labelClass}>Dias antes do vencimento</span>
            <input aria-label={`Antecedência do desconto de ${label} (dias)`} type="number" min="0" max="60" step="1" value={terms.discountDays}
              onChange={event => onChange({ discountDays: event.target.value })} className={inputClass} />
          </label>
        </div>
        <p className="text-xs leading-5 text-slate-500">Informe 0 dias para valer até o vencimento. Estas condições se aplicam {label === 'parcelas' ? 'às parcelas' : `à ${label}`}.</p>
      </div>
    </div>
  </details>;
}

import React from 'react';
import { formatCurrencyInput, normalizeCurrencyInput } from './outros-creditos.presentation';
import { initialOtherCreditPlanTerms, type OtherCreditPlanFeeForm, type OtherCreditPlanForm as Form } from './other-credit-plan.model';
import { OtherCreditPlanTermsFields } from './OtherCreditPlanTermsFields';

const inputClass = 'h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white';
const labelClass = 'block text-[10px] font-black uppercase tracking-wider text-slate-500';

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-1">
    <span className={labelClass}>{label}</span>
    <input type="text" inputMode="decimal" value={value} placeholder="0,00"
      onChange={event => onChange(normalizeCurrencyInput(event.target.value))}
      onBlur={() => onChange(formatCurrencyInput(value))} className={inputClass} />
  </label>;
}

function FeeFields({ label, value, onChange }: {
  label: string; value: OtherCreditPlanFeeForm; onChange: (value: OtherCreditPlanFeeForm) => void;
}) {
  return <div className="rounded-2xl border border-slate-200 p-4">
    <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-[#001a33]">
      <input type="checkbox" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })}
        className="h-4 w-4 accent-emerald-600" />
      Incluir taxa de {label}
    </label>
    {value.enabled ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <MoneyField label={`Valor da ${label}`} value={value.value} onChange={next => onChange({ ...value, value: next })} />
      <label className="space-y-1"><span className={labelClass}>Vencimento da {label}</span>
        <input type="date" value={value.dueDate} onChange={event => onChange({ ...value, dueDate: event.target.value })} className={inputClass} />
      </label>
      <div className="sm:col-span-2"><OtherCreditPlanTermsFields label={label} terms={value.terms || initialOtherCreditPlanTerms()}
        onChange={patch => onChange({ ...value, terms: { ...(value.terms || initialOtherCreditPlanTerms()), ...patch } })} /></div>
    </div> : null}
  </div>;
}

export function OtherCreditPlanFinancialForm({ form, onChange, disabled, children }: {
  form: Form; onChange: (patch: Partial<Form>) => void; disabled: boolean; children?: React.ReactNode;
}) {
  return <fieldset disabled={disabled} className="min-w-0 space-y-5 disabled:opacity-70">
    <div className="grid gap-4 md:grid-cols-2">
      <MoneyField label="Valor de cada parcela" value={form.value} onChange={value => onChange({ value })} />
      <label className="space-y-1"><span className={labelClass}>Quantidade de parcelas</span>
        <input type="number" min="1" max="60" step="1" value={form.quantity}
          onChange={event => onChange({ quantity: event.target.value })} className={inputClass} />
      </label>
      <label className="space-y-1"><span className={labelClass}>Primeiro vencimento</span>
        <input type="date" value={form.firstDueDate} onChange={event => onChange({ firstDueDate: event.target.value })} className={inputClass} />
      </label>
      <div className="space-y-2">
        <span className={labelClass}>Periodicidade das parcelas</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodicidade das parcelas">
          {([{ id: 'MENSAL_CALENDARIO', label: 'Mensal · mesmo dia' }, { id: 'DIAS_CORRIDOS_30', label: 'A cada 30 dias' }] as const).map(option => (
            <button key={option.id} type="button" aria-pressed={form.periodicity === option.id}
              onClick={() => onChange({ periodicity: option.id })}
              className={`min-h-11 rounded-xl border px-4 py-2 text-xs font-bold ${form.periodicity === option.id ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs leading-5 text-slate-500">{form.periodicity === 'DIAS_CORRIDOS_30'
          ? 'Intervalo de 30 dias corridos entre os vencimentos.'
          : 'Mantém o dia escolhido e ajusta os meses com menos dias.'}</p>
      </div>
    </div>

    <div className="space-y-3">
      <h3 className="text-sm font-black text-[#001a33]">Taxas opcionais</h3>
      <p className="text-xs leading-5 text-slate-500">Matrícula e rematrícula são cobranças financeiras separadas neste carnê. A aluna continua sem vínculo com uma turma.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <FeeFields label="matrícula" value={form.enrollment} onChange={enrollment => onChange({ enrollment })} />
        <FeeFields label="rematrícula" value={form.reenrollment} onChange={reenrollment => onChange({ reenrollment })} />
      </div>
    </div>
    {children}
    <OtherCreditPlanTermsFields label="parcelas" terms={form} onChange={onChange} />
  </fieldset>;
}

import React from 'react';
import TransferenciaPicker from '../transferencias/components/TransferenciaPicker';
import { maskPdvDocument } from './PdvPartnerSearch';
import { formatCurrencyInput, normalizeCurrencyInput } from './outros-creditos.presentation';
import type { OtherCreditPlanFeeForm, OtherCreditPlanForm as Form } from './other-credit-plan.model';

type Partner = { id: string; nome: string; tipo: string; cpf_cnpj?: string };
type Category = { id: string; nome: string };
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
    </div> : null}
  </div>;
}

export function OtherCreditPlanForm({ form, onChange, disabled, partners, categories, partnersLoading, partnersError, retryPartners }: {
  form: Form; onChange: (patch: Partial<Form>) => void; disabled: boolean;
  partners: Partner[]; categories: Category[]; partnersLoading: boolean; partnersError: boolean; retryPartners: () => void;
}) {
  return <fieldset disabled={disabled} className="space-y-5 disabled:opacity-70">
    <div className="grid gap-4 md:grid-cols-2">
      <TransferenciaPicker label="Pagador cadastrado" value={form.partnerId}
        options={partners.map(partner => ({ id: partner.id, label: partner.nome, detail: `${partner.tipo} · ${maskPdvDocument(partner.cpf_cnpj)}`, keywords: partner.cpf_cnpj }))}
        onChange={partnerId => onChange({ partnerId })} placeholder="Buscar nome, CPF ou CNPJ"
        loading={partnersLoading} error={partnersError} disabled={disabled} accent="emerald" />
      <TransferenciaPicker label="Categoria financeira (opcional)" value={form.categoryId}
        options={[{ id: '', label: 'Sem categoria específica', detail: 'Crédito avulso' }, ...categories.map(category => ({ id: category.id, label: category.nome, detail: 'Outros Créditos' }))]}
        onChange={categoryId => onChange({ categoryId })} placeholder="Buscar categoria" disabled={disabled} accent="emerald" />
      {partnersError ? <button type="button" onClick={retryPartners} className="text-left text-xs font-bold text-emerald-700 underline">Carregar pagadores novamente</button> : null}
      <label className="space-y-1 md:col-span-2"><span className={labelClass}>Descrição do carnê</span>
        <input value={form.description} onChange={event => onChange({ description: event.target.value })}
          placeholder="Ex.: Aulas de prática para aluna formada" maxLength={240} className={inputClass} />
      </label>
      <MoneyField label="Valor de cada parcela" value={form.value} onChange={value => onChange({ value })} />
      <label className="space-y-1"><span className={labelClass}>Quantidade de parcelas</span>
        <input type="number" min="1" max="60" step="1" value={form.quantity}
          onChange={event => onChange({ quantity: event.target.value })} className={inputClass} />
      </label>
      <label className="space-y-1"><span className={labelClass}>Primeiro vencimento</span>
        <input type="date" value={form.firstDueDate} onChange={event => onChange({ firstDueDate: event.target.value })} className={inputClass} />
      </label>
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
        As parcelas são mensais. O cronograma mantém o dia escolhido e ajusta os meses com menos dias.
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-black text-[#001a33]">Juros e multa por atraso</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1"><span className={labelClass}>Juros ao mês (%)</span>
          <input type="text" inputMode="decimal" value={form.interest} onChange={event => onChange({ interest: normalizeCurrencyInput(event.target.value) })} className={inputClass} />
        </label>
        <label className="space-y-1"><span className={labelClass}>Multa (%)</span>
          <input type="text" inputMode="decimal" value={form.penalty} onChange={event => onChange({ penalty: normalizeCurrencyInput(event.target.value) })} className={inputClass} />
        </label>
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-black text-[#001a33]">Desconto por pontualidade</h3>
      <div className="mt-3 flex gap-2" role="group" aria-label="Tipo de desconto">
        {([{ id: 'FIXO', label: 'Em reais (R$)' }, { id: 'PERCENTUAL', label: 'Percentual (%)' }] as const).map(option => (
          <button key={option.id} type="button" aria-pressed={form.discountType === option.id}
            onClick={() => onChange({ discountType: option.id, discount: '' })}
            className={`rounded-xl border px-4 py-2 text-xs font-bold ${form.discountType === option.id ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {form.discountType === 'FIXO'
          ? <MoneyField label="Desconto por parcela (R$)" value={form.discount} onChange={discount => onChange({ discount })} />
          : <label className="space-y-1"><span className={labelClass}>Desconto por parcela (%)</span>
            <input type="text" inputMode="decimal" value={form.discount} onChange={event => onChange({ discount: normalizeCurrencyInput(event.target.value) })} className={inputClass} />
          </label>}
        <label className="space-y-1"><span className={labelClass}>Dias antes do vencimento</span>
          <input type="number" min="0" max="60" step="1" value={form.discountDays}
            onChange={event => onChange({ discountDays: event.target.value })} className={inputClass} />
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Informe 0 para valer até o vencimento. O desconto se aplica somente às parcelas, dentro do prazo informado.</p>
    </div>

    <div className="space-y-3">
      <h3 className="text-sm font-black text-[#001a33]">Taxas opcionais</h3>
      <p className="text-xs leading-5 text-slate-500">Matrícula e rematrícula são cobranças financeiras separadas neste carnê. A aluna continua sem vínculo com uma turma.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <FeeFields label="matrícula" value={form.enrollment} onChange={enrollment => onChange({ enrollment })} />
        <FeeFields label="rematrícula" value={form.reenrollment} onChange={reenrollment => onChange({ reenrollment })} />
      </div>
    </div>
  </fieldset>;
}

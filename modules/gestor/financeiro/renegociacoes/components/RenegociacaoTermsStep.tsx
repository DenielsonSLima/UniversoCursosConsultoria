import React from 'react';
import { formatCents, formatPolicyPercentage } from '../renegociacoes.presentation';
import type { RenegociacaoPolicyDefaults } from '../renegociacoes.types';
import type { RenegociacaoTermsForm } from '../renegociacoes.terms-form';
import { Field, MoneyField, OverrideField, inputClass } from './WizardSteps';

interface RenegociacaoTermsStepProps {
  defaults: RenegociacaoPolicyDefaults;
  disabled: boolean;
  form: RenegociacaoTermsForm;
  setField: <K extends keyof RenegociacaoTermsForm>(field: K, value: RenegociacaoTermsForm[K]) => void;
}

const RenegociacaoTermsStep: React.FC<RenegociacaoTermsStepProps> = ({ defaults, disabled, form, setField }) => {
  const fineIsPercentage = defaults.penalty.kind === 'PERCENTAGE';
  const fineDefault = fineIsPercentage ? formatPolicyPercentage(defaults.penalty) : formatCents(defaults.penalty.amountCents || 0);
  return (
    <fieldset disabled={disabled} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-[#001a33]">Condições do acordo</h3>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Como definir o valor do acordo">
          {([['TARGET', 'Definir total do acordo'], ['ADJUSTMENTS', 'Compor pelos abatimentos']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={form.amountMode === value}
              onClick={() => setField('amountMode', value)}
              className={`min-h-10 rounded-xl border px-3 text-xs font-bold ${form.amountMode === value ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">O total já inclui a entrada. Os abatimentos e o saldo serão conferidos pelo servidor, sem desconto duplicado.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {form.amountMode === 'TARGET'
            ? <MoneyField label="Total do acordo (incluindo entrada)" value={form.targetNegotiated} onChange={(value) => setField('targetNegotiated', value)} />
            : <MoneyField label="Desconto comercial sobre a dívida atual" value={form.commercialDiscount} onChange={(value) => setField('commercialDiscount', value)} />}
          <MoneyField label="Entrada" value={form.downPayment} onChange={(value) => setField('downPayment', value)} />
          <Field label="Quantidade de novas parcelas (sem a entrada)">
            <input type="number" min="0" max="60" step="1" value={form.installmentCount}
              onChange={(event) => setField('installmentCount', event.target.value)} className={inputClass} />
          </Field>
          {Number(form.installmentCount) > 0 ? <Field label="Primeiro vencimento das novas parcelas">
            <input type="date" value={form.firstDueDate} onChange={(event) => setField('firstDueDate', event.target.value)} className={inputClass} />
          </Field> : <p className="self-end rounded-xl bg-blue-50 p-3 text-xs text-blue-900">Sem parcelas adicionais: a entrada deverá cobrir todo o acordo. A entrada fica prevista para a data-base.</p>}
        </div>
        {Number(form.installmentCount) > 0 ? <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Frequência das novas parcelas">
            {([['MONTHLY', 'Mensal'], ['FIXED_DAYS', 'Intervalo fixo em dias']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={form.cadence === value} onClick={() => setField('cadence', value)}
                className={`min-h-10 rounded-xl border px-3 text-xs font-bold ${form.cadence === value ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
          {form.cadence === 'FIXED_DAYS' ? <Field label="Intervalo entre parcelas (dias)">
            <input type="number" min="1" max="365" step="1" value={form.intervalDays} onChange={(event) => setField('intervalDays', event.target.value)} className={inputClass} />
          </Field> : <p className="text-xs text-slate-500">Mensal usa o mês-calendário e ajusta ao último dia disponível. Não equivale a intervalos de 30 dias.</p>}
        </div> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-[#001a33]">Encargos e desconto das novas parcelas</h3>
        <p className="mt-1 text-xs text-slate-500">Origem: {defaults.origin}. Estas condições não recalculam os encargos dos títulos originais.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <OverrideField checked={form.customPunctual} onChecked={(value) => setField('customPunctual', value)}
            label="Desconto de pontualidade por nova parcela" inherited={formatCents(defaults.punctualDiscount.amountCents)}>
            <MoneyField label="Novo desconto por parcela" value={form.punctualDiscount} onChange={(value) => setField('punctualDiscount', value)} compact />
          </OverrideField>
          <OverrideField checked={form.customInterest} onChecked={(value) => setField('customInterest', value)}
            label="Juros por atraso ao mês" inherited={formatPolicyPercentage(defaults.monthlyInterest)}>
            <Field label="Novo percentual mensal">
              <input inputMode="decimal" value={form.monthlyInterest} onChange={(event) => setField('monthlyInterest', event.target.value)} className={inputClass} />
            </Field>
          </OverrideField>
          <OverrideField checked={form.customPenalty} onChecked={(value) => setField('customPenalty', value)}
            label={`Multa (${fineIsPercentage ? 'percentual' : 'valor fixo'})`} inherited={fineDefault}>
            {fineIsPercentage ? <Field label="Novo percentual da multa">
              <input inputMode="decimal" value={form.penalty} onChange={(event) => setField('penalty', event.target.value)} className={inputClass} />
            </Field> : <MoneyField label="Nova multa" value={form.penalty} onChange={(value) => setField('penalty', value)} compact />}
          </OverrideField>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Desmarque uma personalização para voltar ao padrão herdado. A simulação confere todas as regras antes de salvar.</p>
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">Os novos títulos terão instrução de não recebimento após 60 dias do vencimento. Confira a regra oficial na revisão.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-[#001a33]">Abatimentos sobre encargos da dívida atual</h3>
        <p className="mt-1 text-xs text-slate-500">Juros e multa já apurados. Os limites e a composição do total serão validados pelo cálculo oficial.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MoneyField label="Perdoar juros acumulados" value={form.waivedInterest} onChange={(value) => setField('waivedInterest', value)} />
          <MoneyField label="Perdoar multa acumulada" value={form.waivedPenalty} onChange={(value) => setField('waivedPenalty', value)} />
        </div>
      </section>
    </fieldset>
  );
};

export default RenegociacaoTermsStep;

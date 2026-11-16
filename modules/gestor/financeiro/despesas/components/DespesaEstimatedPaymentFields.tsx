import React from 'react';
import { sanitizeCurrencyInput } from '../../../../shared/utils/currency-input';
import { paymentMoneyInput, paymentMoneyLabel } from '../../settlements/financial-payment.form';
import type { FinancialPaymentForm } from '../../settlements/useFinancialPaymentForm';
import type { ExpenseEstimatePaymentMetadata } from '../despesas-estimativas-pagamento.service';

interface Props {
  form: FinancialPaymentForm;
  originalEstimate: number;
  value: string;
  onChange: (value: string) => void;
  onWithoutCharge: () => void;
}

export default function DespesaEstimatedPaymentFields({ form, originalEstimate, value, onChange, onWithoutCharge }: Props) {
  const saved = (form.submitted?.input as { expenseEstimate?: ExpenseEstimatePaymentMetadata } | undefined)?.expenseEstimate;
  const display = saved ? paymentMoneyInput(saved.realAmount) : value;
  return <section aria-label="Confirmar valor da conta" className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-[#001a33]">Valor real da conta</h3>
      <span className="text-xs text-amber-900">Estimativa original: {paymentMoneyLabel(originalEstimate)}</span>
    </div>
    <label className="block max-w-sm text-xs text-slate-600">
      Valor da fatura, sem os ajustes desta baixa
      <span className="relative mt-1.5 block">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
        <input aria-label="Valor real da conta" aria-required="true" required type="text" inputMode="decimal"
          placeholder="0,00" value={display} disabled={form.locked || form.loading}
          onFocus={event => event.currentTarget.select()}
          onChange={event => onChange(sanitizeCurrencyInput(event.target.value, display))}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-base text-[#001a33] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 sm:h-[38px] sm:text-[13px]" />
      </span>
    </label>
    <p className="mt-2 text-xs leading-5 text-slate-600">Confira a fatura antes de pagar. O valor real será confirmado junto com a baixa deste mês; a estimativa original e os próximos meses serão preservados.</p>
    {!form.history?.summary.hasEvents && <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-amber-200 pt-3 text-sm text-slate-700">
      <input type="checkbox" aria-label="Não houve cobrança neste mês" checked={false} disabled={form.locked || form.loading}
        onChange={event => { if (event.target.checked) onWithoutCharge(); }} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500" />
      Não houve cobrança neste mês
    </label>}
  </section>;
}

import React from 'react';
import { paymentMoneyLabel } from './financial-payment.form';

export type FinancialPaymentSummary = {
  originalAmount: string; previouslyPaid: string; remainingBefore: string; status: string; hasEvents: boolean;
};

export function parseFinancialPaymentSummary(value: unknown): FinancialPaymentSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const summary = value as FinancialPaymentSummary;
  if (['originalAmount', 'previouslyPaid', 'remainingBefore'].some(key => !/^\d+(?:\.\d+)?$/.test(String(summary[key as keyof FinancialPaymentSummary])))) return undefined;
  if (typeof summary.status !== 'string' || typeof summary.hasEvents !== 'boolean') return undefined;
  return summary;
}

export const hasPartialPayment = (summary?: FinancialPaymentSummary) => Boolean(summary?.hasEvents && summary.status !== 'PAGO' && Number(summary.previouslyPaid) > 0 && Number(summary.remainingBefore) > 0);

export function FinancialPaymentBalance({ summary, expense = false }: { summary?: FinancialPaymentSummary; expense?: boolean }) {
  if (!summary?.hasEvents) return null;
  return <div className="mt-2 space-y-1 text-[10px] font-bold">
    <p className="text-emerald-700">{expense ? 'Pago' : 'Recebido'}: {paymentMoneyLabel(summary.previouslyPaid)}</p>
    <p className="text-amber-800">Saldo: {paymentMoneyLabel(summary.remainingBefore)}</p>
    {hasPartialPayment(summary) ? <p className="text-amber-800">Baixa parcial</p> : null}
  </div>;
}

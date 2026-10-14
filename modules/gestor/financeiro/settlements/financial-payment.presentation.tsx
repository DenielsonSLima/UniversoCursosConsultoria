import React from 'react';
import { paymentMoneyLabel } from './financial-payment.form';

import { hasPartialPayment, type FinancialPaymentSummary } from './financial-payment.summary.ts';
export { hasPartialPayment } from './financial-payment.summary.ts';

export function FinancialPaymentBalance({ summary, expense = false }: { summary?: FinancialPaymentSummary; expense?: boolean }) {
  if (!summary?.hasEvents) return null;
  return <div className="mt-2 space-y-1 text-[10px] font-bold">
    <p className="text-emerald-700">{expense ? 'Pago' : 'Recebido'}: {paymentMoneyLabel(summary.previouslyPaid)}</p>
    <p className="text-amber-800">Saldo: {paymentMoneyLabel(summary.remainingBefore)}</p>
    {hasPartialPayment(summary) ? <p className="text-amber-800">Baixa parcial</p> : null}
  </div>;
}

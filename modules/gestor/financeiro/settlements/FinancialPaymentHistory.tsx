import React from 'react';
import { FinancialPaymentReversal } from './FinancialPaymentReversal';
import type { FinancialPaymentHistory as PaymentHistory, FinancialPaymentSourceKind } from './financial-payment.types';
import { paymentMoneyLabel } from './financial-payment.form';

export function FinancialPaymentHistory({ history, sourceKind, sourceId, onReversed, onBusyChange, disabled }: {
  history: PaymentHistory; sourceKind: FinancialPaymentSourceKind; sourceId: string;
  onReversed?: () => Promise<void>; onBusyChange: (busy: boolean) => void; disabled?: boolean;
}) {
  if (!history.events.length) return null;
  return <details className="rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-black text-[#001a33]">Histórico de pagamentos ({history.events.length})</summary>
    <ol className="mt-4 divide-y divide-slate-100">{history.events.map(event => <li key={event.id} className="space-y-2 py-3 text-xs">
      <p className="flex flex-wrap justify-between gap-2 font-black text-slate-700"><span>{new Date(`${event.paymentDate}T12:00:00`).toLocaleDateString('pt-BR')}</span>
        <span>{paymentMoneyLabel(event.paymentAmount)}{event.reversedAt ? ' · Estornado' : ''}</span></p>
      {event.components.map((component, index) => <p key={index} className="text-slate-600">{component.method} · {component.accountName || 'Conta registrada'} · {paymentMoneyLabel(component.amount)}</p>)}
      {sourceKind !== 'RECEIVABLE' && !event.reversedAt && onReversed ? <FinancialPaymentReversal sourceKind={sourceKind} sourceId={sourceId} event={event} onDone={onReversed} onBusyChange={onBusyChange} disabled={disabled} /> : null}
      <p className="text-slate-500">Principal: {paymentMoneyLabel(event.principalPaid)} · Desconto: {paymentMoneyLabel(event.discount)} · Juros: {paymentMoneyLabel(event.interest)} · Multa: {paymentMoneyLabel(event.penalty)} · Acréscimos: {paymentMoneyLabel(event.addition)}</p>
      {event.actorName ? <p className="text-slate-500">Registrado por {event.actorName}</p> : null}
      {event.notes ? <p className="break-words text-slate-500">{event.notes}</p> : null}
    </li>)}</ol>
  </details>;
}

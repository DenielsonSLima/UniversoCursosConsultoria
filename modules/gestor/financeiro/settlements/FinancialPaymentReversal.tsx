import React, { useRef, useState } from 'react';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { reverseFinancialPayment } from './financial-payment.service';
import type { FinancialPaymentHistoryEntry, FinancialPaymentSourceKind } from './financial-payment.types';
import { paymentMoneyLabel } from './financial-payment.form';

export function FinancialPaymentReversal({ sourceKind, sourceId, event, onDone, onBusyChange, disabled }: {
  sourceKind: Exclude<FinancialPaymentSourceKind, 'RECEIVABLE'>; sourceId: string; event: FinancialPaymentHistoryEntry;
  onDone: () => Promise<void>; onBusyChange: (busy: boolean) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const requestId = useRef(generateSafeUuid());
  const inFlight = useRef(false);
  const confirm = async () => {
    if (disabled || inFlight.current || reason.trim().length < 5) return;
    inFlight.current = true; setPending(true); setSubmitted(true); onBusyChange(true); setError('');
    try {
      await reverseFinancialPayment(sourceKind, sourceId, event.id, requestId.current, reason.trim());
      await onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o estorno.'); }
    finally { inFlight.current = false; setPending(false); onBusyChange(false); }
  };
  if (!open) return <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="rounded-lg border border-rose-200 px-3 py-2 font-bold text-rose-700 disabled:opacity-40">Estornar este pagamento</button>;
  return <div className="space-y-2 rounded-xl bg-rose-50 p-3">
    <p className="font-bold text-rose-900">Estornar {paymentMoneyLabel(event.paymentAmount)} deste pagamento? O saldo em aberto será atualizado.</p>
    <label className="block font-bold text-rose-900">Motivo do estorno
      <textarea aria-label="Motivo do estorno" value={reason} onChange={event => setReason(event.target.value)} disabled={pending || submitted} minLength={5} maxLength={500} className="mt-1 block w-full rounded-lg border border-rose-200 bg-white p-2 font-normal" />
    </label>
    {error ? <p role="alert" className="text-rose-800">{error}</p> : null}
    <div className="flex gap-2">
      <button type="button" disabled={disabled || pending || reason.trim().length < 5} onClick={confirm} className="rounded-lg bg-rose-700 px-3 py-2 font-bold text-white disabled:opacity-40">{pending ? 'Conferindo...' : submitted ? 'Conferir estorno' : 'Confirmar estorno'}</button>
      {!submitted ? <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-rose-200 px-3 py-2">Voltar</button> : null}
    </div>
  </div>;
}

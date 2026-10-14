import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { isContaDisponivelNoPolo, type ContaBancaria } from '../financeiro.types';
import type { FinancialPaymentConfirmation, FinancialPaymentResult, FinancialPaymentSourceKind } from './financial-payment.types';
import { useFinancialPaymentForm } from './useFinancialPaymentForm';
import { FinancialPaymentEditor } from './FinancialPaymentEditor';
import { FinancialPaymentHistory } from './FinancialPaymentHistory';
import { paymentMoneyLabel } from './financial-payment.form';

export interface FinancialPaymentModalProps {
  sourceKind: FinancialPaymentSourceKind;
  sourceId: string;
  poloId: string;
  description: string;
  partnerName?: string;
  accounts: ContaBancaria[];
  initialAccountId?: string;
  readOnly?: boolean;
  onClose: () => void;
  onReversed?: () => Promise<void>;
  onConfirm: (payload: FinancialPaymentConfirmation) => Promise<FinancialPaymentResult>;
}

export const FinancialPaymentModal: React.FC<FinancialPaymentModalProps> = (props) => {
  const accounts = props.accounts.filter(account => account.ativo !== false && isContaDisponivelNoPolo(account, props.poloId));
  const initialAccountId = accounts.some(account => account.id === props.initialAccountId) ? props.initialAccountId : accounts[0]?.id || '';
  const form = useFinancialPaymentForm(props.sourceKind, props.sourceId, initialAccountId, props.onConfirm);
  const [reversing, setReversing] = useState(false);
  const busy = form.pending || reversing;
  const ref = useRef<HTMLDivElement>(null);
  const expense = props.sourceKind !== 'RECEIVABLE';
  const summary = form.preview || form.history?.summary;
  const readOnly = !form.submitted && (props.readOnly || form.history?.summary.status === 'PAGO');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  const close = () => { if (!busy) props.onClose(); };
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const nodes = (Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []) as HTMLElement[])
      .filter(node => !node.closest('fieldset[disabled]') && (!node.closest('details:not([open])') || node.tagName === 'SUMMARY'));
    if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === ref.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="financial-payment-title" tabIndex={-1} onKeyDown={keyboard}
      className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none">
      <header className="flex shrink-0 items-start justify-between gap-4 bg-[#001a33] px-5 py-5 text-white sm:px-7">
        <div><p className="text-xs font-bold text-emerald-300">{expense ? 'Contas a pagar' : 'Recebimento'}</p>
          <h2 id="financial-payment-title" className="mt-1 text-xl font-black">{readOnly ? 'Histórico de pagamentos' : expense ? 'Registrar pagamento' : 'Registrar recebimento'}</h2>
          <p className="mt-1 text-sm text-slate-300">{props.partnerName ? `${props.partnerName} · ` : ''}{props.description}</p></div>
        <button type="button" aria-label="Fechar pagamento" onClick={close} disabled={busy} className="rounded-xl p-2 text-white hover:bg-white/10 disabled:opacity-40"><X size={20} /></button>
      </header>
      <main className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
        {form.loading ? <p role="status" className="flex gap-2 text-sm text-slate-600"><Loader2 size={18} className="animate-spin" /> Consultando saldo e pagamentos...</p> : null}
        {summary ? <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
          {[['Valor original', summary.originalAmount], [expense ? 'Já pago' : 'Já recebido', summary.previouslyPaid], ['Saldo em aberto', summary.remainingBefore]].map(([label, value]) =>
            <div key={label}><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-[#001a33]">{paymentMoneyLabel(value)}</p></div>)}
        </div> : null}
        {!readOnly ? <FinancialPaymentEditor form={{ ...form, locked: form.locked || reversing }} accounts={accounts} expense={expense} /> : null}
        {!readOnly && form.preview ? <div className="space-y-2 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-900" aria-label="Resumo do pagamento">
          <p className="flex justify-between gap-3 font-black"><span>{expense ? 'Pagamento agora' : 'Recebimento agora'}</span><span>{paymentMoneyLabel(form.preview.paymentAmount)}</span></p>
          <p className="flex justify-between gap-3"><span>Desconto aplicado nesta baixa</span><strong>{paymentMoneyLabel(form.preview.discount)}</strong></p>
          <p className="flex justify-between gap-3 border-t border-emerald-200 pt-2 font-black"><span>Saldo restante</span><span>{paymentMoneyLabel(form.preview.remainingAfter)}</span></p>
          <p className="text-xs">{form.preview.status === 'PAGO' ? 'Esta baixa quita o lançamento.' : 'Baixa parcial. O saldo restante continuará em aberto.'}</p>
          {form.preview.requiresRemoteCancellation ? <p className="text-xs leading-5">O boleto atual será cancelado antes de registrar este recebimento. Se houver saldo restante, ele continuará em aberto no sistema.</p> : null}
        </div> : null}
        {form.previewLoading && !readOnly ? <p role="status" className="text-xs text-slate-500">Conferindo valores e saldo...</p> : null}
        {form.submitted ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Este pagamento já foi enviado. Use “Conferir pagamento” para consultar a mesma operação.</p> : null}
        {form.storageWarning ? <p role="alert" className="text-sm text-amber-800">Mantenha esta janela aberta: o navegador não conseguiu salvar a retomada.</p> : null}
        {form.error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{form.error}</p> : null}
        {form.history ? <FinancialPaymentHistory history={form.history} sourceKind={props.sourceKind} sourceId={props.sourceId} onReversed={props.onReversed} onBusyChange={setReversing} disabled={busy || Boolean(form.submitted)} /> : null}
      </main>
      <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 p-5">
        <button type="button" onClick={close} disabled={busy} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 disabled:opacity-40">Fechar</button>
        {!readOnly ? <button type="button" onClick={form.confirm} disabled={!form.canConfirm || reversing}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-40">
          {form.pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {form.pending ? 'Conferindo...' : form.submitted ? 'Conferir pagamento' : form.preview?.status === 'PAGO' ? 'Confirmar quitação' : 'Confirmar baixa parcial'}
        </button> : null}
      </footer>
    </div>
  </div>, document.body);
}

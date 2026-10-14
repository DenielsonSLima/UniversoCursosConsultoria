import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, CircleDollarSign, Loader2, ShieldCheck, X } from 'lucide-react';
import { isContaDisponivelNoPolo, type ContaBancaria } from '../financeiro.types';
import type { FinancialPaymentConfirmation, FinancialPaymentResult, FinancialPaymentSourceKind } from './financial-payment.types';
import { useFinancialPaymentForm } from './useFinancialPaymentForm';
import { FinancialPaymentEditor } from './FinancialPaymentEditor';
import { FinancialPaymentHistory } from './FinancialPaymentHistory';
import { FinancialPaymentSummary } from './FinancialPaymentSummary';

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
  const readOnly = Boolean(!form.submitted && (props.readOnly || form.history?.summary.status === 'PAGO'));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  const close = () => { if (!busy) props.onClose(); };
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const nodes = (Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []) as HTMLElement[])
      .filter(node => !node.closest('fieldset[disabled]') && (!node.closest('details:not([open])') || node.tagName === 'SUMMARY'));
    if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === ref.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex min-h-screen w-full items-center justify-center overflow-y-auto bg-[#001225]/80 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="financial-payment-title" aria-describedby="financial-payment-description" aria-busy={busy}
        tabIndex={-1} onKeyDown={keyboard}
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white shadow-[0_35px_100px_-24px_rgba(0,18,37,0.75)] outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem]">
        <header className="relative shrink-0 overflow-hidden bg-[#001a33] px-5 py-5 text-white sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full border border-emerald-300/15 bg-emerald-400/10" />
          <div className="pointer-events-none absolute right-24 top-10 h-20 w-20 rounded-full bg-cyan-300/5 blur-xl" />
          <div className="relative flex items-start gap-4 pr-10">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/15 text-emerald-300 shadow-inner"><CircleDollarSign size={24} /></span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><ShieldCheck size={13} /> Baixa manual segura</p>
              <h2 id="financial-payment-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{readOnly ? 'Histórico de pagamentos' : expense ? 'Confirmar pagamento' : 'Confirmar recebimento'}</h2>
              <p id="financial-payment-description" className="mt-1 max-w-2xl truncate text-xs font-medium text-slate-300 sm:text-sm">{props.partnerName ? `${props.partnerName} · ` : ''}{props.description}</p>
            </div>
          </div>
          <button type="button" aria-label="Fechar pagamento" onClick={close} disabled={busy}
            className="absolute right-4 top-4 rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 sm:right-6 sm:top-6"><X size={18} /></button>
        </header>
        <main className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-6">
          {form.loading ? <p role="status" className="flex gap-2 text-sm text-slate-600"><Loader2 size={18} className="animate-spin" /> Consultando saldo e pagamentos...</p> : null}
          {!readOnly && form.preview?.requiresRemoteCancellation ? <div className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>O boleto atual será cancelado antes de registrar este recebimento. A baixa local só será consolidada após a confirmação bancária. Se houver saldo restante, ele continuará em aberto no sistema.</span>
          </div> : null}
          <div className={`grid items-start gap-5 ${readOnly ? '' : 'lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]'}`}>
            {!readOnly ? <section aria-label={expense ? 'Dados do pagamento' : 'Dados do recebimento'} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <FinancialPaymentEditor form={{ ...form, locked: form.locked || reversing }} accounts={accounts} expense={expense} />
            </section> : null}
            <FinancialPaymentSummary summary={summary} preview={form.preview} expense={expense} readOnly={readOnly} />
          </div>
          {form.previewLoading && !readOnly ? <p role="status" className="text-xs text-slate-500">Conferindo valores e saldo...</p> : null}
          {form.submitted ? <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800">Este pagamento já foi enviado. Use “Conferir pagamento” para consultar a mesma operação.</p> : null}
          {form.storageWarning ? <p role="alert" className="text-sm text-amber-800">Mantenha esta janela aberta: o navegador não conseguiu salvar a retomada.</p> : null}
          {form.error ? <p role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700"><AlertCircle size={16} className="shrink-0" />{form.error}</p> : null}
          {form.history ? <FinancialPaymentHistory history={form.history} sourceKind={props.sourceKind} sourceId={props.sourceId} onReversed={props.onReversed} onBusyChange={setReversing} disabled={busy || Boolean(form.submitted)} /> : null}
        </main>
        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button type="button" onClick={close} disabled={busy}
            className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50">Fechar</button>
          {!readOnly ? <button type="button" onClick={form.confirm} disabled={!form.canConfirm || reversing}
            className="flex min-w-[240px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/15 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50">
            {form.pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {form.pending ? 'Conferindo...' : form.submitted ? 'Conferir pagamento' : form.preview?.status === 'PAGO' ? 'Confirmar quitação' : 'Confirmar baixa parcial'}
          </button> : null}
        </footer>
      </div>
    </div>, document.body,
  );
};

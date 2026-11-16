import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, FileText, Gift, Loader2, X, Zap } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { EadCouponCheckoutState } from '../../../ead/cupons/hooks/useEadCouponCheckout';
import {
  buildEadCheckoutSubmission, defaultEadCheckoutMethod, formatEadCheckoutMoney, resolveEadCheckoutOptions,
} from '../eadCheckoutOptions';
import EadCouponField from './cupons/EadCouponField';

interface Props { view: any }

export default function EadCheckoutReviewModal({ view }: Props) {
  const {
    eadCheckoutReview, setEadCheckoutReview, eadPaymentMethod, setEadPaymentMethod,
    eadInstallments, setEadInstallments, checkoutMutation, startCheckout, checkoutError,
  } = view;
  const coupon: EadCouponCheckoutState | undefined = view.eadCoupon;
  const quote = coupon?.quote;
  const free = quote?.discountPercent === 100;
  const options = resolveEadCheckoutOptions(eadCheckoutReview.course);
  const selectedMethod = options.options.some(option => option.method === eadPaymentMethod)
    ? eadPaymentMethod : defaultEadCheckoutMethod(options);
  const selectedInstallments = selectedMethod === 'CREDIT_CARD'
    ? Math.max(1, Math.min(options.maxParcelas, eadInstallments || 1)) : 1;
  const amount = quote?.payableAmount ?? options.amount;
  const installmentValue = selectedInstallments > 1 ? amount / selectedInstallments : amount;
  const busy = checkoutMutation.isPending || Boolean(coupon?.isRedeeming);
  const needsCouponCheck = Boolean(coupon?.code.trim() && !quote);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const close = () => { if (!busy) setEadCheckoutReview(null); };
  if (typeof document === 'undefined') return null;
  return createPortal((
    <div className="aluno-course-dialog fixed inset-0 z-[99999] flex min-h-dvh w-full items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/75 px-4 py-6 backdrop-blur-sm pointer-events-auto">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ead-checkout-title"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); }
          if (event.key === 'Tab') {
            const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]');
            if (!items?.length) return;
            const first = items[0], last = items[items.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }} className="relative z-[100000] w-full max-w-xl rounded-[2rem] bg-white shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">{free ? 'Gratuidade EAD' : 'Pagamento EAD'}</p>
            <h3 id="ead-checkout-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">{eadCheckoutReview.course.nome}</h3>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label="Fechar pagamento EAD"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 text-slate-400 outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 md:h-10 md:w-10"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">{quote ? 'Total a pagar' : 'Valor do curso'}</p>
            <p className="mt-1 text-2xl font-black text-[#001a33]">{formatEadCheckoutMoney(amount)}</p>
          </div>
          {coupon && <EadCouponField coupon={coupon} disabled={busy} />}
          {!free && <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.options.map(option => {
                const active = selectedMethod === option.method;
                const Icon = option.method === 'CREDIT_CARD' ? CreditCard : option.method === 'BOLETO' ? FileText : Zap;
                return <button key={option.method} type="button" disabled={busy}
                  onClick={() => { setEadPaymentMethod(option.method); setEadInstallments(option.method === 'CREDIT_CARD' ? Math.max(1, options.maxParcelas) : 1); }}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 md:min-h-0 ${active ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'}`}>
                  <Icon size={14} />{option.label}
                </button>;
              })}
            </div>
            {selectedMethod === 'CREDIT_CARD' && options.allowInstallments && <div className="rounded-2xl border border-blue-100 bg-blue-50/45 p-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-blue-700">Parcelas no cartão</label>
              <InstitutionalSelect className="mt-2" value={String(selectedInstallments)}
                onValueChange={value => setEadInstallments(Number(value) || 1)} ariaLabel="Parcelas no cartão"
                options={Array.from({ length: options.maxParcelas }, (_, index) => index + 1).map(installments => ({
                  value: String(installments), label: `${installments}x de ${formatEadCheckoutMoney(amount / installments)}`,
                }))} />
            </div>}
          </>}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-600">
            {free ? 'Ao confirmar, o curso será liberado por gratuidade. Nenhuma cobrança será gerada.'
              : selectedMethod === 'CREDIT_CARD'
                ? `Cartão selecionado: ${selectedInstallments}x de ${formatEadCheckoutMoney(installmentValue)}. Juros do gateway podem alterar o total no checkout.`
                : selectedMethod === 'PIX'
                  ? `Pix selecionado: será emitido um único Boleto com Pix de ${formatEadCheckoutMoney(amount)} e o QR Code oficial aparecerá nesta tela.`
                  : `Boleto com Pix selecionado: o PDF completo da cobrança de ${formatEadCheckoutMoney(amount)} será aberto em uma nova aba.`}
          </div>
          {checkoutError && <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold leading-relaxed text-red-700">{checkoutError}</div>}
        </div>
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:static sm:flex-row sm:justify-end sm:px-6 sm:py-4">
          <button type="button" onClick={close} disabled={busy}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-40 md:min-h-0">Voltar</button>
          <button type="button" disabled={busy || Boolean(coupon?.isChecking) || needsCouponCheck || (!free && options.options.length === 0)}
            onClick={() => {
              if (free) { coupon?.redeemFree(); return; }
              startCheckout(eadCheckoutReview.course, quote ? { id: quote.turmaId } : null,
                buildEadCheckoutSubmission(selectedMethod, selectedInstallments), quote?.code, quote?.requestId);
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:bg-slate-300 md:min-h-0">
            {busy ? <Loader2 size={14} className="animate-spin" /> : free ? <Gift size={14} /> : <CreditCard size={14} />}
            {free ? 'Confirmar curso gratuito' : quote ? `Pagar ${formatEadCheckoutMoney(quote.payableAmount)}` : 'Continuar para pagamento'}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

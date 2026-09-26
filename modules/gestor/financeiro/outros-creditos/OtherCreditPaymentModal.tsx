import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { OtherCreditPaymentContent } from './OtherCreditPaymentContent';
import { useOtherCreditPayment } from './useOtherCreditPayment';

export { OtherCreditPaymentContent } from './OtherCreditPaymentContent';

export const OtherCreditPaymentModal: React.FC<{
  receivableId: string;
  onClose: () => void;
  onNewPayment?: () => void;
}> = ({ receivableId, onClose, onNewPayment }) => {
  const model = useOtherCreditPayment(receivableId);
  const closeRef = useRef<React.ComponentRef<'button'>>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, error, isFetching } = model.query;
  const usable = data && !isError;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    // Polling may remove the focused payment action after confirmation.
    // Keep keyboard focus inside the dialog when its controls change.
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
      closeRef.current?.focus();
    }
  }, [data?.payment.status, data?.canPay, data?.canRefresh, isError, isLoading]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="other-credit-payment-title"
      className="fixed inset-0 z-[130] flex h-[100dvh] flex-col overflow-y-auto bg-white text-[#001a33]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary');
        if (!nodes?.length) return;
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-10">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar caixa"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"><ArrowLeft size={19} /></button>
            <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 sm:text-[10px]">Universo · Outros créditos</p>
              <h2 id="other-credit-payment-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Caixa na tela</h2></div>
          </div>
          {onNewPayment && <button type="button" onClick={onNewPayment}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold transition hover:border-[#001a33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:px-4 sm:text-sm">
            <Plus size={17} aria-hidden="true" /><span>Novo atendimento</span>
          </button>}
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {isLoading && <div role="status" className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-20 text-slate-500">
          <Loader2 size={28} className="animate-spin text-emerald-600" aria-hidden="true" /><p className="text-sm font-semibold">Consultando cobrança...</p>
        </div>}
        {isError && <div role="alert" className="mx-auto my-16 w-[calc(100%-3rem)] max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-900">
          <h3 className="text-lg font-black">Não foi possível consultar a cobrança</h3><p className="mt-3 text-sm leading-6">{error.message}</p>
          <button type="button" onClick={() => void model.query.refetch()} disabled={isFetching}
            className="mt-6 min-h-12 rounded-xl bg-[#001a33] px-6 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 disabled:opacity-40">{isFetching ? 'Consultando...' : 'Tentar consulta novamente'}</button>
        </div>}
        {usable && <OtherCreditPaymentContent data={data}
          onRefresh={() => model.refresh.mutate()} refreshPending={model.refresh.isPending} isFetching={isFetching}
          onOpenDocument={() => model.document.mutate()} documentPending={model.document.isPending} />}
        {model.actionMessage && <p role="status" aria-live="polite" className="mx-auto mb-6 w-[calc(100%-3rem)] max-w-5xl rounded-xl bg-slate-100 px-5 py-3 text-sm text-slate-600">{model.actionMessage}</p>}
      </main>

      <footer className="mt-auto border-t border-slate-100 bg-white px-5 py-4 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-[10px] font-medium text-slate-400 sm:text-xs">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} aria-hidden="true" /> BolePix Banese · Pix e boleto na mesma cobrança</span>
          <span>Situação exibida conforme o registro da cobrança.</span>
        </div>
      </footer>
    </div>, document.body,
  );
};

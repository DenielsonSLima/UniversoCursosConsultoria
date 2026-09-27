import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { OtherCreditPaymentContent } from './OtherCreditPaymentContent';
import { useOtherCreditPayment } from './useOtherCreditPayment';
import { usePdvReceipt } from './usePdvReceipt';
import { PdvReceiptActions } from './PdvReceiptActions';

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
  const receipt = usePdvReceipt(receivableId, Boolean(usable && data.payment.status === 'PAGO'));
  const printing = receipt.state === 'printing';

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
  }, [data?.payment.status, data?.canPay, data?.canRefresh, isError, isLoading, receipt.state]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="other-credit-payment-title"
      className="fixed inset-0 z-[130] flex h-[100dvh] flex-col overflow-y-auto bg-[#eef2f7] text-[#071b3f]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!printing) onClose(); }
        if (event.key !== 'Tab') return;
        const nodes = Array.from<HTMLElement>(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], summary, input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        ) || []).filter(node => node.getClientRects().length > 0);
        if (!nodes?.length) return;
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-[246px] bg-[#071b3f]" />
        <div className="absolute -right-28 -top-8 h-[360px] w-[360px] rounded-full bg-blue-500/20 blur-[100px]" />
        <div className="absolute left-[8%] top-36 h-40 w-40 rounded-full bg-[#ed1c24]/10 blur-[70px]" />
        <div className="absolute inset-x-0 top-[245px] h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent" />
      </div>

      <header className="sticky top-0 z-30 border-t-[3px] border-t-[#ed1c24] bg-[#071b3f]/90 text-white shadow-lg shadow-slate-950/10 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[78px] w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap sm:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <button ref={closeRef} type="button" onClick={onClose} disabled={printing} aria-label="Fechar caixa"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07] text-white transition hover:border-white/30 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b3f]"><ArrowLeft size={18} aria-hidden="true" /></button>
            <span className="flex h-11 w-[124px] shrink-0 items-center justify-center rounded-xl bg-white px-3 shadow-sm sm:h-12 sm:w-[154px]">
              <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-auto w-full object-contain" />
            </span>
            <div className="min-w-0 border-l border-white/15 pl-3 sm:pl-5"><p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-blue-200 sm:text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#ed1c24] shadow-[0_0_0_4px_rgba(237,28,36,0.14)]" /> Ponto de venda</p>
              <h2 id="other-credit-payment-title" className="mt-1 text-sm font-bold tracking-tight text-white sm:text-lg">Pagamento BolePix</h2></div>
            <div className="hidden border-l border-white/15 pl-5 md:block"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white">Pix + boleto</p><p className="mt-1 text-[10px] font-medium text-blue-200/60">Uma única cobrança Banese</p></div>
          </div>
          {onNewPayment && <button type="button" onClick={onNewPayment} disabled={printing}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b3f] sm:px-4 sm:text-sm">
            <Plus size={16} aria-hidden="true" /><span>Novo atendimento</span>
          </button>}
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {usable && data.payment.status === 'PAGO' && <div className="pt-5 sm:pt-8">
          <PdvReceiptActions behavior={receipt.query.data?.receipt.behavior || 'PERGUNTAR'}
            automaticReady={receipt.query.data?.receipt.automaticReady === true}
            state={receipt.state} error={receipt.error} receiptAvailable={Boolean(receipt.query.data)}
            requiresReprint={receipt.requiresReprint} reprintReason={receipt.reprintReason}
            onReprintReasonChange={receipt.setReprintReason}
            onPrint={() => { void receipt.print().then(completed => { if (completed) onClose(); }); }}
            onOpenReceipt={receipt.open} onRetry={receipt.retry} onComplete={onClose} />
        </div>}
        {isLoading && <div role="status" className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-20 text-slate-500">
          <Loader2 size={28} className="animate-spin text-blue-700" aria-hidden="true" /><p className="text-sm font-semibold">Consultando cobrança...</p>
        </div>}
        {isError && <div role="alert" className="mx-auto my-16 w-[calc(100%-3rem)] max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-900">
          <h3 className="text-lg font-black">Não foi possível consultar a cobrança</h3><p className="mt-3 text-sm leading-6">{error.message}</p>
          <button type="button" onClick={() => void model.query.refetch()} disabled={isFetching}
            className="mt-6 min-h-12 rounded-xl bg-[#001a33] px-6 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4 disabled:opacity-40">{isFetching ? 'Consultando...' : 'Tentar consulta novamente'}</button>
        </div>}
        {usable && <OtherCreditPaymentContent data={data}
          isFetching={isFetching}
          onOpenDocument={() => model.document.mutate()} documentPending={model.document.isPending} />}
        {model.actionMessage && <p role="status" aria-live="polite" className="mx-auto mb-6 w-[calc(100%-3rem)] max-w-5xl rounded-xl bg-slate-100 px-5 py-3 text-sm text-slate-600">{model.actionMessage}</p>}
      </main>

      <footer className="relative z-10 mt-auto border-t border-slate-200/80 bg-[#eef2f7]/90 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-[10px] font-medium text-slate-500 sm:text-[11px]">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} aria-hidden="true" /> BolePix Banese · Pix e boleto na mesma cobrança</span>
          <span>Situação exibida conforme o registro da cobrança.</span>
        </div>
      </footer>
    </div>, document.body,
  );
};

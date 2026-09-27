import React from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, FileText, Loader2, Printer } from 'lucide-react';

export type PdvReceiptActionState = 'preparing' | 'ready' | 'printing' | 'dialog-opened' | 'accepted' | 'unknown' | 'error';

export interface PdvReceiptActionsProps {
  behavior: 'PERGUNTAR' | 'AUTOMATICO' | 'NAO';
  automaticReady: boolean;
  state: PdvReceiptActionState;
  receiptAvailable: boolean;
  error?: string | null;
  requiresReprint?: boolean;
  reprintReason?: string;
  onReprintReasonChange?: (reason: string) => void;
  onPrint: () => void;
  onOpenReceipt: () => void;
  onComplete: () => void;
  onRetry?: () => void;
}

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

/** Presentation only. Payment, receipt preparation and print claims belong to the caller. */
export function PdvReceiptActions({
  behavior, automaticReady, state, receiptAvailable, error,
  requiresReprint = false, reprintReason = '', onReprintReasonChange,
  onPrint, onOpenReceipt, onComplete, onRetry,
}: PdvReceiptActionsProps) {
  const busy = state === 'preparing' || state === 'printing';
  const automatic = behavior === 'AUTOMATICO' && automaticReady;
  const ask = behavior === 'PERGUNTAR' || (behavior === 'AUTOMATICO' && !automaticReady);
  const canPrint = !requiresReprint && receiptAvailable && behavior !== 'NAO'
    && (state === 'error' || (state === 'ready' && !automatic));
  const canReprint = requiresReprint && receiptAvailable && !busy;
  const reprintReasonValid = reprintReason.trim().length >= 5 && reprintReason.length <= 240;
  const title = state === 'preparing' ? 'Preparando comprovante'
    : state === 'printing' ? 'Enviando para impressão'
    : state === 'unknown' ? 'Confira a impressora antes de continuar'
    : state === 'error' ? receiptAvailable ? 'Não foi possível concluir a impressão' : 'Não foi possível preparar o comprovante'
    : state === 'dialog-opened' ? 'Diálogo de impressão aberto'
    : state === 'accepted' ? 'Envio aceito pela impressora'
    : ask ? 'Imprimir comprovante?'
    : automatic ? 'Impressão automática preparada'
    : 'Atendimento concluído';
  const description = state === 'unknown'
    ? 'Não foi possível confirmar o envio. O pagamento está preservado. Confira se o comprovante saiu; nenhum novo envio será feito automaticamente.'
    : state === 'dialog-opened'
    ? 'Conclua ou cancele a impressão no diálogo do navegador. A abertura do diálogo não confirma que o papel foi impresso.'
    : state === 'accepted'
    ? 'O envio foi aceito. Você pode concluir o atendimento; o comprovante continua disponível.'
    : state === 'error'
    ? 'O pagamento está confirmado. Você pode acessar o comprovante ou concluir sem imprimir.'
    : state === 'preparing'
    ? 'Aguarde a preparação do comprovante deste pagamento.'
    : state === 'printing'
    ? 'Aguarde o resultado deste envio para evitar cópias duplicadas.'
    : behavior === 'NAO'
    ? 'Nenhuma impressão será iniciada. O comprovante continuará disponível no atendimento.'
    : automatic
    ? 'O comprovante será enviado uma única vez à impressora configurada.'
    : 'O pagamento já foi confirmado. Escolha imprimir agora ou concluir sem impressão.';

  return (
    <section aria-labelledby="pdv-receipt-title" className="mx-auto mb-6 w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:w-[calc(100%-4rem)]">
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${state === 'error' || state === 'unknown' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-800'}`}>
          {busy ? <Loader2 size={22} className="animate-spin" aria-hidden="true" />
            : state === 'error' || state === 'unknown' ? <AlertCircle size={22} aria-hidden="true" />
            : state === 'accepted' ? <CheckCircle2 size={22} aria-hidden="true" />
            : <Printer size={22} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="pdv-receipt-title" className="text-base font-bold text-[#0b1f4a]">{title}</h3>
          <p role="status" aria-live="polite" className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
          {behavior === 'AUTOMATICO' && !automaticReady && state === 'ready' && (
            <p className="mt-2 text-xs leading-5 text-amber-800">A impressão automática ainda não está pronta nesta estação. Escolha como concluir.</p>
          )}
          {state === 'error' && error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
          {canReprint && <div className="mt-4 max-w-xl rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-xs leading-5 text-amber-950">Já existe uma tentativa de impressão. Confira a impressora antes de solicitar outra via. A reimpressão será registrada com o motivo informado.</p>
            <label className="mt-3 block text-xs font-semibold text-slate-700">Motivo da reimpressão
              <input value={reprintReason} onChange={event => onReprintReasonChange?.(event.target.value)} minLength={5} maxLength={240} placeholder="Informe por que precisa de outra via" className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-blue-600" />
            </label>
            <p className="mt-1 text-[11px] text-slate-500">Informe de 5 a 240 caracteres.</p>
          </div>}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
        {canPrint && <button type="button" onClick={onPrint} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b1f4a] px-5 py-3 text-sm font-bold text-white hover:bg-[#163768] ${focus}`}>
          <Printer size={17} aria-hidden="true" /> {state === 'error' ? 'Tentar imprimir novamente' : 'Imprimir comprovante'}
        </button>}
        {canReprint && <button type="button" onClick={onPrint} disabled={!reprintReasonValid || !onReprintReasonChange} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b1f4a] px-5 py-3 text-sm font-bold text-white hover:bg-[#163768] disabled:opacity-40 ${focus}`}>
          <Printer size={17} className="shrink-0" aria-hidden="true" />{state === 'unknown' ? 'Conferi a impressora e quero reimprimir' : 'Reimprimir comprovante'}
        </button>}
        {state === 'error' && !receiptAvailable && onRetry && <button type="button" onClick={onRetry} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b1f4a] px-5 py-3 text-sm font-bold text-white ${focus}`}>
          <FileText size={17} aria-hidden="true" /> Preparar comprovante novamente
        </button>}
        {receiptAvailable && <button type="button" onClick={onOpenReceipt} disabled={busy} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#0b1f4a] hover:bg-blue-50 disabled:opacity-40 ${focus}`}>
          <FileText size={17} aria-hidden="true" /> Ver / baixar comprovante
        </button>}
        <button type="button" onClick={onComplete} disabled={busy} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-[#0b1f4a] hover:bg-slate-200/60 disabled:opacity-40 sm:ml-auto ${focus}`}>
          {ask && state === 'ready' ? 'Concluir sem imprimir' : 'Concluir atendimento'} <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import type { DespesaLancamento } from '../despesas.types';
import { paymentMoneyLabel } from '../../settlements/financial-payment.form';
import { useDespesaWithoutCharge } from '../hooks/useDespesaWithoutCharge';

interface Props {
  item: DespesaLancamento;
  onResolved: () => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

export default function DespesaWithoutChargeModal({ item, onResolved, onBack, onClose }: Props) {
  const form = useDespesaWithoutCharge(item.id, item.valorEstimadoVersao ?? 0, onResolved, Boolean(item.valorSemCobrancaEm));
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = overflow; previous?.focus?.({ preventScroll: true }); };
  }, []);
  const close = () => { if (!form.pending) onClose(); };
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)') || [])];
    if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === dialog.current)) {
      event.preventDefault(); nodes.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="financial-dialog-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-3"
    onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="without-charge-title" aria-busy={form.pending}
      tabIndex={-1} onKeyDown={keyboard} className="financial-dialog flex max-h-[calc(100dvh-24px)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl outline-none">
      <header className="financial-dialog-header flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0"><h2 id="without-charge-title" className="text-lg font-semibold text-[#001a33]">{form.readOnly ? 'Histórico do mês sem cobrança' : 'Encerrar mês sem cobrança'}</h2>
          <p className="mt-1 break-words text-xs text-slate-600">{item.descricao}</p></div>
        <button type="button" aria-label="Fechar encerramento sem cobrança" disabled={form.pending} onClick={close}
          className="rounded-lg p-2 text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-500"><X size={18} /></button>
      </header>
      <main className="financial-dialog-body space-y-4 overflow-y-auto px-5 py-4">
        {form.loading && <p role="status" className="text-sm text-slate-600">Conferindo a solicitação...</p>}
        <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <div><dt className="text-xs text-slate-600">Estimativa original</dt><dd className="mt-1 font-semibold text-slate-700">{paymentMoneyLabel(item.valorEstimadoOriginal ?? item.valorBase)}</dd></div>
          <div><dt className="text-xs text-slate-600">Cobrança deste mês</dt><dd className="mt-1 font-semibold text-emerald-700">{paymentMoneyLabel(0)}</dd></div>
        </dl>
        <p className="text-sm leading-6 text-slate-600">{form.readOnly
          ? 'Este mês foi encerrado sem cobrança e sem pagamento. A estimativa original permanece no histórico; os próximos meses foram preservados.'
          : 'Este lançamento sairá dos compromissos em aberto. A estimativa ficará no histórico e os próximos meses continuarão previstos. Nenhum pagamento será registrado.'}</p>
        {form.readOnly && item.valorSemCobrancaEm && <p className="text-xs text-slate-600">Encerrado em {new Date(item.valorSemCobrancaEm).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}.</p>}
        {form.readOnly && item.cancelamentoMotivo && <p className="break-words text-sm text-slate-600">{item.cancelamentoMotivo}</p>}
        {!form.readOnly && <label className="block text-xs text-slate-600">Motivo ou observação (opcional)
          <textarea aria-label="Motivo do mês sem cobrança" value={form.reason} maxLength={1000} rows={3} disabled={form.locked}
            onChange={event => form.setReason(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 sm:text-[13px]" /></label>}
        {form.submitted && <p role="status" className="text-xs leading-5 text-amber-800">A solicitação já foi enviada. Confira o encerramento para consultar a mesma tentativa.</p>}
        {form.storageWarning && <p role="alert" className="text-xs text-amber-800">Mantenha esta janela aberta: o navegador não conseguiu salvar a retomada.</p>}
        {form.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{form.error}</p>}
      </main>
      <footer className="financial-dialog-footer flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
        {form.readOnly ? <button type="button" onClick={close} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 sm:min-h-[38px]">Fechar</button> : <>
          <button type="button" disabled={form.locked} onClick={onBack} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-50 sm:min-h-[38px]">Voltar à baixa</button>
          <button type="button" disabled={!form.canConfirm} onClick={() => { void form.confirm(); }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:min-h-[38px]">
          {form.pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {form.pending ? 'Conferindo...' : form.submitted ? 'Conferir encerramento' : 'Encerrar mês sem cobrança'}
          </button>
        </>}
      </footer>
    </div>
  </div>, document.body);
}

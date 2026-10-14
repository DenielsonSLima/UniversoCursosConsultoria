import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import type { OtherCreditCancellationModel } from './useOtherCreditCancellation';
import { formatCurrency, formatDate } from './outros-creditos.presentation';

const resultLabels = {
  CANCELED: 'Cancelado', REVIEW_REQUIRED: 'Aguardando conferência',
  FAILED: 'Não cancelado', PROCESSING: 'Em processamento',
};

export function OtherCreditCancellationContent({ model }: { model: OtherCreditCancellationModel }) {
  const completed = model.results.length > 0 && model.results.every(item => item.status === 'CANCELED');
  return <>
    <div className="shrink-0 border-b border-slate-100 p-5 pr-14 sm:p-6 sm:pr-14">
      <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Outros Créditos</p>
      <h2 id="other-credit-cancel-title" className="mt-1 text-xl font-black text-[#001a33]">Cancelar {model.reviewItems.length} crédito(s)</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Confira os lançamentos. Os boletos serão cancelados no banco antes da atualização do financeiro.</p>
    </div>
    <div className="min-h-0 max-h-[58dvh] flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {model.reviewItems.map(item => {
          const result = model.results.find(resultItem => resultItem.receivableId === item.id);
          return <li key={item.id} className="space-y-1 p-4">
            <p className="text-sm font-bold text-[#001a33]">{item.descricao}</p>
            <p className="text-xs text-slate-600">{item.clienteNome || 'Sem parceiro'} · {formatDate(item.dataVencimento)} · {formatCurrency(item.valor)}</p>
            {result ? <div role="status" className={`pt-1 text-xs font-bold ${result.status === 'CANCELED' ? 'text-emerald-700' : 'text-amber-800'}`}>
              <p>{resultLabels[result.status]}</p>
              {result.message ? <p className="mt-1 font-medium">{result.message}</p> : null}
            </div> : null}
          </li>;
        })}
      </ul>
      <label className="block text-sm font-bold text-slate-700" htmlFor="other-credit-cancel-reason">Motivo do cancelamento
        <textarea id="other-credit-cancel-reason" value={model.reason} onChange={event => model.setReason(event.target.value)}
          disabled={model.pending || model.attempted} minLength={10} maxLength={500} rows={3}
          placeholder="Ex.: boletos emitidos com valores incorretos."
          className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50" />
      </label>
      {model.changed ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Os lançamentos mudaram durante a conferência. Feche esta janela e revise a seleção atualizada.</p> : null}
      {model.error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{model.error}</p> : null}
      {model.attempted && !completed ? <p className="text-xs leading-5 text-slate-500">Se algum crédito ainda estiver em conferência, use “Conferir cancelamento”. Você também pode fechar e retomar esta mesma operação pela lista.</p> : null}
      {model.storageUnavailable ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">O navegador não conseguiu salvar a retomada. Mantenha esta tela aberta até conferir todos os resultados.</p> : null}
      {completed ? <p role="status" className="flex gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={18} /> Todos os créditos selecionados foram cancelados.</p> : null}
      {model.pending ? <p role="status" aria-live="polite" className="flex gap-2 text-sm font-bold text-emerald-800"><Loader2 size={18} className="animate-spin" /> Conferindo e cancelando os créditos selecionados...</p> : null}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 p-5 sm:p-6">
      <button type="button" onClick={model.close} disabled={model.pending} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 disabled:opacity-50">{model.attempted ? 'Fechar' : 'Voltar'}</button>
      {!completed ? <button type="button" onClick={model.confirm}
        disabled={model.pending || model.changed || model.reason.trim().length < 10}
        className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50">
        {model.pending ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
        {model.attempted ? 'Conferir cancelamento' : 'Confirmar cancelamento'}
      </button> : null}
    </footer>
  </>;
}

export function OtherCreditCancellationModal({ model }: { model: OtherCreditCancellationModel }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!model.isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [model.isOpen]);
  if (!model.isOpen || typeof document === 'undefined') return null;
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); model.close(); return; }
    if (event.key !== 'Tab') return;
    const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)') || []) as HTMLElement[];
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="other-credit-cancel-title" aria-busy={model.pending}
      tabIndex={-1} onKeyDown={onKeyDown} className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none">
      <button type="button" aria-label="Fechar cancelamento" onClick={model.close} disabled={model.pending}
        className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
      <OtherCreditCancellationContent model={model} />
    </div>
  </div>, document.body);
}

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import ToastNotification, { useToast } from '../../../parceiros/components/shared/ToastNotification';
import { eadPaymentReviewKeys, eadPaymentReviewService } from '../ead-payment-review.service';
import { getEadPaymentReviewPresentation } from '../ead-payment-review.model';
import EadRefundResolutionForm from './EadRefundResolutionForm';

const money = (value: number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (value?: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não informado';

const EadPaymentReviewPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast, toasts, removeToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const query = useQuery({ queryKey: eadPaymentReviewKeys.list(), queryFn: eadPaymentReviewService.list,
    refetchInterval: 30_000 });
  const rows = (query.data || []).filter(item => showResolved || item.state !== 'RESOLVED');
  const resolve = () => {
    setSelectedId(null);
    toast.success('Devolução vinculada', 'O pagamento devolvido foi vinculado à revisão com auditoria.');
    void queryClient.invalidateQueries({ queryKey: eadPaymentReviewKeys.all });
  };

  return <section aria-label="Revisão de pagamentos EAD" className="mb-6 rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="flex items-center gap-2 text-sm font-black text-[#001a33]"><AlertCircle size={18} className="text-amber-600" /> Revisão de pagamentos EAD</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Expirações em análise e pagamentos que precisam de conferência financeira nos polos autorizados.</p></div>
      <button type="button" onClick={() => { void query.refetch(); }} disabled={query.isFetching}
        className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">
        <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} /> Atualizar
      </button>
    </header>
    <label className="mt-4 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} /> Incluir revisões resolvidas</label>
    {query.isPending ? <p role="status" className="mt-4 text-xs text-slate-500">Consultando revisões...</p>
      : query.isError ? <p role="alert" className="mt-4 text-xs text-rose-700">Não foi possível consultar as revisões. Use Atualizar para tentar novamente.</p>
      : rows.length === 0 ? <p className="mt-4 text-xs text-slate-500">Nenhuma revisão pendente nos seus polos.</p>
      : <div className="mt-4 space-y-3">{rows.map(review => {
        const presentation = getEadPaymentReviewPresentation(review);
        return <article key={review.id} className="rounded-2xl border border-slate-100 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-black text-slate-800">{review.alunoNome} · {review.cursoNome}</p>
            <p className="mt-1 text-xs text-slate-500">{presentation.reasonLabel} · {presentation.amountLabel} {money(review.amount)}{presentation.paymentDateLabel ? ` · ${presentation.paymentDateLabel} ${dateLabel(review.paymentDate)}` : ''}{review.poloNome ? ` · ${review.poloNome}` : ''}</p></div>
          {review.state === 'RESOLVED' ? <p className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Devolução vinculada em {dateLabel(review.resolvedAt)}</p>
            : presentation.canLinkRefund ? <button type="button" onClick={() => setSelectedId(review.id)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Vincular devolução já paga</button>
              : <p className="text-xs text-amber-700">Aguarde a conferência financeira.</p>}
        </div>
        {selectedId === review.id && review.state !== 'RESOLVED' && presentation.canLinkRefund && <EadRefundResolutionForm key={review.id} review={review}
          onResolved={resolve} onCancel={() => setSelectedId(null)} onError={message => toast.error('Revisão preservada', message)} />}
      </article>; })}</div>}
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  </section>;
};

export default EadPaymentReviewPanel;

import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { eadPaymentReviewKeys, eadPaymentReviewService, type EadPaymentReview } from '../ead-payment-review.service';
import EadRefundPicker from './EadRefundPicker';

interface Props {
  review: EadPaymentReview;
  onResolved: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

const EadRefundResolutionForm: React.FC<Props> = ({ review, onResolved, onCancel, onError }) => {
  const [expenseId, setExpenseId] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [note, setNote] = useState('');
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const [openingEvidence, setOpeningEvidence] = useState(false);
  const candidates = useQuery({ queryKey: eadPaymentReviewKeys.refunds(review.id),
    queryFn: () => eadPaymentReviewService.refundCandidates(review.id) });
  const mutation = useMutation({
    mutationFn: () => {
      if (!evidenceChecked || !candidates.data?.some(item => item.id === expenseId)) throw new Error('Confira o comprovante da devolução antes de vincular esta revisão.');
      return eadPaymentReviewService.resolveRefund({ reviewId: review.id, requestId: crypto.randomUUID(), expenseId, evidenceReference, note });
    },
    onSuccess: onResolved,
    onError: error => onError(error instanceof Error ? error.message : 'Não foi possível vincular a devolução.'),
  });
  const openEvidence = async () => {
    const candidate = candidates.data?.find(item => item.id === expenseId);
    if (!candidate) return;
    const evidenceWindow = window.open('about:blank', '_blank');
    if (!evidenceWindow) { onError('O navegador bloqueou a abertura do comprovante. Permita a nova aba e tente novamente.'); return; }
    evidenceWindow.opener = null;
    setOpeningEvidence(true);
    try { evidenceWindow.location.href = await eadPaymentReviewService.refundEvidenceUrl(candidate); }
    catch (error) { evidenceWindow.close(); onError(error instanceof Error ? error.message : 'Não foi possível abrir o comprovante.'); }
    finally { setOpeningEvidence(false); }
  };

  return <form onSubmit={event => { event.preventDefault(); mutation.mutate(); }}
    className="mt-4 space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
    <p className="text-xs leading-relaxed text-slate-600">Vincule a despesa da devolução efetivamente paga a este aluno. Se ainda não devolveu o valor, registre e pague a devolução no Financeiro. A revisão continuará aberta até que o pagamento possa ser comprovado.</p>
    <EadRefundPicker items={candidates.data || []} value={expenseId} loading={candidates.isPending}
      error={candidates.isError} disabled={mutation.isPending}
      onRetry={() => { void candidates.refetch(); }}
      onChange={id => { setExpenseId(id); setEvidenceChecked(false); setEvidenceReference(candidates.data?.find(item => item.id === id)?.comprovanteRef || ''); }} />
    {expenseId && <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <button type="button" onClick={() => { void openEvidence(); }} disabled={openingEvidence || mutation.isPending || !evidenceReference}
        className="text-xs font-bold text-blue-700 underline disabled:opacity-50">{openingEvidence ? 'Abrindo comprovante...' : 'Abrir comprovante anexado ao lançamento'}</button>
      <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
        <input type="checkbox" checked={evidenceChecked} disabled={mutation.isPending} onChange={event => setEvidenceChecked(event.target.checked)} />
        Conferi que este lançamento e seu comprovante correspondem à devolução paga ao aluno.
      </label>
    </div>}
    <label className="block text-xs font-bold text-slate-700">Observação
      <textarea maxLength={1000} value={note} disabled={mutation.isPending} onChange={event => setNote(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" rows={2} />
    </label>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onCancel} disabled={mutation.isPending}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Voltar</button>
      <button type="submit" disabled={mutation.isPending || candidates.isPending || candidates.isError || !expenseId || !evidenceReference.trim() || !evidenceChecked}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">
        {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Vincular devolução já paga
      </button>
    </div>
  </form>;
};

export default EadRefundResolutionForm;

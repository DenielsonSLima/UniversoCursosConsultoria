import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, X } from 'lucide-react';
import type { ContasReceber } from '../financeiro.types';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { reverseOtherCredit } from './other-credit-reversal.service';
import { canReverseOtherCredit, validReversalReason } from './other-credit-reversal.model';

export { canReverseOtherCredit } from './other-credit-reversal.model';

export const OtherCreditReversalModal: React.FC<{
  item: ContasReceber;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ item, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [requestId] = useState(generateSafeUuid);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<React.ComponentRef<'button'>>(null);
  const allowed = canReverseOtherCredit(item);
  const reversal = useMutation({
    mutationFn: () => reverseOtherCredit({ receivableId: item.id!, requestId, reason, confirmed }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: ['caixa'] }),
      ]);
      onSuccess();
    },
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="financial-dialog-overlay fixed inset-0 z-[140] flex items-center justify-center bg-[#001a33]/60 p-4 backdrop-blur-sm">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="other-credit-reversal-title"
      className="financial-dialog financial-dialog--padded max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!reversal.isPending) onClose(); }
        if (event.key !== 'Tab') return;
        const nodes = Array.from<HTMLElement>(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled)') || []);
        const first = nodes[0]; const last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="financial-dialog-header flex items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-widest text-rose-700">Correção de lançamento</p>
          <h2 id="other-credit-reversal-title" className="mt-2 text-xl font-black text-[#001a33]">Estornar recebimento</h2></div>
        <button ref={closeRef} type="button" aria-label="Fechar estorno" disabled={reversal.isPending} onClick={onClose}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40"><X size={20} /></button>
      </div>
      <p className="mt-4 text-sm font-bold text-slate-800">{item.descricao} · {Number(item.valorPago || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">O lançamento sairá dos recebidos e seu efeito no saldo interno será revertido. O histórico, a conta, a data e o valor original serão preservados em Cancelados.</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">Esta correção não envia dinheiro ao aluno e não cria outra cobrança.</p>
      {!allowed && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Este recebimento exige revisão financeira. Somente créditos avulsos locais sem vínculo acadêmico ou bancário podem ser estornados aqui.</p>}
      <form onSubmit={event => { event.preventDefault(); if (allowed && confirmed && validReversalReason(reason) && !reversal.isPending) reversal.mutate(); }}>
        <label htmlFor="other-credit-reversal-reason" className="mt-5 block text-sm font-bold text-slate-700">Motivo do estorno</label>
        <textarea id="other-credit-reversal-reason" required minLength={5} maxLength={500} value={reason}
          disabled={reversal.isPending || !allowed} onChange={event => { setReason(event.target.value); reversal.reset(); }}
          className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={confirmed} disabled={reversal.isPending || !allowed}
            onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
          Confirmo a correção do recebimento lançado por engano, preservando o histórico financeiro.
        </label>
        {reversal.isError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{reversal.error.message}</p>}
        <div className="financial-dialog-footer mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" disabled={reversal.isPending} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600">Voltar</button>
          <button type="submit" disabled={!allowed || !confirmed || !validReversalReason(reason) || reversal.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><RotateCcw size={16} />{reversal.isPending ? 'Estornando...' : 'Confirmar estorno'}</button>
        </div>
      </form>
    </div>
  </div>, document.body);
};

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useRenegociacaoDialogFocus } from '../hooks/useRenegociacaoDialogFocus';
import { renegociacaoErrorMessage } from '../renegociacoes.presentation';
import type { RenegociacaoProposalDetail } from '../renegociacoes.types';
import CanonicalSummary from './CanonicalSummary';

export default function ActivationConfirmation({ detail, pending, error, onClose, onConfirm }: {
  detail: RenegociacaoProposalDetail; pending: boolean; error: unknown; onClose: () => void; onConfirm: (approveCustomTerms: boolean) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [customTermsApproved, setCustomTermsApproved] = useState(false);
  const requiresApproval = detail.canonicalSnapshot.requiresApproval;
  const canApproveCustomTerms = detail.proposal.capabilities.canApproveCustomTerms === true;
  const approvalConfirmed = requiresApproval && canApproveCustomTerms && customTermsApproved;
  useEffect(() => {
    setConfirmed(false);
    setCustomTermsApproved(false);
  }, [detail.proposal.version, detail.proposal.proposalFingerprint, requiresApproval]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(pending);
  const closeRef = useRef(onClose);
  submittingRef.current = pending;
  closeRef.current = onClose;
  useRenegociacaoDialogFocus({ isOpen: true, dialogRef, submittingRef, closeRef });
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
    aria-labelledby="activation-confirm-title" aria-busy={pending}
    className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-50 outline-none">
    <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <button type="button" onClick={onClose} disabled={pending} aria-label="Voltar sem efetivar"
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-slate-600 disabled:opacity-40"><ArrowLeft size={18} /></button>
        <div><p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Confirmação bancária</p>
          <h2 id="activation-confirm-title" className="text-lg font-black text-[#001a33]">Efetivar acordo de {detail.proposal.studentName}</h2></div>
      </div>
    </header>
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
          Esta ação cancela os títulos originais selecionados e emite os novos títulos conforme o acordo abaixo.
          O cancelamento será confirmado no banco antes da emissão. Uma falha parcial pode exigir revisão e não desfaz automaticamente o que já foi confirmado.
        </p>
        <CanonicalSummary totals={detail.totals} schedule={detail.schedule} policy={detail.policySnapshot}
          sourceItems={detail.sourceItems} requiresApproval={detail.canonicalSnapshot.requiresApproval}
          approvalReasons={detail.canonicalSnapshot.approvalReasons} />
        {requiresApproval ? <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-900"><strong>Justificativa registrada:</strong> {detail.proposal.reason || 'Não informada.'}</p>
          <label className="flex items-start gap-3 text-sm font-bold text-amber-950">
            <input type="checkbox" checked={customTermsApproved} disabled={pending || !canApproveCustomTerms}
              onChange={(event) => setCustomTermsApproved(event.target.checked)} className="mt-0.5 h-5 w-5 accent-blue-600" />
            Aprovo explicitamente as condições personalizadas e os abatimentos deste acordo, conforme a justificativa registrada.
          </label>
          <p className="text-xs font-medium text-amber-900">{canApproveCustomTerms
            ? 'A aprovação será registrada com seu usuário autorizado no Financeiro.'
            : 'Seu acesso atual ao Financeiro não autoriza aprovar estas condições neste polo.'}</p>
        </div> : null}
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={confirmed} disabled={pending} onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-5 w-5 accent-blue-600" />
          Conferi os títulos originais, o total, a entrada, os vencimentos e as condições. Autorizo a substituição bancária destes títulos.
        </label>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{renegociacaoErrorMessage(error)}</p> : null}
      </div>
    </main>
    <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl justify-end gap-3">
        <button type="button" onClick={onClose} disabled={pending} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase text-slate-600 disabled:opacity-40">Voltar</button>
        <button type="button" onClick={() => {
          if (confirmed && !pending && (!requiresApproval || approvalConfirmed)) onConfirm(approvalConfirmed);
        }} disabled={!confirmed || pending || (requiresApproval && !approvalConfirmed)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 text-xs font-black uppercase text-white disabled:opacity-40">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Confirmar e efetivar
        </button>
      </div>
    </footer>
  </div>, document.body);
}

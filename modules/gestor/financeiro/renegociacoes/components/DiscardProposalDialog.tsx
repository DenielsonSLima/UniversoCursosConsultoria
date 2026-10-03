import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Trash2, X } from 'lucide-react';
import { renegociacaoErrorMessage } from '../renegociacoes.model';
import { useRenegociacaoDialogFocus } from '../hooks/useRenegociacaoDialogFocus';

const DiscardProposalDialog: React.FC<{
  studentName: string;
  pending: boolean;
  error: unknown;
  locked?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ studentName, pending, error, locked = false, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(pending);
  const closeRef = useRef(onClose);
  submittingRef.current = pending;
  closeRef.current = onClose;
  useRenegociacaoDialogFocus({ isOpen: true, dialogRef, submittingRef, closeRef });
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex min-h-[100dvh] items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discard-title"
      aria-describedby="discard-description"
      aria-busy={pending}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[95dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Ação auditada</p>
            <h2 id="discard-title" className="mt-1 text-lg font-black text-[#001a33]">
              Descartar proposta
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fechar"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <p id="discard-description" className="mt-3 text-sm font-medium text-slate-600">
          A proposta de <strong>{studentName}</strong> será encerrada. Os títulos originais permanecem inalterados.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
            Motivo obrigatório
          </span>
          <textarea
            rows={4}
            value={reason}
            maxLength={1000}
            disabled={locked || pending}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Informe o motivo do descarte..."
            className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:opacity-60"
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
            {renegociacaoErrorMessage(error)}
          </p>
        ) : null}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-11 flex-1 rounded-xl border border-slate-200 text-xs font-black uppercase text-slate-600"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={pending || (!locked && reason.trim().length < 3)}
            onClick={() => onConfirm(reason.trim())}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-700 text-xs font-black uppercase text-white disabled:opacity-40"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{' '}
            {locked && error ? 'Tentar novamente' : 'Descartar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DiscardProposalDialog;

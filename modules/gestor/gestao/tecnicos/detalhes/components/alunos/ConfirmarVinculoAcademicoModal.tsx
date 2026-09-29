import React from 'react';
import { AlertTriangle, Loader2, RefreshCw, UserPlus, X } from 'lucide-react';
import type { Turma } from '../../../../gestao.types';
import { useAccessibleDialog } from '../financeiro/hooks/useAccessibleDialog';

interface ConfirmarVinculoAcademicoModalProps {
  turma: Turma;
  student: { nome: string };
  pending: boolean;
  loading?: boolean;
  error?: boolean;
  retrying?: boolean;
  ready?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

const ConfirmarVinculoAcademicoModal: React.FC<ConfirmarVinculoAcademicoModalProps> = ({
  turma,
  student,
  pending,
  loading = false,
  error = false,
  retrying = false,
  ready = true,
  onRetry,
  onClose,
  onConfirm,
}) => {
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, pending);
  const confirmationBlocked = loading || error || retrying || pending || !ready;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmar-vinculo-title"
        aria-describedby="confirmar-vinculo-description"
        aria-busy={loading || retrying || pending}
        tabIndex={-1}
        className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-600">Confirmação acadêmica</p>
            <h3 id="confirmar-vinculo-title" className="mt-1 text-lg font-black text-[#001a33]">{student.nome}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{turma.codigo || turma.nome}</p>
          </div>
          <button
            ref={(node) => { initialFocusRef.current = node; }}
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fechar"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div id="confirmar-vinculo-description" className="mt-5">
          {error ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold leading-relaxed text-rose-800">
              <AlertTriangle size={18} aria-hidden="true" className="mb-2" />
              <p>Não foi possível validar os dados necessários para este vínculo.</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={retrying}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
                >
                  <RefreshCw size={14} aria-hidden="true" className={retrying ? 'animate-spin' : ''} />
                  {retrying ? 'Tentando novamente...' : 'Tentar novamente'}
                </button>
              ) : null}
            </div>
          ) : loading || retrying || !ready ? (
            <div role="status" aria-live="polite" className="flex min-h-28 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-600">
              <Loader2 size={22} aria-hidden="true" className="mb-3 animate-spin text-blue-600" />
              Validando os dados necessários para confirmar o vínculo...
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-800">
              <UserPlus size={18} aria-hidden="true" className="mb-2" />
              Confirme a inclusão do aluno nesta turma. Nenhuma cobrança será criada neste fluxo; a configuração financeira ficará pendente para uma pessoa autorizada.
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmationBlocked}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-[10px] font-black uppercase text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Vinculando...' : 'Confirmar vínculo'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmarVinculoAcademicoModal;

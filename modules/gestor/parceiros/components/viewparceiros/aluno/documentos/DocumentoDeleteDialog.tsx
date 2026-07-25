import React from 'react';
import { ShieldAlert, Trash2 } from 'lucide-react';
import DocumentosModalShell from './DocumentosModalShell';

interface DocumentoDeleteDialogProps {
  open: boolean;
  documentName: string;
  reason: string;
  confirmationText: string;
  expectedConfirmationText?: string;
  submitting?: boolean;
  error?: string | null;
  onReasonChange: (reason: string) => void;
  onConfirmationTextChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const DocumentoDeleteDialog: React.FC<DocumentoDeleteDialogProps> = ({
  open,
  documentName,
  reason,
  confirmationText,
  expectedConfirmationText = 'EXCLUIR',
  submitting = false,
  error,
  onReasonChange,
  onConfirmationTextChange,
  onConfirm,
  onClose,
}) => {
  const confirmationMatches = confirmationText.trim() === expectedConfirmationText;
  const canConfirm = reason.trim().length > 0 && confirmationMatches && !submitting;

  return (
    <DocumentosModalShell
      open={open}
      title="Excluir arquivo permanentemente"
      eyebrow="Área restrita do gestor"
      description={documentName}
      size="md"
      closeDisabled={submitting}
      onClose={onClose}
    >
      <form
        className="space-y-5 p-5 sm:p-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (canConfirm) onConfirm();
        }}
      >
        <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
          <ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0" size={21} />
          <div>
            <p className="text-xs font-black">Esta ação solicita a remoção física do arquivo.</p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed">
              A operação deve ser auditada e pode ser bloqueada quando o mesmo PDF estiver relacionado a outros documentos ativos.
            </p>
          </div>
        </div>

        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
          Justificativa obrigatória
          <textarea
            autoFocus
            required
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Informe a razão administrativa da exclusão."
            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-xs font-medium normal-case tracking-normal text-[#001a33] outline-none placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </label>

        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
          Digite <span className="text-red-600">{expectedConfirmationText}</span> para confirmar
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={confirmationText}
            onChange={(event) => onConfirmationTextChange(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black normal-case tracking-widest text-[#001a33] outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </label>

        {error ? <p role="alert" className="text-xs font-bold text-red-600">{error}</p> : null}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-11 rounded-xl border border-slate-200 px-5 text-[10px] font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" size={14} />
            {submitting ? 'Solicitando exclusão…' : 'Excluir permanentemente'}
          </button>
        </div>
      </form>
    </DocumentosModalShell>
  );
};

export default DocumentoDeleteDialog;

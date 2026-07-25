import React from 'react';
import { Archive } from 'lucide-react';
import DocumentosModalShell from './DocumentosModalShell';

interface DocumentoArchiveDialogProps {
  open: boolean;
  documentName: string;
  reason: string;
  submitting?: boolean;
  error?: string | null;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const DocumentoArchiveDialog: React.FC<DocumentoArchiveDialogProps> = ({
  open,
  documentName,
  reason,
  submitting = false,
  error,
  onReasonChange,
  onConfirm,
  onClose,
}) => {
  const canConfirm = reason.trim().length > 0 && !submitting;

  return (
    <DocumentosModalShell
      open={open}
      title="Arquivar versão"
      eyebrow="Ação administrativa"
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
        <div className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-900">
          <Archive aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="text-xs font-black">O arquivo continuará preservado.</p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed">
              A versão sairá do fluxo ativo, mas permanecerá disponível ao gestor no histórico de auditoria.
            </p>
          </div>
        </div>

        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
          Motivo do arquivamento
          <textarea
            autoFocus
            required
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Registre por que esta versão não deve permanecer ativa."
            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-xs font-medium normal-case tracking-normal text-[#001a33] outline-none placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
          />
          <span className="mt-1 block text-right text-[8px] text-slate-400">{reason.length}/500</span>
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
            className="min-h-11 rounded-xl bg-amber-600 px-5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Arquivando…' : 'Confirmar arquivamento'}
          </button>
        </div>
      </form>
    </DocumentosModalShell>
  );
};

export default DocumentoArchiveDialog;

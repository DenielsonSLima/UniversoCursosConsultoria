import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import DocumentosModalShell from './DocumentosModalShell';

interface DocumentoLegacyReceiptModalProps {
  open: boolean;
  documentName: string;
  reason: string;
  submitting?: boolean;
  error?: string | null;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const DocumentoLegacyReceiptModal: React.FC<
  DocumentoLegacyReceiptModalProps
> = ({
  open,
  documentName,
  reason,
  submitting = false,
  error,
  onReasonChange,
  onSubmit,
  onClose,
}) => {
  const canSubmit = !submitting;

  return (
    <DocumentosModalShell
      open={open}
      title="Marcar documento como entregue"
      eyebrow="Registro administrativo sem anexo"
      description={documentName}
      size="md"
      closeDisabled={submitting}
      onClose={onClose}
    >
      <form
        className="space-y-5 p-5 sm:p-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-950">
          <ClipboardCheck aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
          <p className="text-xs font-semibold leading-relaxed">
            Use quando o gestor recebeu e conferiu o documento, mas não possui
            uma cópia digital para anexar. Data, responsável e a observação,
            quando informada, ficarão registrados para auditoria.
          </p>
        </div>

        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
          Justificativa (opcional)
          <textarea
            autoFocus
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Opcional: informe alguma observação sobre a entrega presencial."
            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-xs font-medium normal-case tracking-normal text-[#001a33] outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <span className="mt-1 block text-right text-[8px] text-slate-400">
            {reason.length}/1000
          </span>
        </label>

        <p className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-900">
          Nenhum arquivo será criado. Um anexo real poderá ser enviado depois
          e substituirá automaticamente este registro administrativo.
        </p>

        {error ? (
          <p role="alert" className="text-xs font-bold text-red-600">
            {error}
          </p>
        ) : null}

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
            disabled={!canSubmit}
            className="min-h-11 rounded-xl bg-blue-700 px-5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Registrando…' : 'Marcar como entregue'}
          </button>
        </div>
      </form>
    </DocumentosModalShell>
  );
};

export default DocumentoLegacyReceiptModal;

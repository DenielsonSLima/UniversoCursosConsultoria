import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { DocumentoAlunoDecisaoRevisao } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import DocumentosModalShell from './DocumentosModalShell';

interface DocumentoReviewModalProps {
  open: boolean;
  documentName: string;
  decision: DocumentoAlunoDecisaoRevisao;
  reason: string;
  submitting?: boolean;
  error?: string | null;
  onDecisionChange: (decision: DocumentoAlunoDecisaoRevisao) => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const DocumentoReviewModal: React.FC<DocumentoReviewModalProps> = ({
  open,
  documentName,
  decision,
  reason,
  submitting = false,
  error,
  onDecisionChange,
  onReasonChange,
  onSubmit,
  onClose,
}) => {
  const requiresReason = decision === 'recusado';
  const canSubmit = !submitting && (!requiresReason || reason.trim().length > 0);

  return (
    <DocumentosModalShell
      open={open}
      title="Revisar documento"
      eyebrow="Decisão da secretaria"
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
        <fieldset>
          <legend className="text-[10px] font-black uppercase tracking-wider text-slate-500">Resultado da análise</legend>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={decision === 'aprovado'}
              onClick={() => onDecisionChange('aprovado')}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                decision === 'aprovado'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
              }`}
            >
              <CheckCircle2 aria-hidden="true" size={21} />
              <span>
                <strong className="block text-xs font-black">Aprovar</strong>
                <span className="mt-0.5 block text-[9px] font-semibold">Documento válido e legível</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={decision === 'recusado'}
              onClick={() => onDecisionChange('recusado')}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                decision === 'recusado'
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-red-200'
              }`}
            >
              <XCircle aria-hidden="true" size={21} />
              <span>
                <strong className="block text-xs font-black">Recusar</strong>
                <span className="mt-0.5 block text-[9px] font-semibold">Libera um novo envio ao aluno</span>
              </span>
            </button>
          </div>
        </fieldset>

        {requiresReason ? (
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Motivo da recusa
            <textarea
              autoFocus
              required
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Explique de forma objetiva o que precisa ser corrigido."
              className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-xs font-medium normal-case tracking-normal text-[#001a33] outline-none placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            <span className="mt-1 block text-right text-[8px] text-slate-400">{reason.length}/500</span>
          </label>
        ) : (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold leading-relaxed text-emerald-800">
            A aprovação será registrada nesta versão e ficará disponível no histórico de auditoria.
          </p>
        )}

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
            disabled={!canSubmit}
            className={`min-h-11 rounded-xl px-5 text-[10px] font-black uppercase tracking-wider text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              decision === 'recusado' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {submitting ? 'Registrando…' : decision === 'recusado' ? 'Recusar e solicitar reenvio' : 'Confirmar aprovação'}
          </button>
        </div>
      </form>
    </DocumentosModalShell>
  );
};

export default DocumentoReviewModal;

import React from 'react';
import { BookOpenCheck } from 'lucide-react';
import DocumentosModalShell from './DocumentosModalShell';

interface MatriculaImplantacaoDialogProps {
  open: boolean;
  courseName: string;
  className: string;
  reason: string;
  submitting?: boolean;
  error?: string | null;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const MatriculaImplantacaoDialog: React.FC<
  MatriculaImplantacaoDialogProps
> = ({
  open,
  courseName,
  className,
  reason,
  submitting = false,
  error,
  onReasonChange,
  onConfirm,
  onClose,
}) => {
  const canConfirm = !submitting && reason.trim().length >= 10;

  return (
    <DocumentosModalShell
      open={open}
      title="Liberar aluno de implantação"
      eyebrow="Acesso acadêmico sem financeiro"
      description={`${courseName} · ${className}`}
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
        <div className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-950">
          <BookOpenCheck
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={20}
          />
          <p className="text-xs font-semibold leading-relaxed">
            Esta ação libera aulas, frequência e notas sem criar cobrança. A
            matrícula continuará pendente até a regularização documental e
            financeira.
          </p>
        </div>

        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
          Justificativa obrigatória
          <textarea
            autoFocus
            required
            rows={4}
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ex.: Aluno já frequentava a turma antes da implantação do sistema."
            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-xs font-medium normal-case tracking-normal text-[#001a33] outline-none placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
          />
          <span className="mt-1 block text-right text-[8px] text-slate-400">
            {reason.length}/1000
          </span>
        </label>

        <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-relaxed text-slate-700">
          Somente gestores autorizados podem concluir esta operação. Data,
          responsável e justificativa ficam registrados para auditoria.
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
            disabled={!canConfirm}
            className="min-h-11 rounded-xl bg-amber-600 px-5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Liberando…' : 'Liberar sem financeiro'}
          </button>
        </div>
      </form>
    </DocumentosModalShell>
  );
};

export default MatriculaImplantacaoDialog;

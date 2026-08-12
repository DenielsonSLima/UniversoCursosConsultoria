import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, RotateCcw, Trash2, X } from 'lucide-react';

import { createEmprestimoRequestId } from '../emprestimos.service';
import type {
  CancelarOuEstornarEmprestimoInput,
  EmprestimoFinanceiro,
} from '../emprestimos.types';

interface EmprestimoLifecycleModalProps {
  emprestimo: EmprestimoFinanceiro;
  poloResponsavelId: string;
  isPending?: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: (input: CancelarOuEstornarEmprestimoInput) => void;
}

const EmprestimoLifecycleModal: React.FC<EmprestimoLifecycleModalProps> = ({
  emprestimo,
  poloResponsavelId,
  isPending = false,
  error,
  onClose,
  onConfirm,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const requestIdRef = useRef(createEmprestimoRequestId());
  const [motivo, setMotivo] = useState('');
  const [confirmarEstorno, setConfirmarEstorno] = useState(false);
  const hasSettlement = emprestimo.possuiBaixa;
  const actionLabel = hasSettlement ? 'Estornar e cancelar' : 'Excluir logicamente';

  const submit = () => {
    if (motivo.trim().length < 3 || !confirmarEstorno) return;
    onConfirm({
      emprestimoId: emprestimo.id,
      poloResponsavelId,
      requestId: requestIdRef.current,
      motivo: motivo.trim(),
      confirmarEstorno,
    });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex min-h-[100dvh] items-end justify-center bg-[#001a33]/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isPending}
        className="relative w-full max-w-lg rounded-t-[2rem] border border-white/70 bg-white p-6 shadow-2xl sm:rounded-[2rem] sm:p-8"
      >
        <button type="button" onClick={onClose} disabled={isPending} className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar confirmação de ciclo de vida">
          <X size={19} />
        </button>

        <div className="flex items-start gap-4 pr-10">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            {hasSettlement ? <RotateCcw size={28} aria-hidden="true" /> : <AlertTriangle size={28} aria-hidden="true" />}
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-black tracking-tight text-[#001a33]">{hasSettlement ? 'Estornar empréstimo?' : 'Excluir empréstimo?'}</h2>
            <p className="mt-1 text-sm font-bold text-slate-700">{emprestimo.descricao}</p>
            <p id={descriptionId} className="mt-2 text-xs font-medium leading-relaxed text-slate-500">
              {hasSettlement
                ? 'Há parcelas baixadas. O backend cancelará o contrato e preservará toda a trilha financeira como estorno auditável.'
                : 'A exclusão é lógica: o contrato, suas parcelas e o crédito continuam no histórico de auditoria e deixam as listagens ativas.'}
            </p>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Motivo *</span>
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            disabled={isPending}
            placeholder="Explique por que este empréstimo deve ser cancelado"
            className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={confirmarEstorno}
            disabled={isPending}
            onChange={(event) => setConfirmarEstorno(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-300 text-rose-600 focus:ring-rose-500"
          />
          <span><strong className="font-black text-[#001a33]">Confirmo a verificação externa.</strong> O crédito liberado e, quando houver, as parcelas pagas foram estornados ou não chegaram a movimentar a conta.</span>
        </label>

        {error ? (
          <div role="alert" className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold leading-relaxed text-rose-700">
            {error.message || 'Não foi possível concluir o estorno.'}
          </div>
        ) : null}

        <footer className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={onClose} disabled={isPending} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Manter empréstimo
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || motivo.trim().length < 3 || !confirmarEstorno}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-rose-950/15 transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : hasSettlement ? <RotateCcw size={15} /> : <Trash2 size={15} />}
            {isPending ? 'Processando...' : actionLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default EmprestimoLifecycleModal;

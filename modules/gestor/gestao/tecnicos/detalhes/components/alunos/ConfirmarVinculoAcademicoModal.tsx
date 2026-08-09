import React from 'react';
import { UserPlus, X } from 'lucide-react';
import type { Turma } from '../../../../gestao.types';
import { useAccessibleDialog } from '../financeiro/hooks/useAccessibleDialog';

interface ConfirmarVinculoAcademicoModalProps {
  turma: Turma;
  student: { nome: string };
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ConfirmarVinculoAcademicoModal: React.FC<ConfirmarVinculoAcademicoModalProps> = ({
  turma,
  student,
  pending,
  onClose,
  onConfirm,
}) => {
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, pending);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirmar-vinculo-title" tabIndex={-1} className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-600">Vínculo acadêmico</p><h3 id="confirmar-vinculo-title" className="mt-1 text-lg font-black text-[#001a33]">{student.nome}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{turma.codigo || turma.nome}</p></div>
          <button ref={(node) => { initialFocusRef.current = node; }} type="button" onClick={onClose} disabled={pending} aria-label="Fechar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-800"><UserPlus size={18} className="mb-2" />Confirme o vínculo acadêmico. Nenhuma nova cobrança será criada automaticamente neste fluxo.</div>
        <div className="mt-5 flex gap-3"><button type="button" onClick={onClose} disabled={pending} className="flex-1 rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase text-slate-500">Cancelar</button><button type="button" onClick={onConfirm} disabled={pending} className="flex-1 rounded-xl bg-emerald-600 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{pending ? 'Vinculando...' : 'Confirmar vínculo'}</button></div>
      </div>
    </div>
  );
};

export default ConfirmarVinculoAcademicoModal;


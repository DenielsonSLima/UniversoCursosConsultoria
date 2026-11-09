import React, { useEffect, useRef, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock, Copy, X } from 'lucide-react';
import type { DespesaCloneDraft } from './despesa-clone.model';

interface Props {
  draft: DespesaCloneDraft;
  onChoose: (pago: boolean) => void;
  onClose: () => void;
}

export default function DespesaCloneChoice({ draft, onChoose, onClose }: Props) {
  const dialogRef = useRef<ComponentRef<'dialog'>>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  const dialog = <dialog ref={dialogRef} aria-labelledby="clone-choice-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    } }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border-0 bg-white p-5 text-[#001a33] shadow-2xl backdrop:bg-slate-950/50">
    <div className="flex items-start justify-between gap-3">
      <h3 id="clone-choice-title" className="flex items-center gap-2 text-base font-bold"><Copy size={18} /> Clonar lançamento</h3>
      <button type="button" onClick={onClose} aria-label="Cancelar clonagem" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
    </div>
    <p className="mt-3 break-words text-sm font-semibold">{draft.descricao}</p>
    <p className="mt-2 text-sm text-slate-600">Como deseja lançar a cópia?</p>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <button type="button" autoFocus onClick={() => onChoose(false)} className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><Clock size={16} /> Pendente</button>
      <button type="button" onClick={() => onChoose(true)} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><CheckCircle2 size={16} /> Pago</button>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500">O formulário abrirá para conferência, com o parceiro em branco. Salve para confirmar o novo lançamento.</p>
  </dialog>;
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}

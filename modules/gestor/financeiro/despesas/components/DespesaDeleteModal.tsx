import React from 'react';
import { RefreshCw, Trash2, X } from 'lucide-react';
import type { DespesaLancamento } from '../despesas.service';
import DespesaModalPortal from './DespesaModalPortal';

interface DespesaDeleteModalProps {
  items: DespesaLancamento[];
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}

const DespesaDeleteModal: React.FC<DespesaDeleteModalProps> = ({
  items,
  onConfirm,
  onClose,
  isPending,
}) => {
  const count = items.length;
  if (count === 0) return null;

  return (
    <DespesaModalPortal onClose={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="excluir-despesas-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl animate-fadeIn"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 size={21} />
            </span>
            <h3 id="excluir-despesas-title" className="text-lg font-black uppercase tracking-tight text-[#001a33]">
              Excluir {count} lançamento{count === 1 ? '' : 's'}?
            </h3>
            <p className="mt-1 text-sm font-medium leading-5 text-slate-500">
              {count === 1
                ? 'Ele sairá das listas e não será considerado nos totais.'
                : 'Eles sairão das listas e não serão considerados nos totais.'}
              {' '}A trilha de auditoria permanece protegida.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          {items.slice(0, 3).map((item) => (
            <p key={item.id} className="truncate text-xs font-bold text-slate-700">{item.descricao}</p>
          ))}
          {count > 3 && <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">+ {count - 3} outros lançamentos</p>}
        </div>

        <footer className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold uppercase text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-black uppercase tracking-wide text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Excluir {count > 1 ? count : ''}
          </button>
        </footer>
      </section>
    </DespesaModalPortal>
  );
};

export default DespesaDeleteModal;

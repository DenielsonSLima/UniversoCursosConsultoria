import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';

interface DeleteParceiroModalProps {
  parceiro: any;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}

const DeleteParceiroModal: React.FC<DeleteParceiroModalProps> = ({
  parceiro,
  isPending,
  onCancel,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
    <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100 animate-scaleIn">
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 border border-red-100">
          <Trash2 size={28} />
        </div>
        <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-2">Excluir Parceiro?</h3>
        <p className="text-sm text-slate-500 mb-7 leading-relaxed">
          O registro de <strong>{parceiro.nome}</strong> será removido permanentemente.
          {['Aluno', 'Professor'].includes(parceiro.tipo) && ' O usuário de autenticação vinculado ao e-mail também será excluído.'}
        </p>
        <div className="flex gap-3 w-full">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-650 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(parceiro.id)}
            disabled={isPending}
            className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-red-500/20 flex items-center justify-center gap-1.5"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Sim, Excluir'}
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default DeleteParceiroModal;

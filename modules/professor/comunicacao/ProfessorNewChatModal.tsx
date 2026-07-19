import React from 'react';
import { X } from 'lucide-react';

interface Category {
  id: string;
  nome: string;
}

interface ProfessorNewChatModalProps {
  categories: Category[];
  categoryId: string;
  subject: string;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onSubjectChange: (value: string) => void;
}

export const ProfessorNewChatModal: React.FC<ProfessorNewChatModalProps> = ({
  categories,
  categoryId,
  subject,
  onCategoryChange,
  onClose,
  onSubmit,
  onSubjectChange,
}) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl relative animate-fadeIn">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
      >
        <X size={18} />
      </button>

      <div className="mb-6">
        <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Novo Chamado Docente</h4>
        <p className="text-slate-550 text-xs mt-1">Fale diretamente com os setores administrativos e coordenação.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-555">Setor / Assunto</label>
          <select
            required
            value={categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:border-purple-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="">Selecione uma categoria...</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.nome}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-555">Mensagem / Solicitação</label>
          <textarea
            required
            rows={4}
            placeholder="Escreva detalhadamente o que você precisa..."
            value={subject}
            onChange={(event) => onSubjectChange(event.target.value)}
            className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-medium text-slate-700 focus:border-purple-500 focus:bg-white transition-all resize-none"
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 bg-slate-100 hover:bg-slate-205 text-slate-650 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!categoryId || !subject.trim()}
            className="px-5 py-3 bg-[#001a33] hover:bg-purple-650 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-md"
          >
            Confirmar Chamado
          </button>
        </div>
      </form>
    </div>
  </div>
);

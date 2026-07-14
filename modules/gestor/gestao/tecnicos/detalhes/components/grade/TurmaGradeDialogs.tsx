import React from 'react';
import { X } from 'lucide-react';
import { TurmaProfessorOption } from '../../turma-grade.types';

interface DocenteDialogProps {
  disciplinaId: string;
  professores: TurmaProfessorOption[];
  onAssign: (disciplinaId: string, professorId: string) => void;
  onClose: () => void;
}

export const TurmaGradeDocenteDialog: React.FC<DocenteDialogProps> = ({
  disciplinaId,
  professores,
  onAssign,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
    <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
      >
        <X size={20} />
      </button>
      <h3 className="text-lg font-black text-[#001a33] mb-4">Selecionar Docente</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {professores.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <p className="font-bold text-sm">Nenhum professor cadastrado.</p>
            <p className="text-xs text-slate-500 mt-1">
              Cadastre professores ativos no módulo de Parceiros primeiro.
            </p>
          </div>
        ) : professores.map((professor) => (
          <button
            key={professor.id}
            onClick={() => onAssign(disciplinaId, professor.id)}
            className="w-full text-left px-4 py-3 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 font-bold text-slate-700 transition-colors"
          >
            {professor.nome}
          </button>
        ))}
      </div>
    </div>
  </div>
);
interface DeleteAulaDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const TurmaGradeDeleteAulaDialog: React.FC<DeleteAulaDialogProps> = ({
  onCancel,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
    <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
      <h3 className="text-lg font-black text-[#001a33]">Excluir aula?</h3>
      <p className="text-sm text-slate-500 mt-2">
        A aula e seus lançamentos associados serão removidos.
      </p>
      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase text-slate-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-xs font-black uppercase"
        >
          Excluir aula
        </button>
      </div>
    </div>
  </div>
);

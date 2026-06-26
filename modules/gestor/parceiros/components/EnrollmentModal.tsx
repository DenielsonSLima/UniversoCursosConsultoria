import React from 'react';
import { BookOpen, CheckCircle2, X } from 'lucide-react';

interface EnrollmentModalProps {
  alunoNome: string;
  alunoId: string;
  turmas: any[];
  selectedTurmaId: string;
  isPending: boolean;
  onClose: () => void;
  onSelectTurma: (turmaId: string) => void;
  onConfirm: (input: { alunoId: string; turmaId: string }) => void;
}

const EnrollmentModal: React.FC<EnrollmentModalProps> = ({
  alunoNome,
  alunoId,
  turmas,
  selectedTurmaId,
  isPending,
  onClose,
  onSelectTurma,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001a33]/60 backdrop-blur-sm animate-fadeIn">
    <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl relative border border-slate-100">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors"
      >
        <X size={20} />
      </button>

      <div className="flex flex-col items-center mb-6">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
          <BookOpen size={32} />
        </div>
        <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight text-center">
          Matricular Aluno
        </h3>
        <p className="text-slate-550 text-sm text-center mt-1">
          Selecione uma turma para vincular o aluno <strong>{alunoNome}</strong>.
        </p>
      </div>

      <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
        {turmas.length === 0 ? (
          <p className="text-center text-slate-450 text-xs py-6">Nenhuma turma disponível.</p>
        ) : (
          turmas.map((turma) => (
            <button
              key={turma.id}
              onClick={() => onSelectTurma(turma.id)}
              className={`w-full flex justify-between items-center p-4 rounded-2xl border text-left transition-all ${
                selectedTurmaId === turma.id
                  ? 'border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-100'
                  : 'border-slate-100 hover:border-slate-300 bg-slate-50'
              }`}
            >
              <div>
                <h4 className="font-bold text-[#001a33] text-sm">{turma.nome}</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                  Código: {turma.codigo} • Turno: {turma.turno}
                </p>
              </div>
              {selectedTurmaId === turma.id && (
                <CheckCircle2 className="text-blue-600" size={18} />
              )}
            </button>
          ))
        )}
      </div>

      <div className="flex gap-3 mt-8 pt-4 border-t border-slate-100">
        <button
          onClick={onClose}
          className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-650 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
        >
          Pular Matrícula
        </button>
        <button
          onClick={() => selectedTurmaId && onConfirm({ alunoId, turmaId: selectedTurmaId })}
          disabled={!selectedTurmaId || isPending}
          className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50"
        >
          {isPending ? 'Matriculando...' : 'Confirmar Matrícula'}
        </button>
      </div>
    </div>
  </div>
);

export default EnrollmentModal;

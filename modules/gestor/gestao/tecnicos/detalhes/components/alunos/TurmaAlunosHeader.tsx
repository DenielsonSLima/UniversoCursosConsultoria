import React from 'react';
import { UserPlus } from 'lucide-react';

interface TurmaAlunosHeaderProps {
  totalStudents: number;
  onEnroll: () => void;
  canEnroll: boolean;
}

const TurmaAlunosHeader: React.FC<TurmaAlunosHeaderProps> = ({ totalStudents, onEnroll, canEnroll }) => (
  <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
    <div>
      <h3 className="text-lg font-bold text-[#001a33] mb-1">Matrículas da Turma</h3>
      <p className="text-slate-500 text-xs">
        {totalStudents} registros preservados, incluindo alunos inativos e transferidos.
      </p>
    </div>
    <button
      onClick={onEnroll}
      disabled={!canEnroll}
      title={canEnroll ? 'Matricular aluno' : 'Esta fase da turma não permite novas matrículas.'}
      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-md disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
    >
      <UserPlus size={16} /> Matricular Aluno
    </button>
  </div>
);

export default TurmaAlunosHeader;

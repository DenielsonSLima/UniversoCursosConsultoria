import React from 'react';
import { ArrowRightLeft, PauseCircle, RotateCcw, UserX } from 'lucide-react';
import { formatMatricula } from '../../../../../../../lib/academicUtils';
import { AcademicStudent } from '../../academic-lifecycle.service';

interface TurmaAlunosTableProps {
  students: AcademicStudent[];
  onOpenMovement: (student: AcademicStudent) => void;
  onOpenTransfer: (student: AcademicStudent) => void;
}

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'ATIVO': return 'bg-emerald-100 text-emerald-700';
    case 'TRANCADO': return 'bg-amber-100 text-amber-700';
    case 'DESISTENTE':
    case 'CANCELADO': return 'bg-rose-100 text-rose-700';
    case 'TRANSFERIDO': return 'bg-violet-100 text-violet-700';
    case 'CONCLUIDO': return 'bg-blue-100 text-blue-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const TurmaAlunosTable: React.FC<TurmaAlunosTableProps> = ({
  students,
  onOpenMovement,
  onOpenTransfer,
}) => {
  if (students.length === 0) {
    return (
      <div className="py-20 text-center text-slate-400 flex flex-col items-center">
        <UserX size={48} className="mb-4 opacity-50 text-slate-300" />
        <p className="font-bold text-sm">Nenhuma matrícula registrada nesta turma.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left border-collapse">
        <thead className="bg-[#001a33] text-white">
          <tr>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Aluno</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Matrícula</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Situação</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Frequência</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {students.map((student) => (
            <tr key={student.matricula_id} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-black text-slate-500 border border-slate-200">
                    {student.nome.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-[#001a33] text-sm block">{student.nome}</span>
                    <span className="text-[10px] text-slate-500">
                      CPF: {student.cpf || 'Não informado'}
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-6 py-5 text-sm text-slate-500 font-mono">
                {formatMatricula(student.matricula_id, student.data_matricula)}
              </td>
              <td className="px-6 py-5">
                <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${getStatusStyle(student.status)}`}>
                  {student.status.replace('_', ' ')}
                </span>
              </td>
              <td className="px-6 py-5">
                {student.frequencia_percent === null ? (
                  <span className="text-[10px] font-bold uppercase text-slate-400">Sem lançamentos</span>
                ) : (
                  <span className="text-sm font-black text-slate-700">{student.frequencia_percent}%</span>
                )}
              </td>
              <td className="px-6 py-5">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onOpenMovement(student)}
                    disabled={student.status === 'TRANSFERIDO' || student.status === 'CONCLUIDO'}
                    title="Movimentar matrícula"
                    className="p-2.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {['TRANCADO', 'DESISTENTE', 'CANCELADO'].includes(student.status)
                      ? <RotateCcw size={16} />
                      : <PauseCircle size={16} />}
                  </button>
                  <button
                    onClick={() => onOpenTransfer(student)}
                    disabled={student.status !== 'ATIVO'}
                    title="Transferir aluno"
                    className="p-2.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowRightLeft size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TurmaAlunosTable;

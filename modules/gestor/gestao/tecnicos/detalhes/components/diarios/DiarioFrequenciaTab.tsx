import React from 'react';
import { AlertCircle, Calendar } from 'lucide-react';
import { DiarioAula, DiarioStudent } from './diario-classe.service';
import { AttendanceMap, DiarioStudentStats } from './diario-classe.types';

interface DiarioFrequenciaTabProps {
  students: DiarioStudent[];
  aulas: DiarioAula[];
  attendanceMap: AttendanceMap;
  isReadOnly: boolean;
  onToggleAttendance: (studentId: string, classId: string) => void;
  getStats: (studentId: string) => DiarioStudentStats;
}

const DiarioFrequenciaTab: React.FC<DiarioFrequenciaTabProps> = ({
  students,
  aulas,
  attendanceMap,
  isReadOnly,
  onToggleAttendance,
  getStats,
}) => (
  <div>
    {students.length === 0 ? (
      <div className="py-20 text-center text-slate-400 flex flex-col items-center">
        <AlertCircle size={48} className="mb-4 opacity-50 text-slate-300" />
        <p className="font-bold text-sm">Nenhum aluno matriculado nesta turma.</p>
        <p className="text-xs text-slate-500 mt-1">Matricule alunos na aba "Alunos" para registrar frequência.</p>
      </div>
    ) : aulas.length === 0 ? (
      <div className="py-20 text-center text-slate-400 flex flex-col items-center">
        <Calendar size={48} className="mb-4 opacity-50 text-slate-300" />
        <p className="font-bold text-sm">Nenhuma aula registrada nesta disciplina.</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md">Adicione aulas no cronograma da disciplina na aba "Grade & Profs" para lançar a folha de presença.</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="p-4 border-b border-slate-200 border-r w-12 text-center text-xs font-black text-slate-400">Nº</th>
              <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase">Nome do Aluno</th>
              <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 border-r" colSpan={aulas.length}>AULAS LANÇADAS</th>
              <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 w-32">TOTAL FALTAS</th>
            </tr>
            <tr>
              <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
              <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
              {aulas.map((aula) => (
                <th key={aula.id} className="p-2 border-b border-slate-200 border-r bg-slate-50 text-center text-[10px] font-bold text-slate-600 min-w-[65px] truncate" title={aula.titulo}>
                  {aula.dataLabel}
                </th>
              ))}
              <th className="p-2 border-b border-slate-200 bg-slate-50 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((aluno, idx) => {
              const stats = getStats(aluno.id);
              return (
                <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-3 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                  <td className="p-3 border-r border-slate-100 font-bold text-sm text-[#001a33] truncate max-w-[250px]">{aluno.nome}</td>
                  {aulas.map((aula) => {
                    const attendanceStatus = attendanceMap[aluno.id]?.[aula.id] || null;
                    const foiFalta = attendanceStatus === 'F';
                    const foiPresente = attendanceStatus === 'P';
                    return (
                      <td key={aula.id} className="p-2 border-r border-slate-100 text-center">
                        <button
                          onClick={() => onToggleAttendance(aluno.id, aula.id)}
                          disabled={isReadOnly}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-xs font-bold transition-all ${
                            foiFalta
                              ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                              : foiPresente
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          {foiFalta ? 'F' : foiPresente ? 'P' : '—'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${stats.faltas > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                      {stats.faltas}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default DiarioFrequenciaTab;

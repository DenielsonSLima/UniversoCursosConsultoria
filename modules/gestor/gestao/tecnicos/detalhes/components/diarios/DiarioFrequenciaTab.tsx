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
}) => {
  const totalSessoes = aulas.reduce((total, aula) => total + aula.sessoes.length, 0);

  return (
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
              <th rowSpan={3} className="p-4 border-b border-slate-200 border-r w-12 text-center text-xs font-black text-slate-400">Nº</th>
              <th rowSpan={3} className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase">Nome do Aluno</th>
              <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 border-r" colSpan={totalSessoes}>AULAS LANÇADAS</th>
              <th rowSpan={3} className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 w-32">TOTAL FALTAS</th>
            </tr>
            <tr>
              {aulas.map((aula) => (
                <th
                  key={aula.id}
                  colSpan={aula.sessoes.length}
                  className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[10px] font-black text-slate-700"
                  title={aula.titulo}
                >
                  <span>{aula.dataLabel}</span>
                  <span className="ml-1 text-[9px] font-medium italic text-slate-400">
                    ({String(aula.cargaHoraria).padStart(2, '0')}HRS)
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {aulas.flatMap((aula) => aula.sessoes.map((sessao) => (
                <th
                  key={sessao.id}
                  className="min-w-[65px] border-b border-r border-slate-200 bg-white px-2 py-1 text-center text-[10px] font-black text-blue-700"
                  title={`${sessao.periodo === 'M' ? 'Manhã' : sessao.periodo === 'T' ? 'Tarde' : sessao.periodo === 'N' ? 'Noite' : 'Aula única'} — ${sessao.cargaHoraria}h`}
                >
                  {sessao.periodo === 'U' ? 'ÚNICA' : sessao.periodo}
                  <span className="ml-1 text-[8px] font-medium italic text-slate-400">
                    {sessao.cargaHoraria}h
                  </span>
                </th>
              )))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((aluno, idx) => {
              const stats = getStats(aluno.id);
              const isCredited = stats.resultado === 'APROVEITADO';
              const totalFaltas = stats.faltas;
              return (
                <tr
                  key={aluno.id}
                  className={`transition-colors group ${isCredited ? 'bg-violet-50/60' : 'hover:bg-slate-50/50'}`}
                >
                  <td className="p-3 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                  <td className="p-3 border-r border-slate-100 font-bold text-sm text-[#001a33] max-w-[250px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate">{aluno.nome}</span>
                      {isCredited && (
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-violet-700">
                          Aproveitado
                        </span>
                      )}
                    </div>
                  </td>
                  {aulas.flatMap((aula) => aula.sessoes.map((sessao) => {
                    const attendanceStatus = attendanceMap[aluno.id]?.[sessao.id] || null;
                    const foiFalta = attendanceStatus === 'F';
                    const foiPresente = attendanceStatus === 'P';
                    const foiJustificada = attendanceStatus === 'J';
                    return (
                      <td key={sessao.id} className="p-2 border-r border-slate-100 text-center">
                        {isCredited ? (
                          <span
                            className="mx-auto inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-100 px-1.5 text-[9px] font-black text-violet-700"
                            title="Frequência preservada pelo aproveitamento acadêmico"
                          >
                            APR
                          </span>
                        ) : (
                          <button
                            onClick={() => onToggleAttendance(aluno.id, sessao.id)}
                            disabled={isReadOnly}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-xs font-bold transition-all ${
                              foiFalta
                                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                : foiPresente
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                                  : foiJustificada
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                                    : 'bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100'
                            } disabled:cursor-not-allowed disabled:opacity-70`}
                            title={foiJustificada ? 'Falta justificada' : foiFalta ? 'Falta' : foiPresente ? 'Presença' : 'Sem lançamento'}
                          >
                            {foiFalta ? 'F' : foiPresente ? 'P' : foiJustificada ? 'J' : '—'}
                          </button>
                        )}
                      </td>
                    );
                  }))}
                  <td className="p-3 text-center">
                    {isCredited ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-black uppercase text-violet-700">
                        Equivalência
                      </span>
                    ) : (
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${totalFaltas > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                        {totalFaltas}
                      </span>
                    )}
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
};

export default DiarioFrequenciaTab;

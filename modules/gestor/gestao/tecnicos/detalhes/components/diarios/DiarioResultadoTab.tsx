import React from 'react';
import { AlertCircle } from 'lucide-react';
import { DiarioStudent } from './diario-classe.service';
import { DiarioStudentStats, GradesMap } from './diario-classe.types';

type GradeField = 'p' | 'ti' | 'tg' | 's' | 'cq' | 'o' | 'rec';

interface DiarioResultadoTabProps {
  students: DiarioStudent[];
  localGrades: GradesMap;
  isReadOnly: boolean;
  getStats: (studentId: string) => DiarioStudentStats;
  onGradeChange: (studentId: string, field: GradeField, value: string) => void;
  onSaveGrade: (studentId: string) => void;
}

const DiarioResultadoTab: React.FC<DiarioResultadoTabProps> = ({
  students,
  localGrades,
  isReadOnly,
  getStats,
  onGradeChange,
  onSaveGrade,
}) => (
  <div>
    {students.length === 0 ? (
      <div className="py-20 text-center text-slate-400 flex flex-col items-center">
        <AlertCircle size={48} className="mb-4 opacity-50 text-slate-300" />
        <p className="font-bold text-sm">Nenhum aluno matriculado nesta turma.</p>
        <p className="text-xs text-slate-500 mt-1">Matricule alunos na aba "Alunos" para lançar notas.</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr>
              <th className="p-4 border-b border-slate-200 border-r w-12 text-xs font-black text-slate-400" rowSpan={2}>Nº</th>
              <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase text-left" rowSpan={2}>Nome do Aluno</th>
              <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-blue-700 bg-blue-50/50" colSpan={6}>INSTRUMENTOS AVALIATIVOS (0.0 a 10.0)</th>
              <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA PARCIAL</th>
              <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>REC<br /><span className="font-bold text-slate-400">SUBST.</span></th>
              <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA FINAL</th>
              <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-amber-700 bg-amber-50/50" colSpan={2}>FREQUÊNCIA</th>
              <th className="p-4 border-b border-slate-200 text-xs font-black text-[#001a33] uppercase" rowSpan={2}>RESULTADO FINAL</th>
            </tr>
            <tr>
              <GradeHeader title="Prova">P</GradeHeader>
              <GradeHeader title="Trabalho Individual">TI</GradeHeader>
              <GradeHeader title="Trabalho em Grupo">TG</GradeHeader>
              <GradeHeader title="Seminário">S</GradeHeader>
              <GradeHeader title="Critérios Qualitativos">CQ</GradeHeader>
              <GradeHeader title="Outros">O</GradeHeader>
              <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">FALTAS</th>
              <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">% PRES.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((aluno, idx) => {
              const stats = getStats(aluno.id);
              const isCredited = stats.resultado === 'APROVEITADO';
              const studentGrades = localGrades[aluno.id] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
              const commonInputProps = {
                studentId: aluno.id,
                onGradeChange,
                onSaveGrade,
                disabled: isReadOnly || isCredited,
              };
              return (
                <tr key={aluno.id} className={`transition-colors ${isCredited ? 'bg-violet-50/60' : 'hover:bg-slate-50/50'}`}>
                  <td className="p-2 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                  <td className="p-2 border-r border-slate-100 font-bold text-xs text-[#001a33] text-left truncate max-w-[200px]">{aluno.nome}</td>
                  <GradeInput {...commonInputProps} field="p" value={studentGrades.p} />
                  <GradeInput {...commonInputProps} field="ti" value={studentGrades.ti} />
                  <GradeInput {...commonInputProps} field="tg" value={studentGrades.tg} />
                  <GradeInput {...commonInputProps} field="s" value={studentGrades.s} />
                  <GradeInput {...commonInputProps} field="cq" value={studentGrades.cq} />
                  <GradeInput {...commonInputProps} field="o" value={studentGrades.o} />
                  <td className="p-2 border-r border-slate-100 font-bold text-xs bg-slate-50">
                    {stats.mediaParcial === null ? '—' : stats.mediaParcial.toFixed(1)}
                  </td>
                  <GradeInput
                    {...commonInputProps}
                    field="rec"
                    value={studentGrades.rec}
                    recovery
                    disabled={isReadOnly || isCredited || (stats.mediaParcial !== null && stats.mediaParcial >= 6)}
                  />
                  <td className="p-2 border-r border-slate-100 font-black text-sm bg-slate-50 text-[#001a33]">
                    {stats.mediaFinal === null ? '—' : stats.mediaFinal.toFixed(1)}
                  </td>
                  <td className="p-2 border-r border-slate-100 font-bold text-xs text-red-600">{stats.faltas}</td>
                  <td className="p-2 border-r border-slate-100 font-bold text-xs">
                    {stats.frequencia === null ? '—' : `${stats.frequencia}%`}
                  </td>
                  <td className="p-2">
                    <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      ['APROVADO', 'APROVEITADO'].includes(stats.resultado)
                        ? 'bg-emerald-100 text-emerald-800'
                        : ['EM_RECUPERACAO', 'FREQUENCIA_PENDENTE', 'SEM_LANCAMENTO'].includes(stats.resultado)
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }`}>
                      {stats.resultado.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    <div className="p-6 bg-slate-50 border-t border-slate-200">
      <p className="text-xs font-bold text-slate-500 mb-2">LEGENDA - Instrumentos Avaliativos:</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-medium text-slate-600">
        <span><strong>P</strong> - Prova Escrita</span>
        <span><strong>TI</strong> - Trabalho Individual</span>
        <span><strong>TG</strong> - Trabalho em Grupo</span>
        <span><strong>S</strong> - Seminário</span>
        <span><strong>CQ</strong> - Critérios Qualitativos (assiduidade, participação, etc.)</span>
        <span><strong>O</strong> - Outros / Atividades Práticas</span>
        <span><strong>REC</strong> - Recuperação Semestral</span>
      </div>
      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[11px] font-bold leading-relaxed text-blue-900">
        Regra da recuperação: quando a média parcial fica abaixo de 6,0, o aluno entra em recuperação.
        A nota REC é substitutiva: se for maior que a média parcial, ela passa a ser a média final; se for menor, a média parcial é preservada.
        O período só pode ser fechado depois que todas as recuperações pendentes forem lançadas.
      </div>
    </div>
  </div>
);

const GradeHeader: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title={title}>{children}</th>
);

interface GradeInputProps {
  studentId: string;
  field: GradeField;
  value: number | null;
  disabled: boolean;
  recovery?: boolean;
  onGradeChange: DiarioResultadoTabProps['onGradeChange'];
  onSaveGrade: DiarioResultadoTabProps['onSaveGrade'];
}

const GradeInput: React.FC<GradeInputProps> = ({
  studentId,
  field,
  value,
  disabled,
  recovery = false,
  onGradeChange,
  onSaveGrade,
}) => (
  <td className="p-1 border-r border-slate-100">
    <input
      type="number"
      min="0"
      max="10"
      step="0.1"
      className={`w-full text-center text-xs font-bold ${recovery ? 'text-blue-600' : 'text-slate-700'} bg-transparent outline-none focus:bg-blue-50/50 rounded py-1`}
      value={value === null || value === undefined ? '' : value}
      placeholder={recovery ? '—' : undefined}
      disabled={disabled}
      onChange={(event) => onGradeChange(studentId, field, event.target.value)}
      onBlur={() => onSaveGrade(studentId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  </td>
);

export default DiarioResultadoTab;

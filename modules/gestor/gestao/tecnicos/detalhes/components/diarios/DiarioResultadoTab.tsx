import React from 'react';
import { AlertCircle, SlidersHorizontal } from 'lucide-react';
import { DiarioStudent } from './diario-classe.service';
import { ActiveInstruments, DiarioStudentStats, GradesMap } from './diario-classe.types';

type GradeField = 'p' | 'ti' | 'tg' | 's' | 'cq' | 'o' | 'rec';

interface DiarioResultadoTabProps {
  students: DiarioStudent[];
  localGrades: GradesMap;
  isReadOnly: boolean;
  activeInstruments: ActiveInstruments;
  onToggleInstrument: (field: keyof ActiveInstruments) => void;
  getStats: (studentId: string) => DiarioStudentStats;
  onGradeChange: (studentId: string, field: GradeField, value: string) => void;
  onSaveGrade: (studentId: string, field: GradeField) => void;
}

const DiarioResultadoTab: React.FC<DiarioResultadoTabProps> = ({
  students,
  localGrades,
  isReadOnly,
  activeInstruments,
  onToggleInstrument,
  getStats,
  onGradeChange,
  onSaveGrade,
}) => {
  const instrumentsList: { key: keyof ActiveInstruments; label: string; fullTitle: string }[] = [
    { key: 'p', label: 'P', fullTitle: 'Prova Escrita' },
    { key: 'ti', label: 'TI', fullTitle: 'Trabalho Individual' },
    { key: 'tg', label: 'TG', fullTitle: 'Trabalho em Grupo' },
    { key: 's', label: 'S', fullTitle: 'Seminário' },
    { key: 'cq', label: 'CQ', fullTitle: 'Critérios Qualitativos' },
    { key: 'o', label: 'O', fullTitle: 'Outros Instrumentos' },
  ];

  return (
    <div>
      {/* Barra de controle dos Instrumentos Avaliativos */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <SlidersHorizontal size={16} className="text-blue-600 shrink-0" />
          <span>Instrumentos Avaliativos da Disciplina:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {instrumentsList.map((inst) => {
            const active = activeInstruments[inst.key];
            return (
              <button
                key={inst.key}
                type="button"
                onClick={() => !isReadOnly && onToggleInstrument(inst.key)}
                disabled={isReadOnly}
                className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all border flex items-center gap-1.5 cursor-pointer ${
                  active
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm'
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through hover:bg-slate-200 opacity-70'
                } disabled:cursor-not-allowed`}
                title={active ? `Clique para anular/remover ${inst.fullTitle}` : `Clique para ativar ${inst.fullTitle}`}
              >
                <span>{inst.label}</span>
                <span className={`text-[9px] font-black px-1 rounded ${active ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                  {active ? 'ATIVO' : 'ANULADO'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
                {instrumentsList.map((inst) => (
                  <GradeHeader
                    key={inst.key}
                    title={inst.fullTitle}
                    active={activeInstruments[inst.key]}
                    onToggle={() => !isReadOnly && onToggleInstrument(inst.key)}
                  >
                    {inst.label}
                  </GradeHeader>
                ))}
                <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">FALTAS</th>
                <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">% PRES.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((aluno, idx) => {
                const stats = getStats(aluno.id);
                const isCredited = stats.resultado === 'APROVEITADO';
                const studentGrades = localGrades[aluno.id] || { p: null, ti: null, tg: null, s: null, cq: null, o: null, rec: null };
                const commonInputProps = {
                  studentId: aluno.id,
                  onGradeChange,
                  onSaveGrade,
                };
                return (
                  <tr key={aluno.id} className={`transition-colors ${isCredited ? 'bg-violet-50/60' : 'hover:bg-slate-50/50'}`}>
                    <td className="p-2 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="p-2 border-r border-slate-100 font-bold text-xs text-[#001a33] text-left truncate max-w-[200px]">{aluno.nome}</td>
                    <GradeInput {...commonInputProps} field="p" value={studentGrades.p} disabled={isReadOnly || isCredited || !activeInstruments.p} />
                    <GradeInput {...commonInputProps} field="ti" value={studentGrades.ti} disabled={isReadOnly || isCredited || !activeInstruments.ti} />
                    <GradeInput {...commonInputProps} field="tg" value={studentGrades.tg} disabled={isReadOnly || isCredited || !activeInstruments.tg} />
                    <GradeInput {...commonInputProps} field="s" value={studentGrades.s} disabled={isReadOnly || isCredited || !activeInstruments.s} />
                    <GradeInput {...commonInputProps} field="cq" value={studentGrades.cq} disabled={isReadOnly || isCredited || !activeInstruments.cq} />
                    <GradeInput {...commonInputProps} field="o" value={studentGrades.o} disabled={isReadOnly || isCredited || !activeInstruments.o} />
                    <td className="p-2 border-r border-slate-100 font-black text-xs bg-slate-50/80 text-blue-900">
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
          <span className={activeInstruments.p ? 'font-bold text-blue-900' : 'line-through text-slate-400'}><strong>P</strong> - Prova Escrita</span>
          <span className={activeInstruments.ti ? 'font-bold text-blue-900' : 'line-through text-slate-400'}><strong>TI</strong> - Trabalho Individual</span>
          <span className={activeInstruments.tg ? 'font-bold text-blue-900' : 'line-through text-slate-400'}><strong>TG</strong> - Trabalho em Grupo</span>
          <span className={activeInstruments.s ? 'font-bold text-blue-900' : 'line-through text-slate-400'}><strong>S</strong> - Seminário</span>
          <span className={activeInstruments.cq ? 'font-bold text-blue-900' : 'line-through text-slate-400'}><strong>CQ</strong> - Critérios Qualitativos</span>
          <span className={activeInstruments.o ? 'font-bold text-blue-900' : 'line-through text-slate-400'}><strong>O</strong> - Outros / Atividades Práticas</span>
          <span><strong>REC</strong> - Recuperação Semestral</span>
        </div>
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[11px] font-bold leading-relaxed text-blue-900">
          A Média Parcial é calculada somando os pontos obtidos nos instrumentos ativos da disciplina (limitada a 10.0). Instrumentos anulados são desconsiderados do cálculo e da exibição.
        </div>
      </div>
    </div>
  );
};

const GradeHeader: React.FC<{
  title: string;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, active, onToggle, children }) => (
  <th
    className={`p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold w-12 cursor-pointer transition-colors ${
      active
        ? 'text-blue-700 bg-blue-50/70 hover:bg-blue-100'
        : 'text-slate-300 bg-slate-100 hover:bg-slate-200 line-through'
    }`}
    title={`${title} (${active ? 'Ativo - Clique para anular' : 'Anulado - Clique para ativar'})`}
    onClick={onToggle}
  >
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span>{children}</span>
      <span className={`text-[8px] font-black px-1 rounded ${active ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>
        {active ? '✓' : '✕'}
      </span>
    </div>
  </th>
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
  <td className={`p-1 border-r border-slate-100 ${disabled ? 'bg-slate-100/50' : ''}`}>
    <input
      type="number"
      min="0"
      max="10"
      step="0.1"
      inputMode="decimal"
      className={`w-full text-center text-xs font-bold ${recovery ? 'text-blue-600' : 'text-slate-700'} ${disabled ? 'text-slate-300' : ''} bg-transparent outline-none focus:bg-blue-50/50 rounded py-1`}
      value={disabled && (value === null || value === undefined) ? '' : (value === null || value === undefined ? '' : value)}
      placeholder="—"
      disabled={disabled}
      onChange={(event) => onGradeChange(studentId, field, event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => onSaveGrade(studentId, field)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  </td>
);

export default DiarioResultadoTab;

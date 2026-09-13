import React from 'react';
import { AlertCircle, SlidersHorizontal } from 'lucide-react';
import { DiarioStudent } from './diario-classe.service';
import { ActiveInstruments, DiarioStudentStats, GradesMap } from './diario-classe.types';
import type { HistoricalStudent } from './historico/diario-historico.types';
import { useDiarioDocumentary } from './historico/DiarioDocumentaryContext';
import { buildDocumentaryGradeColumns, documentaryGradeCellText, diaryGradeNumberText } from './historico/diario-documentary.presentation';

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
  const documentary = useDiarioDocumentary();
  const instrumentsList: { key: keyof ActiveInstruments; label: string; fullTitle: string }[] = [
    { key: 'p', label: 'P', fullTitle: 'Prova Escrita' },
    { key: 'ti', label: 'TI', fullTitle: 'Trabalho Individual' },
    { key: 'tg', label: 'TG', fullTitle: 'Trabalho em Grupo' },
    { key: 's', label: 'S', fullTitle: 'Seminário' },
    { key: 'cq', label: 'CQ', fullTitle: 'Critérios Qualitativos' },
    { key: 'o', label: 'O', fullTitle: 'Outros Instrumentos' },
  ];

  const visibleInstruments = instrumentsList.filter((instrument) => activeInstruments[instrument.key]);
  const documentaryColumns = documentary
    ? buildDocumentaryGradeColumns(Object.values<HistoricalStudent>(documentary.students).map((student) => student.gradeRows))
    : null;
  const instrumentColumnCount = documentaryColumns?.length ?? visibleInstruments.length;

  return (
    <div>
      {/* Barra de controle dos Instrumentos Avaliativos */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <SlidersHorizontal size={16} className="text-blue-600 shrink-0" />
          <span>Instrumentos Avaliativos da Disciplina:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {documentaryColumns ? documentaryColumns.map((column) => (
            <span key={column.key} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700">
              {column.label}
            </span>
          )) : instrumentsList.map((inst) => {
            const active = activeInstruments[inst.key];
            return (
              <button
                key={inst.key}
                type="button"
                onClick={() => !isReadOnly && !documentary && onToggleInstrument(inst.key)}
                disabled={isReadOnly || Boolean(documentary)}
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
                {instrumentColumnCount > 0 && <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-blue-700 bg-blue-50/50" colSpan={instrumentColumnCount}>INSTRUMENTOS AVALIATIVOS (0.0 a 10.0)</th>}
                <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA PARCIAL</th>
                <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>REC<br /><span className="font-bold text-slate-400">SUBST.</span></th>
                <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA FINAL</th>
                <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-amber-700 bg-amber-50/50" colSpan={2}>FREQUÊNCIA</th>
                <th className="p-4 border-b border-slate-200 text-xs font-black text-[#001a33] uppercase" rowSpan={2}>RESULTADO FINAL</th>
              </tr>
              <tr>
                {documentaryColumns ? documentaryColumns.map((column) => (
                  <th key={column.key} scope="col" className="min-w-14 border-b border-r border-slate-200 bg-blue-50/70 p-2 text-[10px] font-bold text-blue-700">
                    {column.label}
                  </th>
                )) : visibleInstruments.map((inst) => (
                  <GradeHeader
                    key={inst.key}
                    title={inst.fullTitle}
                    active={activeInstruments[inst.key]}
                    onToggle={() => !isReadOnly && !documentary && onToggleInstrument(inst.key)}
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
                const gradeReadOnly = isReadOnly || Boolean(documentary);
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
                    {documentaryColumns ? documentaryColumns.map((column) => {
                      const source = documentary?.students[aluno.id];
                      return (
                        <td key={column.key} className="border-r border-slate-100 p-2 text-xs font-bold text-slate-700">
                          {documentaryGradeCellText(source?.gradeRows, column)}
                        </td>
                      );
                    }) : visibleInstruments.map((instrument) => (
                      <GradeInput
                        key={instrument.key}
                        {...commonInputProps}
                        field={instrument.key}
                        value={studentGrades[instrument.key]}
                        disabled={gradeReadOnly || isCredited || !activeInstruments[instrument.key]}
                      />
                    ))}
                    <td className="p-2 border-r border-slate-100 font-black text-xs bg-slate-50/80 text-blue-900">
                      {diaryGradeNumberText(stats.mediaParcial)}
                    </td>
                    <GradeInput
                      {...commonInputProps}
                      field="rec"
                      value={studentGrades.rec}
                      recovery
                      disabled={gradeReadOnly || isCredited || (stats.mediaParcial !== null && stats.mediaParcial >= 6)}
                    />
                    <td className="p-2 border-r border-slate-100 font-black text-sm bg-slate-50 text-[#001a33]">
                      {diaryGradeNumberText(stats.mediaFinal)}
                    </td>
                    <td className="p-2 border-r border-slate-100 font-bold text-xs text-red-600">{stats.faltas ?? '—'}</td>
                    <td className="p-2 border-r border-slate-100 font-bold text-xs">
                      {stats.frequencia === null ? '—' : `${stats.frequencia}%`}
                    </td>
                    <td className="p-2">
                      <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                        ['APROVADO', 'APROVEITADO'].includes(stats.resultado)
                          ? 'bg-emerald-100 text-emerald-800'
                          : ['EM_RECUPERACAO', 'FREQUENCIA_PENDENTE', 'SEM_LANCAMENTO', 'EM_CONFERENCIA'].includes(stats.resultado)
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
          {documentaryColumns ? documentaryColumns.map((column) => {
            const standard = instrumentsList.find((instrument) => instrument.label === column.category);
            return (
              <span key={column.key} className="font-bold text-blue-900">
                <strong>{column.label}</strong>{standard ? ` - ${column.category === 'P' ? 'Prova' : standard.fullTitle}` : ''}
              </span>
            );
          }) : visibleInstruments.map((instrument) => (
            <span key={instrument.key} className="font-bold text-blue-900">
              <strong>{instrument.label}</strong> - {instrument.fullTitle}
            </span>
          ))}
          <span><strong>REC</strong> - Recuperação Semestral</span>
        </div>
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[11px] font-bold leading-relaxed text-blue-900">
          {documentary
            ? 'As avaliações registradas aparecem separadas. Médias, frequência e resultado são informados pelo sistema.'
            : 'A Média Parcial é calculada somando os pontos obtidos nos instrumentos ativos da disciplina (limitada a 10.0). Instrumentos anulados são desconsiderados do cálculo e da exibição.'}
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

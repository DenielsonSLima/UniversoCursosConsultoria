import type { FC } from 'react';
import type { DiarioHistorico, HistoricalGradeRow, HistoricalResults } from './diario-historico.types';
import HistoricalField, { ReviewBadge } from './HistoricalField';
import { historicalNumber } from './diario-historico.presentation';

const resultLabels: Array<[keyof HistoricalResults, string]> = [
  ['partial', 'Média parcial no documento'], ['recovery', 'Recuperação no documento'],
  ['final', 'Média final no documento'], ['frequency', 'Frequência no documento'],
  ['absences', 'Faltas no documento'], ['outcome', 'Situação no documento'],
];

const SourceGradeRow: FC<{ row: HistoricalGradeRow; resultState?: string }> = ({ row, resultState }) => (
  <div className="space-y-4 border-t border-slate-100 pt-4">
    <div className="flex flex-wrap gap-3">
      {row.grades.map((grade, index) => (
        <div key={`${grade.columnOrdinal}-${index}`} className="min-w-28 rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-1 text-[10px] uppercase text-slate-400">Instrumento do documento</p>
          <div className="text-xs font-bold text-[#001a33]"><HistoricalField field={grade.category} /></div>
          <div className="mt-2 text-sm font-semibold text-slate-700"><HistoricalField field={grade.value} /></div>
        </div>
      ))}
    </div>
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {resultLabels.map(([key, label]) => (
        <div key={key}>
          <dt className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
          <dd className="text-sm font-semibold text-slate-700"><HistoricalField field={row.reportedResults?.[key]} state={key === 'outcome' ? resultState : undefined} /></dd>
        </div>
      ))}
    </dl>
  </div>
);

const DiarioHistoricoResultados = ({ history }: { history: DiarioHistorico }) => (
  <div className="space-y-4 p-5">
    <p className="text-sm text-slate-500">
      Instrumentos e resultados mantêm a ordem do documento. Categorias repetidas aparecem separadamente.
      A situação escrita no diário não altera a matrícula do aluno.
    </p>
    {history.students.map((student) => (
      <article key={student.matriculaId} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-[#001a33]">{student.name}</h4>
            <p className="mt-1 text-xs text-slate-500">Matrícula: {student.enrollmentStatus}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {student.gradeState === 'CONFERIDO' ? 'Média final conferida' : 'Média final em conferência'}
            </p>
            <p className="text-lg font-black text-[#001a33]">{student.gradeState === 'CONFERIDO' ? historicalNumber(student.final) : '—'}</p>
            <ReviewBadge state={student.gradeState} />
            {student.resultState === 'EM_CONFERENCIA' && <p className="mt-1 text-xs font-bold text-amber-700">Resultado em conferência</p>}
          </div>
        </div>
        <div className="space-y-5">
          {student.gradeRows?.length ? student.gradeRows.map((row) => <SourceGradeRow key={row.sourceKey} row={row} resultState={student.resultState} />)
            : <SourceGradeRow row={{ sourceKey: student.matriculaId, grades: student.grades || [], reportedResults: student.reportedResults || undefined }} resultState={student.resultState} />}
        </div>
      </article>
    ))}
    {history.studentsCount === 0 && <p className="text-sm text-slate-500">Nenhum resultado foi vinculado a uma matrícula até o momento.</p>}
  </div>
);

export default DiarioHistoricoResultados;

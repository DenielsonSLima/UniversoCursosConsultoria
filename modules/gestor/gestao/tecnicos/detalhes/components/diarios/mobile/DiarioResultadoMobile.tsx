import React, { useState } from 'react';
import type { DiarioResultadoTabProps } from '../DiarioResultadoTab';
import type { ActiveInstruments } from '../diario-classe.types';
import { useDiarioDocumentary } from '../historico/DiarioDocumentaryContext';
import { buildDocumentaryGradeColumns, documentaryGradeCellText, diaryGradeNumberText } from '../historico/diario-documentary.presentation';
import type { HistoricalStudent } from '../historico/diario-historico.types';

const instruments: { key: keyof ActiveInstruments; label: string }[] = [
  { key: 'p', label: 'Prova escrita' }, { key: 'ti', label: 'Trabalho individual' },
  { key: 'tg', label: 'Trabalho em grupo' }, { key: 's', label: 'Seminário' },
  { key: 'cq', label: 'Critérios qualitativos' }, { key: 'o', label: 'Outros instrumentos' },
];

const DiarioResultadoMobile: React.FC<DiarioResultadoTabProps> = ({ students, localGrades, isReadOnly, activeInstruments, onToggleInstrument, getStats, onGradeChange, onSaveGrade }) => {
  const documentary = useDiarioDocumentary();
  const [search, setSearch] = useState('');
  const visible = instruments.filter(instrument => activeInstruments[instrument.key]);
  const documentaryColumns = documentary ? buildDocumentaryGradeColumns(Object.values<HistoricalStudent>(documentary.students).map(student => student.gradeRows)) : null;
  return <section className="professor-diary-mobile" aria-label="Notas por aluno">
    {!documentary && <>
      <p className="text-xs text-slate-600">Instrumentos avaliativos da disciplina</p>
      <div className="my-3 flex flex-wrap gap-2">{instruments.map(instrument => <button type="button" key={instrument.key}
        aria-pressed={activeInstruments[instrument.key]} title={instrument.label} disabled={isReadOnly}
        onClick={() => onToggleInstrument(instrument.key)} className={`rounded-lg border px-3 py-2 ${activeInstruments[instrument.key] ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500'}`}>
        {instrument.key.toUpperCase()} · {activeInstruments[instrument.key] ? 'Ativo' : 'Anulado'}
      </button>)}</div>
      <p className="mb-4 text-xs text-slate-600">As notas são salvas ao sair do campo. Vazio significa sem lançamento; informe 0 quando essa for a nota.</p>
    </>}
    <label className="diary-mobile-label" htmlFor="diary-grade-student">Buscar aluno</label>
    <input id="diary-grade-student" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do aluno" />
    <div className="mt-4 space-y-3">{students.filter(student => student.nome.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(student => {
      const stats = getStats(student.id);
      const credited = stats.resultado === 'APROVEITADO';
      const disabled = isReadOnly || Boolean(documentary) || credited;
      const values = localGrades[student.id];
      return <article className="diary-mobile-card" key={student.id}>
        <h4 className="break-words font-medium">{student.nome}</h4>
        <p className="mt-1 text-xs text-slate-500">{stats.resultado.replaceAll('_', ' ')}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">{documentaryColumns ? documentaryColumns.map(column => <div key={column.key}>
          <p className="text-xs text-slate-500">{column.label}</p><p>{documentaryGradeCellText(documentary?.students[student.id]?.gradeRows, column)}</p>
        </div>) : visible.map(instrument => <GradeField key={instrument.key} label={instrument.label} studentId={student.id} studentName={student.nome} field={instrument.key}
          value={values?.[instrument.key] ?? null} disabled={disabled || !activeInstruments[instrument.key]} onGradeChange={onGradeChange} onSaveGrade={onSaveGrade} />)}
          <GradeField label="Recuperação (REC)" studentId={student.id} studentName={student.nome} field="rec" value={values?.rec ?? null}
            disabled={disabled || (stats.mediaParcial !== null && stats.mediaParcial >= 6)} onGradeChange={onGradeChange} onSaveGrade={onSaveGrade} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
          <div><dt className="text-slate-500">Média parcial</dt><dd>{diaryGradeNumberText(stats.mediaParcial)}</dd></div>
          <div><dt className="text-slate-500">Média final</dt><dd>{diaryGradeNumberText(stats.mediaFinal)}</dd></div>
          <div><dt className="text-slate-500">Faltas</dt><dd>{stats.faltas ?? '—'}</dd></div>
          <div><dt className="text-slate-500">Frequência</dt><dd>{stats.frequencia === null ? '—' : `${stats.frequencia}%`}</dd></div>
        </dl>
      </article>;
    })}</div>
    {!students.length && <p className="py-4 text-slate-500">Nenhum aluno disponível neste diário.</p>}
  </section>;
};

const GradeField: React.FC<Pick<DiarioResultadoTabProps, 'onGradeChange' | 'onSaveGrade'> & {
  label: string; studentId: string; studentName: string; field: keyof ActiveInstruments | 'rec'; value: number | null; disabled: boolean;
}> = ({ label, studentId, studentName, field, value, disabled, onGradeChange, onSaveGrade }) => <label className="diary-mobile-label">
  {label}
  <input aria-label={`${label} de ${studentName}`} type="number" min="0" max="10" step="0.01" inputMode="decimal"
    value={value ?? ''} disabled={disabled} placeholder="Sem nota" onChange={event => onGradeChange(studentId, field, event.target.value)}
    onBlur={() => onSaveGrade(studentId, field)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
</label>;

export default DiarioResultadoMobile;

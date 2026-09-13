import type { DiarioHistorico } from './diario-historico.types';
import HistoricalField, { ReviewBadge } from './HistoricalField';
import { historicalDate, historicalNumber } from './diario-historico.presentation';

const DiarioHistoricoFrequencia = ({ history }: { history: DiarioHistorico }) => (
  <>
    <p className="border-b border-slate-100 px-5 py-4 text-sm text-slate-500">
      P: presença · F: falta · J: justificativa · —: sem registro. Marcações e percentuais do documento permanecem identificados pela fonte.
    </p>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <caption className="sr-only">Frequência histórica por aluno e aula</caption>
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="min-w-56 px-5 py-4">Aluno</th>
            {history.lessons.map((lesson) => (
              <th scope="col" key={lesson.id} className="min-w-28 border-l border-slate-100 px-3 py-4 font-medium">
                <HistoricalField field={lesson.dateField} fallback={historicalDate(lesson.date)} />
              </th>
            ))}
            <th scope="col" className="min-w-32 px-4 py-4">Frequência conferida</th>
            <th scope="col" className="min-w-32 px-4 py-4">Frequência no documento</th>
            <th scope="col" className="min-w-32 px-4 py-4">Faltas no documento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {history.students.map((student) => (
            <tr key={student.matriculaId} className="align-top hover:bg-slate-50/50">
              <th scope="row" className="px-5 py-4 font-bold text-[#001a33]">
                {student.name}<p className="mt-1 text-[10px] font-normal text-slate-500">Matrícula: {student.enrollmentStatus}</p>
              </th>
              {history.lessons.map((lesson) => {
                const entry = student.attendance.find((item) => item.lessonId === lesson.id);
                return <td key={lesson.id} className="border-l border-slate-100 px-3 py-4 font-semibold text-slate-700">
                  <HistoricalField field={entry?.source} state={entry?.state} fallback={entry?.status || '—'} />
                </td>;
              })}
              <td className="px-4 py-4 text-slate-700">
                {historicalNumber(student.frequency)}{student.frequency !== null ? '%' : ''}
                <div className="mt-1"><ReviewBadge state={student.frequencyState} /></div>
              </td>
              <td className="px-4 py-4"><HistoricalField field={student.reportedResults?.frequency} /></td>
              <td className="space-y-2 px-4 py-4">
                {student.reportedAttendanceTotals?.length
                  ? student.reportedAttendanceTotals.map((field, index) => <HistoricalField key={index} field={field} />)
                  : <HistoricalField field={student.reportedResults?.absences} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {history.studentsCount === 0 && <p className="p-6 text-sm text-slate-500">Os vínculos dos alunos deste documento estão em conferência.</p>}
  </>
);

export default DiarioHistoricoFrequencia;

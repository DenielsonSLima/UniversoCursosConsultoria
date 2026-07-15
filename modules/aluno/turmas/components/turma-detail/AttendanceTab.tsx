import React, { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import type { AulaTurmaAluno, DisciplinaResumoAluno, FrequenciaAluno, QueryDisplayState } from '../../turmas.types';
import QueryStateNotice from '../QueryStateNotice';

interface AttendanceTabProps {
  disciplines: DisciplinaResumoAluno[];
  classes: AulaTurmaAluno[];
  attendance: FrequenciaAluno[];
  disciplinesState: QueryDisplayState;
  classesState: QueryDisplayState;
  attendanceState: QueryDisplayState;
}

const AttendanceTab: React.FC<AttendanceTabProps> = ({ disciplines, classes, attendance, disciplinesState, classesState, attendanceState }) => {
  const classesByDiscipline = useMemo(() => {
    const map = new Map<string, AulaTurmaAluno[]>();
    classes.forEach((item) => {
      if (!item.disciplina_id) return;
      map.set(item.disciplina_id, [...(map.get(item.disciplina_id) || []), item]);
    });
    return map;
  }, [classes]);
  const attendanceByClass = useMemo(() => new Map(attendance.filter((item) => item.aula_id).map((item) => [String(item.aula_id), String(item.status || '').toUpperCase()])), [attendance]);

  const hasError = disciplinesState.isError || classesState.isError || attendanceState.isError;
  const isLoading = disciplinesState.isLoading || classesState.isLoading || attendanceState.isLoading;
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2"><ScrollText size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Presença por disciplina</h4></div>
      <QueryStateNotice state={disciplinesState} label="as disciplinas" />
      <QueryStateNotice state={classesState} label="as aulas" />
      <QueryStateNotice state={attendanceState} label="a frequência" />
      {!isLoading && !hasError && disciplines.length === 0 ? <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma disciplina vinculada para mostrar o diário.</div> : null}
      {!hasError ? disciplines.map((discipline) => {
        const disciplineClasses = classesByDiscipline.get(discipline.id) || [];
        return (
          <div key={discipline.id} className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="mb-3 flex flex-col items-start gap-2 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between"><h5 className="break-words text-sm font-bold text-[#001a33]">{discipline.nome}</h5><span className="shrink-0 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">{discipline.frequency === null ? 'Frequência não lançada' : `${discipline.frequency}%`}</span></div>
            {disciplineClasses.length === 0 ? <p className="text-xs text-slate-500">Nenhuma aula registrada nesta disciplina.</p> : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{disciplineClasses.map((lesson) => { const status = attendanceByClass.get(String(lesson.id)); return <div key={lesson.id} className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold text-[#001a33]">{lesson.titulo || 'Aula sem título'}</p><div className="flex flex-wrap gap-2 text-slate-500"><span>{lesson.data_aula || 'sem data'}</span><span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider">{status === 'P' ? 'presente' : status === 'F' ? 'falta' : 'sem chamada'}</span></div></div>; })}</div>
            )}
          </div>
        );
      }) : null}
    </div>
  );
};

export default AttendanceTab;

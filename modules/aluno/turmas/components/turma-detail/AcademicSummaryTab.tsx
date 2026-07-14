import React from 'react';
import { BookOpen } from 'lucide-react';
import type { DisciplinaResumoAluno, QueryDisplayState, TurmaDisciplinaAluno } from '../../turmas.types';
import QueryStateNotice from '../QueryStateNotice';

interface AcademicSummaryTabProps {
  disciplines: TurmaDisciplinaAluno[];
  summaries: DisciplinaResumoAluno[];
  isTechnical: boolean;
  state: QueryDisplayState;
}

const AcademicSummaryTab: React.FC<AcademicSummaryTabProps> = ({ disciplines, summaries, isTechnical, state }) => {
  const summaryById = new Map<string, DisciplinaResumoAluno>(summaries.map((item) => [item.id, item]));
  return (
  <div className="space-y-4 pt-4">
    <div className="flex items-center gap-2"><BookOpen size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Grade e disciplinas do período</h4></div>
    <QueryStateNotice state={state} label="as disciplinas" />
    {!state.isLoading && !state.isError && disciplines.length === 0 ? (
      <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma disciplina vinculada a esta turma.</div>
    ) : null}
    {!state.isError && disciplines.length > 0 ? (
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
        {disciplines.map((item) => {
          const disciplineId = item.disciplinas?.id || item.disciplina_id || '';
          const completed = isTechnical ? summaryById.get(disciplineId)?.concluida === true : item.concluida === true;
          return <div key={item.id} className="flex flex-col gap-3 bg-slate-50/50 p-4 text-xs font-medium sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-[#001a33]">{item.disciplinas?.nome || 'Disciplina'}</p><p className="text-[10px] text-slate-400">Carga: {item.disciplinas?.carga_horaria || 0}h | Docente: {item.professor_nome || 'A definir'}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status</p><p className={`font-bold ${completed ? 'text-emerald-600' : 'text-blue-600'}`}>{completed ? 'Concluída' : 'Em andamento'}</p></div></div>;
        })}
      </div>
    ) : null}
  </div>
  );
};

export default AcademicSummaryTab;

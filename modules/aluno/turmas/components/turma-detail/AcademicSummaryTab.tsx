import React, { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import type { DisciplinaResumoAluno, QueryDisplayState, TurmaDisciplinaAluno } from '../../turmas.types';
import { groupCurriculumDisciplines } from '../../turmas.utils';
import CurriculumModuleSection from './CurriculumModuleSection';
import QueryStateNotice from '../QueryStateNotice';

interface AcademicSummaryTabProps {
  disciplines: TurmaDisciplinaAluno[];
  summaries: DisciplinaResumoAluno[];
  isTechnical: boolean;
  state: QueryDisplayState;
}

const AcademicSummaryTab: React.FC<AcademicSummaryTabProps> = ({ disciplines, summaries, isTechnical, state }) => {
  const summaryById = useMemo(
    () => new Map<string, DisciplinaResumoAluno>(summaries.map((item) => [item.id, item])),
    [summaries],
  );
  const modules = useMemo(() => groupCurriculumDisciplines(disciplines), [disciplines]);

  return (
    <div className="space-y-5 pt-4">
      <div className="flex items-center gap-2"><BookOpen size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Grade curricular</h4></div>
      <QueryStateNotice state={state} label="as disciplinas" />
      {!state.isLoading && !state.isError && disciplines.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma disciplina vinculada a esta turma.</div>
      ) : null}
      {!state.isError ? modules.map((module, moduleIndex) => {
        const totalHours = module.itens.reduce((total, item) => total + Number(item.disciplinas?.carga_horaria || 0), 0);
        const completedCount = module.itens.filter((item) => {
          const id = item.disciplinas?.id || item.disciplina_id || '';
          return isTechnical ? summaryById.get(id)?.concluida === true : item.concluida === true;
        }).length;
        return (
          <CurriculumModuleSection
            key={module.id}
            title={module.nome}
            order={module.ordem}
            itemCount={module.itens.length}
            detail={`${totalHours}h de carga • ${completedCount} concluída${completedCount === 1 ? '' : 's'}`}
            defaultOpen={moduleIndex === 0}
          >
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
              {module.itens.map((item, disciplineIndex) => {
                const disciplineId = item.disciplinas?.id || item.disciplina_id || '';
                const completed = isTechnical ? summaryById.get(disciplineId)?.concluida === true : item.concluida === true;
                return (
                  <div key={item.id} className="grid gap-3 bg-white p-4 text-xs sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-[10px] font-black text-slate-400">{String(disciplineIndex + 1).padStart(2, '0')}</span>
                    <div className="min-w-0"><p className="break-words font-bold text-[#001a33]">{item.disciplinas?.nome || 'Disciplina'}</p><p className="mt-1 text-[10px] text-slate-400">{item.disciplinas?.carga_horaria || 0}h • Docente: {item.professor_nome || 'A definir'}</p></div>
                    <span className={`w-max rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{completed ? 'Concluída' : 'Em andamento'}</span>
                  </div>
                );
              })}
            </div>
          </CurriculumModuleSection>
        );
      }) : null}
    </div>
  );
};

export default AcademicSummaryTab;

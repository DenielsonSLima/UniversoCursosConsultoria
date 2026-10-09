import React, { useId, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { AulaTurmaAluno, QueryDisplayState, TurmaDisciplinaAluno } from '../../turmas.types';
import { formatDate } from '../../turmas.utils';
import QueryStateNotice from '../QueryStateNotice';

interface CurriculumDisciplineSectionProps {
  discipline: TurmaDisciplinaAluno;
  order: number;
  completed: boolean;
  classes: AulaTurmaAluno[];
  classesState: QueryDisplayState;
}

const SESSION_LABELS: Record<string, string> = {
  M: 'Manhã', T: 'Tarde', N: 'Noite', U: 'Turno único',
};

const CurriculumDisciplineSection: React.FC<CurriculumDisciplineSectionProps> = ({
  discipline, order, completed, classes, classesState,
}) => {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const disciplineId = discipline.disciplinas?.id || discipline.disciplina_id;
  const lessons = disciplineId ? classes.filter((lesson) => lesson.disciplina_id === disciplineId) : [];
  const name = discipline.disciplinas?.nome || 'Disciplina';

  return (
    <section className="bg-white text-xs">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
        className="grid w-full grid-cols-[32px_minmax(0,1fr)_20px] items-center gap-3 p-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:grid-cols-[40px_minmax(0,1fr)_auto_20px]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-[10px] font-black text-slate-400">{String(order).padStart(2, '0')}</span>
        <span className="min-w-0">
          <span className="block break-words font-bold text-[#001a33]">{name}</span>
          <span className="mt-1 block text-[10px] text-slate-400">{discipline.disciplinas?.carga_horaria || 0}h • Docente: {discipline.professor_nome || 'A definir'}</span>
          <span className="mt-1 block text-[10px] font-semibold text-blue-600">{expanded ? 'Ocultar dias de aula' : 'Ver dias de aula'}</span>
        </span>
        <span className={`col-start-2 row-start-2 w-max rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider sm:col-auto sm:row-auto ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{completed ? 'Concluída' : 'Em andamento'}</span>
        <ChevronDown aria-hidden="true" size={16} className={`col-start-3 row-start-1 text-slate-400 transition-transform sm:col-auto sm:row-auto ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!expanded} className="border-t border-slate-100 bg-slate-50/50 p-4">
        {expanded ? <>
          {classesState.isLoading ? <p role="status" className="py-3 text-slate-500">Carregando dias de aula...</p> : null}
          {classesState.isError ? <QueryStateNotice state={classesState} label="os dias de aula" /> : null}
          {!classesState.isLoading && !classesState.isError && lessons.length === 0 ? (
            <p className="py-3 text-slate-500">Nenhuma aula cadastrada para esta disciplina.</p>
          ) : null}
          {!classesState.isLoading && !classesState.isError && lessons.length > 0 ? (
            <ul aria-label={`Dias de aula de ${name}`} className="space-y-2">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3">
                  <CalendarDays aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <p className="font-bold text-[#001a33]">{lesson.data_aula ? formatDate(lesson.data_aula) : 'Data a definir'}{lesson.sessao && SESSION_LABELS[lesson.sessao] ? ` • ${SESSION_LABELS[lesson.sessao]}` : ''}</p>
                    {lesson.titulo ? <p className="mt-1 break-words text-slate-600">{lesson.titulo}</p> : null}
                    {lesson.carga_horaria != null ? <p className="mt-1 text-[10px] text-slate-500">{lesson.carga_horaria}h de aula</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </> : null}
      </div>
    </section>
  );
};

export default CurriculumDisciplineSection;

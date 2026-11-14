import React from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import type { ProfessorDashboardLesson, ProfessorDashboardTurma } from '../hooks/useProfessorDashboard';

const formatDate = (value?: string | null, long = false) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', long
    ? { weekday: 'short', day: '2-digit', month: 'short' }
    : { day: '2-digit', month: '2-digit' })
  : 'Sem data';

interface Props {
  lessons: ProfessorDashboardLesson[];
  classes: ProfessorDashboardTurma[];
  onOpenClasses: () => void;
}

const ProfessorHomeLists: React.FC<Props> = ({ lessons, classes, onOpenClasses }) => (
  <div className="grid gap-4 xl:grid-cols-2">
    <section className="professor-card">
      <div className="professor-heading">
        <div><h3>Próximas aulas</h3><p>Datas cadastradas no polo selecionado.</p></div>
        <button type="button" className="professor-button" onClick={onOpenClasses}>
          Disciplinas<ArrowRight size={15} />
        </button>
      </div>
      <div className="space-y-3">
        {lessons.length ? lessons.map((lesson) => (
          <article key={lesson.id} className="border-t border-slate-100 pt-3">
            <p className="mb-1 text-xs font-medium text-blue-700">{formatDate(lesson.dataAula, true)}</p>
            <h4 className="break-words">{lesson.titulo || lesson.disciplinaNome || 'Aula cadastrada'}</h4>
            <p className="mt-1 break-words">{lesson.disciplinaNome || 'Disciplina sem nome'} · {lesson.turmaNome}</p>
            <p className="mt-1 professor-help">{lesson.cursoNome || 'Curso não informado'}</p>
            <p className="mt-1 flex items-start gap-1 professor-help">
              <MapPin size={13} className="mt-0.5 shrink-0" />
              {[lesson.poloNome, lesson.poloCidade, lesson.poloUf].filter(Boolean).join(' · ') || 'Polo não informado'}
            </p>
          </article>
        )) : <p className="professor-help">Nenhuma próxima aula com data cadastrada.</p>}
      </div>
    </section>
    <section className="professor-card">
      <div className="professor-heading">
        <div><h3>Turmas em andamento</h3><p>Turmas vinculadas às suas disciplinas.</p></div>
      </div>
      <div className="space-y-2">
        {classes.length ? classes.map((group) => (
          <button
            type="button" key={group.id} onClick={onOpenClasses}
            className="w-full rounded-lg border border-slate-200 p-3 text-left"
          >
            <h4 className="break-words">{group.nome}</h4>
            <p className="mt-1 professor-help">{group.cursoNome || 'Curso não informado'} · {group.disciplinasCount} disc.</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 professor-help">
              <span>Início: {formatDate(group.dataInicio)}</span>
              <span>Próxima aula: {formatDate(group.proximaAula)}</span>
            </p>
          </button>
        )) : <p className="professor-help">Nenhuma turma em andamento vinculada.</p>}
      </div>
    </section>
  </div>
);
export default ProfessorHomeLists;

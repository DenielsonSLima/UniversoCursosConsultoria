import React, { useMemo } from 'react';
import {
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  Clock3,
  ScrollText,
} from 'lucide-react';
import type {
  AulaTurmaAluno,
  DisciplinaResumoAluno,
  FrequenciaAluno,
  QueryDisplayState,
} from '../../turmas.types';
import { formatDate, groupDisciplineSummaries } from '../../turmas.utils';
import CurriculumModuleSection from './CurriculumModuleSection';
import QueryStateNotice from '../QueryStateNotice';

interface AttendanceTabProps {
  disciplines: DisciplinaResumoAluno[];
  classes: AulaTurmaAluno[];
  attendance: FrequenciaAluno[];
  disciplinesState: QueryDisplayState;
  classesState: QueryDisplayState;
  attendanceState: QueryDisplayState;
}

interface MeetingGroup {
  key: string;
  title: string;
  date: string | null;
  sessions: AulaTurmaAluno[];
}

const SESSION_ORDER: Record<string, number> = { M: 1, T: 2, N: 3, U: 4 };
const SESSION_LABELS: Record<string, string> = { M: 'Manhã', T: 'Tarde', N: 'Noite', U: 'Turno único' };

const groupMeetings = (lessons: AulaTurmaAluno[]): MeetingGroup[] => {
  const groups = new Map<string, MeetingGroup>();
  [...lessons]
    .sort((a, b) => {
      if (a.data_aula && !b.data_aula) return -1;
      if (!a.data_aula && b.data_aula) return 1;
      return String(a.data_aula || '').localeCompare(String(b.data_aula || ''))
        || (SESSION_ORDER[String(a.sessao || 'U')] || 9) - (SESSION_ORDER[String(b.sessao || 'U')] || 9)
        || a.id.localeCompare(b.id);
    })
    .forEach((lesson) => {
      const title = String(lesson.titulo || 'Aula sem título').trim();
      const key = `${lesson.data_aula || lesson.id}::${title.toLocaleLowerCase('pt-BR')}`;
      const current = groups.get(key) || { key, title, date: lesson.data_aula || null, sessions: [] };
      current.sessions.push(lesson);
      groups.set(key, current);
    });
  return [...groups.values()];
};

const AttendanceTab: React.FC<AttendanceTabProps> = ({
  disciplines,
  classes,
  attendance,
  disciplinesState,
  classesState,
  attendanceState,
}) => {
  const classesByDiscipline = useMemo(() => {
    const map = new Map<string, AulaTurmaAluno[]>();
    classes.forEach((item) => {
      if (!item.disciplina_id) return;
      map.set(item.disciplina_id, [...(map.get(item.disciplina_id) || []), item]);
    });
    return map;
  }, [classes]);
  const attendanceByClass = useMemo(
    () => new Map(attendance
      .filter((item) => item.aula_id)
      .map((item) => [String(item.aula_id), String(item.status || '').toUpperCase()])),
    [attendance],
  );
  const modules = useMemo(() => groupDisciplineSummaries(disciplines), [disciplines]);
  const disciplinesWithClasses = disciplines.filter(
    (discipline) => (classesByDiscipline.get(discipline.id) || []).length > 0,
  );
  const launchedAttendance = attendance.length;
  const absences = attendance.filter((item) => String(item.status || '').toUpperCase() === 'F').length;
  const publishedFrequencies = disciplines
    .map((discipline) => discipline.frequency)
    .filter((frequency): frequency is number => frequency !== null);
  const overallFrequency = launchedAttendance > 0
    ? Math.round(((launchedAttendance - absences) / launchedAttendance) * 100)
    : publishedFrequencies.length > 0
      ? Math.round(publishedFrequencies.reduce((total, frequency) => total + frequency, 0) / publishedFrequencies.length)
      : null;

  const hasError = disciplinesState.isError || classesState.isError || attendanceState.isError;
  const isLoading = disciplinesState.isLoading || classesState.isLoading || attendanceState.isLoading;

  return (
    <div className="space-y-5 pt-4">
      <div className="flex items-center gap-2"><ScrollText size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Diário e frequência</h4></div>
      <QueryStateNotice state={disciplinesState} label="as disciplinas" />
      <QueryStateNotice state={classesState} label="as aulas" />
      <QueryStateNotice state={attendanceState} label="a frequência" />
      {!isLoading && !hasError && disciplines.length === 0 ? <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma disciplina vinculada para mostrar o diário.</div> : null}

      {!isLoading && !hasError && disciplines.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><BookOpenCheck size={18} className="text-blue-600" /><p className="mt-3 text-xl font-black text-[#001a33]">{disciplinesWithClasses.length}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Com diário</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><CalendarDays size={18} className="text-slate-500" /><p className="mt-3 text-xl font-black text-[#001a33]">{classes.length}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sessões lançadas</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><ScrollText size={18} className="text-emerald-600" /><p className="mt-3 text-xl font-black text-[#001a33]">{launchedAttendance}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Chamadas registradas</p></div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4"><Clock3 size={18} className="text-violet-600" /><p className="mt-3 text-xl font-black text-[#001a33]">{overallFrequency === null ? '--' : `${overallFrequency}%`}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Frequência geral</p></div>
        </div>
      ) : null}

      {!hasError ? modules.map((module, moduleIndex) => {
        const moduleClasses = module.itens.reduce(
          (total, discipline) => total + (classesByDiscipline.get(discipline.id) || []).length,
          0,
        );
        const firstDisciplineWithClassesId = module.itens.find(
          (discipline) => (classesByDiscipline.get(discipline.id) || []).length > 0,
        )?.id;
        return (
          <CurriculumModuleSection
            key={module.id}
            title={module.nome}
            order={module.ordem}
            itemCount={module.itens.length}
            detail={`${moduleClasses} sessões registradas neste módulo`}
            defaultOpen={moduleIndex === 0 || moduleClasses > 0}
          >
            <div className="space-y-3">
              {module.itens.map((discipline) => {
                const disciplineClasses = classesByDiscipline.get(discipline.id) || [];
                const meetings = groupMeetings(disciplineClasses);
                const totalHours = disciplineClasses.reduce((sum, lesson) => sum + Number(lesson.carga_horaria || 0), 0);
                if (disciplineClasses.length === 0) {
                  return (
                    <div key={discipline.id} className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-xs font-bold text-slate-600">{discipline.nome}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">Diário ainda não iniciado</p></div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Aguardando aulas</span>
                    </div>
                  );
                }

                return (
                  <details key={discipline.id} className="group/discipline overflow-hidden rounded-xl border border-slate-200 bg-white" open={moduleIndex === 0 && discipline.id === firstDisciplineWithClassesId}>
                    <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0"><h5 className="break-words text-sm font-black text-[#001a33]">{discipline.nome}</h5><p className="mt-1 text-[10px] font-semibold text-slate-400">{meetings.length} encontros • {disciplineClasses.length} sessões • {totalHours}h</p></div>
                      <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${discipline.frequency === null ? 'bg-slate-50 text-slate-500' : discipline.frequency >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{discipline.frequency === null ? 'Frequência pendente' : `${discipline.frequency}% de frequência`}</span><ChevronDown size={16} className="text-slate-400 transition-transform group-open/discipline:rotate-180" /></div>
                    </summary>
                    <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-3">
                      {meetings.map((meeting, meetingIndex) => {
                        const statuses = meeting.sessions.map((session) => attendanceByClass.get(String(session.id))).filter(Boolean) as string[];
                        const pending = meeting.sessions.length - statuses.length;
                        const sessionHours = meeting.sessions.reduce((sum, session) => sum + Number(session.carga_horaria || 0), 0);
                        const consolidated = statuses.length === 0 && discipline.frequency !== null;
                        return (
                          <article key={meeting.key} className="grid gap-3 rounded-xl border border-slate-100 bg-white p-4 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center">
                            <div className="sm:border-r sm:border-slate-100 sm:pr-3"><p className="text-[9px] font-black uppercase tracking-wider text-blue-600">Encontro {String(meetingIndex + 1).padStart(2, '0')}</p><p className="mt-1 text-xs font-black text-[#001a33]">{meeting.date ? formatDate(meeting.date) : 'Sem data'}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{sessionHours}h no total</p></div>
                            <div className="min-w-0"><p className="break-words text-xs font-bold leading-relaxed text-[#001a33]">{meeting.title}</p><div className="mt-2 flex flex-wrap gap-1.5">{meeting.sessions.map((session) => { const status = attendanceByClass.get(String(session.id)); return <span key={session.id} className={`rounded-md px-2 py-1 text-[9px] font-bold ${status === 'P' ? 'bg-emerald-50 text-emerald-700' : status === 'F' ? 'bg-rose-50 text-rose-700' : status === 'J' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{SESSION_LABELS[String(session.sessao || 'U')] || 'Sessão'} • {session.carga_horaria || 0}h • {status === 'P' ? 'Presente' : status === 'F' ? 'Falta' : status === 'J' ? 'Justificada' : 'Pendente'}</span>; })}</div></div>
                            <div className="flex flex-wrap gap-1.5 sm:max-w-40 sm:justify-end"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${statuses.length === meeting.sessions.length ? 'bg-emerald-50 text-emerald-700' : pending > 0 && statuses.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{statuses.length === meeting.sessions.length ? 'Chamada completa' : statuses.length > 0 ? `${pending} sessão pendente` : consolidated ? 'Detalhamento indisponível' : 'Chamada pendente'}</span></div>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </CurriculumModuleSection>
        );
      }) : null}
    </div>
  );
};

export default AttendanceTab;

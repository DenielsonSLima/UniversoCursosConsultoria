import React from 'react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  ClipboardCheck,
  Clock3,
  Image as ImageIcon,
  LayoutList,
  MonitorPlay,
  NotebookText,
  ScrollText,
  Shield,
} from 'lucide-react';
import type { useAlunoTurmasData } from '../hooks/useAlunoTurmasData';
import type { MatriculaAluno, TurmaDetailTab } from '../turmas.types';
import { formatDate, hasEadAccess } from '../turmas.utils';
import CourseStatusBadge from './CourseStatusBadge';
import AlunoAtividadesExtraClasseTab from './AlunoAtividadesExtraClasseTab';
import AcademicSummaryTab from './turma-detail/AcademicSummaryTab';
import AttendanceTab from './turma-detail/AttendanceTab';
import CertificateTab from './turma-detail/CertificateTab';
import EadSummaryTab from './turma-detail/EadSummaryTab';
import GradesTab from './turma-detail/GradesTab';
import InternshipTab from './turma-detail/InternshipTab';

interface TurmaDetailProps {
  alunoId: string;
  matricula: MatriculaAluno;
  detailTab: TurmaDetailTab;
  onDetailTabChange: (tab: TurmaDetailTab) => void;
  onBack: () => void;
  onOpenEad: () => void;
  data: ReturnType<typeof useAlunoTurmasData>;
}

const TurmaDetail: React.FC<TurmaDetailProps> = ({ alunoId, matricula, detailTab, onDetailTabChange, onBack, onOpenEad, data }) => {
  const course = matricula.turmas?.cursos;
  const progressState = data.progressStateByMatricula.get(matricula.id);
  const waitingForTechnicalStart = data.selectedIsTechnical && !data.selectedHasAcademicAccess;
  const fallbackPercent = progressState === undefined
    && String(matricula.status || '').toUpperCase() === 'CONCLUIDO' ? 100 : 0;
  const percent = data.progressByMatricula.get(matricula.id) ?? fallbackPercent;
  const certificate = data.certificates[0] || null;
  const tabs: Array<{ id: TurmaDetailTab; label: string; icon: React.ReactNode }> = data.selectedIsEad
    ? [
      { id: 'resumo', label: 'Aulas', icon: <BookOpen size={14} /> },
      { id: 'certificado', label: 'Certificado', icon: <Award size={14} /> },
    ]
    : [
      { id: 'resumo', label: 'Resumo', icon: <LayoutList size={14} /> },
      { id: 'diario', label: 'Diário', icon: <ScrollText size={14} /> },
      { id: 'atividades', label: 'Atividades', icon: <ClipboardCheck size={14} /> },
      { id: 'notas', label: 'Notas', icon: <NotebookText size={14} /> },
      { id: 'estagio', label: 'Estágio', icon: <Shield size={14} /> },
      { id: 'certificado', label: 'Certificado', icon: <Award size={14} /> },
    ];

  return (
    <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
      <button type="button" onClick={onBack} className="group flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-blue-600"><ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" /> Voltar para meus cursos</button>

      <div className="grid grid-cols-1 gap-6 border-b border-slate-100 pb-6 lg:grid-cols-[240px_1fr]">
        <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 lg:aspect-auto lg:min-h-[150px]">{course?.imagem_url ? <img src={course.imagem_url} alt={course.nome || 'Curso'} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageIcon size={34} /></div>}</div>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div><div className="mb-3 flex flex-wrap gap-2"><CourseStatusBadge status={matricula.status} /><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">Carga: {course?.carga_horaria || 0}h</span><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">Inscrição: {formatDate(matricula.data_matricula || matricula.created_at)}</span></div><h3 className="text-xl font-black leading-tight text-[#001a33]">{course?.nome || matricula.turmas?.nome}</h3><p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Turma: {matricula.turmas?.nome || 'Matrícula vinculada'}</p></div>
          <div className="space-y-2"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400"><span>Progresso do curso</span><span className={progressState?.isError ? 'text-rose-600' : 'text-blue-600'}>{waitingForTechnicalStart ? 'aguardando início' : progressState?.isLoading ? 'carregando' : progressState?.isError ? 'indisponível' : `${percent}%`}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${waitingForTechnicalStart || progressState?.isError ? 'bg-slate-300' : progressState?.isLoading ? 'w-1/3 animate-pulse bg-blue-300' : 'bg-blue-600'}`} style={progressState?.isLoading ? undefined : { width: waitingForTechnicalStart || progressState?.isError ? '0%' : `${percent}%` }} /></div>{data.selectedIsTechnical ? <p className="text-[10px] font-semibold text-slate-400">{waitingForTechnicalStart ? 'O conteúdo acadêmico será liberado quando a turma entrar em andamento.' : 'Calculado pela carga horária das disciplinas em que você foi aprovado ou teve aproveitamento.'}</p> : null}</div>
          {data.selectedIsEad && course?.id && hasEadAccess(matricula) ? <button type="button" onClick={onOpenEad} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700 sm:w-max"><MonitorPlay size={14} /> Entrar na sala do curso</button> : null}
        </div>
      </div>

      {waitingForTechnicalStart ? (
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-7 text-amber-900">
          <div className="flex items-start gap-4"><div className="rounded-2xl bg-white p-3 text-amber-600"><Clock3 size={22} /></div><div><p className="text-xs font-black uppercase tracking-widest">Matrícula confirmada — aguardando início</p><p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-amber-800">Sua vaga está registrada. Diário, notas, atividades e estágio serão liberados quando a turma entrar em andamento. Até lá, nenhuma consulta acadêmica protegida é realizada.</p>{matricula.turmas?.status ? <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-amber-600">Fase atual: {matricula.turmas.status.replaceAll('_', ' ')}</p> : null}</div></div>
        </div>
      ) : <>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => onDetailTabChange(tab.id)} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${detailTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>{tab.icon}{tab.label}</button>)}</div>

      {detailTab === 'certificado' ? <CertificateTab certificate={certificate} state={data.certificatesState} eadProgress={data.selectedEadProgress} /> : null}
      {detailTab === 'resumo' && data.selectedIsEad ? <EadSummaryTab matricula={matricula} progress={data.selectedEadProgress} onOpenCourse={onOpenEad} /> : null}
      {detailTab === 'resumo' && !data.selectedIsEad ? <AcademicSummaryTab disciplines={data.disciplines} summaries={data.disciplineSummaries} isTechnical={data.selectedIsTechnical} state={data.disciplinesState} /> : null}
      {detailTab === 'atividades' && data.selectedTurmaId ? <AlunoAtividadesExtraClasseTab alunoId={alunoId} turmaId={data.selectedTurmaId} /> : null}
      {detailTab === 'diario' ? <AttendanceTab disciplines={data.disciplineSummaries} classes={data.classes} attendance={data.attendance} disciplinesState={data.disciplinesState} classesState={data.classesState} attendanceState={data.attendanceState} /> : null}
      {detailTab === 'notas' ? <GradesTab disciplines={data.disciplineSummaries} disciplinesState={data.disciplinesState} resultsState={data.resultsState} sharedQueryState={data.selectedIsTechnical} /> : null}
      {detailTab === 'estagio' ? <InternshipTab internships={data.internships} state={data.internshipsState} /> : null}
      </>}
    </div>
  );
};

export default TurmaDetail;

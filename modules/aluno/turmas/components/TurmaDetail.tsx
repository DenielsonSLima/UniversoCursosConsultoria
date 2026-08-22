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
  FileQuestion,
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
import FinancialUnderlineTabs from '../../../gestor/financeiro/components/FinancialUnderlineTabs';
import LiveFinalAssessmentTab from './final-assessment/LiveFinalAssessmentTab';

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
  const waitingForAcademicStart = (data.selectedIsTechnical || data.selectedIsLive)
    && !data.selectedHasAcademicAccess;
  const pendingAcademicRelease = String(matricula.status || '').toUpperCase() === 'PENDENTE';
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
      ...(data.selectedIsLive
        ? [{ id: 'prova_final' as const, label: 'Prova final', icon: <FileQuestion size={14} /> }]
        : []),
      ...(data.hasInternship
        ? [{ id: 'estagio' as const, label: 'Estágio', icon: <Shield size={14} /> }]
        : []),
      { id: 'certificado', label: 'Certificado', icon: <Award size={14} /> },
    ];
  const activeTab = (detailTab === 'estagio' && !data.hasInternship)
    || (detailTab === 'prova_final' && !data.selectedIsLive)
    ? 'resumo'
    : detailTab;

  return (
    <div className="min-w-0 space-y-5 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:space-y-6 sm:rounded-[2rem] sm:p-6 md:p-8">
      <button type="button" onClick={onBack} className="group flex min-h-11 items-center gap-2 rounded-xl pr-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:text-blue-600 sm:text-xs"><ArrowLeft size={16} className="shrink-0 transition-transform group-hover:-translate-x-0.5" /> Voltar para meus cursos</button>

      <div className="grid grid-cols-1 gap-6 border-b border-slate-100 pb-6 lg:grid-cols-[240px_1fr]">
        <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 lg:aspect-auto lg:min-h-[150px]">{course?.imagem_url ? <img src={course.imagem_url} alt={course.nome || 'Curso'} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageIcon size={34} /></div>}</div>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div><div className="mb-3 flex flex-wrap gap-2"><CourseStatusBadge status={matricula.status} /><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">Carga: {course?.carga_horaria || 0}h</span><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">Inscrição: {formatDate(matricula.data_matricula || matricula.created_at)}</span></div><h3 className="break-words text-lg font-black leading-tight text-[#001a33] sm:text-xl">{course?.nome || matricula.turmas?.nome}</h3><p className="mt-1 break-words text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs sm:tracking-widest">Turma: {matricula.turmas?.nome || 'Matrícula vinculada'}</p></div>
          <div className="space-y-2"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400"><span>Progresso do curso</span><span className={progressState?.isError ? 'text-rose-600' : 'text-blue-600'}>{waitingForAcademicStart ? pendingAcademicRelease ? 'aguardando liberação' : 'aguardando início' : progressState?.isLoading ? 'carregando' : progressState?.isError ? 'indisponível' : `${percent}%`}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${waitingForAcademicStart || progressState?.isError ? 'bg-slate-300' : progressState?.isLoading ? 'w-1/3 animate-pulse bg-blue-300' : 'bg-blue-600'}`} style={progressState?.isLoading ? undefined : { width: waitingForAcademicStart || progressState?.isError ? '0%' : `${percent}%` }} /></div>{data.selectedIsTechnical || data.selectedIsLive ? <p className="text-[10px] font-semibold text-slate-400">{waitingForAcademicStart ? pendingAcademicRelease ? 'A turma já está vinculada ao seu cadastro. O conteúdo acadêmico será liberado após a conclusão do fluxo de matrícula.' : 'O conteúdo acadêmico será liberado quando a turma entrar em andamento.' : data.selectedIsTechnical ? 'Calculado pela carga horária das disciplinas em que você foi aprovado ou teve aproveitamento.' : 'A situação final é confirmada após a prova e os critérios acadêmicos do curso.'}</p> : null}</div>
          {data.selectedIsEad && course?.id && hasEadAccess(matricula) ? <button type="button" onClick={onOpenEad} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700 sm:w-max"><MonitorPlay size={14} /> Entrar na sala do curso</button> : null}
        </div>
      </div>

      {waitingForAcademicStart ? (
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-amber-900 sm:p-7">
          <div className="flex flex-col items-start gap-3 min-[390px]:flex-row min-[390px]:gap-4"><div className="rounded-2xl bg-white p-3 text-amber-600"><Clock3 size={22} /></div><div><p className="text-xs font-black uppercase tracking-wider sm:tracking-widest">{pendingAcademicRelease ? 'Matrícula registrada — aguardando liberação' : 'Matrícula confirmada — aguardando início'}</p><p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-amber-800">{pendingAcademicRelease ? `Você já está vinculado a esta turma. O acesso ao diário, notas, atividades${data.selectedIsLive ? ' e prova final' : ' e estágio'} será liberado quando a matrícula acadêmica for ativada.` : 'Sua vaga está registrada. O conteúdo acadêmico será liberado quando a turma entrar em andamento.'}</p>{matricula.turmas?.status ? <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-amber-600">Fase atual: {matricula.turmas.status.replaceAll('_', ' ')}</p> : null}</div></div>
        </div>
      ) : <>
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
          <FinancialUnderlineTabs
            items={tabs}
            value={activeTab}
            onChange={onDetailTabChange}
            ariaLabel="Seções da turma"
          />
        </div>

      {activeTab === 'certificado' ? <CertificateTab certificate={certificate} state={data.certificatesState} eadProgress={data.selectedEadProgress} /> : null}
      {activeTab === 'resumo' && data.selectedIsEad ? <EadSummaryTab matricula={matricula} progress={data.selectedEadProgress} onOpenCourse={onOpenEad} /> : null}
      {activeTab === 'resumo' && !data.selectedIsEad ? <AcademicSummaryTab disciplines={data.disciplines} summaries={data.disciplineSummaries} isTechnical={data.selectedIsTechnical} state={data.disciplinesState} /> : null}
      {activeTab === 'atividades' && data.selectedTurmaId ? <AlunoAtividadesExtraClasseTab alunoId={alunoId} turmaId={data.selectedTurmaId} /> : null}
      {activeTab === 'diario' ? <AttendanceTab disciplines={data.disciplineSummaries} classes={data.classes} attendance={data.attendance} disciplinesState={data.disciplinesState} classesState={data.classesState} attendanceState={data.attendanceState} /> : null}
      {activeTab === 'notas' ? <GradesTab disciplines={data.disciplineSummaries} disciplinesState={data.disciplinesState} resultsState={data.resultsState} sharedQueryState={data.selectedIsTechnical} /> : null}
      {activeTab === 'prova_final' && data.selectedTurmaId ? <LiveFinalAssessmentTab alunoId={alunoId} matriculaId={matricula.id} turmaId={data.selectedTurmaId} /> : null}
      {activeTab === 'estagio' ? <InternshipTab disciplines={data.internshipDisciplines} internships={data.internships} state={data.internshipsState} /> : null}
      </>}
    </div>
  );
};

export default TurmaDetail;

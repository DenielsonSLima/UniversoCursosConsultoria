import { ArrowRight, BookOpen, GraduationCap, Image as ImageIcon, MessageSquare } from 'lucide-react';
import type { StudentCourseAccessItem } from '../../cursos/courseAccessHistory';
import { HomeAgenda, HomeDataNotice, HomeFinanceAndDocuments, type HomeFinanceSummary, type HomeUpcomingEvent } from './AlunoHomePanels';

type AlunoMobileHomeProps = {
  bibliotecaCount: number | null;
  canViewCalendar: boolean;
  chatsCount: number | null;
  courseDataError: boolean;
  loadingCourses?: boolean;
  financeDataError: boolean;
  hasDataError: boolean;
  financeiroResumo?: HomeFinanceSummary;
  loadingFinanceiro: boolean;
  loadingProximosEventos: boolean;
  matriculasCount: number | null;
  pendingTechnical?: number;
  primaryCourse?: StudentCourseAccessItem;
  proximosEventos: HomeUpcomingEvent[];
  onNavigate: (module: string) => void;
  onOpenCourse: (course: StudentCourseAccessItem) => void;
  onRetry: () => void;
  scheduleDataError: boolean;
};

const modalityLabel = (value?: string | null) => {
  const modality = String(value || '').toUpperCase();
  if (modality === 'TECNICO' || modality === 'TÉCNICO') return 'Técnico';
  if (modality === 'ESPECIALIZACAO' || modality === 'ESPECIALIZAÇÃO') return 'Especialização';
  if (modality === 'LIVRE') return 'Curso livre';
  return modality === 'EAD' ? 'EAD' : 'Seu curso';
};

const AlunoMobileHome = ({
  bibliotecaCount, canViewCalendar, chatsCount, courseDataError, loadingCourses = false, financeDataError,
  hasDataError, financeiroResumo, loadingFinanceiro, loadingProximosEventos,
  matriculasCount, pendingTechnical = 0, primaryCourse, proximosEventos,
  onNavigate, onOpenCourse, onRetry, scheduleDataError,
}: AlunoMobileHomeProps) => (
  <div className="space-y-4 text-[13px] md:hidden">
    <div>
      <h1 className="text-[22px] font-medium text-[#001a33]">Início</h1>
      <p className="mt-1 text-slate-600">Tudo o que você precisa para estudar.</p>
    </div>
    {hasDataError ? <HomeDataNotice onRetry={onRetry} /> : null}
    <section aria-label="Continuar estudando" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {primaryCourse ? (
        <button type="button" onClick={() => onOpenCourse(primaryCourse)} aria-label={`Continuar curso: ${primaryCourse.cursoNome}`} className="flex min-h-11 w-full items-center gap-3 p-3 text-left hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-50">
            {primaryCourse.imagemUrl ? <img src={primaryCourse.imagemUrl} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><ImageIcon size={22} /></div>}
          </div>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-blue-700">Continuar estudando · {modalityLabel(primaryCourse.modalidade)}</span>
            <span className="mt-1 block break-words text-sm font-medium leading-snug text-[#001a33]">{primaryCourse.cursoNome}</span>
            <span className="mt-1 block break-words text-xs text-slate-600">{primaryCourse.turmaNome || 'Acesso disponível'}</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-blue-700" />
        </button>
      ) : (
        <div className="p-4">
          <p className="font-medium text-[#001a33]">{loadingCourses ? 'Carregando seus cursos…' : courseDataError ? 'Cursos indisponíveis agora' : 'Nenhum curso liberado'}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{loadingCourses ? 'Aguarde enquanto consultamos seus acessos.' : courseDataError ? 'Tente carregar as informações novamente.' : 'Seu acesso aparecerá aqui após a liberação acadêmica.'}</p>
        </div>
      )}
      {pendingTechnical > 0 ? <p className="border-t border-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-600">{pendingTechnical} matrícula(s) aguardando liberação acadêmica.</p> : null}
    </section>

    <HomeFinanceAndDocuments summary={financeiroResumo} loading={loadingFinanceiro} error={financeDataError} onNavigate={onNavigate} />
    <HomeAgenda events={proximosEventos} loading={loadingProximosEventos} error={scheduleDataError} canViewCalendar={canViewCalendar} onNavigate={onNavigate} limit={1} />

    <section aria-label="Resumo do portal" className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {[
        { id: 'turmas', label: 'Meus cursos', count: matriculasCount, icon: GraduationCap },
        { id: 'biblioteca', label: 'Biblioteca', count: bibliotecaCount, icon: BookOpen },
        { id: 'comunicacao', label: 'Atendimento', count: chatsCount, icon: MessageSquare },
      ].map(({ id, label, count, icon: Icon }) => (
        <button key={id} type="button" onClick={() => onNavigate(id)} className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center hover:bg-blue-50">
          <Icon size={17} className="text-slate-500" />
          <span className="text-lg font-semibold text-[#001a33]">{count ?? '—'}</span>
          <span className="text-xs text-slate-600">{label}</span>
        </button>
      ))}
    </section>
    <button type="button" onClick={() => onNavigate('comunicacao')} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 font-medium text-blue-700 hover:bg-blue-50"><MessageSquare size={17} /> Precisa de ajuda? Fale com a equipe</button>
  </div>
);

export default AlunoMobileHome;

import { ArrowRight, BookOpen, GraduationCap, Image as ImageIcon, MessageSquare, Pin } from 'lucide-react';
import { getStudentCourseAccessKey } from '../../cursos/courseAccessHistory';
import type { useAlunoHomeData } from '../useAlunoHomeData';
import { HomeAgenda, HomeDataNotice, HomeFinanceAndDocuments } from './AlunoHomePanels';

type Props = {
  data: ReturnType<typeof useAlunoHomeData>;
  canViewCalendar: boolean;
  onNavigate: (module: string) => void;
};

const AlunoDesktopHome = ({ data, canViewCalendar, onNavigate }: Props) => {
  const indicators = [
    { id: 'turmas', title: 'Meus cursos', count: data.loadingEnrollmentSummary ? null : data.matriculasCount, icon: GraduationCap,
      detail: data.enrollmentSummary.pendingTechnical > 0 ? `${data.enrollmentSummary.pendingTechnical} aguardando liberação acadêmica` : 'Matrículas e acessos' },
    { id: 'biblioteca', title: 'Biblioteca', count: data.bibliotecaCountError ? null : data.bibliotecaCount, icon: BookOpen, detail: 'Apostilas e materiais disponíveis' },
    { id: 'comunicacao', title: 'Atendimento', count: data.chatsCountError ? null : data.chatsCount, icon: MessageSquare, detail: 'Chamados em aberto' },
  ];

  return (
    <div className="space-y-5 text-[13px]">
      <div>
        <h1 className="text-2xl font-medium text-[#001a33]">Início</h1>
        <p className="mt-1 text-slate-600">Seus cursos, pagamentos e documentos em um só lugar.</p>
      </div>
      {data.hasHomeDataError ? <HomeDataNotice onRetry={data.retryHomeData} /> : null}

      <div className="grid grid-cols-3 gap-3">
        {indicators.map(({ id, title, count, icon: Icon, detail }) => (
          <button key={id} type="button" onClick={() => onNavigate(id)} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-blue-700"><Icon size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium text-slate-700">{title}</span><span className="text-xl font-semibold text-[#001a33]">{count ?? '—'}</span></span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">{detail}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="aluno-home-courses-title" className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id="aluno-home-courses-title" className="text-sm font-semibold text-[#001a33]">Continuar estudando</h2>
              <button type="button" onClick={() => onNavigate('turmas')} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-medium text-blue-700 hover:bg-blue-50">Meus cursos <ArrowRight size={15} /></button>
            </div>
            {data.quickAccessCourses.length ? <div className="divide-y divide-slate-100">
              {data.quickAccessCourses.map((course) => {
                const key = getStudentCourseAccessKey(course);
                const pinned = data.pinnedCourseKeys.includes(key);
                return (
                  <article key={key} className="flex items-center gap-3 py-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                      {course.imagemUrl ? <img src={course.imagemUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><ImageIcon size={21} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-md border px-2 py-0.5 ${data.getCourseModalityClasses(course.modalidade)}`}>{data.getCourseModalityLabel(course.modalidade)}</span>
                        {pinned ? <span className="text-blue-700">Fixado</span> : null}
                      </div>
                      <h3 className="break-words font-medium text-[#001a33]">{course.cursoNome}</h3>
                      <p className="mt-1 break-words text-xs text-slate-600">{course.turmaNome || 'Acesso do curso'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      <button type="button" onClick={() => data.handleTogglePinnedCourse(course)} aria-pressed={pinned} aria-label={`${pinned ? 'Desafixar' : 'Fixar'} ${course.cursoNome}`} className={`flex h-11 w-11 items-center justify-center rounded-lg hover:bg-blue-50 ${pinned ? 'text-blue-700' : 'text-slate-500'}`}><Pin size={16} fill={pinned ? 'currentColor' : 'none'} /></button>
                      <button type="button" onClick={() => data.handleOpenQuickAccessCourse(course)} aria-label={`Abrir ${course.cursoNome}`} className="min-h-11 rounded-lg bg-blue-600 px-3 font-medium text-white hover:bg-blue-700">Abrir</button>
                    </div>
                  </article>
                );
              })}
            </div> : <div className="rounded-lg bg-slate-50 p-5 text-center">
              <GraduationCap size={23} className="mx-auto mb-2 text-slate-500" />
              <p className="font-medium text-[#001a33]">{data.loadingMatriculas ? 'Carregando seus cursos…' : data.matriculasError || data.enrollmentSummaryError ? 'Não foi possível consultar seus cursos' : 'Nenhum curso liberado'}</p>
              <p className="mt-1 text-xs text-slate-600">{data.loadingMatriculas ? 'Aguarde enquanto consultamos seus acessos.' : data.matriculasError || data.enrollmentSummaryError ? 'Tente carregar as informações novamente.' : 'Seu acesso aparecerá aqui após a liberação acadêmica.'}</p>
            </div>}
          </section>
          <HomeAgenda events={data.proximosEventos} loading={data.loadingProximosEventos} error={data.proximosEventosError} canViewCalendar={canViewCalendar} onNavigate={onNavigate} />
        </div>
        <div className="min-w-0 space-y-4">
          <HomeFinanceAndDocuments summary={data.financeiroResumo} loading={data.loadingFinanceiro} error={data.financeiroError} onNavigate={onNavigate} />
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-[#001a33]">Precisa de ajuda?</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Fale com a equipe sobre seus cursos, pagamentos ou documentos.</p>
            <button type="button" onClick={() => onNavigate('comunicacao')} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 font-medium text-blue-700 hover:bg-blue-50"><MessageSquare size={16} /> Falar com a equipe</button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AlunoDesktopHome;

import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import './aluno-courses-compact.css';
import { createPortal } from 'react-dom';
import {
  Award,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  MonitorPlay,
  Search,
  User,
  X,
  Zap,
} from 'lucide-react';
import EadPaymentModal from '../../../ead/components/EadPaymentModal';
import CourseCatalogGrid from './CourseCatalogGrid';
import EadCheckoutReviewModal from './EadCheckoutReviewModal';
import { getPoloLabel } from '../cursosPage.utils';

interface CourseCatalogViewProps {
  view: any;
}

const CourseCatalogView: React.FC<CourseCatalogViewProps> = ({ view }) => {
  const {
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    availableCategories,
    sortDirection,
    setSortDirection,
    currentTabCourses,
    activeTab,
    setActiveTab,
    checkoutError,
    technicalProfileGate,
    setTechnicalProfileGate,
    onRequireTechnicalProfile,
    checkoutReview,
    setCheckoutReview,
    acceptedOnlineTerms,
    setAcceptedOnlineTerms,
    checkoutMutation,
    startCheckout,
    eadPaymentPanel,
    setEadPaymentPanel,
    eadPaymentConfirmation,
    eadCheckoutReview,
    isLoading,
    isError,
    groupedCurrentPageCourses,
    coursePage,
    totalCoursePages,
    progressByCourseId,
    selectedTurmaByCourse,
    setSelectedTurmaByCourse,
    setSelectedCourse,
    openEadCheckoutReview,
    openOnlineClassCheckoutReview,
    onOpenEnrollment,
    setCoursePage,
  } = view;

  return (
    <div className="aluno-course-catalog space-y-4 animate-fadeIn">
      <div>
        <div>
          <h2 className="flex items-center gap-2 text-xl font-medium text-[#001a33] md:text-2xl">
            <BookOpen className="text-blue-600" />
            Cursos disponíveis
          </h2>
          <p className="mt-1 text-sm text-slate-600">Encontre seu curso, faça a inscrição e acompanhe seu aprendizado.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Pesquisar cursos..."
            aria-label="Pesquisar cursos disponíveis"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-base text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:h-[38px] md:text-[13px]"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-[1fr_220px_220px]">
          <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Categoria
            <InstitutionalSelect value={categoryFilter} onValueChange={setCategoryFilter}
              ariaLabel="Categoria dos cursos" options={[
                { value: 'todas', label: 'Todas as categorias' },
                ...availableCategories.map(category => ({ value: category, label: category })),
              ]} />
          </label>

          <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Ordem alfabética
            <InstitutionalSelect value={sortDirection} onValueChange={value => setSortDirection(value as 'asc' | 'desc')}
              ariaLabel="Ordem alfabética dos cursos" options={[
                { value: 'asc', label: 'A–Z crescente' }, { value: 'desc', label: 'Z–A decrescente' },
              ]} />
          </label>

          <div className="col-span-2 flex items-end md:col-span-1">
            <div className="flex min-h-6 w-full items-center justify-center rounded-lg bg-slate-50 px-3 text-xs text-slate-600 md:h-[38px]">
              {currentTabCourses.length} cursos encontrados
            </div>
          </div>
        </div>
      </div>

      <div
        className="aluno-course-tabs flex max-w-full gap-1 overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="Modalidades de cursos disponíveis"
      >
        {[
          ['ead', 'Cursos EAD', <MonitorPlay size={15} />],
          ['live', 'Cursos Livres', <Zap size={15} />],
          ['especializacao', 'Especializações', <Award size={15} />],
          ['tecnico', 'Cursos Técnicos', <BookOpen size={15} />]
        ].map(([id, label, icon]) => (
          <button
            key={id as string}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id as any)}
            className={`flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
              activeTab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-blue-700'
            }`}
          >
            {icon as React.ReactNode}
            <span>{label as string}</span>
          </button>
        ))}
      </div>

      {checkoutError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
          {checkoutError}
        </div>
      )}

      {technicalProfileGate && (
        <div className="aluno-course-dialog fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6">
          <div className="w-full max-w-xl rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">Perfil necessário</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
                  Complete seu cadastro técnico
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTechnicalProfileGate(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 text-slate-400 outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 md:h-10 md:w-10"
                aria-label="Fechar aviso de perfil necessário"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">
                Antes de pagar a matrícula de <strong>{technicalProfileGate.course.nome}</strong>, precisamos completar sua identificação acadêmica. Isso evita cobrança em cadastro incompleto e agiliza a conferência da secretaria.
              </div>

              <div className="grid grid-cols-1 gap-2">
                {technicalProfileGate.missingFields.map((field) => (
                  <div key={field.key} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-wider text-[#001a33]">{field.label}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">{field.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:static sm:flex-row sm:justify-end sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={() => setTechnicalProfileGate(null)}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:min-h-0"
              >
                Voltar aos cursos
              </button>
              <button
                type="button"
                onClick={() => {
                  setTechnicalProfileGate(null);
                  onRequireTechnicalProfile?.();
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white outline-none hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:min-h-0"
              >
                <User size={14} />
                Ir para Meu Perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutReview && (
        <div className="aluno-course-dialog fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Confirmação de matrícula online</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">{checkoutReview.course.nome}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutReview(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 text-slate-400 outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 md:h-10 md:w-10"
                aria-label="Fechar confirmação de matrícula"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-700">
                    <MapPin size={13} />
                    Polo escolhido
                  </p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{getPoloLabel(checkoutReview.turma)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Turma</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{checkoutReview.turma?.nome || 'Turma aberta'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">
                O pagamento confirma a matrícula nesta turma e neste polo após a baixa do gateway bancário. Documentos e dados complementares poderão ser preenchidos depois no portal do aluno.
              </div>

              {String(checkoutReview.course.modalidade || '').toUpperCase() === 'TECNICO' && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold leading-relaxed text-blue-800">
                  Para curso técnico, a secretaria poderá solicitar documentos acadêmicos adicionais depois da matrícula online. A liberação acadêmica segue as regras da turma e do polo informado acima.
                </div>
              )}

              <label className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4 text-xs font-bold leading-relaxed text-slate-600">
                <input
                  type="checkbox"
                  checked={acceptedOnlineTerms}
                  onChange={(event) => setAcceptedOnlineTerms(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:h-4 md:w-4"
                />
                <span>
                  Declaro que li e aceito os termos da matrícula online, autorizo o uso dos meus dados para emissão da cobrança e confirmo que escolhi o polo correto.
                </span>
              </label>
            </div>

            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:static sm:flex-row sm:justify-end sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={() => setCheckoutReview(null)}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:min-h-0"
              >
                Revisar depois
              </button>
              <button
                type="button"
                disabled={!acceptedOnlineTerms || checkoutMutation.isPending}
                onClick={() => {
                  const review = checkoutReview;
                  setCheckoutReview(null);
                  startCheckout(review.course, review.turma, {
                    method: 'BOLETO',
                    installments: 1,
                  });
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white outline-none hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:bg-slate-300 md:min-h-0"
              >
                {checkoutMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Continuar para pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {eadPaymentPanel && (
        <EadPaymentModal
          panel={eadPaymentPanel}
          onClose={() => setEadPaymentPanel(null)}
        />
      )}

      {eadPaymentConfirmation && typeof document !== 'undefined' && createPortal((
        <div className="fixed right-6 top-6 z-[2147483647] flex max-w-[calc(100vw-3rem)] justify-end pointer-events-none">
          <div className="flex max-w-md items-center gap-3 rounded-2xl border border-emerald-100 border-l-4 border-l-emerald-500 bg-white px-5 py-4 text-sm font-black text-emerald-700 shadow-2xl shadow-slate-900/15">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pagamento EAD</p>
              <p>{eadPaymentConfirmation}</p>
            </div>
          </div>
        </div>
      ), document.body)}

      {eadCheckoutReview && <EadCheckoutReviewModal view={view} />}

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : isError ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-2xl text-xs font-bold border border-red-100">
          Falha ao carregar catálogo de cursos.
        </div>
      ) : currentTabCourses.length === 0 ? (
        <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
          <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen size={22} />
          </div>
          <p className="text-slate-450 font-bold text-xs">Nenhum curso encontrado nesta modalidade.</p>
        </div>
      ) : (
        <CourseCatalogGrid
          groupedCourses={groupedCurrentPageCourses}
          coursePage={coursePage}
          totalCoursePages={totalCoursePages}
          progressByCourseId={progressByCourseId}
          selectedTurmaByCourse={selectedTurmaByCourse}
          checkoutMutation={checkoutMutation}
          onSelectTurma={(courseId, turmaId) => {
            setSelectedTurmaByCourse((current) => ({ ...current, [courseId]: turmaId }));
          }}
          onSelectCourse={setSelectedCourse}
          onOpenEadCheckout={openEadCheckoutReview}
          onOpenOnlineCheckout={openOnlineClassCheckoutReview}
          onOpenEnrollment={onOpenEnrollment}
          onPageChange={setCoursePage}
        />
      )}
    </div>
  );
};

export default CourseCatalogView;

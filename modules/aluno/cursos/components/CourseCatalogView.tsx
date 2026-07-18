import React from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  BookOpen,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  MonitorPlay,
  Search,
  User,
  X,
  Zap,
} from 'lucide-react';
import EadPaymentModal from '../../../ead/components/EadPaymentModal';
import {
  defaultEadCheckoutMethod,
  formatEadCheckoutMoney,
  resolveEadCheckoutOptions,
} from '../eadCheckoutOptions';
import CourseCatalogGrid from './CourseCatalogGrid';
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
    setEadCheckoutReview,
    eadPaymentMethod,
    setEadPaymentMethod,
    eadInstallments,
    setEadInstallments,
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
    setCoursePage,
  } = view;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="text-blue-600" />
            Cursos Disponíveis
          </h2>
          <p className="text-xs text-slate-450 font-medium">Acesse cursos com etapas, atividades, vídeo e prova controlada</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Pesquisar cursos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 focus:border-blue-500 outline-none rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_220px]">
          <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Categoria
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs font-bold normal-case tracking-normal text-slate-700 outline-none transition-colors focus:border-blue-500"
            >
              <option value="todas">Todas as categorias</option>
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Ordem alfabética
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
              className="h-11 rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs font-bold normal-case tracking-normal text-slate-700 outline-none transition-colors focus:border-blue-500"
            >
              <option value="asc">A-Z crescente</option>
              <option value="desc">Z-A decrescente</option>
            </select>
          </label>

          <div className="flex items-end">
            <div className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-50 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
              {currentTabCourses.length} cursos encontrados
            </div>
          </div>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-max">
        {[
          ['ead', 'Cursos EAD', <MonitorPlay size={15} />],
          ['live', 'Cursos Livres', <Zap size={15} />],
          ['especializacao', 'Especializações', <Award size={15} />],
          ['tecnico', 'Cursos Técnicos', <BookOpen size={15} />]
        ].map(([id, label, icon]) => (
          <button
            key={id as string}
            onClick={() => setActiveTab(id as any)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-600'
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6">
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700"
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

            <div className="flex flex-col gap-2 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setTechnicalProfileGate(null)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
              >
                Voltar aos cursos
              </button>
              <button
                type="button"
                onClick={() => {
                  setTechnicalProfileGate(null);
                  onRequireTechnicalProfile?.();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700"
              >
                <User size={14} />
                Ir para Meu Perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutReview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Confirmação de matrícula online</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">{checkoutReview.course.nome}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutReview(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700"
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
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>
                  Declaro que li e aceito os termos da matrícula online, autorizo o uso dos meus dados para emissão da cobrança e confirmo que escolhi o polo correto.
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCheckoutReview(null)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:bg-slate-300"
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

      {eadCheckoutReview && (() => {
        const options = resolveEadCheckoutOptions(eadCheckoutReview.course);
        const selectedMethod = options.options.some(option => option.method === eadPaymentMethod)
          ? eadPaymentMethod
          : defaultEadCheckoutMethod(options);
        const selectedInstallments = selectedMethod === 'CREDIT_CARD'
          ? Math.max(1, Math.min(options.maxParcelas, eadInstallments || 1))
          : 1;
        const installmentValue = selectedInstallments > 1 ? options.amount / selectedInstallments : options.amount;

        if (typeof document === 'undefined') return null;

        return createPortal((
          <div className="fixed inset-0 z-[99999] flex h-screen min-h-screen w-screen items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/75 px-4 py-6 backdrop-blur-sm pointer-events-auto">
            <div className="relative z-[100000] w-full max-w-xl rounded-[2rem] bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Pagamento EAD</p>
                  <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">{eadCheckoutReview.course.nome}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEadCheckoutReview(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Valor do curso</p>
                  <p className="mt-1 text-2xl font-black text-[#001a33]">{formatEadCheckoutMoney(options.amount)}</p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {options.options.map(option => {
                    const active = selectedMethod === option.method;
                    const Icon = option.method === 'CREDIT_CARD' ? CreditCard : option.method === 'BOLETO' ? FileText : Zap;
                    return (
                      <button
                        key={option.method}
                        type="button"
                        onClick={() => {
                          setEadPaymentMethod(option.method);
                          setEadInstallments(option.method === 'CREDIT_CARD' ? Math.max(1, options.maxParcelas) : 1);
                        }}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                          active
                            ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'
                        }`}
                      >
                        <Icon size={14} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {selectedMethod === 'CREDIT_CARD' && options.allowInstallments && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/45 p-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-blue-700">
                      Parcelas no cartão
                    </label>
                    <select
                      value={selectedInstallments}
                      onChange={(event) => setEadInstallments(Number(event.target.value) || 1)}
                      className="mt-2 w-full rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm font-black text-[#001a33] outline-none focus:border-blue-400"
                    >
                      {Array.from({ length: options.maxParcelas }, (_, index) => index + 1).map(installments => (
                        <option key={installments} value={installments}>
                          {installments}x de {formatEadCheckoutMoney(options.amount / installments)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-600">
                  {selectedMethod === 'CREDIT_CARD'
                    ? `Cartão selecionado: ${selectedInstallments}x de ${formatEadCheckoutMoney(installmentValue)} sobre o valor do curso. Juros do gateway podem alterar o total no checkout.`
                    : `${selectedMethod === 'PIX' ? 'Pix' : 'Boleto'} selecionado: cobrança única de ${formatEadCheckoutMoney(options.amount)}.`}
                </div>

                {checkoutError && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold leading-relaxed text-red-700">
                    {checkoutError}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setEadCheckoutReview(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={checkoutMutation.isPending || options.options.length === 0}
                  onClick={() => {
                    const review = eadCheckoutReview;
                    startCheckout(review.course, null, {
                      method: selectedMethod,
                      installments: selectedInstallments,
                    });
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:bg-slate-300"
                >
                  {checkoutMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  Continuar para pagamento
                </button>
              </div>
            </div>
          </div>
        ), document.body);
      })()}

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
          onPageChange={setCoursePage}
        />
      )}
    </div>
  );
};

export default CourseCatalogView;

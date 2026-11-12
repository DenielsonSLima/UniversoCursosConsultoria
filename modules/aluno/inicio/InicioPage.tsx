import React from 'react';
import { BookOpen, GraduationCap, MessageSquare, Calendar, Clock, AlertTriangle, CheckCircle2, WalletCards, History, Pin, PlayCircle, Image as ImageIcon } from 'lucide-react';
import { getStudentCourseAccessKey } from '../cursos/courseAccessHistory';
import AlunoMobileHome from './components/AlunoMobileHome';
import { useAlunoHomeData, type InicioPageProps } from './useAlunoHomeData';

const InicioPage: React.FC<InicioPageProps> = (props) => {
  const { canViewCalendar, onNavigate } = props;
  const { bibliotecaCount, bibliotecaCountError, chatsCount, chatsCountError, enrollmentSummary, enrollmentSummaryError, financeiroError, financeiroResumo, formatCurrency, formatDate, getCourseModalityClasses, getCourseModalityLabel, handleOpenQuickAccessCourse, handleTogglePinnedCourse, hasHomeDataError, isMobileLayout, loadingFinanceiro, loadingProximosEventos, matriculasCount, matriculasError, proximosEventos, proximosEventosError, quickAccessCourses, retryHomeData, pinnedCourseKeys } = useAlunoHomeData(props);
  return (
    <>
      {isMobileLayout ? <AlunoMobileHome
        bibliotecaCount={bibliotecaCountError ? null : bibliotecaCount}
        canViewCalendar={canViewCalendar}
        chatsCount={chatsCountError ? null : chatsCount}
        courseDataError={matriculasError || enrollmentSummaryError}
        financeDataError={financeiroError}
        hasDataError={hasHomeDataError}
        financeiroResumo={financeiroResumo}
        loadingFinanceiro={loadingFinanceiro}
        loadingProximosEventos={loadingProximosEventos}
        matriculasCount={matriculasCount}
        primaryCourse={quickAccessCourses[0]}
        proximosEventos={proximosEventos}
        onNavigate={onNavigate}
        onOpenCourse={handleOpenQuickAccessCourse}
        onRetry={retryHomeData}
        scheduleDataError={proximosEventosError}
      /> : null}

      {!isMobileLayout ? <div className="space-y-8 animate-fadeIn antialiased">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* KPI 1 */}
        <button
          onClick={() => onNavigate('turmas')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-blue-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Meus Cursos</p>
            <p className="text-3xl font-black text-[#001a33]">{matriculasCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">
              {enrollmentSummary.pendingTechnical > 0
                ? `${enrollmentSummary.pendingTechnical} aguardando liberação acadêmica`
                : 'Cursos matriculados e liberados'}
            </p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <GraduationCap size={22} />
          </div>
        </button>

        {/* KPI 2 */}
        <button
          onClick={() => onNavigate('biblioteca')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-blue-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Biblioteca</p>
            <p className="text-3xl font-black text-[#001a33]">{bibliotecaCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Documentos e apostilas liberados</p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <BookOpen size={22} />
          </div>
        </button>

        {/* KPI 3 */}
        <button
          onClick={() => onNavigate('comunicacao')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-blue-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Suporte</p>
            <p className="text-3xl font-black text-[#001a33]">{chatsCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Chamados ativos abertos</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <MessageSquare size={22} />
          </div>
        </button>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <button
          type="button"
          onClick={() => onNavigate('financeiro')}
          className="rounded-[2rem] border border-slate-100 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                financeiroResumo?.overdueCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                {financeiroResumo?.overdueCount > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Financeiro</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-[#001a33]">
                  {loadingFinanceiro
                    ? 'Carregando situação...'
                    : financeiroResumo?.overdueCount > 0
                      ? `${financeiroResumo.overdueCount} pagamento(s) em atraso`
                      : 'Você está em dia'}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {financeiroResumo?.nextPayment
                    ? `Próximo vencimento: ${formatDate(financeiroResumo.nextPayment.data_vencimento)}`
                    : 'Nenhuma cobrança aberta encontrada.'}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 md:min-w-48">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aberto agora</p>
              <p className="mt-1 text-2xl font-black text-[#001a33]">{formatCurrency(financeiroResumo?.openTotal || 0)}</p>
              <p className="mt-1 text-[10px] font-bold text-rose-500">Atrasado: {formatCurrency(financeiroResumo?.overdueTotal || 0)}</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('financeiro')}
          className="rounded-[2rem] border border-slate-100 bg-[#001a33] p-6 text-left text-white shadow-sm transition hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-blue-200">
              <WalletCards size={21} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200">Próximo pagamento</p>
              <h3 className="mt-1 text-lg font-black">
                {financeiroResumo?.nextPayment ? formatCurrency(Number(financeiroResumo.nextPayment.valor || 0)) : 'Sem cobrança aberta'}
              </h3>
            </div>
          </div>
          <p className="mt-4 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-300">
            {financeiroResumo?.nextPayment?.descricao || 'Quando houver mensalidade, boleto ou PIX pendente, ele aparecerá aqui para facilitar o acompanhamento.'}
          </p>
        </button>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <History size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Cursos recentes</p>
                <h2 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Últimos acessos</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('turmas')}
              className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-blue-700 transition hover:border-blue-300"
            >
              Meus cursos
            </button>
          </div>

          {quickAccessCourses.length > 0 ? (
            <div className="space-y-3">
              {quickAccessCourses.map((course) => {
                const courseKey = getStudentCourseAccessKey(course);
                const isPinned = pinnedCourseKeys.includes(courseKey);

                return (
                  <article
                    key={courseKey}
                    className={`flex flex-col gap-4 rounded-2xl border p-3 transition hover:border-blue-200 hover:bg-blue-50/20 sm:flex-row sm:items-center ${
                      isPinned ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100 bg-slate-50/60'
                    }`}
                  >
                    <div className="h-20 w-full overflow-hidden rounded-2xl bg-white shadow-sm sm:w-24 sm:shrink-0">
                      {course.imagemUrl ? (
                        <img
                          src={course.imagemUrl}
                          alt={course.cursoNome}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <ImageIcon size={24} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${getCourseModalityClasses(course.modalidade)}`}>
                          {getCourseModalityLabel(course.modalidade)}
                        </span>
                        {isPinned && (
                          <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-blue-700">
                            Fixado
                          </span>
                        )}
                      </div>
                      <h3 className="line-clamp-2 text-sm font-black leading-snug text-[#001a33]">{course.cursoNome}</h3>
                      <p className="mt-1 line-clamp-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {course.turmaNome || 'Acesso do curso'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:flex-col">
                      <button
                        type="button"
                        onClick={() => handleTogglePinnedCourse(course)}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                          isPinned
                            ? 'border-blue-200 bg-white text-blue-700'
                            : 'border-slate-100 bg-white text-slate-400 hover:border-blue-200 hover:text-blue-700'
                        }`}
                        title={isPinned ? 'Remover fixação' : 'Fixar curso'}
                        aria-label={isPinned ? 'Remover fixação do curso' : 'Fixar curso'}
                      >
                        <Pin size={15} fill={isPinned ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenQuickAccessCourse(course)}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 sm:w-24 sm:flex-none"
                      >
                        <PlayCircle size={14} />
                        Abrir
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
              <GraduationCap size={24} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-black text-[#001a33]">Nenhum curso liberado</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                Assim que houver matrícula ativa, o acesso rápido aparece aqui.
              </p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Calendar size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600">Agenda</p>
                  <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Próximos eventos</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('calendario')}
                className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-indigo-700 transition hover:border-indigo-300"
              >
                Ver agenda
              </button>
            </div>

            {loadingProximosEventos ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs font-black uppercase tracking-widest text-slate-400">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                Carregando eventos...
              </div>
            ) : proximosEventos.length > 0 ? (
              <div className="space-y-3">
                {proximosEventos.slice(0, 4).map((event) => {
                  const [, month, day] = event.date.split('-');
                  return (
                    <article key={event.id} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-white shadow-sm">
                        <span className="text-base font-black text-[#001a33]">{day}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{month}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-black leading-snug text-[#001a33]">{event.title}</p>
                        <p className="mt-1 line-clamp-1 text-[11px] font-bold text-slate-500">{event.subtitle}</p>
                        {event.detail && (
                          <p className="mt-1 line-clamp-1 text-[10px] font-bold text-indigo-600">{event.detail}</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center">
                <Clock size={22} className="mx-auto mb-3 text-slate-300" />
                <p className="text-xs font-black text-[#001a33]">Nenhuma aula futura encontrada</p>
                <p className="mt-1 text-[10px] font-bold text-slate-400">
                  Assim que a turma tiver aulas agendadas, elas aparecerão aqui.
                </p>
              </div>
            )}
          </section>

          <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 p-6 text-white shadow-md">
            <div className="absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-blue-600/30 blur-xl"></div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-blue-300">Central de Atendimento</h3>
            <p className="mt-1 text-[11px] font-medium text-slate-300">
              Tem alguma dúvida sobre notas, mensalidades ou documentação?
            </p>
            <button
              onClick={() => onNavigate('comunicacao')}
              className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-blue-500"
            >
              Falar com Atendente
            </button>
          </div>
        </div>
      </div>
      </div> : null}
    </>
  );
};

export default InicioPage;

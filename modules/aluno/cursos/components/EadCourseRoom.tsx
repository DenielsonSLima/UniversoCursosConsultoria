import React from 'react';
import {
  ArrowLeft,
  AlertCircle,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Download,
  Loader2,
  FileText,
  MonitorPlay,
  Printer,
  RefreshCw,
} from 'lucide-react';
import EadLearningContent from './EadLearningContent';
import type { LearningTab } from '../cursosPage.types';

interface EadCourseRoomProps {
  view: any;
}

const EadCourseRoom: React.FC<EadCourseRoomProps> = ({ view }) => {
  const {
    selectedCourse,
    alunoCertificado,
    startedAtDate,
    completedAtDate,
    quizPassed,
    showCompletedLessons,
    renderCertificatePdfSource,
    closeSelectedCourse,
    setActiveLearningTab,
    setShowCompletedLessons,
    summary,
    certificateStatusTitle,
    certificateStatusMessage,
    printCertificate,
    downloadCertificatePdf,
    isDownloadingCertificate,
    renderCertificatePreview,
    progressPercent,
    completedLessonCount,
    conteudos,
    learningView,
    activeLearningTab,
    isProgressReady,
    isProgressLoading,
    isProgressRefreshing,
    progressQueryError,
    retryProgress,
    progressMutationError,
    isUpdatingProgress,
  } = view;

    const enrollmentDate = alunoCertificado?.data_inscricao
      ? new Date(alunoCertificado.data_inscricao)
      : startedAtDate;
    const enrollmentDateLabel = enrollmentDate && !Number.isNaN(enrollmentDate.getTime())
      ? enrollmentDate.toLocaleDateString('pt-BR')
      : 'Data não informada';
    const completionDateLabel = completedAtDate
      ? completedAtDate.toLocaleDateString('pt-BR')
      : 'Hoje';
    if (quizPassed && !showCompletedLessons) {
      return (
        <div className="space-y-6 animate-fadeIn">
          {renderCertificatePdfSource()}
          <style>{`
            @media print {
              @page { size: A4 landscape; margin: 0; }
              body * { visibility: hidden !important; }
              #ead-certificate-print-area, #ead-certificate-print-area * { visibility: visible !important; }
              #ead-certificate-print-area { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; background: white !important; }
              #ead-certificate-print-area section { break-after: page; box-shadow: none !important; border-radius: 0 !important; }
            }
          `}</style>
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={closeSelectedCourse}
                disabled={isUpdatingProgress}
                title={isUpdatingProgress ? 'Aguarde o salvamento do progresso.' : 'Voltar aos cursos'}
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 shrink-0 disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-300"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Curso concluído</p>
                <h2 className="text-xl sm:text-2xl font-black text-[#001a33] uppercase tracking-tight truncate">{selectedCourse.nome}</h2>
              </div>
            </div>
          </div>

          {progressQueryError && (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 sm:flex-row sm:items-center sm:justify-between">
              <span>O último progresso confirmado continua visível, mas a atualização falhou: {progressQueryError}</span>
              <button
                type="button"
                onClick={retryProgress}
                disabled={isProgressRefreshing}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={13} className={isProgressRefreshing ? 'animate-spin' : ''} />
                {isProgressRefreshing ? 'Atualizando' : 'Tentar novamente'}
              </button>
            </div>
          )}

          <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm">
            <div className="bg-emerald-50/80 p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="max-w-3xl">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <Award size={26} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-700">Parabéns pela conclusão</p>
                  <h3 className="mt-2 text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#001a33]">
                    Você concluiu este curso EAD
                  </h3>
                  <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">
                    Seu progresso foi registrado e a matrícula foi concluída. O certificado foi enviado à Secretaria e permanece pendente até o registro do número, livro e página. Depois da emissão, o PDF será liberado aqui.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLearningTab('aulas');
                      setShowCompletedLessons(true);
                    }}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800"
                  >
                    <BookOpen size={14} />
                    Acessar conteúdos e aulas
                  </button>
                </div>

                <div className="grid min-w-[260px] grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <CalendarDays size={13} />
                      Data da inscrição
                    </p>
                    <p className="mt-1 text-lg font-black text-[#001a33]">{enrollmentDateLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <CheckCircle2 size={13} />
                      Data da conclusão
                    </p>
                    <p className="mt-1 text-lg font-black text-emerald-700">{completionDateLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nota final</p>
                    <p className="mt-1 text-lg font-black text-blue-600">{summary?.quizScore ?? '--'}%</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Certificado</p>
                    <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
                      {certificateStatusTitle}
                    </h4>
                    <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                      {certificateStatusMessage}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={printCertificate}
                      disabled={!alunoCertificado || isDownloadingCertificate}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      <Printer size={14} />
                      Imprimir
                    </button>
                    <button
                      onClick={downloadCertificatePdf}
                      disabled={!alunoCertificado || isDownloadingCertificate}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-150 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      {isDownloadingCertificate ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {isDownloadingCertificate ? 'Gerando PDF' : 'Baixar PDF'}
                    </button>
                  </div>
                </div>
              </div>
              {renderCertificatePreview()}
            </div>
          </section>
        </div>
      );
    }

    if (!isProgressReady) {
      return (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={closeSelectedCourse}
              disabled={isUpdatingProgress}
              title={isUpdatingProgress ? 'Aguarde o salvamento do progresso.' : 'Voltar aos cursos'}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 shrink-0 disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-300"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Sala de aprendizagem</p>
              <h2 className="text-xl sm:text-2xl font-black text-[#001a33] uppercase tracking-tight truncate">{selectedCourse.nome}</h2>
            </div>
          </div>

          <section
            role={progressQueryError ? 'alert' : 'status'}
            aria-live="polite"
            className={`rounded-[2rem] border bg-white p-7 text-center shadow-sm ${
              progressQueryError ? 'border-red-100' : 'border-blue-100'
            }`}
          >
            {isProgressLoading
              ? <Loader2 className="mx-auto animate-spin text-blue-600" size={28} />
              : <AlertCircle className="mx-auto text-red-600" size={28} />}
            <h3 className="mt-3 text-sm font-black uppercase tracking-widest text-[#001a33]">
              {isProgressLoading ? 'Carregando seu progresso' : 'Progresso indisponível'}
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-xs font-bold leading-relaxed text-slate-500">
              {isProgressLoading
                ? 'Aguarde a confirmação do servidor antes de marcar aulas, vídeos ou responder atividades.'
                : progressQueryError || 'Não foi possível confirmar seu progresso agora.'}
            </p>
            {!isProgressLoading && (
              <button
                type="button"
                onClick={retryProgress}
                disabled={isProgressRefreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-wait disabled:bg-slate-300"
              >
                <RefreshCw size={14} className={isProgressRefreshing ? 'animate-spin' : ''} />
                {isProgressRefreshing ? 'Tentando novamente' : 'Tentar novamente'}
              </button>
            )}
          </section>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-fadeIn">
        {renderCertificatePdfSource()}
        <style>{`
          @media print {
            @page { size: A4 landscape; margin: 0; }
            body * { visibility: hidden !important; }
            #ead-certificate-print-area, #ead-certificate-print-area * { visibility: visible !important; }
            #ead-certificate-print-area { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; background: white !important; }
            #ead-certificate-print-area section { break-after: page; box-shadow: none !important; border-radius: 0 !important; }
          }
        `}</style>
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={closeSelectedCourse}
              disabled={isUpdatingProgress}
              title={isUpdatingProgress ? 'Aguarde o salvamento do progresso.' : 'Voltar aos cursos'}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 shrink-0 disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-300"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Sala de aprendizagem</p>
              <h2 className="text-xl sm:text-2xl font-black text-[#001a33] uppercase tracking-tight truncate">{selectedCourse.nome}</h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 min-w-[280px]">
            <div className="bg-white border border-slate-100 rounded-2xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Progresso</p>
              <p className="text-lg font-black text-blue-600">{progressPercent}%</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aulas</p>
              <p className="text-lg font-black text-amber-600">{completedLessonCount}/{conteudos.length || 0}</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nota</p>
              <p className="text-lg font-black text-emerald-600">{summary?.quizScore ?? '--'}%</p>
            </div>
          </div>
        </div>

        {progressQueryError && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <span>O último progresso confirmado continua visível, mas a atualização falhou: {progressQueryError}</span>
            <button
              type="button"
              onClick={retryProgress}
              disabled={isProgressRefreshing}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={13} className={isProgressRefreshing ? 'animate-spin' : ''} />
              Tentar novamente
            </button>
          </div>
        )}

        {progressMutationError && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex gap-2">
              <AlertCircle className="mt-0.5 shrink-0" size={16} />
              {progressMutationError}
            </span>
            <button
              type="button"
              onClick={retryProgress}
              disabled={isProgressRefreshing || isUpdatingProgress}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={13} className={isProgressRefreshing ? 'animate-spin' : ''} />
              {isProgressRefreshing ? 'Atualizando' : 'Atualizar progresso'}
            </button>
          </div>
        )}

        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-slate-100 bg-white p-2 shadow-sm w-full sm:w-max">
          {[
            ['video', 'Vídeo', <MonitorPlay size={15} />],
            ['aulas', quizPassed ? 'Conteúdos do curso' : 'Aulas e atividades', <BookOpen size={15} />],
            ['prova', 'Prova final', <FileText size={15} />],
            ...(quizPassed ? [['certificado', 'Certificado', <Award size={15} />]] : [])
          ].map(([id, label, icon]) => (
            <button
              key={id as string}
              onClick={() => setActiveLearningTab(id as LearningTab)}
              className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeLearningTab === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              {icon as React.ReactNode}
              {label as string}
            </button>
          ))}
        </div>

        <EadLearningContent view={learningView} />
      </div>
    );
};

export default EadCourseRoom;

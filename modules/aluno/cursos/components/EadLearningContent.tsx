import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  ListChecks,
  Loader2,
  Lock,
  MonitorPlay,
  Play,
  Printer,
} from 'lucide-react';
import EadVideoPlayer from '../EadVideoPlayer';
import {
  MAIN_EAD_VIDEO_ID,
  getActivityChoiceData,
  getEmbedUrl,
  getLessonDurationLabel,
} from '../cursosPage.utils';

interface EadLearningContentProps {
  view: any;
}

const EadLearningContent: React.FC<EadLearningContentProps> = ({ view }) => {
  const {
    activeLearningTab,
    setActiveLearningTab,
    activeCourseContentTab,
    setActiveCourseContentTab,
    selectedCourse,
    selectedLessonIdx,
    setSelectedLessonIdx,
    quizAnswers,
    setQuizAnswers,
    quizError,
    activityCompletionPrompt,
    setActivityCompletionPrompt,
    conteudos,
    currentProva,
    selectedLesson,
    selectedLessonText,
    progress,
    mainVideoUrl,
    mainVideoDone,
    selectedLessonActivities,
    quizPassed,
    allLessonsDone,
    allActivitiesDone,
    allVideosDone,
    questionsTotal,
    minimumQuestions,
    quizRetryBlocked,
    retryCountdownLabel,
    canTakeQuiz,
    alunoCertificado,
    certificateStatusTitle,
    certificateStatusMessage,
    isDownloadingCertificate,
    printCertificate,
    downloadCertificatePdf,
    renderCertificatePreview,
    eadGradeCurricular,
    randomizedQuizQuestions,
    displayedQuizAnswers,
    retryAvailableLabel,
    summary,
    isLessonLocked,
    updateProgress,
  } = view;

  return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {activeLearningTab !== 'video' && (
          <aside className={`${activeLearningTab === 'prova' || activeLearningTab === 'certificado' ? 'xl:col-span-3' : 'xl:col-span-4'} space-y-3`}>
            <div className="bg-white border border-slate-100 rounded-[2rem] p-4 shadow-sm">
              <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest mb-3">Etapas do curso</h3>
              <div className="space-y-2">
                {conteudos.map((lesson: any, idx: number) => {
                  const locked = isLessonLocked(idx);
                  const done = progress.completedContentIds.includes(lesson.id);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => !locked && setSelectedLessonIdx(idx)}
                      disabled={locked}
                      className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                        selectedLessonIdx === idx ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white hover:bg-slate-50'
                      } ${locked ? 'opacity-55 cursor-not-allowed' : ''}`}
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-emerald-100 text-emerald-700' : locked ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-700'}`}>
                        {locked ? <Lock size={14} /> : done ? <CheckCircle2 size={15} /> : idx + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-[#001a33] line-clamp-2">{lesson.titulo}</span>
                        <span className="block text-[10px] text-slate-400 font-bold mt-0.5">{getLessonDurationLabel(lesson)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
          )}

          <main className={`${activeLearningTab === 'video' ? 'xl:col-span-12' : activeLearningTab === 'prova' || activeLearningTab === 'certificado' ? 'xl:col-span-9' : 'xl:col-span-8'} space-y-6`}>
            {activeLearningTab === 'video' ? (
              <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
                <div className="grid grid-cols-1 gap-0 xl:grid-cols-12">
                  <div className="bg-white xl:col-span-8">
                    {mainVideoUrl ? (
                      <div className="aspect-video overflow-hidden bg-white">
                        <EadVideoPlayer
                          key={`${selectedCourse.id}-${mainVideoUrl}`}
                          embedUrl={getEmbedUrl(mainVideoUrl)}
                          title={`Vídeo principal - ${selectedCourse.nome}`}
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center border border-slate-100 bg-slate-50 text-center">
                        <div className="max-w-sm px-6">
                          <MonitorPlay className="mx-auto mb-3 text-blue-300" size={42} />
                          <p className="text-sm font-black uppercase tracking-widest text-[#001a33]">Vídeo em preparação</p>
                          <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                            Assim que a videoaula for vinculada ao cadastro do curso, ela aparecerá aqui.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between gap-6 p-5 sm:p-7 xl:col-span-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Primeiro passo</p>
                      <h3 className="mt-2 text-2xl font-black uppercase tracking-tight text-[#001a33]">
                        Assista à videoaula de abertura
                      </h3>
                      <p className="mt-3 text-sm font-bold leading-relaxed text-slate-500">
                        Este vídeo apresenta o curso, organiza a visão geral do conteúdo e prepara você para avançar pelas aulas, atividades e prova final.
                      </p>

                      {mainVideoUrl && (
                        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Videoaula vinculada</p>
                          <p className="mt-1 text-sm font-black text-[#001a33]">Vídeo principal do curso</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      {mainVideoUrl && (
                        <button
                          onClick={() => updateProgress('toggle_video', MAIN_EAD_VIDEO_ID)}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-widest ${
                            mainVideoDone
                              ? 'border border-emerald-150 bg-emerald-50 text-emerald-700'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {mainVideoDone ? <CheckCircle2 size={15} /> : <Play size={15} />}
                          {mainVideoDone ? 'Vídeo concluído' : 'Marcar vídeo como concluído'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveLearningTab('aulas')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-650 hover:border-blue-200 hover:text-blue-700"
                      >
                        <BookOpen size={15} />
                        Ir para aulas e atividades
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : activeLearningTab === 'certificado' ? (
              <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
                <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-5">
                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Certificado</p>
                      <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
                        {certificateStatusTitle}
                      </h4>
                      <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                        {certificateStatusMessage}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
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

                <div className="mt-5 rounded-[1.5rem] border border-blue-50 bg-blue-50/50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Conteúdo programático no verso</p>
                  <pre className="mt-3 whitespace-pre-wrap text-xs font-bold leading-relaxed text-slate-650">{eadGradeCurricular}</pre>
                </div>
              </section>
            ) : activeLearningTab === 'aulas' ? (
            selectedLesson ? (
              <section className="bg-white border border-slate-100 rounded-[2rem] p-5 sm:p-7 shadow-sm space-y-6">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-1.5 w-full sm:w-max">
                  {[
                    ['aulas', 'Aulas', <BookOpen size={14} />],
                    ['atividades', 'Atividades', <ListChecks size={14} />]
                  ].map(([id, label, icon]) => (
                    <button
                      key={id as string}
                      type="button"
                      onClick={() => setActiveCourseContentTab(id as 'aulas' | 'atividades')}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeCourseContentTab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'
                      }`}
                    >
                      {icon as React.ReactNode}
                      {label as string}
                    </button>
                  ))}
                </div>

                {activeCourseContentTab === 'aulas' ? (
                  <>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                          Etapa {selectedLessonIdx + 1}
                          {selectedLesson.etapa && ` • ${selectedLesson.etapa}`}
                        </span>
                        <h3 className="text-xl font-black text-[#001a33] tracking-tight mt-1">{selectedLesson.titulo}</h3>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed mt-2">{selectedLesson.descricao}</p>
                      </div>
                      <button
                        onClick={() => updateProgress('toggle_content', selectedLesson.id)}
                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                          progress.completedContentIds.includes(selectedLesson.id)
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#001a33] text-white'
                        }`}
                      >
                        <CheckCircle2 size={14} />
                        {progress.completedContentIds.includes(selectedLesson.id) ? 'Concluída' : 'Marcar leitura'}
                      </button>
                    </div>

                    {selectedLessonText && (
                      <article className="prose prose-slate max-w-none">
                        <div className="whitespace-pre-line text-sm leading-8 text-slate-700 font-medium bg-slate-50/70 border border-slate-100 rounded-3xl p-5">
                          {selectedLessonText}
                        </div>
                      </article>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
                        <ListChecks size={16} className="text-emerald-600" />
                        Atividades desta etapa
                      </h4>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {selectedLesson?.titulo
                          ? `Responda as atividades vinculadas a "${selectedLesson.titulo}" antes de avançar.`
                          : 'Selecione uma etapa para visualizar as atividades vinculadas.'}
                      </p>
                    </div>

                    {selectedLessonActivities.length === 0 ? (
                      <div className="rounded-3xl border border-slate-100 bg-slate-50 p-8 text-center">
                        <FileText className="mx-auto mb-3 text-slate-300" size={34} />
                        <p className="text-sm font-bold text-slate-500">Esta etapa ainda não possui atividades cadastradas.</p>
                      </div>
                    ) : selectedLessonActivities.map(({ atividade, activityIndex, linkedLessonIndex }: any) => {
                      const choiceData = getActivityChoiceData(atividade, activityIndex, currentProva);
                      const activityDone = progress.completedActivityIds.includes(atividade.id);

                      return (
                        <div key={atividade.id} className="border border-emerald-100 bg-emerald-50/35 rounded-3xl p-4 space-y-3">
                          <div className="flex justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-[#001a33]">{atividade.titulo}</p>
                              {linkedLessonIndex >= 0 && (
                                <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                  Etapa {linkedLessonIndex + 1}
                                  {conteudos[linkedLessonIndex]?.etapa && ` • ${conteudos[linkedLessonIndex].etapa}`}
                                </p>
                              )}
                              <p className="text-xs text-slate-600 font-medium mt-1">{choiceData?.enunciado || atividade.enunciado}</p>
                            </div>
                            {activityDone && <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />}
                          </div>

                          {choiceData ? (
                            <div className="grid grid-cols-1 gap-2">
                              {choiceData.opcoes.map((opcao: string, idx: number) => (
                                <button
                                  key={`${atividade.id}-${idx}`}
                                  onClick={() => {
                                    updateProgress('set_activity_answer', atividade.id, { answer: String(idx) });
                                    if (idx === choiceData.respostaCorreta && !activityDone) {
                                      setActivityCompletionPrompt({ activityId: atividade.id, title: atividade.titulo || 'Atividade' });
                                    }
                                  }}
                                  className={`rounded-xl border px-3 py-2 text-left text-xs font-bold ${
                                    progress.activityAnswers[atividade.id] === String(idx) ? 'border-emerald-500 bg-white text-emerald-700' : 'border-emerald-100 bg-white text-slate-600'
                                  }`}
                                >
                                  {opcao}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <>
                              <textarea
                                rows={3}
                                value={progress.activityAnswers[atividade.id] || ''}
                                onChange={e => updateProgress('set_activity_answer', atividade.id, { answer: e.target.value })}
                                className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-xs font-medium outline-none resize-none"
                              />
                              <button
                                onClick={() => progress.activityAnswers[atividade.id]?.trim() && updateProgress('toggle_activity', atividade.id)}
                                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest"
                              >
                                Salvar atividade
                              </button>
                            </>
                          )}

                          {activityCompletionPrompt?.activityId === atividade.id && !activityDone && (
                            <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                              <p className="text-xs font-black text-emerald-700">Resposta correta.</p>
                              <p className="mt-1 text-xs font-semibold text-slate-600">
                                Deseja marcar esta atividade como concluída?
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() => {
                                    updateProgress('toggle_activity', atividade.id);
                                    setActivityCompletionPrompt(null);
                                  }}
                                  className="rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                                >
                                  Sim, concluir
                                </button>
                                <button
                                  onClick={() => setActivityCompletionPrompt(null)}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500"
                                >
                                  Agora não
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <div className="bg-white border border-slate-100 rounded-[2rem] p-12 text-center">
                <BookOpen className="mx-auto text-slate-300 mb-3" size={36} />
                <p className="text-sm font-bold text-slate-500">Este curso ainda não possui etapas cadastradas.</p>
              </div>
            )
            ) : (
            <section className="bg-white border border-slate-100 rounded-[2rem] p-5 sm:p-7 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Prova final</h3>
                  <p className="text-xs text-slate-500 font-medium">A prova libera quando etapas, vídeos e atividades estiverem concluídos.</p>
                </div>
                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${canTakeQuiz ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {canTakeQuiz ? 'Liberada' : 'Bloqueada'}
                </span>
              </div>

              {!canTakeQuiz ? (
                <div className="space-y-3">
                  {questionsTotal < minimumQuestions && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold text-amber-700">
                      A prova ainda precisa ter no mínimo {minimumQuestions} questões cadastradas. Hoje há {questionsTotal}.
                    </div>
                  )}
                  {quizRetryBlocked && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
                      <p>Sua última tentativa não atingiu a nota mínima.</p>
                      <p className="mt-2 text-2xl font-black tracking-widest text-red-800">{retryCountdownLabel}</p>
                      <p className="mt-1 text-[11px] text-red-600">
                        Nova tentativa liberada em {retryAvailableLabel || `${summary.retryIntervalHours || 1} hora`}.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      ['Etapas', allLessonsDone],
                      ['Atividades', allActivitiesDone],
                      ['Vídeos', allVideosDone]
                    ].map(([label, ok]) => (
                      <div key={label as string} className={`rounded-2xl border p-3 text-xs font-black ${ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                        {ok ? <CheckCircle2 size={15} className="mb-1" /> : <Lock size={15} className="mb-1" />}
                        {label as string}
                      </div>
                    ))}
                  </div>
                </div>
              ) : randomizedQuizQuestions.length ? (
                <div className="space-y-4">
                  {randomizedQuizQuestions.map((questao: any, qIdx: number) => {
                    const selectedAnswer = displayedQuizAnswers[questao.id];
                    const hasAnswered = selectedAnswer !== undefined && selectedAnswer !== null;
                    const isCorrect = hasAnswered && Number(selectedAnswer) === Number(questao.respostaCorreta);

                    return (
                    <div key={questao.id} className="border border-slate-100 rounded-3xl p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="text-sm font-black text-[#001a33]">{qIdx + 1}. {questao.pergunta}</p>
                        {quizPassed && hasAnswered && (
                          <span className={`rounded-xl px-3 py-1 text-[9px] font-black uppercase tracking-widest ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {isCorrect ? 'Você acertou' : 'Você errou'}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 mt-3">
                        {questao.shuffledOptions.map((opcao: any, idx: number) => {
                          const selected = Number(selectedAnswer) === Number(opcao.originalIndex);
                          const correct = Number(questao.respostaCorreta) === Number(opcao.originalIndex);
                          const reviewClass = quizPassed
                            ? correct
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                              : selected
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-slate-100 bg-slate-50 text-slate-500'
                            : selected
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-slate-100 bg-slate-50 text-slate-600';

                          return (
                          <button
                            key={`${questao.id}-${opcao.originalIndex}`}
                            type="button"
                            disabled={quizPassed}
                            onClick={() => setQuizAnswers(prev => ({ ...prev, [questao.id]: opcao.originalIndex }))}
                            className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all disabled:cursor-default ${reviewClass}`}
                          >
                            <span className="mr-2 font-black">{String.fromCharCode(65 + idx)}.</span>
                            {opcao.label}
                            {quizPassed && correct && <span className="ml-2 font-black text-emerald-700">Resposta correta</span>}
                            {quizPassed && selected && !correct && <span className="ml-2 font-black text-red-700">Sua resposta</span>}
                          </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                  {!quizPassed && (
                    <button
                      onClick={() => updateProgress('finish_quiz', null, { answers: quizAnswers })}
                      className="w-full rounded-xl bg-[#001a33] py-3 text-white text-xs font-black uppercase tracking-widest"
                    >
                      Corrigir prova
                    </button>
                  )}
                  {quizError && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
                      {quizError}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-bold">Prova ainda não cadastrada para este curso.</p>
              )}
            </section>
            )}
          </main>
        </div>
  );
};

export default EadLearningContent;

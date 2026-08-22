import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import {
  getEadAnswerFeedback,
  getEadOptionFeedbackState,
  getEadQuizAnswerProgress,
  getEadQuizSubmissionAnswers,
  type EadOptionFeedbackState,
} from '../eadAssessmentFeedback';

interface EadQuizPanelProps {
  view: any;
}

const optionStateClasses: Record<EadOptionFeedbackState, string> = {
  neutral: 'border-slate-200 bg-white text-slate-650 hover:border-blue-200',
  selected: 'border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200',
  correct: 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200',
  incorrect: 'border-red-400 bg-red-50 text-red-800 ring-1 ring-red-200',
};

export const EadQuizPanel: React.FC<EadQuizPanelProps> = ({ view }) => {
  const {
    quizAnswers,
    setQuizAnswers,
    assessmentFeedback,
    summary,
    randomizedQuizQuestions,
    displayedQuizAnswers,
    quizPassed,
    allLessonsDone,
    allActivitiesDone,
    allVideosDone,
    questionsTotal,
    minimumQuestions,
    quizRetryBlocked,
    retryCountdownLabel,
    retryAvailableLabel,
    retryReleaseRefreshing,
    canTakeQuiz,
    isUpdatingProgress,
    isProgressUpdatePending,
    updateProgress,
  } = view;
  const quizReviewMode = quizPassed || quizRetryBlocked;
  const quizFeedback = assessmentFeedback?.quiz;
  const authoritativeQuizAnswers = Object.fromEntries(
    Object.entries(quizFeedback?.results || {}).map(([questionId, result]: [string, any]) => (
      [questionId, result.selectedIndex]
    )),
  );
  const answersForDisplay = quizReviewMode ? authoritativeQuizAnswers : displayedQuizAnswers;
  const quizAnswerProgress = getEadQuizAnswerProgress(randomizedQuizQuestions, quizAnswers);
  const { answeredQuestions, allQuestionsAnswered, isConfigurationValid } = quizAnswerProgress;
  const quizSubmitting = isProgressUpdatePending('finish_quiz', null);
  const canSubmitQuiz = canTakeQuiz && !quizReviewMode && isConfigurationValid
    && allQuestionsAnswered && !isUpdatingProgress && !quizSubmitting;
  const showQuizQuestions = (canTakeQuiz || quizReviewMode)
    && randomizedQuizQuestions.length > 0
    && isConfigurationValid;

  const statusLabel = quizPassed ? 'Aprovada' : quizRetryBlocked ? 'Em revisão' : canTakeQuiz ? 'Liberada' : 'Bloqueada';
  const statusClass = quizPassed
    ? 'bg-emerald-100 text-emerald-800'
    : quizRetryBlocked
      ? 'bg-red-50 text-red-700'
      : canTakeQuiz ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

  return (
    <section className="space-y-4 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Prova final</h3>
          <p className="text-xs font-medium text-slate-500">A prova libera quando etapas, vídeos e atividades estiverem concluídos.</p>
        </div>
        <span className={`rounded-xl px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {!canTakeQuiz && (
        <div className="space-y-3">
          {questionsTotal < minimumQuestions && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold text-amber-700">
              A prova ainda precisa ter no mínimo {minimumQuestions} questões cadastradas. Hoje há {questionsTotal}.
            </div>
          )}
          {quizRetryBlocked && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
              <p>Sua última tentativa não atingiu a nota mínima. Revise a correção abaixo antes de tentar novamente.</p>
              <p className="mt-2 text-2xl font-black tracking-widest text-red-800">{retryCountdownLabel}</p>
              <p className="mt-1 text-[11px] text-red-600">
                {retryReleaseRefreshing
                  ? 'Aguardando o servidor confirmar a liberação da nova tentativa.'
                  : `Nova tentativa liberada em ${retryAvailableLabel || `${summary.retryIntervalHours || 1} hora`}.`}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              ['Etapas', allLessonsDone],
              ['Atividades', allActivitiesDone],
              ['Vídeos', allVideosDone],
            ].map(([label, ok]) => (
              <div key={label as string} className={`rounded-2xl border p-3 text-xs font-black ${ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>
                {ok ? <CheckCircle2 size={15} className="mb-1" /> : <Lock size={15} className="mb-1" />}
                {label as string}
              </div>
            ))}
          </div>
        </div>
      )}

      {quizReviewMode && (
        <div role="status" aria-live="polite" className={`rounded-2xl border p-4 ${quizPassed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`text-xs font-black uppercase tracking-widest ${quizPassed ? 'text-emerald-800' : 'text-red-800'}`}>
            {quizPassed ? 'Você foi aprovado' : 'Tentativa corrigida'}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-650">
            Nota: {summary.quizScore ?? 0}% · Média necessária: {summary.quizMinimumScore ?? 70}%.
          </p>
        </div>
      )}

      {(canTakeQuiz || quizReviewMode) && randomizedQuizQuestions.length > 0 && !isConfigurationValid && (
        <div role="alert" className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">
          <AlertCircle className="shrink-0" size={16} />
          A prova possui identificadores, enunciados ou alternativas inválidos. Avise o suporte antes de enviar.
        </div>
      )}

      {showQuizQuestions ? (
        <div className="space-y-4">
          {randomizedQuizQuestions.map((questao: any, qIdx: number) => {
            const visualQuestionKey = `${qIdx}:${String(questao.id || 'sem-id')}`;
            const selectedAnswer = answersForDisplay[questao.id];
            const feedback = getEadAnswerFeedback(
              selectedAnswer,
              quizFeedback?.results?.[questao.id]
                ? { submitted: quizFeedback.submitted, ...quizFeedback.results[questao.id] }
                : null,
              questao.shuffledOptions.length,
            );
            return (
              <fieldset key={visualQuestionKey} className="rounded-3xl border border-slate-100 p-4">
                <legend className="w-full px-0 text-sm font-black text-[#001a33]">
                  <span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <span>{qIdx + 1}. {questao.pergunta}</span>
                    {quizReviewMode && (
                      <span className={`w-max shrink-0 rounded-xl px-3 py-1 text-[9px] font-black uppercase tracking-widest ${feedback.isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {feedback.isCorrect ? 'Você acertou' : feedback.hasAnswered ? 'Você errou' : 'Não respondida'}
                      </span>
                    )}
                  </span>
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {questao.shuffledOptions.map((opcao: any, idx: number) => {
                    const optionState = getEadOptionFeedbackState(feedback, opcao.originalIndex, quizReviewMode);
                    const selected = feedback.selectedIndex === Number(opcao.originalIndex);
                    const optionDisabled = quizReviewMode || quizSubmitting || isUpdatingProgress || !isConfigurationValid;
                    return (
                      <label
                        key={`${visualQuestionKey}:${idx}:${opcao.originalIndex}`}
                        className={optionDisabled ? 'cursor-default' : 'cursor-pointer'}
                      >
                        <input
                          type="radio"
                          name={`prova-${qIdx}-${String(questao.id || 'sem-id')}`}
                          value={opcao.originalIndex}
                          checked={selected}
                          disabled={optionDisabled}
                          onChange={() => setQuizAnswers((previous: Record<string, number>) => ({
                            ...previous,
                            [questao.id]: opcao.originalIndex,
                          }))}
                          className="peer sr-only"
                        />
                        <span className={`block rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 ${optionStateClasses[optionState]}`}>
                          <span className="mr-2 font-black">{String.fromCharCode(65 + idx)}.</span>
                          {opcao.label}
                          {quizReviewMode && optionState === 'correct' && (
                            <span className="ml-2 font-black text-emerald-700">Resposta correta</span>
                          )}
                          {quizReviewMode && optionState === 'incorrect' && (
                            <span className="ml-2 font-black text-red-700">Sua resposta</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {!quizReviewMode && (
            <div className="space-y-2">
              <p aria-live="polite" className={`text-xs font-bold ${allQuestionsAnswered ? 'text-emerald-700' : 'text-slate-500'}`}>
                {answeredQuestions} de {randomizedQuizQuestions.length} questões respondidas.
                {!allQuestionsAnswered && ' Responda todas antes de corrigir a prova.'}
              </p>
              <button
                type="button"
                disabled={!canSubmitQuiz}
                onClick={() => {
                  if (!canSubmitQuiz) return;
                  updateProgress('finish_quiz', null, {
                    answers: getEadQuizSubmissionAnswers(randomizedQuizQuestions, quizAnswers),
                  });
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] py-3 text-xs font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {quizSubmitting && <Loader2 size={15} className="animate-spin" />}
                {quizSubmitting ? 'Corrigindo prova' : 'Corrigir prova'}
              </button>
            </div>
          )}
        </div>
      ) : canTakeQuiz && randomizedQuizQuestions.length === 0 ? (
        <p className="text-xs font-bold text-slate-500">Prova ainda não cadastrada para este curso.</p>
      ) : null}
    </section>
  );
};

import React from 'react';
import { AlertCircle, CheckCircle2, CircleX, FileText, ListChecks, Loader2 } from 'lucide-react';
import {
  getActivityChoiceData,
  getEadAnswerFeedback,
  getEadOptionFeedbackState,
  isEadChoiceActivity,
  type EadOptionFeedbackState,
} from '../eadAssessmentFeedback';
import { getEadActivityDraftKey } from '../eadAssessmentRuntime';

interface EadActivitiesPanelProps {
  view: any;
}

const optionStateClasses: Record<EadOptionFeedbackState, string> = {
  neutral: 'border-slate-200 bg-white text-slate-650 hover:border-blue-200',
  selected: 'border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200',
  correct: 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200',
  incorrect: 'border-red-400 bg-red-50 text-red-800 ring-1 ring-red-200',
};

export const EadActivitiesPanel: React.FC<EadActivitiesPanelProps> = ({ view }) => {
  const {
    selectedCourse,
    progressContextKey,
    selectedLesson,
    selectedLessonActivities,
    activityConfigurationValidation,
    conteudos,
    progress,
    assessmentFeedback,
    quizError,
    activityAnswerDrafts,
    setActivityAnswerDraft,
    saveActivityAnswer,
    isProgressUpdatePending,
    updateProgress,
  } = view;
  const requestActivityAnswerSave = (draftKey: string, activityId: string, answer: string) => (
    saveActivityAnswer(draftKey, activityId, answer)
  );

  const requestActivityCompletion = (activityId: string) => (
    updateProgress('complete_activity', activityId)
  );

  return (
    <div className="space-y-4">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[#001a33]">
          <ListChecks size={16} className="text-emerald-600" />
          Atividades desta etapa
        </h4>
        <p className="mt-1 text-xs font-bold text-slate-500">
          {selectedLesson?.titulo
            ? `Responda as atividades vinculadas a "${selectedLesson.titulo}" antes de avançar.`
            : 'Selecione uma etapa para visualizar as atividades vinculadas.'}
        </p>
      </div>

      {!activityConfigurationValidation.isConfigurationValid && selectedLessonActivities.length > 0 && (
        <div role="alert" className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">
          <AlertCircle className="mt-0.5 shrink-0" size={16} />
          As atividades do curso possuem identificadores, títulos ou enunciados inválidos. O envio foi bloqueado; avise o suporte.
        </div>
      )}

      {selectedLessonActivities.length === 0 ? (
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-8 text-center">
          <FileText className="mx-auto mb-3 text-slate-300" size={34} />
          <p className="text-sm font-bold text-slate-500">Esta etapa ainda não possui atividades cadastradas.</p>
        </div>
      ) : selectedLessonActivities.map(({ atividade, activityIndex, linkedLessonIndex }: any) => {
        const activityIdValid = activityConfigurationValidation.isConfigurationValid;
        const activityTextValid = !activityConfigurationValidation.invalidTextIndexes.has(activityIndex);
        const activityTitle = activityTextValid ? atividade.titulo.trim() : 'Atividade com configuração inválida';
        const activityPrompt = activityTextValid ? atividade.enunciado.trim() : 'O enunciado desta atividade não está disponível.';
        const choiceData = getActivityChoiceData(atividade);
        const expectsChoiceAnswer = isEadChoiceActivity(atividade);
        const activityDone = progress.completedActivityIds.includes(atividade.id);
        const answerSavePending = isProgressUpdatePending('set_activity_answer', atividade.id);
        const completionPending = isProgressUpdatePending('complete_activity', atividade.id);
        const draftKey = getEadActivityDraftKey(
          progressContextKey || selectedCourse?.id || '',
          activityIndex,
          atividade.id,
        );
        const persistedAnswer = progress.activityAnswers[atividade.id] ?? '';
        const currentAnswer = activityDone ? persistedAnswer : activityAnswerDrafts[draftKey] ?? persistedAnswer;
        const authoritativeFeedback = assessmentFeedback?.activities?.[atividade.id];
        const feedback = choiceData
          ? getEadAnswerFeedback(currentAnswer, authoritativeFeedback, choiceData.opcoes.length)
          : null;
        const persistedFeedback = choiceData
          ? getEadAnswerFeedback(persistedAnswer, authoritativeFeedback, choiceData.opcoes.length)
          : null;
        const answerPersisted = currentAnswer === persistedAnswer;
        const domKey = draftKey.replace(/[^a-zA-Z0-9_-]/g, '-');
        const questionId = `atividade-enunciado-${domKey}`;
        const feedbackId = `atividade-feedback-${domKey}`;

        return (
          <section key={draftKey} className="space-y-3 rounded-3xl border border-emerald-100 bg-emerald-50/35 p-4">
            <div className="flex justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#001a33]">{activityTitle}</p>
                {linkedLessonIndex >= 0 && (
                  <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                    Etapa {linkedLessonIndex + 1}
                    {conteudos[linkedLessonIndex]?.etapa && ` • ${conteudos[linkedLessonIndex].etapa}`}
                  </p>
                )}
                <p id={questionId} className="mt-1 text-xs font-medium text-slate-600">
                  {activityPrompt}
                </p>
              </div>
              {activityDone && (
                <span className="inline-flex h-max shrink-0 items-center gap-1 rounded-xl bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-800">
                  <CheckCircle2 size={13} />
                  Concluída
                </span>
              )}
            </div>

            {!activityIdValid && (
              <div role="alert" className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                <AlertCircle className="mt-0.5 shrink-0" size={16} />
                Nenhuma atividade pode ser enviada enquanto a configuração global do curso estiver inválida.
              </div>
            )}

            {choiceData ? (
              <>
                {authoritativeFeedback?.submitted && !feedback?.hasValidCorrection && (
                  <div role="alert" className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                    <AlertCircle className="mt-0.5 shrink-0" size={16} />
                    A correção desta resposta não pôde ser carregada. Atualize o progresso ou avise o suporte.
                  </div>
                )}
                <fieldset
                  aria-describedby={activityIdValid && feedback?.submitted && feedback.hasValidCorrection
                    ? feedbackId
                    : undefined}
                  aria-busy={answerSavePending}
                  className="grid grid-cols-1 gap-2"
                >
                  <legend className="sr-only">{activityPrompt || activityTitle}</legend>
                  {choiceData.opcoes.map((opcao: string, idx: number) => {
                    const revealAnswer = Boolean(activityIdValid && feedback?.submitted && feedback.hasValidCorrection);
                    const optionState = feedback
                      ? getEadOptionFeedbackState(feedback, idx, revealAnswer)
                      : 'neutral';
                    const selected = feedback?.selectedIndex === idx;
                    const optionDisabled = activityDone || !activityIdValid
                      || answerSavePending || completionPending;
                    return (
                      <label key={`${draftKey}-${idx}`} className={optionDisabled ? 'cursor-default' : 'cursor-pointer'}>
                        <input
                          type="radio"
                          name={`atividade-${domKey}`}
                          value={idx}
                          checked={selected}
                          disabled={optionDisabled}
                          onChange={() => {
                            const answer = String(idx);
                            setActivityAnswerDraft(draftKey, answer);
                            requestActivityAnswerSave(draftKey, atividade.id, answer);
                          }}
                          className="peer sr-only"
                        />
                        <span className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 ${optionStateClasses[optionState]}`}>
                          <span>{opcao}</span>
                          {optionState === 'correct' && (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-emerald-800">
                              {selected ? 'Sua resposta · correta' : 'Resposta correta'}
                            </span>
                          )}
                          {optionState === 'incorrect' && (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-red-700">
                              Sua resposta · incorreta
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                {!activityDone && activityIdValid && feedback?.hasAnswered && !answerPersisted && (
                  <button
                    type="button"
                    disabled={answerSavePending || completionPending}
                    onClick={() => requestActivityAnswerSave(draftKey, atividade.id, currentAnswer)}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {answerSavePending
                      ? <Loader2 size={14} className="animate-spin" />
                      : <CheckCircle2 size={14} />}
                    {answerSavePending
                      ? 'Salvando resposta'
                      : quizError ? 'Tentar salvar resposta' : 'Salvar resposta'}
                  </button>
                )}

                {activityIdValid && feedback?.submitted && feedback.hasValidCorrection && (
                  <div
                    id={feedbackId}
                    role="status"
                    aria-live="polite"
                    className={`rounded-2xl border p-4 ${feedback.isCorrect === true ? 'border-emerald-200 bg-white' : 'border-red-200 bg-red-50'}`}
                  >
                    <div className="flex items-start gap-2">
                      {feedback.isCorrect === true
                        ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={17} />
                        : <CircleX className="mt-0.5 shrink-0 text-red-600" size={17} />}
                      <div>
                        <p className={`text-xs font-black ${feedback.isCorrect === true ? 'text-emerald-800' : 'text-red-800'}`}>
                          {feedback.isCorrect === true ? 'Você acertou.' : 'Você errou.'}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          {feedback.isCorrect === true
                            ? 'A resposta está correta. Agora você pode concluir esta atividade.'
                            : 'Sua resposta ficou vermelha e a alternativa correta está marcada em verde. Tente novamente.'}
                        </p>
                      </div>
                    </div>
                    {feedback.isCorrect === true && !activityDone && (
                      <button
                        type="button"
                        disabled={completionPending || answerSavePending}
                        onClick={() => persistedFeedback?.isCorrect === true
                          ? requestActivityCompletion(atividade.id)
                          : requestActivityAnswerSave(draftKey, atividade.id, currentAnswer)}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:cursor-wait disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        {(completionPending || answerSavePending)
                          ? <Loader2 size={14} className="animate-spin" />
                          : <CheckCircle2 size={14} />}
                        {completionPending
                          ? 'Concluindo atividade'
                          : answerSavePending
                            ? 'Salvando resposta'
                            : persistedFeedback?.isCorrect === true
                              ? 'Marcar como concluída'
                              : quizError ? 'Tentar salvar resposta' : 'Salvar resposta'}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : expectsChoiceAnswer ? (
              <div role="alert" className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                <AlertCircle className="mt-0.5 shrink-0" size={16} />
                Esta atividade objetiva está sem alternativas. Avise o suporte antes de continuar.
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  rows={3}
                  value={currentAnswer}
                  aria-labelledby={questionId}
                  aria-busy={answerSavePending}
                  disabled={activityDone || !activityIdValid || completionPending}
                  onChange={(event) => {
                    const answer = event.target.value;
                    setActivityAnswerDraft(draftKey, answer);
                  }}
                  onBlur={(event) => !completionPending
                    && (answerSavePending || event.currentTarget.value !== persistedAnswer)
                    && requestActivityAnswerSave(draftKey, atividade.id, event.currentTarget.value)}
                  placeholder="Escreva sua resposta aqui"
                  className="w-full resize-none rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-xs font-medium outline-none focus:border-emerald-400 disabled:cursor-default disabled:bg-slate-50"
                />
                <button
                  type="button"
                  disabled={activityDone || !activityIdValid || !currentAnswer.trim()
                    || completionPending || answerSavePending}
                  onClick={() => {
                    if (!answerPersisted) requestActivityAnswerSave(draftKey, atividade.id, currentAnswer);
                    else requestActivityCompletion(atividade.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {(answerSavePending || completionPending) && !activityDone
                    ? <Loader2 size={14} className="animate-spin" />
                    : <CheckCircle2 size={14} />}
                  {activityDone
                    ? 'Atividade concluída'
                    : completionPending
                      ? 'Concluindo atividade'
                      : answerSavePending
                        ? 'Salvando resposta'
                        : !answerPersisted
                          ? quizError ? 'Tentar salvar resposta' : 'Salvar resposta'
                          : 'Marcar como concluída'}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

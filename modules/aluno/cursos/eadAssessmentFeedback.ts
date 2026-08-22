const parseEadOptionIndex = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const normalizeEadActivityType = (activity: any) => String(activity?.tipo || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export const isEadChoiceActivity = (activity: any) => {
  const normalizedType = normalizeEadActivityType(activity);
  const hasChoiceType = ['multipla', 'objetiva', 'selecao', 'quiz'].some(type => normalizedType.includes(type));
  const hasOpenType = ['reflex', 'discurs', 'aberta', 'texto'].some(type => normalizedType.includes(type));
  const hasOptions = Array.isArray(activity?.opcoes) && activity.opcoes.length > 0;
  if (hasOpenType) return false;
  return hasChoiceType || hasOptions;
};

export const getActivityChoiceData = (activity: any) => {
  const options = activity?.opcoes;
  const hasValidOptions = Array.isArray(options)
    && options.length >= 2
    && options.every(option => typeof option === 'string' && option.trim().length > 0);
  if (!isEadChoiceActivity(activity) || !hasValidOptions) {
    return null;
  }
  return {
    enunciado: activity.enunciado,
    opcoes: activity.opcoes,
  };
};

export interface EadIdentifierValidation {
  hasValidIds: boolean;
  invalidIndexes: Set<number>;
  normalizedIds: Array<string | null>;
}

export interface EadActivityConfigurationValidation extends EadIdentifierValidation {
  hasValidTexts: boolean;
  invalidTextIndexes: Set<number>;
  isConfigurationValid: boolean;
}

export const getEadIdentifierValidation = (items: any[]): EadIdentifierValidation => {
  const normalizedIds = items.map((item) => {
    const id = item?.id;
    return typeof id === 'string' && id.length > 0 && id === id.trim() ? id : null;
  });
  const occurrences = new Map<string, number>();
  normalizedIds.forEach((id) => {
    if (id) occurrences.set(id, (occurrences.get(id) || 0) + 1);
  });
  const invalidIndexes = new Set<number>();
  normalizedIds.forEach((id, index) => {
    if (!id || occurrences.get(id) !== 1) invalidIndexes.add(index);
  });
  return {
    hasValidIds: invalidIndexes.size === 0,
    invalidIndexes,
    normalizedIds,
  };
};

export const getEadActivityConfigurationValidation = (
  activities: any[],
): EadActivityConfigurationValidation => {
  const identifierValidation = getEadIdentifierValidation(activities);
  const invalidTextIndexes = new Set<number>();
  activities.forEach((activity, index) => {
    const hasValidTitle = typeof activity?.titulo === 'string' && activity.titulo.trim().length > 0;
    const hasValidPrompt = typeof activity?.enunciado === 'string' && activity.enunciado.trim().length > 0;
    if (!hasValidTitle || !hasValidPrompt) invalidTextIndexes.add(index);
  });
  const hasValidTexts = invalidTextIndexes.size === 0;
  return {
    ...identifierValidation,
    hasValidTexts,
    invalidTextIndexes,
    isConfigurationValid: identifierValidation.hasValidIds && hasValidTexts,
  };
};

export interface EadAnswerFeedback {
  submitted: boolean;
  selectedIndex: number | null;
  correctIndex: number | null;
  hasAnswered: boolean;
  hasValidCorrection: boolean;
  isCorrect: boolean | null;
}

export interface EadAuthoritativeAnswerFeedback {
  submitted?: unknown;
  selectedIndex?: unknown;
  correctIndex?: unknown;
  isCorrect?: unknown;
}

const isEadFeedbackRecord = (value: unknown): value is Record<string, any> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isEadFeedbackIndex = (value: unknown) => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);

const hasEadAuthoritativeSummaryFields = (summary: Record<string, any>) => (
  ['canTakeQuiz', 'allLessonsDone', 'allActivitiesDone', 'allVideosDone', 'quizRetryBlocked', 'quizPassed']
    .every(field => typeof summary[field] === 'boolean')
  && isEadFeedbackIndex(summary.questionsTotal)
  && isEadFeedbackIndex(summary.minimumQuestions)
);

const isEadActivityFeedbackPayload = (value: unknown) => {
  if (!isEadFeedbackRecord(value) || value.submitted !== true) return false;
  const isOpenFeedback = value.selectedIndex === null
    && value.correctIndex === null
    && value.isCorrect === null;
  const isChoiceFeedback = isEadFeedbackIndex(value.selectedIndex)
    && isEadFeedbackIndex(value.correctIndex)
    && typeof value.isCorrect === 'boolean'
    && value.isCorrect === (value.selectedIndex === value.correctIndex);
  return isOpenFeedback || isChoiceFeedback;
};

const isEadQuizQuestionFeedbackPayload = (value: unknown) => (
  isEadFeedbackRecord(value)
  && isEadFeedbackIndex(value.selectedIndex)
  && isEadFeedbackIndex(value.correctIndex)
  && typeof value.isCorrect === 'boolean'
  && value.isCorrect === (value.selectedIndex === value.correctIndex)
);

export const isEadAssessmentFeedbackPayload = (value: any) => {
  const activities = value?.activities;
  const quiz = value?.quiz;
  if (!isEadFeedbackRecord(activities)
    || !Object.values(activities).every(isEadActivityFeedbackPayload)
    || !isEadFeedbackRecord(quiz)
  ) return false;
  if (typeof quiz.submitted !== 'boolean'
    || !(quiz.score === null || typeof quiz.score === 'number'
      && Number.isFinite(quiz.score) && quiz.score >= 0 && quiz.score <= 100)
    || typeof quiz.passed !== 'boolean'
    || !isEadFeedbackRecord(quiz.results)
    || !Object.values(quiz.results).every(isEadQuizQuestionFeedbackPayload)
  ) return false;
  if (!quiz.submitted) {
    return quiz.score === null && quiz.passed === false && Object.keys(quiz.results).length === 0;
  }
  return quiz.score !== null;
};

export const isEadProgressStatePayload = (value: any) => (
  isEadFeedbackRecord(value)
  && isEadFeedbackRecord(value.progress)
  && isEadFeedbackRecord(value.summary)
  && hasEadAuthoritativeSummaryFields(value.summary)
  && isEadAssessmentFeedbackPayload(value.assessmentFeedback)
);

export type EadOptionFeedbackState = 'neutral' | 'selected' | 'correct' | 'incorrect';

export const getEadAnswerFeedback = (
  selectedAnswer: unknown,
  authoritativeFeedback: EadAuthoritativeAnswerFeedback | null | undefined,
  optionsTotal: number,
): EadAnswerFeedback => {
  const selectedIndex = parseEadOptionIndex(selectedAnswer);
  const hasAnswered = selectedIndex !== null && selectedIndex < optionsTotal;
  const submittedIndex = parseEadOptionIndex(authoritativeFeedback?.selectedIndex);
  const submitted = authoritativeFeedback?.submitted === true
    && hasAnswered
    && submittedIndex === selectedIndex;
  const correctIndex = submitted ? parseEadOptionIndex(authoritativeFeedback?.correctIndex) : null;
  const hasValidCorrection = submitted && correctIndex !== null && correctIndex < optionsTotal;
  const isCorrect = submitted && typeof authoritativeFeedback?.isCorrect === 'boolean'
    ? authoritativeFeedback.isCorrect
    : null;
  return {
    submitted,
    selectedIndex: hasAnswered ? selectedIndex : null,
    correctIndex: hasValidCorrection ? correctIndex : null,
    hasAnswered,
    hasValidCorrection,
    isCorrect,
  };
};

export const getEadQuizAnswerProgress = (
  questions: any[],
  answers: Record<string, unknown>,
) => {
  const identifierValidation = getEadIdentifierValidation(questions);
  const answeredQuestions = questions.filter((question, index) => {
    if (identifierValidation.invalidIndexes.has(index)) return false;
    const selectedIndex = parseEadOptionIndex(answers[question.id]);
    const optionsTotal = Array.isArray(question?.shuffledOptions) ? question.shuffledOptions.length : 0;
    return selectedIndex !== null && selectedIndex < optionsTotal;
  }).length;
  const totalQuestions = questions.length;
  const hasValidQuestionPrompts = questions.every(
    question => typeof question?.pergunta === 'string' && question.pergunta.trim().length > 0,
  );
  const hasValidOptions = questions.every((question) => {
    const options = Array.isArray(question?.shuffledOptions) ? question.shuffledOptions : [];
    if (options.length < 2) return false;
    if (!options.every((option: any) => typeof option?.label === 'string' && option.label.trim().length > 0)) {
      return false;
    }
    const indexes = options.map((option: any) => parseEadOptionIndex(option?.originalIndex));
    return indexes.every(index => index !== null && index < options.length)
      && new Set(indexes).size === options.length;
  });
  const isConfigurationValid = totalQuestions > 0
    && identifierValidation.hasValidIds
    && hasValidQuestionPrompts
    && hasValidOptions;
  return {
    answeredQuestions,
    totalQuestions,
    hasValidQuestionIds: identifierValidation.hasValidIds,
    hasValidQuestionPrompts,
    hasValidOptions,
    isConfigurationValid,
    allQuestionsAnswered: isConfigurationValid && answeredQuestions === totalQuestions,
  };
};

export const getEadQuizSubmissionAnswers = (
  questions: any[],
  answers: Record<string, number>,
) => Object.fromEntries(questions.flatMap((question) => {
  const id = question?.id;
  return typeof id === 'string' && id.length > 0 && id === id.trim()
    ? [[id, answers[id]]]
    : [];
}));

export const getEadOptionFeedbackState = (
  feedback: EadAnswerFeedback,
  optionIndex: number,
  revealCorrectAnswer: boolean,
): EadOptionFeedbackState => {
  if (revealCorrectAnswer && feedback.hasValidCorrection && optionIndex === feedback.correctIndex) return 'correct';
  if (feedback.hasAnswered && optionIndex === feedback.selectedIndex) {
    return revealCorrectAnswer && feedback.hasValidCorrection ? 'incorrect' : 'selected';
  }
  return 'neutral';
};

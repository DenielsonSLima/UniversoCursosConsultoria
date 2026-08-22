import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActivityChoiceData,
  getEadActivityConfigurationValidation,
  getEadAnswerFeedback,
  getEadOptionFeedbackState,
  getEadQuizAnswerProgress,
  getEadQuizSubmissionAnswers,
  isEadAssessmentFeedbackPayload,
  isEadChoiceActivity,
  isEadProgressStatePayload,
} from './eadAssessmentFeedback.ts';

test('atividade errada destaca a escolha em vermelho e a alternativa correta em verde', () => {
  const feedback = getEadAnswerFeedback('2', {
    submitted: true,
    selectedIndex: 2,
    correctIndex: 1,
    isCorrect: false,
  }, 4);

  assert.equal(feedback.submitted, true);
  assert.equal(feedback.hasAnswered, true);
  assert.equal(feedback.hasValidCorrection, true);
  assert.equal(feedback.isCorrect, false);
  assert.equal(getEadOptionFeedbackState(feedback, 2, true), 'incorrect');
  assert.equal(getEadOptionFeedbackState(feedback, 1, true), 'correct');
  assert.equal(getEadOptionFeedbackState(feedback, 0, true), 'neutral');
});

test('atividade correta mantém confirmação positiva e permite conclusão', () => {
  const feedback = getEadAnswerFeedback('1', {
    submitted: true,
    selectedIndex: 1,
    correctIndex: 1,
    isCorrect: true,
  }, 4);

  assert.equal(feedback.isCorrect, true);
  assert.equal(getEadOptionFeedbackState(feedback, 1, true), 'correct');
});

test('prova em andamento mostra apenas a alternativa selecionada', () => {
  const feedback = getEadAnswerFeedback(3, null, 4);

  assert.equal(feedback.submitted, false);
  assert.equal(getEadOptionFeedbackState(feedback, 3, false), 'selected');
  assert.equal(getEadOptionFeedbackState(feedback, 1, false), 'neutral');
});

test('feedback ausente ou inválido nunca revela a primeira alternativa', () => {
  const feedback = getEadAnswerFeedback('0', {
    submitted: true,
    selectedIndex: 0,
    correctIndex: -1,
    isCorrect: false,
  }, 2);
  assert.equal(feedback.hasValidCorrection, false);
  assert.equal(feedback.isCorrect, false);
  assert.equal(getEadOptionFeedbackState(feedback, 0, true), 'selected');
});

test('feedback autoritativo rejeita coerções de índice', () => {
  for (const invalid of [' ', '01', '1.0', '1e0', false, true, -1, 1.5, Number.POSITIVE_INFINITY]) {
    const feedback = getEadAnswerFeedback(0, {
      submitted: true,
      selectedIndex: 0,
      correctIndex: invalid,
      isCorrect: false,
    }, 2);
    assert.equal(feedback.hasValidCorrection, false, `valor deveria ser inválido: ${String(invalid)}`);
  }
});

test('feedback de uma resposta anterior não corrige um novo rascunho local', () => {
  const feedback = getEadAnswerFeedback(0, {
    submitted: true,
    selectedIndex: 1,
    correctIndex: 1,
    isCorrect: true,
  }, 2);
  assert.equal(feedback.submitted, false);
  assert.equal(feedback.correctIndex, null);
  assert.equal(getEadOptionFeedbackState(feedback, 0, true), 'selected');
});

test('contrato autoritativo exige feedback completo sem depender do ead_config', () => {
  assert.equal(isEadAssessmentFeedbackPayload({
    activities: {},
    quiz: { submitted: false, score: null, passed: false, results: {} },
  }), true);
  assert.equal(isEadAssessmentFeedbackPayload({
    activities: {
      objetiva: { submitted: true, selectedIndex: 1, correctIndex: 0, isCorrect: false },
      aberta: { submitted: true, selectedIndex: null, correctIndex: null, isCorrect: null },
    },
    quiz: {
      submitted: true,
      score: 80,
      passed: true,
      results: { q1: { selectedIndex: 1, correctIndex: 1, isCorrect: true } },
    },
  }), true);
  assert.equal(isEadAssessmentFeedbackPayload({ activities: {}, quiz: { submitted: false } }), false);
  assert.equal(isEadAssessmentFeedbackPayload({
    activities: { a1: { submitted: true, selectedIndex: '1', correctIndex: 1, isCorrect: true } },
    quiz: { submitted: false, score: null, passed: false, results: {} },
  }), false);
  assert.equal(isEadAssessmentFeedbackPayload({
    activities: { a1: { submitted: true, selectedIndex: 0, correctIndex: 1, isCorrect: true } },
    quiz: { submitted: false, score: null, passed: false, results: {} },
  }), false);
  assert.equal(isEadAssessmentFeedbackPayload({
    activities: {},
    quiz: { submitted: false, score: 0, passed: false, results: {} },
  }), false);
});

test('fotografia autoritativa exige progresso, resumo e feedback no mesmo payload', () => {
  const assessmentFeedback = {
    activities: {},
    quiz: { submitted: false, score: null, passed: false, results: {} },
  };
  const summary = {
    canTakeQuiz: false,
    allLessonsDone: false,
    allActivitiesDone: false,
    allVideosDone: false,
    quizRetryBlocked: false,
    quizPassed: false,
    questionsTotal: 10,
    minimumQuestions: 10,
  };
  assert.equal(isEadProgressStatePayload({ progress: {}, summary, assessmentFeedback }), true);
  assert.equal(isEadProgressStatePayload({ summary: {}, assessmentFeedback }), false);
  assert.equal(isEadProgressStatePayload({ progress: {}, assessmentFeedback }), false);
  assert.equal(isEadProgressStatePayload({ progress: {}, summary: {} }), false);
  assert.equal(isEadProgressStatePayload({
    progress: {},
    summary: { ...summary, canTakeQuiz: 1 },
    assessmentFeedback,
  }), false);
  assert.equal(isEadProgressStatePayload({
    progress: {},
    summary: { ...summary, questionsTotal: -1 },
    assessmentFeedback,
  }), false);
});

test('atividade reflexiva não reutiliza questões nem correção da prova final', () => {
  assert.equal(getActivityChoiceData({ tipo: 'reflexao', enunciado: 'Explique sua resposta.' }), null);
  assert.equal(getActivityChoiceData({
    tipo: 'reflexão',
    opcoes: ['Legada A', 'Legada B'],
  }), null);
});

test('prova incompleta não fica pronta para envio', () => {
  const questions = [
    { id: 'q1', pergunta: 'Questão 1', shuffledOptions: [{ label: 'A', originalIndex: 0 }, { label: 'B', originalIndex: 1 }] },
    { id: 'q2', pergunta: 'Questão 2', shuffledOptions: [{ label: 'A', originalIndex: 0 }, { label: 'B', originalIndex: 1 }] },
  ];

  assert.deepEqual(getEadQuizAnswerProgress(questions, { q1: 0 }), {
    answeredQuestions: 1,
    totalQuestions: 2,
    hasValidQuestionIds: true,
    hasValidQuestionPrompts: true,
    hasValidOptions: true,
    isConfigurationValid: true,
    allQuestionsAnswered: false,
  });
  assert.equal(getEadQuizAnswerProgress(questions, { q1: 0, q2: 1 }).allQuestionsAnswered, true);
});

test('prova bloqueia IDs vazios ou duplicados e não conta uma resposta compartilhada duas vezes', () => {
  const duplicateQuestions = [
    { id: 'q1', shuffledOptions: [{ originalIndex: 0 }, { originalIndex: 1 }] },
    { id: 'q1', shuffledOptions: [{ originalIndex: 0 }, { originalIndex: 1 }] },
  ];
  const duplicated = getEadQuizAnswerProgress(duplicateQuestions, { q1: 0 });
  assert.equal(duplicated.hasValidQuestionIds, false);
  assert.equal(duplicated.answeredQuestions, 0);
  assert.equal(duplicated.isConfigurationValid, false);
  assert.equal(duplicated.allQuestionsAnswered, false);

  const missing = getEadQuizAnswerProgress([
    { id: '  ', shuffledOptions: [{ originalIndex: 0 }, { originalIndex: 1 }] },
  ], {});
  assert.equal(missing.hasValidQuestionIds, false);
  assert.equal(missing.allQuestionsAnswered, false);
});

test('prova bloqueia alternativas insuficientes ou índices originais duplicados', () => {
  const insufficient = getEadQuizAnswerProgress([
    { id: 'q1', shuffledOptions: [{ originalIndex: 0 }] },
  ], { q1: 0 });
  assert.equal(insufficient.hasValidOptions, false);
  assert.equal(insufficient.isConfigurationValid, false);

  const duplicatedIndexes = getEadQuizAnswerProgress([
    { id: 'q1', shuffledOptions: [{ originalIndex: 0 }, { originalIndex: 0 }] },
  ], { q1: 0 });
  assert.equal(duplicatedIndexes.hasValidOptions, false);
  assert.equal(duplicatedIndexes.allQuestionsAnswered, false);

  const emptyLabel = getEadQuizAnswerProgress([
    { id: 'q1', shuffledOptions: [{ label: 'A', originalIndex: 0 }, { label: ' ', originalIndex: 1 }] },
  ], { q1: 0 });
  assert.equal(emptyLabel.hasValidOptions, false);

  const invalidPrompt = getEadQuizAnswerProgress([
    { id: 'q1', pergunta: { texto: 'Inválida' }, shuffledOptions: [{ label: 'A', originalIndex: 0 }, { label: 'B', originalIndex: 1 }] },
  ], { q1: 0 });
  assert.equal(invalidPrompt.hasValidQuestionPrompts, false);
  assert.equal(invalidPrompt.isConfigurationValid, false);
});

test('atividade objetiva sem alternativas não cai no campo reflexivo', () => {
  assert.equal(isEadChoiceActivity({ tipo: 'múltipla escolha' }), true);
  assert.equal(isEadChoiceActivity({ tipo: 'objetiva' }), true);
  assert.equal(isEadChoiceActivity({ tipo: 'reflexao' }), false);
});

test('atividade objetiva exige ao menos duas alternativas textuais preenchidas', () => {
  assert.equal(getActivityChoiceData({ tipo: 'objetiva', opcoes: ['Única'] }), null);
  assert.equal(getActivityChoiceData({ tipo: 'objetiva', opcoes: ['A', ' '] }), null);
  assert.deepEqual(
    getActivityChoiceData({ tipo: 'objetiva', enunciado: 'Escolha', opcoes: ['A', 'B'] }),
    { enunciado: 'Escolha', opcoes: ['A', 'B'] },
  );
});

test('atividades bloqueiam globalmente IDs repetidos e textos inválidos', () => {
  const validation = getEadActivityConfigurationValidation([
    { id: 'duplicada', titulo: 'Atividade 1', enunciado: 'Pergunta 1' },
    { id: 'duplicada', titulo: 'Atividade 2', enunciado: 'Pergunta 2' },
    { id: 'unica', titulo: { texto: 'Inválido' }, enunciado: 'Pergunta 3' },
  ]);

  assert.equal(validation.hasValidIds, false);
  assert.deepEqual([...validation.invalidIndexes], [0, 1]);
  assert.equal(validation.hasValidTexts, false);
  assert.deepEqual([...validation.invalidTextIndexes], [2]);
  assert.equal(validation.isConfigurationValid, false);
});

test('atividade válida exige título e enunciado textuais preenchidos', () => {
  const validation = getEadActivityConfigurationValidation([
    { id: 'atividade-1', titulo: 'Atividade 1', enunciado: 'Explique sua resposta.' },
  ]);
  assert.equal(validation.isConfigurationValid, true);
});

test('payload da prova contém somente IDs da configuração exibida', () => {
  assert.deepEqual(
    getEadQuizSubmissionAnswers([{ id: 'q1' }, { id: 'q2' }], { q1: 0, q2: 1, antiga: 2 }),
    { q1: 0, q2: 1 },
  );
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { diplomaService } from '../../../gestor/cadastros/modelos-documentos/diploma/diploma.service';
import type { CertificadoAcademico } from '../../../gestor/secretaria/certificados/certificados.types';
import {
  getStudentCourseAccessKey,
  recordStudentCourseAccess,
  type StudentCourseAccessItem,
} from '../courseAccessHistory';
import type { CourseContentTab, EadProgressState, LearningTab } from '../cursosPage.types';
import {
  getEadActivityConfigurationValidation,
  isEadProgressStatePayload,
} from '../eadAssessmentFeedback';
import {
  createEadProgressOperationQueue,
  flushEadActivityDraftSaves,
  getEadActivityDraftKey,
  getEadDraftsAfterConfirmedSave,
  getEadProgressAvailability,
  getEadProgressOperationKey,
  getPendingEadActivityDraftSaves,
  getEadRetryReleaseToken,
  getEadServerConfirmedRetryUnlockToken,
  type EadProgressOperationInput,
  type EadProgressOperationQueue,
  type EadProgressOperationSnapshot,
} from '../eadAssessmentRuntime';
import {
  MAIN_EAD_VIDEO_ID,
  buildEadGradeCurricular,
  formatCountdown,
  getActivityLessonIndex,
  getLegacyMainVideoLesson,
  getLessonDisplayText,
  getMainCourseVideoUrl,
  hasEadAccess,
  hashString,
  normalizeEadProgressState,
  shuffleWithSeed,
} from '../cursosPage.utils';

interface UseEadLearningInput {
  alunoId?: string;
  hasAlunoContext: boolean;
  selectedCourse: any | null;
  queryClient: QueryClient;
}

export const useEadLearning = ({ alunoId, hasAlunoContext, selectedCourse, queryClient }: UseEadLearningInput) => {
  const progressContextKey = alunoId && selectedCourse?.id ? `${alunoId}:${selectedCourse.id}` : '';
  const [activeLearningTab, setActiveLearningTabState] = useState<LearningTab>('video');
  const [activeCourseContentTab, setActiveCourseContentTabState] = useState<CourseContentTab>('aulas');
  const [selectedLessonIdx, setSelectedLessonIdxState] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSeed, setQuizSeed] = useState(() => Date.now());
  const [quizNowMs, setQuizNowMs] = useState(() => Date.now());
  const [quizError, setQuizError] = useState('');
  const [activityAnswerDrafts, setActivityAnswerDraftsState] = useState<Record<string, string>>({});
  const activityAnswerDraftsRef = useRef<Record<string, string>>({});
  const [showCompletedLessons, setShowCompletedLessons] = useState(false);
  const [progressOperationSnapshot, setProgressOperationSnapshot] = useState<EadProgressOperationSnapshot>({
    pendingCount: 0,
    pendingKeys: [],
  });
  const lastRecordedSelectedCourseKeyRef = useRef<string | null>(null);
  const selectedProgressContextRef = useRef<string | null>(
    alunoId && selectedCourse?.id ? `${alunoId}:${selectedCourse.id}` : null,
  );
  const retryRefreshRequestedRef = useRef<string | null>(null);
  const retryUnlockedRef = useRef<string | null>(null);
  const retryServerStateRef = useRef<{ courseId: string | null; blocked: boolean }>({
    courseId: selectedCourse?.id || null,
    blocked: false,
  });
  const progressOperationExecutorRef = useRef<(input: EadProgressOperationInput) => Promise<EadProgressState>>(
    async () => { throw new Error('Atualização do progresso EAD ainda não inicializada.'); },
  );
  const progressOperationQueueRef = useRef<EadProgressOperationQueue<EadProgressState> | null>(null);
  if (!progressOperationQueueRef.current) {
    progressOperationQueueRef.current = createEadProgressOperationQueue(
      input => progressOperationExecutorRef.current(input),
    );
  }
  const progressOperationQueue = progressOperationQueueRef.current;
  selectedProgressContextRef.current = alunoId && selectedCourse?.id ? `${alunoId}:${selectedCourse.id}` : null;
  const setActivityAnswerDraft = useCallback((draftKey: string, answer: string) => {
    activityAnswerDraftsRef.current = { ...activityAnswerDraftsRef.current, [draftKey]: answer };
    setActivityAnswerDraftsState(previous => ({ ...previous, [draftKey]: answer }));
  }, []);

  useEffect(() => {
    setSelectedLessonIdxState(0);
    setActiveLearningTabState('video');
    setActiveCourseContentTabState('aulas');
    setQuizAnswers({});
    setQuizSeed(Date.now());
    setQuizNowMs(Date.now());
    setQuizError('');
    setShowCompletedLessons(true);
    retryRefreshRequestedRef.current = null;
    retryUnlockedRef.current = null;
    retryServerStateRef.current = { courseId: selectedCourse?.id || null, blocked: false };
  }, [alunoId, selectedCourse?.id]);

  useEffect(() => {
    if (!alunoId || !selectedCourse?.id) return;
    const accessItem: StudentCourseAccessItem = {
      cursoId: selectedCourse.id,
      turmaId: selectedCourse.alunoMatricula?.turmaId || null,
      cursoNome: selectedCourse.nome || 'Curso',
      turmaNome: selectedCourse.alunoMatricula?.turmaNome || null,
      modalidade: selectedCourse.modalidade || null,
      imagemUrl: selectedCourse.imagem_url || null,
    };
    const accessKey = `${alunoId}:${getStudentCourseAccessKey(accessItem)}`;
    if (lastRecordedSelectedCourseKeyRef.current === accessKey) return;
    recordStudentCourseAccess(alunoId, accessItem);
    lastRecordedSelectedCourseKeyRef.current = accessKey;
  }, [alunoId, selectedCourse?.alunoMatricula?.turmaId, selectedCourse?.id]);

  const progressQueryKey = useMemo(
    () => ['ead-aluno-progresso', alunoId, selectedCourse?.id],
    [alunoId, selectedCourse?.id],
  );
  const progressQuery = useQuery<EadProgressState>({
    queryKey: progressQueryKey,
    enabled: hasAlunoContext && !!selectedCourse?.id && hasEadAccess(selectedCourse),
    queryFn: async () => {
      if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
      const { data, error } = await supabase.rpc('ead_get_aluno_progress', {
        p_aluno_id: alunoId,
        p_curso_id: selectedCourse!.id,
      });
      if (error) throw error;
      return data as EadProgressState;
    },
    refetchInterval: selectedCourse?.id ? 30000 : false,
  });
  const hasProgressData = progressQuery.data !== undefined;
  const hasAuthoritativeProgress = isEadProgressStatePayload(progressQuery.data);
  const progressContractError = hasProgressData && !hasAuthoritativeProgress;
  const progressAvailability = getEadProgressAvailability(
    hasAuthoritativeProgress,
    progressQuery.isFetching,
    progressQuery.isError || progressContractError,
  );
  const progressQueryError = progressContractError
    ? 'O servidor retornou um contrato de avaliação incompatível. Atualize novamente ou avise o suporte.'
    : progressQuery.isError
      ? (progressQuery.error as any)?.message || 'Não foi possível carregar seu progresso EAD.'
      : '';
  const refetchProgress = progressQuery.refetch;

  const updateProgressMutation = useMutation<EadProgressState, unknown, EadProgressOperationInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('ead_update_aluno_progress', {
        p_aluno_id: input.alunoId,
        p_curso_id: input.courseId,
        p_action: input.action,
        p_item_id: input.itemId || null,
        p_payload: input.payload || {},
      });
      if (error) throw error;
      return data as EadProgressState;
    },
    onSuccess: (data, input) => {
      const inputQueryKey = ['ead-aluno-progresso', input.alunoId, input.courseId];
      const inputContextKey = `${input.alunoId}:${input.courseId}`;
      queryClient.setQueryData(inputQueryKey, data);
      queryClient.invalidateQueries({ queryKey: inputQueryKey });
      if (selectedProgressContextRef.current === inputContextKey) setQuizError('');
      if (selectedProgressContextRef.current === inputContextKey && data?.summary?.quizRetryBlocked) {
        setQuizAnswers({});
      }
      if (data?.summary?.quizPassed) {
        queryClient.invalidateQueries({ queryKey: ['aluno-certificado-ead', input.alunoId, input.courseId] });
      }
    },
    onError: (error: any, input) => {
      const inputQueryKey = ['ead-aluno-progresso', input.alunoId, input.courseId];
      const inputContextKey = `${input.alunoId}:${input.courseId}`;
      queryClient.invalidateQueries({ queryKey: inputQueryKey });
      if (selectedProgressContextRef.current === inputContextKey) {
        setQuizError(error?.message || 'Não foi possível atualizar seu progresso.');
      }
    },
  });
  progressOperationExecutorRef.current = updateProgressMutation.mutateAsync;

  useEffect(() => progressOperationQueue.subscribe(setProgressOperationSnapshot), [progressOperationQueue]);

  useEffect(() => {
    if (!hasAlunoContext || !alunoId || !selectedCourse?.id) return;
    const channel = supabase
      .channel(`ead_aluno_progresso_${alunoId}_${selectedCourse.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ead_aluno_progresso', filter: `curso_id=eq.${selectedCourse.id}` },
        () => queryClient.invalidateQueries({ queryKey: progressQueryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, hasAlunoContext, progressQueryKey, queryClient, selectedCourse?.id]);

  const eadConfig = selectedCourse?.ead_config || {};
  const conteudos = Array.isArray(eadConfig.conteudos) ? eadConfig.conteudos : [];
  const atividades = Array.isArray(eadConfig.atividades) ? eadConfig.atividades : [];
  const activityConfigurationValidation = useMemo(
    () => getEadActivityConfigurationValidation(atividades),
    [atividades],
  );
  const regras = typeof eadConfig.regras === 'object' && eadConfig.regras !== null ? eadConfig.regras : {};
  const provas = Array.isArray(eadConfig.provas) ? eadConfig.provas : [];
  const currentProva = provas[0];
  const selectedLesson = conteudos[selectedLessonIdx];
  const selectedLessonText = getLessonDisplayText(selectedCourse, selectedLesson, selectedLessonIdx);
  const normalizedProgressState = progressAvailability.isReady && progressQuery.data
    ? normalizeEadProgressState(progressQuery.data)
    : null;
  const progress = normalizedProgressState?.progress;
  const summary = normalizedProgressState?.summary;
  const assessmentFeedback = progressQuery.data?.assessmentFeedback;
  const mainVideoUrl = getMainCourseVideoUrl(eadConfig);
  const legacyMainVideoLesson = getLegacyMainVideoLesson(eadConfig);
  const mainVideoDone = Boolean(progress?.completedVideoIds.includes(MAIN_EAD_VIDEO_ID)
    || (legacyMainVideoLesson?.id ? progress?.completedVideoIds.includes(legacyMainVideoLesson.id) : false));
  const selectedLessonActivities = atividades
    .map((atividade: any, activityIndex: number) => ({
      atividade,
      activityIndex,
      linkedLessonIndex: getActivityLessonIndex(atividade, activityIndex, conteudos),
    }))
    .filter((item: any) => item.linkedLessonIndex === selectedLessonIdx);
  const quizPassed = summary?.quizPassed === true;
  const progressPercent = Number(summary?.progressPercent || 0);
  const allLessonsDone = summary?.allLessonsDone === true;
  const allActivitiesDone = summary?.allActivitiesDone === true;
  const allVideosDone = summary?.allVideosDone === true;
  const questionsTotal = summary?.questionsTotal;
  const minimumQuestions = summary?.minimumQuestions;
  const rawRetryAvailableAtMs = Number(summary?.retryAvailableAt);
  const retryAvailableAtMs = Number.isFinite(rawRetryAvailableAtMs) && rawRetryAvailableAtMs > 0
    ? rawRetryAvailableAtMs
    : null;
  const retryRemainingMs = retryAvailableAtMs ? retryAvailableAtMs - quizNowMs : 0;
  const quizRetryBlocked = summary?.quizRetryBlocked === true;
  const retryCountdownActive = quizRetryBlocked && retryRemainingMs > 0;
  const retryCountdownLabel = quizRetryBlocked
    ? retryCountdownActive ? formatCountdown(retryRemainingMs) : 'Confirmando liberação'
    : '';
  const canTakeQuiz = summary?.canTakeQuiz === true;
  const completedAt = summary?.completedAt || progress?.completedAt;
  const completedAtDate = completedAt ? new Date(Number(completedAt)) : null;
  const startedAtDate = progress?.startedAt ? new Date(Number(progress.startedAt)) : null;
  const completedLessonCount = Array.isArray(progress?.completedContentIds) ? progress.completedContentIds.length : 0;
  const eadGradeCurricular = buildEadGradeCurricular(selectedCourse);

  const { data: alunoCertificado, isLoading: certificateLoading, isError: certificateError } = useQuery<CertificadoAcademico | null>({
    queryKey: ['aluno-certificado-ead', alunoId, selectedCourse?.id],
    enabled: hasAlunoContext && !!selectedCourse?.id && quizPassed,
    queryFn: async () => {
      if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
      const { data, error } = await supabase
        .from('certificados_academicos')
        .select(`
          *,
          aluno:parceiros!certificados_academicos_aluno_id_fkey(nome, cpf_cnpj),
          turma:turmas!certificados_academicos_turma_id_fkey(nome, codigo),
          curso:cursos!certificados_academicos_curso_id_fkey(nome, carga_horaria),
          polo:polos!certificados_academicos_polo_id_fkey(nome, cidade, estado)
        `)
        .eq('aluno_id', alunoId)
        .eq('curso_id', selectedCourse!.id)
        .eq('modalidade', 'EAD')
        .eq('status', 'FINALIZADO')
        .not('codigo_validacao', 'is', null)
        .order('data_conclusao', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as CertificadoAcademico | null;
    },
    refetchInterval: query => query.state.data ? false : 30_000,
  });
  const certificateStatusTitle = certificateError
    ? 'Situação do certificado indisponível'
    : alunoCertificado ? 'Certificado EAD disponível' : 'Certificado pendente na Secretaria';
  const certificateStatusMessage = certificateLoading
    ? 'Consultando a situação do certificado acadêmico.'
    : certificateError
      ? 'Não foi possível consultar o certificado agora. Tente novamente em instantes.'
      : alunoCertificado
        ? `Código de validação: ${alunoCertificado.codigo_validacao || 'gerado na emissão'}`
        : 'Sua conclusão já foi enviada à Secretaria. O documento será liberado após o registro do número, livro e página.';
  const { data: certificateTemplates = [] } = useQuery<any[]>({
    queryKey: ['aluno-certificado-modelos'],
    enabled: !!selectedCourse?.id && quizPassed,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () => diplomaService.getTemplates(),
  });
  const eadCertificateModel = certificateTemplates.find((modelo) =>
    String(modelo.tipoCurso || '').toLocaleLowerCase('pt-BR').includes('ead')
    || String(modelo.modalidade || '').toUpperCase() === 'EAD');
  const randomizedQuizQuestions = useMemo(() => {
    const questoes = Array.isArray(currentProva?.questoes) ? currentProva.questoes : [];
    return shuffleWithSeed(questoes, quizSeed + hashString(selectedCourse?.id || '')).map((questao: any, qIdx: number) => ({
      ...questao,
      originalQuestionIndex: qIdx,
      shuffledOptions: shuffleWithSeed(
        (Array.isArray(questao?.opcoes) ? questao.opcoes : []).map((opcao: string, index: number) => ({ label: opcao, originalIndex: index })),
        quizSeed + hashString(`${questao?.id || qIdx}-${selectedCourse?.id || ''}`),
      ),
    }));
  }, [currentProva, quizSeed, selectedCourse?.id]);
  const displayedQuizAnswers = quizPassed ? (progress?.quizAnswers || quizAnswers) : quizAnswers;
  const retryAvailableLabel = retryAvailableAtMs
    ? new Date(retryAvailableAtMs).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '';
  const retryReleaseToken = getEadRetryReleaseToken(selectedCourse?.id, retryAvailableAtMs, quizNowMs);
  const retryReleaseRefreshing = quizRetryBlocked && retryReleaseToken !== null;

  useEffect(() => {
    if (!selectedCourse?.id || !retryCountdownActive) return;
    const timer = window.setInterval(() => setQuizNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryCountdownActive, selectedCourse?.id]);

  useEffect(() => {
    if (!quizRetryBlocked || !retryReleaseToken || retryRefreshRequestedRef.current === retryReleaseToken) return;
    retryRefreshRequestedRef.current = retryReleaseToken;
    queryClient.invalidateQueries({ queryKey: progressQueryKey });
  }, [progressQueryKey, queryClient, quizRetryBlocked, retryReleaseToken]);

  useEffect(() => {
    const courseId = selectedCourse?.id || null;
    const previous = retryServerStateRef.current;
    const serverUnlockToken = getEadServerConfirmedRetryUnlockToken(
      previous.courseId,
      previous.blocked,
      courseId,
      quizRetryBlocked,
      retryAvailableAtMs,
    );
    retryServerStateRef.current = { courseId, blocked: quizRetryBlocked };
    if (!serverUnlockToken || retryUnlockedRef.current === serverUnlockToken) return;
    retryUnlockedRef.current = serverUnlockToken;
    setQuizSeed(Date.now());
    setQuizAnswers({});
  }, [quizRetryBlocked, retryAvailableAtMs, selectedCourse?.id]);

  const isLessonLocked = (idx: number) => {
    if (!progress) return true;
    if (!regras.liberarSequencialmente || idx === 0) return false;
    return !progress.completedContentIds.includes(conteudos[idx - 1]?.id);
  };
  const activityDraftDescriptors = useMemo(() => {
    if (!activityConfigurationValidation.isConfigurationValid) return [];
    return atividades.flatMap((activity: any, activityIndex: number) => (
      progress?.completedActivityIds.includes(activity.id)
        ? []
        : [{
            draftKey: getEadActivityDraftKey(progressContextKey, activityIndex, activity.id),
            activityId: activity.id as string,
            persistedAnswer: progress?.activityAnswers[activity.id] ?? '',
          }]
    ));
  }, [
    activityConfigurationValidation.isConfigurationValid,
    atividades,
    progress?.activityAnswers,
    progress?.completedActivityIds,
    progressContextKey,
  ]);
  const pendingProgressKeys = useMemo(
    () => new Set(progressOperationSnapshot.pendingKeys),
    [progressOperationSnapshot.pendingKeys],
  );
  const updateProgress = useCallback((
    action: string,
    itemId?: string | null,
    payload?: Record<string, unknown>,
  ) => {
    if (!alunoId || !selectedCourse?.id || !progressAvailability.isReady) {
      const error = new Error(progressAvailability.isReady
        ? 'Aluno ou curso não identificado para atualizar o progresso.'
        : 'Aguarde o carregamento do progresso antes de continuar.');
      setQuizError(error.message);
      const rejected = Promise.reject<EadProgressState>(error);
      void rejected.catch(() => undefined);
      return rejected;
    }
    const operationPromise = progressOperationQueue.enqueue({
      alunoId,
      courseId: selectedCourse.id,
      action,
      itemId,
      payload,
    });
    void operationPromise.catch(() => undefined);
    return operationPromise;
  }, [alunoId, progressAvailability.isReady, progressOperationQueue, selectedCourse?.id]);
  const isProgressUpdatePending = useCallback((action: string, itemId?: string | null) => {
    if (!alunoId || !selectedCourse?.id) return false;
    return pendingProgressKeys.has(getEadProgressOperationKey({
      alunoId,
      courseId: selectedCourse.id,
      action,
      itemId,
    }));
  }, [alunoId, pendingProgressKeys, selectedCourse?.id]);
  const saveActivityAnswer = useCallback((draftKey: string, activityId: string, answer: string) => {
    const draft = { draftKey, activityId, answer };
    const savePromise = updateProgress('set_activity_answer', activityId, { answer }).then((confirmedState) => {
      const confirmedAnswer = confirmedState?.progress?.activityAnswers?.[activityId];
      const currentDraft = activityAnswerDraftsRef.current[draftKey];
      if (confirmedAnswer !== answer && currentDraft === answer) {
        const error = new Error('O servidor não confirmou a revisão enviada. Tente salvar novamente.');
        setQuizError(error.message);
        throw error;
      }
      activityAnswerDraftsRef.current = getEadDraftsAfterConfirmedSave(
        activityAnswerDraftsRef.current,
        draft,
        confirmedAnswer,
      );
      setActivityAnswerDraftsState(previous => (
        getEadDraftsAfterConfirmedSave(previous, draft, confirmedAnswer)
      ));
      return confirmedState;
    });
    void savePromise.catch(() => undefined);
    return savePromise;
  }, [updateProgress]);
  const flushActivityAnswerDrafts = useCallback(async () => {
    if (!progressAvailability.isReady) return true;
    const saves = getPendingEadActivityDraftSaves(activityAnswerDraftsRef.current, activityDraftDescriptors);
    try {
      await flushEadActivityDraftSaves(
        saves,
        draft => saveActivityAnswer(draft.draftKey, draft.activityId, draft.answer),
      );
      return true;
    } catch {
      return false;
    }
  }, [activityDraftDescriptors, progressAvailability.isReady, saveActivityAnswer]);
  const runAfterActivityDraftFlush = useCallback(async (transition: () => void) => {
    const flushed = await flushActivityAnswerDrafts();
    if (flushed) transition();
    return flushed;
  }, [flushActivityAnswerDrafts]);
  const setActiveLearningTab = useCallback((tab: LearningTab) => (
    runAfterActivityDraftFlush(() => setActiveLearningTabState(tab))
  ), [runAfterActivityDraftFlush]);
  const setActiveCourseContentTab = useCallback((tab: CourseContentTab) => (
    runAfterActivityDraftFlush(() => setActiveCourseContentTabState(tab))
  ), [runAfterActivityDraftFlush]);
  const setSelectedLessonIdx = useCallback((index: number) => (
    runAfterActivityDraftFlush(() => setSelectedLessonIdxState(index))
  ), [runAfterActivityDraftFlush]);
  const retryProgress = useCallback(async () => {
    const result = await refetchProgress();
    if (!result.isError) setQuizError('');
    return result;
  }, [refetchProgress]);

  return {
    activeLearningTab, setActiveLearningTab, activeCourseContentTab, setActiveCourseContentTab,
    progressContextKey,
    selectedLessonIdx, setSelectedLessonIdx, quizAnswers, setQuizAnswers, quizError,
    activityAnswerDrafts, setActivityAnswerDraft, saveActivityAnswer, flushActivityAnswerDrafts,
    showCompletedLessons, setShowCompletedLessons,
    conteudos, selectedLesson, selectedLessonText, progress, summary, assessmentFeedback, mainVideoUrl, mainVideoDone,
    selectedLessonActivities, activityConfigurationValidation,
    quizPassed, progressPercent, allLessonsDone, allActivitiesDone, allVideosDone,
    questionsTotal, minimumQuestions, quizRetryBlocked, retryCountdownLabel, canTakeQuiz, completedAtDate,
    startedAtDate, completedLessonCount, eadGradeCurricular, alunoCertificado, certificateStatusTitle,
    certificateStatusMessage, eadCertificateModel, randomizedQuizQuestions, displayedQuizAnswers,
    retryAvailableLabel, retryReleaseRefreshing, isLessonLocked,
    isProgressReady: progressAvailability.isReady,
    isProgressLoading: progressAvailability.isLoading,
    isProgressRefreshing: progressQuery.isFetching,
    progressQueryError,
    retryProgress,
    isUpdatingProgress: progressOperationSnapshot.pendingCount > 0,
    isProgressUpdatePending, updateProgress,
  };
};

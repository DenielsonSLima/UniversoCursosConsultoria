import { useEffect, useMemo, useRef, useState } from 'react';
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
  MAIN_EAD_VIDEO_ID,
  buildEadGradeCurricular,
  emptyProgressState,
  formatCountdown,
  getActivityLessonIndex,
  getCorrectOptionIndex,
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
  const [activeLearningTab, setActiveLearningTab] = useState<LearningTab>('video');
  const [activeCourseContentTab, setActiveCourseContentTab] = useState<CourseContentTab>('aulas');
  const [selectedLessonIdx, setSelectedLessonIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSeed, setQuizSeed] = useState(() => Date.now());
  const [quizNowMs, setQuizNowMs] = useState(() => Date.now());
  const [quizError, setQuizError] = useState('');
  const [showCompletedLessons, setShowCompletedLessons] = useState(false);
  const [activityCompletionPrompt, setActivityCompletionPrompt] = useState<{ activityId: string; title: string } | null>(null);
  const lastRecordedSelectedCourseKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setSelectedLessonIdx(0);
    setActiveLearningTab('video');
    setActiveCourseContentTab('aulas');
    setQuizAnswers({});
    setQuizSeed(Date.now());
    setQuizError('');
    setShowCompletedLessons(true);
    setActivityCompletionPrompt(null);
  }, [selectedCourse?.id]);

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
    const accessKey = getStudentCourseAccessKey(accessItem);
    if (lastRecordedSelectedCourseKeyRef.current === accessKey) return;
    recordStudentCourseAccess(alunoId, accessItem);
    lastRecordedSelectedCourseKeyRef.current = accessKey;
  }, [alunoId, selectedCourse?.alunoMatricula?.turmaId, selectedCourse?.id]);

  useEffect(() => {
    if (!selectedCourse?.id) return;
    const timer = window.setInterval(() => setQuizNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedCourse?.id]);

  const progressQueryKey = useMemo(
    () => ['ead-aluno-progresso', alunoId, selectedCourse?.id],
    [alunoId, selectedCourse?.id],
  );
  const { data: progressState = emptyProgressState } = useQuery<EadProgressState>({
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

  const updateProgressMutation = useMutation({
    mutationFn: async (input: { action: string; itemId?: string | null; payload?: Record<string, any> }) => {
      if (!alunoId) throw new Error('Aluno não identificado para este contexto.');
      const { data, error } = await supabase.rpc('ead_update_aluno_progress', {
        p_aluno_id: alunoId,
        p_curso_id: selectedCourse!.id,
        p_action: input.action,
        p_item_id: input.itemId || null,
        p_payload: input.payload || {},
      });
      if (error) throw error;
      return data as EadProgressState;
    },
    onSuccess: (data) => {
      setQuizError('');
      queryClient.setQueryData(progressQueryKey, data);
      queryClient.invalidateQueries({ queryKey: progressQueryKey });
      if (data.summary?.quizRetryBlocked) {
        setQuizAnswers({});
        setQuizSeed(Date.now());
      }
      if (data.summary?.quizPassed) {
        queryClient.invalidateQueries({ queryKey: ['aluno-certificado-ead', alunoId, selectedCourse?.id] });
      }
    },
    onError: (error: any) => setQuizError(error?.message || 'Não foi possível atualizar seu progresso.'),
  });

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
  const regras = typeof eadConfig.regras === 'object' && eadConfig.regras !== null ? eadConfig.regras : {};
  const provas = Array.isArray(eadConfig.provas) ? eadConfig.provas : [];
  const currentProva = provas[0];
  const selectedLesson = conteudos[selectedLessonIdx];
  const selectedLessonText = getLessonDisplayText(selectedCourse, selectedLesson, selectedLessonIdx);
  const { progress, summary } = normalizeEadProgressState(progressState);
  const mainVideoUrl = getMainCourseVideoUrl(eadConfig);
  const legacyMainVideoLesson = getLegacyMainVideoLesson(eadConfig);
  const mainVideoDone = progress.completedVideoIds.includes(MAIN_EAD_VIDEO_ID)
    || (legacyMainVideoLesson?.id ? progress.completedVideoIds.includes(legacyMainVideoLesson.id) : false);
  const selectedLessonActivities = atividades
    .map((atividade: any, activityIndex: number) => ({
      atividade,
      activityIndex,
      linkedLessonIndex: getActivityLessonIndex(atividade, activityIndex, conteudos),
    }))
    .filter((item: any) => item.linkedLessonIndex === selectedLessonIdx);
  const quizPassed = Boolean(summary.quizPassed);
  const progressPercent = Number(summary.progressPercent || 0);
  const allLessonsDone = Boolean(summary.allLessonsDone);
  const allActivitiesDone = Boolean(summary.allActivitiesDone);
  const allVideosDone = Boolean(summary.allVideosDone);
  const questionsTotal = Number(summary.questionsTotal || currentProva?.questoes?.length || 0);
  const minimumQuestions = Number(summary.minimumQuestions || 10);
  const retryAvailableAt = summary.retryAvailableAt ? new Date(Number(summary.retryAvailableAt)) : null;
  const retryRemainingMs = retryAvailableAt ? retryAvailableAt.getTime() - quizNowMs : 0;
  const quizRetryBlocked = Boolean(summary.quizRetryBlocked) && retryRemainingMs > 0;
  const retryCountdownLabel = quizRetryBlocked ? formatCountdown(retryRemainingMs) : '';
  const canTakeQuiz = allLessonsDone && allActivitiesDone && allVideosDone
    && questionsTotal >= minimumQuestions && !quizRetryBlocked;
  const completedAt = summary.completedAt || progress.completedAt;
  const completedAtDate = completedAt ? new Date(Number(completedAt)) : null;
  const startedAtDate = progress.startedAt ? new Date(Number(progress.startedAt)) : null;
  const completedLessonCount = Array.isArray(progress.completedContentIds) ? progress.completedContentIds.length : 0;
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
      respostaCorreta: getCorrectOptionIndex(questao),
      shuffledOptions: shuffleWithSeed(
        (Array.isArray(questao?.opcoes) ? questao.opcoes : []).map((opcao: string, index: number) => ({ label: opcao, originalIndex: index })),
        quizSeed + hashString(`${questao?.id || qIdx}-${selectedCourse?.id || ''}`),
      ),
    }));
  }, [currentProva, quizSeed, selectedCourse?.id]);
  const displayedQuizAnswers = quizPassed ? (progress.quizAnswers || quizAnswers) : quizAnswers;
  const retryAvailableLabel = retryAvailableAt
    ? retryAvailableAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  useEffect(() => {
    if (!summary.quizRetryBlocked || !retryAvailableAt || retryRemainingMs > 0) return;
    queryClient.invalidateQueries({ queryKey: progressQueryKey });
    setQuizSeed(Date.now());
    setQuizAnswers({});
  }, [queryClient, progressQueryKey, retryAvailableAt, retryRemainingMs, summary.quizRetryBlocked]);

  const isLessonLocked = (idx: number) => {
    if (!regras.liberarSequencialmente || idx === 0) return false;
    return !progress.completedContentIds.includes(conteudos[idx - 1]?.id);
  };
  const updateProgress = (action: string, itemId?: string | null, payload?: Record<string, any>) => {
    updateProgressMutation.mutate({ action, itemId, payload });
  };

  return {
    activeLearningTab, setActiveLearningTab, activeCourseContentTab, setActiveCourseContentTab,
    selectedLessonIdx, setSelectedLessonIdx, quizAnswers, setQuizAnswers, quizError,
    showCompletedLessons, setShowCompletedLessons, activityCompletionPrompt, setActivityCompletionPrompt,
    conteudos, currentProva, selectedLesson, selectedLessonText, progress, summary, mainVideoUrl, mainVideoDone,
    selectedLessonActivities, quizPassed, progressPercent, allLessonsDone, allActivitiesDone, allVideosDone,
    questionsTotal, minimumQuestions, quizRetryBlocked, retryCountdownLabel, canTakeQuiz, completedAtDate,
    startedAtDate, completedLessonCount, eadGradeCurricular, alunoCertificado, certificateStatusTitle,
    certificateStatusMessage, eadCertificateModel, randomizedQuizQuestions, displayedQuizAnswers,
    retryAvailableLabel, isLessonLocked, updateProgress,
  };
};

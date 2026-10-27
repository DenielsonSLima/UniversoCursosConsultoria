import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { EadRevisionNotice } from './components/EadRevisionNotice';
import { EadLessonArticle } from './components/EadLessonArticle';
import { useEadAssessmentRevision } from './hooks/useEadAssessmentRevision';
import revision from '../../../content/ead/matematica-basica/index.mjs';
import { buildCourseConfig } from '../../../scripts/ead-mathematics/revision-model.mjs';

// Dados inteiramente sintéticos; o bundle de smoke não usa rede, chaves ou alunos reais.
const studentId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const available = 'matematica-20261027-v2';
const clean = (input: any): any => {
  if (Array.isArray(input)) return input.map(clean);
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input)
    .filter(([key]) => !['respostaCorreta', 'explicacao'].includes(key)).map(([key, value]) => [key, clean(value)]));
  return input;
};
const config = clean(buildCourseConfig({}, revision, { includeAnswers: false }));
const queryKey = ['ead-aluno-progresso', studentId, courseId];
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const summary = {
  allLessonsDone: false, allActivitiesDone: false, allVideosDone: true, quizPassed: false,
  quizRetryBlocked: false, canTakeQuiz: false, questionsTotal: 10, minimumQuestions: 10,
};
let history: any[] = [];
let calls = 0;
let failNext = false;
let state: any = {
  progress: { completedContentIds: ['old-lesson'], activityAnswers: {}, quizAnswers: {} },
  summary,
  assessmentFeedback: { activities: {}, quiz: { submitted: false, score: null, passed: false, results: {} } },
  effectiveEadConfig: { conteudos: [{ id: 'old-lesson', titulo: 'Aula anterior' }] },
  assessmentRevision: { current: 'legacy-20261027', available, canUpgrade: true, isHistorical: true },
};
client.setQueryData(queryKey, state);
(window as any).__revisionSmokeRpc = async (name: string, args: any) => {
  calls++;
  if (name !== 'ead_start_assessment_revision' || args.p_aluno_id !== studentId
    || args.p_curso_id !== courseId || args.p_expected_revision !== available) {
    throw new Error('Contrato RPC inesperado no smoke.');
  }
  if (failNext) { failNext = false; return { data: null, error: { message: 'Falha simulada: histórico preservado. Tente novamente.' } }; }
  history = [...history, structuredClone(state.progress)];
  state = {
    ...state,
    progress: { completedContentIds: [], completedActivityIds: [], completedVideoIds: [], activityAnswers: {}, quizAnswers: {} },
    summary: { ...summary, questionsTotal: config.provas[0].questoes.length },
    effectiveEadConfig: config,
    assessmentRevision: { current: available, available, canUpgrade: false, isHistorical: false },
  };
  return { data: state, error: null };
};

function Smoke() {
  const result = useQuery({ queryKey, queryFn: async () => state });
  const revisionView = useEadAssessmentRevision({
    alunoId: studentId, courseId, state: result.data, queryClient: client, disabled: false,
    onAccepted: () => undefined,
  });
  const view = { ...revisionView, selectedCourse: { id: courseId, ead_config: config }, isUpdatingProgress: revisionView.revisionPending };
  return <main>
    <h1>Verificação da revisão EAD</h1>
    <p>Ambiente local com dados sintéticos e transporte RPC simulado.</p>
    <p>Revisão atual: {result.data.assessmentRevision.current}</p>
    <p>Históricos arquivados: {history.length} · Chamadas: {calls}</p>
    <button onClick={() => { failNext = true; }}>Simular uma falha na próxima confirmação</button>
    <EadRevisionNotice key={result.data.assessmentRevision.current} view={view} />
    {result.data.assessmentRevision.current === available && <section>
      <h2>Nova revisão confirmada: {result.data.summary.questionsTotal} questões</h2>
      <h3>{config.conteudos[0].titulo}</h3>
      <EadLessonArticle lesson={config.conteudos[0]} />
    </section>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><Smoke /></QueryClientProvider>);

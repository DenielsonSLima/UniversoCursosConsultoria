import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import React, { act } from 'react';

const base = fileURLToPath(new URL('../../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE || process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');

test('pending EAD trust follows server quiz flags and hides cached protected content on denial or expiry', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/ead-trust-learning-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const realNow = Date.now;
  let now = Date.parse('2026-11-12T12:00:00Z'); Date.now = () => now;
  const intervals = new Map(); let timer = 0;
  window.setInterval = callback => { const id = ++timer; intervals.set(id, callback); return id; };
  window.clearInterval = id => intervals.delete(id);
  const questions = Array.from({ length: 10 }, (_, index) => ({ id: `q${index}`, pergunta: `Questão sintética ${index}`, opcoes: ['A', 'B'] }));
  const selected = { id: 'course-synthetic', nome: 'EAD sintético', modalidade: 'EAD',
    ead_config: { conteudos: [], atividades: [], provas: [{ questoes: questions }], regras: {} },
    alunoMatricula: { id: 'enrollment-synthetic', status: 'PENDENTE', acessoTemporarioAte: new Date(now + 60_000).toISOString() } };
  let state = { progress: { startedAt: now, completedContentIds: [], completedActivityIds: [], completedVideoIds: [], activityAnswers: {}, quizAnswers: {} },
    summary: { temporaryAccess: true, canTakeQuiz: true, allLessonsDone: true, allActivitiesDone: true, allVideosDone: true,
      quizRetryBlocked: false, quizPassed: false, questionsTotal: 10, minimumQuestions: 10, progressPercent: 90 },
    assessmentFeedback: { activities: {}, quiz: { submitted: false, score: null, passed: false, results: {} } } };
  let denied = false;
  const calls = [], certificateReads = [];
  globalThis.__eadTrustLearning = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (denied && name === 'ead_get_aluno_progress') return { data: null, error: { code: '42501', message: 'Acesso negado pelo servidor.' } };
      if (name === 'ead_update_aluno_progress') {
        assert.equal(args.p_action, 'finish_quiz');
        state = { ...state, summary: { ...state.summary, canTakeQuiz: false, quizPassed: true, certificateId: 'certificate-synthetic', quizScore: 100, completedAt: now },
          assessmentFeedback: { activities: {}, quiz: { submitted: true, score: 100, passed: true,
            results: Object.fromEntries(questions.map(question => [question.id, { selectedIndex: 0, correctIndex: 0, isCorrect: true }])) } } };
      }
      return { data: state, error: null };
    },
    channel() { return { on() { return this; }, subscribe() { return this; } }; }, removeChannel() {},
  };
  globalThis.__eadTrustCertificateRead = (...args) => {
    certificateReads.push(args);
    return { id: 'certificate-synthetic', status: 'FINALIZADO', codigo_validacao: 'synthetic-code' };
  };
  let root, client;
  try {
    const outfile = resolve(temp, 'learning.mjs');
    const compiled = await build({ stdin: { resolveDir: base, contents: `
      export {useEadLearning} from './modules/aluno/cursos/hooks/useEadLearning';
      export {EadQuizPanel} from './modules/aluno/cursos/components/EadQuizPanel';
      export {default as EadCourseRoom} from './modules/aluno/cursos/components/EadCourseRoom';` },
      bundle: true, write: false, outfile, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
      loader: { '.css': 'empty' }, plugins: [{ name: 'synthetic-learning-boundaries', setup(builder) {
        for (const [filter, path] of [[/lib\/supabase$/, 'rpc'], [/ead-certificate\.service$/, 'certificate'], [/useAlunoEadCertificateModel$/, 'model']]) {
          builder.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
        }
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: {
          rpc: 'export const supabase=globalThis.__eadTrustLearning;',
          certificate: 'export const getAlunoEadCertificate=async(...args)=>globalThis.__eadTrustCertificateRead(...args);',
          model: 'export const useAlunoEadCertificateModel=()=>({eadCertificateModel:null,certificateModelLoading:false,certificateModelError:null,retryCertificateModel(){}});',
        }[args.path] }));
      } }] });
    await writeFile(outfile, compiled.outputFiles[0].contents);
    const { useEadLearning, EadQuizPanel, EadCourseRoom } = await import(pathToFileURL(outfile).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    let view;
    function Harness() {
      view = useEadLearning({ alunoId: 'student-synthetic', hasAlunoContext: true, selectedCourse: selected, queryClient: client });
      return view.quizPassed || !view.isProgressReady ? React.createElement(EadCourseRoom, { view: {
        ...view, selectedCourse: selected, learningView: view, certificateActions: { disabled: false, busy: false, label: 'Baixar certificado' },
        renderCertificatePdfSource: () => null, renderCertificatePreview: () => null,
        closeSelectedCourse() {}, printCertificate() {}, downloadCertificatePdf() {},
      } }) : React.createElement(EadQuizPanel, { view });
    }
    root = createRoot(document.getElementById('root'));
    const settle = async () => act(async () => { await new Promise(done => setTimeout(done, 30)); });
    const refresh = async () => { await act(async () => client.invalidateQueries({ queryKey: ['ead-aluno-progresso', 'student-synthetic', selected.id] })); await settle(); };
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness)))); await settle();
    assert.equal(view.canTakeQuiz, true); assert.equal(view.isProgressReady, true); assert.equal(selected.alunoMatricula.status, 'PENDENTE');
    await act(async () => view.setQuizAnswers(Object.fromEntries(questions.map(question => [question.id, 0])))); await settle();
    const submit = [...document.querySelectorAll('button')].find(button => button.textContent === 'Corrigir prova');
    assert(submit); assert.equal(submit.disabled, false); await act(async () => submit.click()); await settle(); await settle();
    assert.equal(calls.filter(call => call.name === 'ead_update_aluno_progress').length, 1);
    assert.equal(view.quizPassed, true); assert.equal(view.alunoCertificado.id, 'certificate-synthetic');
    assert.deepEqual(certificateReads.at(-1), ['student-synthetic', selected.id, 'certificate-synthetic']);
    await act(async () => view.setShowCompletedLessons(false)); await settle();
    const certificateButton = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Baixar certificado');
    assert(certificateButton()); assert.equal(selected.alunoMatricula.status, 'PENDENTE');
    denied = true; await refresh();
    assert.equal(view.isProgressReady, false); assert.equal(view.quizPassed, false); assert.equal(certificateButton(), undefined);
    assert.equal(document.querySelector('[role="radiogroup"]'), null, 'A denied temporary read hides cached questions and content');
    assert(document.body.textContent.includes('Não foi possível confirmar o acesso temporário'));
    denied = false; await refresh(); assert.equal(view.isProgressReady, true);
    now += 60_000; await act(async () => { for (const callback of intervals.values()) callback(); }); await settle();
    assert.equal(view.isProgressReady, false); assert.equal(view.canTakeQuiz, false); assert.equal(certificateButton(), undefined);
    assert(document.body.textContent.includes('Acesso temporário encerrado'));
    selected.alunoMatricula.status = 'ATIVO';
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness))));
    await settle(); await refresh(); assert.equal(view.isProgressReady, true);
    denied = true; await refresh();
    assert.equal(view.isProgressReady, true, 'An activated enrollment retains its existing confirmed-data refresh behavior');
    assert.equal(calls.filter(call => call.name === 'ead_update_aluno_progress').length, 1, 'Expiry, denial and recovery never submit the quiz again');
  } finally {
    if (root) await act(async () => root.unmount()); client?.clear(); Date.now = realNow; dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    delete globalThis.__eadTrustLearning; delete globalThis.__eadTrustCertificateRead;
    await rm(temp, { recursive: true, force: true });
  }
});

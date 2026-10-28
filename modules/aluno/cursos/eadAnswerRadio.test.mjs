import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const jsdomModule = process.env.JSDOM_MODULE_PATH
  ? pathToFileURL(resolve(process.env.JSDOM_MODULE_PATH)).href : 'jsdom';
const { JSDOM } = await import(jsdomModule);
const directory = dirname(fileURLToPath(import.meta.url));
const sourceFiles = ['EadAnswerRadio.tsx', 'EadQuizPanel.tsx', 'EadActivitiesPanel.tsx'];
const source = (await Promise.all(sourceFiles.map(name => readFile(resolve(directory, 'components', name), 'utf8')))).join('\n');
const css = (await postcss([tailwindcss({
  content: [{ raw: source, extension: 'tsx' }], corePlugins: { preflight: false },
})]).process('@tailwind utilities;', { from: undefined })).css;
const bundle = await build({
  stdin: { resolveDir: directory, loader: 'tsx', contents: `
    import React,{act,useState} from 'react';
    import{createRoot}from'react-dom/client';
    import{EadQuizPanel}from'./components/EadQuizPanel';
    import{EadActivitiesPanel}from'./components/EadActivitiesPanel';
    import{getEadActivityConfigurationValidation}from'./eadAssessmentFeedback';
    window.IS_REACT_ACT_ENVIRONMENT=true;
    const question={id:'question-1',pergunta:'Pergunta sintética',shuffledOptions:[
      {label:'Primeira opção visual',originalIndex:3},{label:'Segunda opção visual',originalIndex:1},
      {label:'Terceira opção visual',originalIndex:0},{label:'Quarta opção visual',originalIndex:2}]};
    const activity={id:'activity-1',titulo:'Atividade sintética',enunciado:'Escolha uma opção',
      tipo:'multipla_escolha',opcoes:['Resposta um','Resposta dois'],aulaId:'lesson-1'};
    function Fixture({kind,disabled}){
      const[answers,setAnswers]=useState({});
      const[drafts,setDrafts]=useState({});
      const[persisted,setPersisted]=useState({});
      const quizView={quizAnswers:answers,setQuizAnswers:setAnswers,displayedQuizAnswers:answers,
        randomizedQuizQuestions:[question],summary:{},quizPassed:false,quizRetryBlocked:false,
        allLessonsDone:true,allActivitiesDone:true,allVideosDone:true,questionsTotal:1,minimumQuestions:1,
        canTakeQuiz:true,isUpdatingProgress:disabled,isProgressUpdatePending:()=>false,
        updateProgress:()=>{throw Error('Selecionar alternativa não deve enviar a prova');}};
      const activityView={selectedCourse:{id:'course-1'},progressContextKey:'student-1:course-1',
        selectedLesson:{id:'lesson-1',titulo:'Aula'},conteudos:[{id:'lesson-1',titulo:'Aula'}],
        selectedLessonActivities:[{atividade:activity,activityIndex:0,linkedLessonIndex:0}],
        activityConfigurationValidation:getEadActivityConfigurationValidation([activity]),
        progress:{completedActivityIds:[],activityAnswers:persisted},assessmentFeedback:{activities:{}},
        revisionPending:disabled,activityAnswerDrafts:drafts,
        setActivityAnswerDraft:(key,value)=>setDrafts(old=>({...old,[key]:value})),
        saveActivityAnswer:async(_key,id,answer)=>setPersisted(old=>({...old,[id]:answer})),
        isProgressUpdatePending:()=>false,updateProgress:async()=>undefined};
      return <><header>Portal sintético</header><main style={{height:300,overflowY:'auto'}}>
        {kind==='quiz'?<EadQuizPanel view={quizView}/>:<EadActivitiesPanel view={activityView}/>}
      </main><footer>Menu sintético</footer><output>{JSON.stringify(kind==='quiz'?answers:persisted)}</output></>;
    }
    window.mount=(kind,disabled=false)=>{const root=createRoot(document.getElementById('root'));
      act(()=>root.render(<Fixture kind={kind} disabled={disabled}/>));};
    window.runInteraction=fn=>{act(fn);};
  ` },
  bundle: true, platform: 'browser', format: 'iife', write: false,
});

const fixture = async (kind, disabled = false) => {
  const dom = new JSDOM(`<style>${css}</style><div id="root"></div>`, {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const errors = [];
  dom.window.addEventListener('error', event => errors.push(event.message));
  dom.window.eval(bundle.outputFiles[0].text);
  await dom.window.mount(kind, disabled);
  return { dom, document: dom.window.document, errors };
};

for (const kind of ['quiz', 'activity']) {
  test(`${kind}: foco pertence ao retângulo da alternativa e seleção conserva o índice original`, async () => {
    const { dom, document, errors } = await fixture(kind);
    try {
      const input = document.querySelector('input[type="radio"]');
      assert.ok(input, 'a alternativa mantém um rádio nativo');
      const label = input.closest('label');
      const labelStyle = dom.window.getComputedStyle(label);
      const inputStyle = dom.window.getComputedStyle(input);
      assert.equal(labelStyle.position, 'relative');
      assert.equal(labelStyle.display, 'block');
      assert.equal(inputStyle.position, 'absolute');
      assert.equal(inputStyle.width, '100%');
      assert.equal(inputStyle.height, '100%');
      assert.equal(inputStyle.inset, '0px');
      assert.ok(!inputStyle.clip || inputStyle.clip === 'auto', 'o foco não usa uma área recortada de 1px');
      assert.equal(inputStyle.opacity, '0');
      assert.ok(label.textContent.trim(), 'o rótulo visível permanece associado ao rádio');
      input.focus();
      assert.equal(document.activeElement, input);
      await dom.window.runInteraction(() => input.click());
      assert.equal(input.checked, true);
      assert.match(document.querySelector('output').textContent,
        kind === 'quiz' ? /"question-1":3/ : /"activity-1":"0"/);
      assert.ok(document.querySelector('header'));
      assert.ok(document.querySelector('main').textContent.trim());
      assert.ok(document.querySelector('footer'));
      assert.deepEqual(errors, []);
    } finally { dom.window.close(); }
  });

  test(`${kind}: rádio desabilitado não recebe foco nem altera respostas`, async () => {
    const { dom, document, errors } = await fixture(kind, true);
    try {
      const input = document.querySelector('input[type="radio"]');
      assert.equal(input.disabled, true);
      input.focus();
      assert.notEqual(document.activeElement, input);
      await dom.window.runInteraction(() => input.click());
      assert.equal(input.checked, false);
      assert.equal(document.querySelector('output').textContent, '{}');
      assert.deepEqual(errors, []);
    } finally { dom.window.close(); }
  });
}

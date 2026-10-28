import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const directory = dirname(fileURLToPath(import.meta.url));
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../ead-student-model-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { JSDOM } = process.env.JSDOM_MODULE_PATH
  ? await import(pathToFileURL(resolve(process.env.JSDOM_MODULE_PATH)).href) : requireTool('jsdom');
const bundle = await build({
  stdin: { resolveDir: directory, loader: 'tsx', contents: `
    import React,{act} from 'react';
    import{createRoot}from'react-dom/client';
    import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
    import{useAlunoEadCertificateModel}from'./hooks/useAlunoEadCertificateModel';
    import{AlunoCertificateModelStatus}from'./components/AlunoCertificateModelStatus';
    import{getAlunoCertificateActions}from'./eadCertificateModel';
    window.IS_REACT_ACT_ENVIRONMENT=true;
    const client=new QueryClient();
    const root=createRoot(document.getElementById('root'));
    function Fixture({alunoId,certificateId}){
      const view=useAlunoEadCertificateModel(alunoId,certificateId,true);
      const actions=getAlunoCertificateActions({hasCertificate:!!certificateId,
        modelLoading:view.certificateModelLoading,modelError:view.certificateModelError,
        pdfReady:!!view.eadCertificateModel,pdfLoading:false,pdfError:'',printing:false});
      return <><button data-download disabled={actions.disabled} data-busy={actions.busy}>{actions.label}</button>
        {(view.certificateModelLoading||view.certificateModelError)&&
          <AlunoCertificateModelStatus error={view.certificateModelError}
            loading={view.certificateModelLoading} retry={view.retryCertificateModel}/>}
        <output>{view.eadCertificateModel?.id||''}</output></>;
    }
    window.mount=async(alunoId='student-a',certificateId='certificate-a')=>{
      await act(async()=>{root.render(<QueryClientProvider client={client}>
        <Fixture alunoId={alunoId} certificateId={certificateId}/></QueryClientProvider>);
        await new Promise(resolve=>setTimeout(resolve,5));});
    };
    window.interact=async action=>{await act(async()=>{action();await new Promise(resolve=>setTimeout(resolve,5));});};
    window.cleanup=async()=>{await act(async()=>root.unmount());client.clear();};
  ` },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  nodePaths: dependencies ? [dependencies] : [],
  plugins: [{ name: 'student-model-rpc-fixture', setup(plugin) {
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'database', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const supabase={rpc(name,args){return{abortSignal(signal){return window.modelRpc(name,args,signal);}}}};
    ` }));
  } }],
});

const createFixture = () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  // JSDOM does not implement MessageChannel, used by React's async act scheduler.
  dom.window.MessageChannel = class {
    port1 = { onmessage: null };
    port2 = { postMessage: value => dom.window.setTimeout(() => this.port1.onmessage?.({ data: value }), 0) };
  };
  const requests = [];
  const responses = [];
  dom.window.modelRpc = async (name, args, signal) => {
    assert.equal(name, 'get_aluno_ead_certificate_model');
    assert.deepEqual(Object.keys(args), ['p_certificado_id']);
    assert.ok(signal);
    requests.push(args.p_certificado_id);
    const response = responses.shift();
    assert.ok(response, 'a interface não pode consultar em loop');
    return typeof response === 'function' ? response(signal) : response;
  };
  dom.window.eval(bundle.outputFiles[0].text);
  return { dom, document: dom.window.document, requests, responses };
};

const flush = async dom => { await dom.window.interact(() => {}); };

test('hook real, erro e clique de repetição não exibem geração fictícia nem repetição automática', async () => {
  const { dom, document, requests, responses } = createFixture();
  try {
    responses.push({ data: null, error: { code: '42501' } });
    await dom.window.mount();
    await flush(dom);
    assert.match(document.querySelector('[role=alert]').textContent, /Não foi possível carregar/);
    assert.equal(document.querySelector('[data-download]').textContent, 'PDF indisponível');
    assert.equal(document.querySelector('[data-download]').dataset.busy, 'false');
    assert.equal(document.querySelector('[data-download]').disabled, true);
    assert.equal(requests.length, 1);
    await flush(dom);
    assert.equal(requests.length, 1);

    let finish;
    responses.push(() => new Promise(resolve => { finish = resolve; }));
    await dom.window.interact(() => document.querySelector('[role=alert] button').click());
    assert.equal(document.querySelector('[role=alert]'), null);
    assert.match(document.querySelector('[role=status]').textContent, /Carregando/);
    assert.equal(document.querySelector('[data-download]').textContent, 'Carregando modelo');
    assert.equal(document.querySelector('[data-download]').disabled, true);
    await dom.window.interact(() => finish({ data: { id: 'ead-synthetic', blocks: [] }, error: null }));
    await flush(dom);
    assert.equal(document.querySelector('output').textContent, 'ead-synthetic');
    assert.equal(document.querySelector('[data-download]').disabled, false);
    assert.equal(document.querySelector('[data-download]').textContent, 'Baixar PDF');
    assert.deepEqual(requests, ['certificate-a', 'certificate-a']);
  } finally { await dom.window.cleanup(); dom.window.close(); }
});

test('troca de aluno/certificado durante consulta descarta resultado antigo e modelo ausente mostra erro', async () => {
  const { dom, document, requests, responses } = createFixture();
  try {
    let oldSignal;
    let finishOld;
    responses.push(signal => { oldSignal = signal; return new Promise(resolve => { finishOld = resolve; }); });
    await dom.window.mount();
    responses.push({ data: null, error: { code: 'P0002' } });
    await dom.window.mount('student-b', 'certificate-b');
    await flush(dom);
    assert.equal(oldSignal.aborted, true);
    assert.match(document.querySelector('[role=alert]').textContent, /modelo deste certificado não está disponível/);
    await dom.window.interact(() => finishOld({ data: { id: 'old-model' }, error: null }));
    assert.equal(document.querySelector('output').textContent, '');
    assert.equal(document.querySelector('[data-download]').dataset.busy, 'false');
    assert.deepEqual(requests, ['certificate-a', 'certificate-b']);
  } finally { await dom.window.cleanup(); dom.window.close(); }
});

test('as duas entradas usam os mesmos estados e o gestor conserva a leitura administrativa', async () => {
  const room = await readFile(resolve(directory, 'components/EadCourseRoom.tsx'), 'utf8');
  const content = await readFile(resolve(directory, 'components/EadLearningContent.tsx'), 'utf8');
  for (const source of [room, content]) {
    assert.match(source, /disabled=\{certificateActions\.disabled\}/);
    assert.match(source, /certificateActions\.busy \? <Loader2/);
    assert.match(source, /\{certificateActions\.label\}/);
    assert.doesNotMatch(source, /isDownloadingCertificate/);
  }
  const learning = await readFile(resolve(directory, 'hooks/useEadLearning.ts'), 'utf8');
  assert.match(learning, /useAlunoEadCertificateModel\(alunoId, alunoCertificado\?\.id/);
  assert.doesNotMatch(learning, /usePersistedEadCertificateTemplates|selectEadCertificateModel/);
  const gestor = await readFile(resolve(directory, '../../gestor/secretaria/certificados/SecretariaCertificadosPage.tsx'), 'utf8');
  assert.match(gestor, /usePersistedEadCertificateTemplates/);
  assert.doesNotMatch(gestor, /useAlunoEadCertificateModel/);
});

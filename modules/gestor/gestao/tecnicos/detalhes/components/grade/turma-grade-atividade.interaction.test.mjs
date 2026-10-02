import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';
import { build } from 'esbuild';

// Isolated DOM unit tests, not authenticated browser or Safari smoke.
// npm install --prefix /tmp/universo-atividade-react-deps --no-save --no-package-lock jsdom@26.1.0
// ATIVIDADE_TEST_JSDOM_PATH=/tmp/universo-atividade-react-deps/node_modules/jsdom node --test modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-atividade.interaction.test.mjs
const jsdomPath = process.env.ATIVIDADE_TEST_JSDOM_PATH;
const { JSDOM } = await import(jsdomPath
  ? pathToFileURL(resolve(jsdomPath, 'lib/api.js')).href : 'jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost/'});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {value:dom.window.navigator,configurable:true});
for (const key of ['HTMLElement','HTMLInputElement','Event','MouseEvent','KeyboardEvent']) {
  globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Bundled React's act fallback uses Node MessagePorts; close them after this suite.
const NativeMessageChannel = globalThis.MessageChannel;
const messagePorts = [];
globalThis.MessageChannel = class extends NativeMessageChannel {
  constructor() { super(); messagePorts.push(this.port1,this.port2); }
};
const calls = [];
const notices = [];
let rpcResult;
globalThis.__atividadeInteractionRpc = (...args) => { calls.push(args); return rpcResult(...args); };
globalThis.__atividadeInteractionToast = (kind, ...args) => notices.push({kind,args});

const componentDirectory = fileURLToPath(new URL('.', import.meta.url));
const result = await build({
  stdin:{contents:`import React, { act } from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import Rows from './TurmaGradeAtividades';
    export { React, act, createRoot, QueryClient, QueryClientProvider, Rows };`,
  resolveDir:componentDirectory,loader:'tsx'},
  bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
  plugins:[{
    name:'isolated-component-boundaries',
    setup(builder) {
      builder.onResolve({filter:/\/lib\/supabase$/}, () => ({path:'supabase',namespace:'fixture'}));
      builder.onResolve({filter:/\/atividades-extra\/atividadesExtraClasse\.service$/}, () => ({path:'activity-keys',namespace:'fixture'}));
      builder.onResolve({filter:/\/ToastNotification$/}, () => ({path:'toast',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'}, ({path}) => ({loader:'js',contents:
        path === 'supabase' ? 'export const supabase = {rpc:(...args)=>globalThis.__atividadeInteractionRpc(...args)};'
          : path === 'activity-keys' ? "export const atividadesExtraClasseKeys={turma:(id)=>['atividades-extra-classe',id]};"
            : `export default ()=>null; export const useToast=()=>({toasts:[],removeToast:()=>{},toast:{
              success:(...args)=>globalThis.__atividadeInteractionToast('success',...args),
              error:(...args)=>globalThis.__atividadeInteractionToast('error',...args)}});`,
      }));
    },
  }],
});
const { React, act, createRoot, QueryClient, QueryClientProvider, Rows } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const record = (overrides = {}) => ({
  id:'atividade-1',titulo:'Atividade sintética',cargaHoraria:4,prazoEntrega:'2026-09-12',
  status:'PUBLICADA',respostasCount:0,updatedAt:'2026-10-02T18:00:00.123456+00:00',
  contexto:{turmaId:'turma-1',turmaStatus:'EM_ANDAMENTO',modalidade:'TECNICO',periodoStatus:'ABERTO'},
  ...overrides,
});
let container;
let root;
let client;
const tick = () => new Promise((done) => setTimeout(done,0));
const flush = () => act(async () => { await tick(); });
const render = async (atividades = [record()]) => {
  await act(async () => {
    root.render(React.createElement(QueryClientProvider,{client},React.createElement(Rows,{atividades})));
  });
};
const button = (label) => [...container.querySelectorAll('button')].find((item) =>
  item.getAttribute('aria-label') === label || item.textContent.trim() === label);
const click = async (target) => {
  assert.ok(target, 'the target button must exist');
  await act(async () => { target.dispatchEvent(new MouseEvent('click',{bubbles:true})); await tick(); });
};
const input = async (type, value) => {
  const element = container.querySelector(`input[type="${type}"]`);
  assert.ok(element);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);
    element.dispatchEvent(new Event('input',{bubbles:true}));
  });
};
const submit = async () => {
  const form = container.querySelector('form');
  assert.ok(form);
  await act(async () => { form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); await tick(); });
};

beforeEach(async () => {
  calls.length = 0;
  notices.length = 0;
  rpcResult = async (_name,payload) => ({data:{id:payload.p_atividade_id},error:null});
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false,gcTime:0}}});
  await render();
});
afterEach(async () => {
  await act(async () => { root.unmount(); client.clear(); });
  container.remove();
});
after(() => {
  dom.window.close();
  for (const port of messagePorts) port.close();
  globalThis.MessageChannel = NativeMessageChannel;
});

test('edit opens with existing values; Cancel discards the draft without an RPC', async () => {
  await click(button('Editar atividade Atividade sintética'));
  assert.equal(container.querySelector('input[type="text"]').value,'Atividade sintética');
  assert.equal(container.querySelector('input[type="date"]').value,'2026-09-12');
  await input('text','Rascunho não salvo');
  await click(button('Cancelar'));
  assert.equal(container.querySelector('form'),null);
  assert.equal(calls.length,0);
  await click(button('Editar atividade Atividade sintética'));
  assert.equal(container.querySelector('input[type="text"]').value,'Atividade sintética');
});

test('saving a retroactive edit sends the changed values and closes after confirmation', async () => {
  await click(button('Editar atividade Atividade sintética'));
  await input('text','Título corrigido');
  await input('date','2026-01-01');
  await input('number','3.5');
  await submit();
  await flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].p_titulo,'Título corrigido');
  assert.equal(calls[0][1].p_prazo_entrega,'2026-01-01');
  assert.equal(calls[0][1].p_carga_horaria,3.5);
  assert.equal(container.querySelector('form'),null);
  assert.equal(notices.at(-1).kind,'success');
});

test('RPC failure preserves the draft and editor for correction', async () => {
  rpcResult = async () => ({data:null,error:{code:'23514',message:'Carga horária excedida'}});
  await click(button('Editar atividade Atividade sintética'));
  await input('text','Preservar este rascunho');
  await submit();
  await flush();
  assert.equal(container.querySelector('input[type="text"]').value,'Preservar este rascunho');
  assert.equal(button('Salvar atividade').disabled,false);
  assert.equal(notices.at(-1).kind,'error');
  assert.equal(calls.length,1);
});

test('duplicate submissions during one pending request make only one RPC and prevent cancellation', async () => {
  let complete;
  rpcResult = () => new Promise((resolve) => { complete = resolve; });
  await click(button('Editar atividade Atividade sintética'));
  await act(async () => {
    const form = container.querySelector('form');
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await tick();
  });
  assert.equal(calls.length,1);
  assert.equal(button('Salvar atividade').disabled,true);
  assert.equal(button('Cancelar').disabled,true);
  await act(async () => { complete({data:{id:'atividade-1'},error:null}); await tick(); });
  await flush();
  assert.equal(container.querySelector('form'),null);
});

test('external revision refresh retains the draft but blocks saving over newer data', async () => {
  await click(button('Editar atividade Atividade sintética'));
  await input('text','Rascunho anterior');
  await render([record({titulo:'Título de outra pessoa',updatedAt:'2026-10-02T19:00:00.654321+00:00'})]);
  assert.equal(container.querySelector('input[type="text"]').value,'Rascunho anterior');
  assert.equal(button('Salvar atividade').disabled,true);
  assert.match(container.querySelector('[role="alert"]').textContent,/alterada enquanto você editava/);
  await submit();
  assert.equal(calls.length,0);
  await click(button('Cancelar'));
  await click(button('Editar atividade Título de outra pessoa'));
  assert.equal(container.querySelector('input[type="text"]').value,'Título de outra pessoa');
  assert.equal(button('Salvar atividade').disabled,false);
});

test('Escape dismisses editing and archive confirmation without changing data', async () => {
  await click(button('Editar atividade Atividade sintética'));
  await act(async () => container.querySelector('form').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(container.querySelector('form'),null);
  await click(button('Excluir atividade Atividade sintética da grade'));
  await act(async () => container.querySelector('[role="group"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(container.querySelector('[role="group"]'),null);
  assert.equal(calls.length,0);
});

test('archive confirmation explains effects, supports cancellation and rejects a refreshed revision', async () => {
  await click(button('Excluir atividade Atividade sintética da grade'));
  assert.match(container.querySelector('[role="group"]').textContent,/Respostas e notas serão preservadas/);
  await click(button('Cancelar'));
  assert.equal(calls.length,0);
  await click(button('Excluir atividade Atividade sintética da grade'));
  await render([record({updatedAt:'2026-10-02T19:00:00.654321+00:00'})]);
  assert.equal(button('Arquivar atividade').disabled,true);
  assert.match(container.querySelector('[role="alert"]').textContent,/atividade foi alterada/);
  await click(button('Arquivar atividade'));
  assert.equal(calls.length,0);
  await click(button('Cancelar'));
  await click(button('Excluir atividade Atividade sintética da grade'));
  await click(button('Arquivar atividade'));
  assert.equal(calls[0][1].p_acao,'ARQUIVAR');
  assert.equal(calls[0][1].p_updated_at_esperado,'2026-10-02T19:00:00.654321+00:00');
});

test('archived rows have a separate count and draft restoration never changes its intended status', async () => {
  const archived = record({id:'arquivada-1',titulo:'Rascunho guardado',status:'ARQUIVADA',statusAnterior:'RASCUNHO'});
  await render([record(),archived]);
  assert.equal(container.querySelector('summary').textContent,'Atividades arquivadas (1)');
  assert.equal(container.textContent.includes('Extra 2'),false);
  const restore = button('Restaurar atividade Rascunho guardado');
  assert.equal(restore.textContent.trim(),'Restaurar rascunho');
  await click(restore);
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].p_acao,'RESTAURAR');
  assert.equal(calls[0][1].p_atividade_id,'arquivada-1');
  assert.equal(calls[0][1].p_titulo,null);
});

test('activities with responses disable editing while retaining recoverable archival', async () => {
  await render([record({respostasCount:2})]);
  assert.equal(button('Editar atividade Atividade sintética').disabled,true);
  assert.match(container.textContent,/2 resposta\(s\) registrada\(s\)/);
  assert.equal(button('Excluir atividade Atividade sintética da grade').disabled,false);
});

test('legacy unknown archive origin stays visible without an automatic restore action', async () => {
  await render([record({status:'ARQUIVADA',statusAnterior:null})]);
  assert.equal(container.querySelector('summary').textContent,'Atividades arquivadas (1)');
  assert.match(container.textContent,/Origem não registrada/);
  assert.equal(button('Restaurar atividade Atividade sintética'),undefined);
  assert.equal(calls.length,0);
});

test('archive failure keeps its confirmation available and never reports success', async () => {
  rpcResult = async () => ({data:null,error:{code:'42501',message:'Período fechado'}});
  await click(button('Excluir atividade Atividade sintética da grade'));
  await click(button('Arquivar atividade'));
  await flush();
  assert.ok(container.querySelector('[role="group"]'));
  assert.equal(button('Arquivar atividade').disabled,false);
  assert.equal(calls.length,1);
  assert.equal(notices.at(-1).kind,'error');
  assert.equal(notices.some((notice) => notice.kind === 'success'),false);
});

test('successful mutation refreshes scoped academic projections without broad turma invalidation', async () => {
  const invalidated = [];
  const original = client.invalidateQueries.bind(client);
  client.invalidateQueries = (filters) => { invalidated.push(filters.queryKey); return original(filters); };
  await click(button('Editar atividade Atividade sintética'));
  await submit();
  await flush();
  const academic = invalidated.filter((key) => key[0] === 'academic-lifecycle');
  assert.deepEqual(academic, ['grade','atividades','diarios','resumo'].map((section) =>
    ['academic-lifecycle','turma','turma-1',section]));
  assert.ok(invalidated.some((key) => key[0] === 'atividades-extra-classe' && key[1] === 'turma-1'));
  assert.equal(invalidated.length,9);
});

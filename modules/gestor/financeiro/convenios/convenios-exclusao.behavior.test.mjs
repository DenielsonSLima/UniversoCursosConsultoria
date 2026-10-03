import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// DOM sintético, sem navegador, credenciais ou chamadas de rede.
const require = createRequire(import.meta.url);
const jsdomPath = process.env.CONVENIOS_JSDOM_PATH || process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina CONVENIOS_JSDOM_PATH com o pacote jsdom@26.1.0.');
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);
const temporary = await mkdtemp(join(tmpdir(), 'universo-convenios-exclusao-'));
const bundle = join(temporary, 'convenios-exclusao.cjs');
after(async () => { await rm(temporary, { recursive: true, force: true }); });

const mocks = {
  queries: `
    export const useConveniosListQuery=(polo)=>({
      data:{itens:globalThis.__conveniosDeletion.items[polo]||[]},isPending:false,isError:false});
    export const useConvenioPartnersQuery=()=>({data:[],isPending:false,isError:false});
    export const useConvenioDetailQuery=(polo,id)=>{
      globalThis.__conveniosDeletion.details.push({polo,id});
      const mes=(globalThis.__conveniosDeletion.items[polo]||[]).find(item=>item.id===id);
      return {data:mes?{mes,movimentos:[]}:undefined,isPending:false,error:null,refetch:async()=>{}};
    };
  `,
  shared: 'export const useFinanceiroSharedQueries=()=>({accountsQuery:{data:[]}});',
  finance: 'export const isContaDisponivelNoPolo=()=>true;',
  realtime: 'export const useConveniosRealtime=()=>{};',
  service: `
    export const conveniosService={excluir:(input)=>globalThis.__conveniosDeletion.excluir(input)};
  `,
  cache: `
    export const invalidateConveniosScope=async(_client,polo)=>{
      globalThis.__conveniosDeletion.invalidated.push(polo);
    };
  `,
  toast: `
    export default function ToastNotification(){return null;}
    export const useToast=()=>({toasts:[],removeToast:()=>{},toast:{
      success:(...args)=>globalThis.__conveniosDeletion.toasts.push(['success',...args]),
      error:(...args)=>globalThis.__conveniosDeletion.toasts.push(['error',...args]),
    }});
  `,
  unused: 'export default function Unused(){return null;}',
};

await build({
  stdin: {
    contents: `
      import React,{act} from 'react';
      import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import ConveniosTab from './ConveniosTab.tsx';
      const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
      export async function interact(action){
        await act(async()=>{await action();await tick()});
        await act(async()=>{await tick()});
      }
      export async function mount(container,polo){
        const client=new QueryClient({defaultOptions:{
          queries:{retry:false,gcTime:Infinity},mutations:{retry:false,gcTime:Infinity}}});
        const root=createRoot(container);
        const render=async(nextPolo)=>interact(()=>root.render(
          <QueryClientProvider client={client}><ConveniosTab poloId={nextPolo}/></QueryClientProvider>));
        await render(polo);
        return {client,render,unmount:async()=>{await interact(()=>root.unmount());client.clear()}};
      }
    `,
    loader: 'tsx', resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    sourcefile: 'convenios-exclusao.fixture.tsx',
  },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'convenios-deletion-fixture', setup(api) {
    const replacements = [
      [/useConveniosQueries$/, 'queries'], [/useFinanceiroSharedQueries$/, 'shared'],
      [/financeiro\.service$/, 'finance'], [/useConveniosRealtime$/, 'realtime'],
      [/convenios\.service$/, 'service'], [/convenios\.cache$/, 'cache'],
      [/ToastNotification$/, 'toast'],
      [/Convenio(?:Form|Credit|CloseMonth)Modal$|ConveniosKpis$/, 'unused'],
    ];
    for (const [filter, path] of replacements) {
      api.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
    }
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: mocks[path] }));
  } }],
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

const mes = (polo) => ({
  id: `mes-${polo}`, convenioId: `convenio-${polo}`, nome: `Convênio ${polo}`,
  poloId: polo, poloNome: `Polo ${polo}`, parceiroId: null, parceiroNome: null,
  competencia: '2026-10-01', status: 'ABERTO', saldoInicial: 0, creditos: 0,
  despesasPagas: 0, despesasPendentes: 0, saldoDisponivel: 0, saldoProjetado: 0,
  quantidadeCreditos: 0, quantidadeDespesas: 0, fechadoEm: null, observacao: null, sucessoraId: null,
});

const result = (polo) => ({
  replayed: false, poloId: polo, convenioId: `convenio-${polo}`, competenciaIds: [`mes-${polo}`],
});
const detailKey = (polo) => ['financeiro', 'convenios', 'detalhes', polo, `mes-${polo}`];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

async function withHarness(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true, url: 'https://universo.test/',
  });
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map([...Object.keys(globals), '__conveniosDeletion'].map((key) => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const fixture = {
    items: { A: [mes('A')], B: [mes('B')] }, calls: [], pending: [], invalidated: [], details: [], toasts: [],
    excluir(input) {
      this.calls.push({ ...input });
      const request = deferred();
      this.pending.push(request);
      return request.promise;
    },
  };
  globalThis.__conveniosDeletion = fixture;
  const { mount, interact } = require(bundle);
  const harness = await mount(document.getElementById('root'), 'A');
  try {
    await run({ dom, fixture, harness, interact });
  } finally {
    await harness.unmount();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const dialog = () => document.querySelector('[role="dialog"]');
const confirmButton = () => [...dialog().querySelectorAll('button')].find((button) => /^(Excluir convênio|Excluindo\.\.\.)$/.test(button.textContent.trim()));
const openDelete = async (interact, polo) => {
  await interact(() => {
    const trigger = document.querySelector(`[aria-label="Excluir convênio Convênio ${polo}"]`);
    assert.ok(trigger);
    trigger.focus();
    trigger.click();
  });
};

test('DOM sintético: confirmação, pending/Escape e erro preservam alvo e chave no retry', async () => {
  await withHarness(async ({ dom, fixture, harness, interact }) => {
    harness.client.setQueryData(detailKey('A'), { sentinel: 'A' });
    await openDelete(interact, 'A');
    assert.equal(fixture.calls.length, 0, 'abrir confirmação não exclui');
    assert.equal(dialog().getAttribute('aria-modal'), 'true');
    assert.ok(document.getElementById(dialog().getAttribute('aria-labelledby')));
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Fechar');
    assert.equal(document.body.style.overflow, 'hidden');
    assert.match(dialog().textContent, /convênio inteiro.*não apenas o mês/s);
    assert.match(dialog().textContent, /parceiro e a trilha de auditoria serão preservados/);
    assert.equal(confirmButton().disabled, true);
    await interact(() => confirmButton().click());
    assert.equal(fixture.calls.length, 0);
    await interact(() => dialog().querySelector('input[type="checkbox"]').click());
    assert.equal(confirmButton().disabled, false);
    await interact(() => {
      confirmButton().focus();
      document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Fechar', 'Tab volta ao primeiro controle');
    await interact(() => confirmButton().click());
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].poloId, 'A');
    assert.equal(fixture.calls[0].convenioId, 'convenio-A');
    assert.match(fixture.calls[0].requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(confirmButton().disabled, true);
    assert.equal(dialog().querySelector('input').disabled, true);
    await interact(() => {
      document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      dialog().querySelector('[aria-label="Fechar"]').click();
      confirmButton().click();
    });
    assert.ok(dialog(), 'Escape e fechar não desmontam durante exclusão');
    assert.equal(fixture.calls.length, 1, 'ação desabilitada não envia novamente');
    await interact(() => fixture.pending[0].reject(new Error('Falha sintética recuperável')));
    assert.match(dialog().querySelector('[role="alert"]').textContent, /Falha sintética recuperável/);
    assert.equal(confirmButton().disabled, false);
    assert.equal(fixture.toasts.filter(([kind]) => kind === 'success').length, 0);
    await interact(() => confirmButton().click());
    assert.deepEqual(fixture.calls[1], fixture.calls[0], 'retry conserva requestId e alvo original');
    await interact(() => fixture.pending[1].resolve(result('A')));
    assert.equal(dialog(), null);
    assert.equal(document.body.style.overflow, '');
    assert.equal(harness.client.getQueryData(detailKey('A')), undefined);
    assert.deepEqual(fixture.invalidated, ['A']);
    assert.equal(fixture.toasts.filter(([kind]) => kind === 'success').length, 1);
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Excluir convênio Convênio A');
  });
});

test('DOM sintético: trocar polo remonta detalhe e confirmação; resposta tardia não afeta o novo polo', async () => {
  await withHarness(async ({ fixture, harness, interact }) => {
    harness.client.setQueryData(detailKey('A'), { sentinel: 'A' });
    harness.client.setQueryData(detailKey('B'), { sentinel: 'B' });
    await interact(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Abrir').click());
    assert.match(document.body.textContent, /Extrato da competência/);
    await interact(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Excluir convênio').click());
    await interact(() => dialog().querySelector('input').click());
    await interact(() => confirmButton().click());
    assert.equal(fixture.calls.length, 1);
    await harness.render('B');
    assert.equal(dialog(), null, 'confirmação antiga não atravessa o polo');
    assert.doesNotMatch(document.body.textContent, /Convênio A|Extrato da competência/);
    assert.equal(fixture.details.some(({ polo, id }) => polo === 'B' && id === 'mes-A'), false);
    await openDelete(interact, 'B');
    assert.equal(dialog().querySelector('input').checked, false, 'novo polo requer nova confirmação');
    const confirmationB = dialog();
    await interact(() => fixture.pending[0].resolve(result('A')));
    assert.equal(dialog(), confirmationB, 'sucesso tardio de A não fecha o modal B');
    assert.match(dialog().textContent, /Convênio B/);
    assert.deepEqual(fixture.invalidated, ['A']);
    assert.equal(harness.client.getQueryData(detailKey('A')), undefined);
    assert.deepEqual(harness.client.getQueryData(detailKey('B')), { sentinel: 'B' });
    assert.equal(fixture.calls.length, 1, 'não houve exclusão de B por trocar polo');
    await interact(() => dialog().querySelector('[aria-label="Fechar"]').click());
    assert.equal(dialog(), null, 'fechar volta a funcionar sem operação pendente neste polo');
  });
});

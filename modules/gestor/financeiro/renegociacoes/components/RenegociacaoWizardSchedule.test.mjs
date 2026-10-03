import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// DOM sintético: não usa navegador, rede, sessão ou cobranças reais.
const require = createRequire(import.meta.url);
const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina RENEGOCIACAO_JSDOM_PATH para jsdom@26.1.0.');
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);
const components = process.env.RENEGOCIACAO_TEST_SOURCE_ROOT
  ? resolve(process.env.RENEGOCIACAO_TEST_SOURCE_ROOT, 'modules/gestor/financeiro/renegociacoes/components')
  : fileURLToPath(new URL('.', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'universo-wizard-schedule-'));
const bundle = join(temporary, 'wizard-schedule.cjs');
after(async () => { await rm(temporary, { recursive: true, force: true }); });

await build({
  stdin: {
    contents: `
      import React,{act} from 'react';
      import {createRoot} from 'react-dom/client';
      import RenegociacaoWizard from './RenegociacaoWizard.tsx';
      const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
      export async function interact(action){
        await act(async()=>{await action()});
        await tick();await act(async()=>{});
      }
      export async function mount(container){
        const root=createRoot(container);
        await interact(()=>root.render(<RenegociacaoWizard
          group={globalThis.__wizardSchedule.group} initialSelectedIds={['rec-1','rec-2']}
          canSave={true} onClose={()=>globalThis.__wizardSchedule.closed++}
          onSaved={(proposal,replayed)=>globalThis.__wizardSchedule.saved.push({proposal,replayed})}/>));
        return {unmount:()=>interact(()=>root.unmount())};
      }
    `,
    loader: 'tsx', resolveDir: components, sourcefile: 'wizard-schedule.fixture.tsx',
  },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  nodePaths: [dirname(dirname(require.resolve('react/package.json')))],
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'wizard-schedule-fixture', setup(api) {
    api.onResolve({ filter: /useRenegociacoesQueries$/ }, () => ({ path: 'queries', namespace: 'fixture' }));
    api.onResolve({ filter: /useRenegociacaoSelectionSummary$/ }, () => ({ path: 'summary', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: components, contents: path === 'queries' ? `
      import {useState,useCallback} from 'react';
      const clean={isPending:false,isError:false,error:null,data:undefined};
      function useFixtureMutation(kind){
        const [state,setState]=useState(clean);
        const reset=useCallback(()=>setState(clean),[]);
        const mutateAsync=useCallback(async(input)=>{
          const fixture=globalThis.__wizardSchedule;
          fixture[kind+'Calls'].push(structuredClone(input));
          setState({...clean,isPending:true});
          try {
            const response=fixture[kind+'Responses'].shift();
            if(!response)throw Error('Resposta sintética ausente: '+kind);
            const data=await response;
            setState({...clean,data});return data;
          } catch(error){setState({...clean,isError:true,error});throw error;}
        },[kind]);
        return {...state,reset,mutateAsync};
      }
      export const useRenegociacaoCandidateItems=()=>globalThis.__wizardSchedule.itemsQuery;
      export const useRenegociacaoMutations=()=>({
        preview:useFixtureMutation('preview'),save:useFixtureMutation('save')});
    ` : `
      export const useRenegociacaoSelectionSummary=()=>({
        data:undefined,loading:false,error:null,refetch:async()=>{}});
    ` }));
  } }],
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

const identity = { poloId: 'polo-sintetico', alunoId: 'aluno-sintetico', matriculaId: 'mat-sintetica', turmaId: 'turma-sintetica' };
const defaults = {
  origin: 'TURMA', punctualDiscount: { kind: 'FIXED_CENTS', amountCents: 0 },
  monthlyInterest: { kind: 'MONTHLY_PERCENTAGE', basisPoints: 100 },
  penalty: { kind: 'PERCENTAGE', basisPoints: 200 },
};
const group = { ...identity, alunoNome: 'Aluno Sintético', matriculaCodigo: 'MAT-TESTE', turmaNome: 'Turma Sintética',
  policyKind: 'TECHNICAL', courseType: 'TECNICO', openCount: 2, eligibilityPending: true,
  eligibleCount: null, blockedCount: null, overdueCount: 2, futureCount: 0, principalCents: 32000,
  accruedInterestCents: null, accruedPenaltyCents: null, grossDebtCents: null,
  oldestDueDate: '2026-09-10', nextDueDate: null };
const initialEntries = [
  { sequence: 0, kind: 'DOWN_PAYMENT', dueDate: '2026-10-03', amountCents: 2000 },
  { sequence: 1, kind: 'INSTALLMENT', dueDate: '2026-11-10', amountCents: 15000 },
  { sequence: 2, kind: 'INSTALLMENT', dueDate: '2026-12-10', amountCents: 15000 },
];
const manualEntries = [
  { sequence: 1, dueDate: '2026-11-12', amountCents: 14000 },
  { sequence: 2, dueDate: '2026-12-14', amountCents: 16000 },
];
const previewResult = (manual = false) => ({
  version: manual ? 3 : 2, asOf: '2026-10-03', identity,
  selection: { receivableIds: ['rec-1', 'rec-2'], itemCount: 2, overdueCount: 2, futureCount: 0 },
  sourceItems: [],
  policySnapshot: { kind: 'TECHNICAL', defaults, effective: defaults, differsFromDefault: false,
    provenance: { punctualDiscount: 'HERDADO', monthlyInterest: 'HERDADO', penalty: 'HERDADO' } },
  calculationSnapshot: {},
  totals: { principalCents: 32000, accruedInterestCents: 0, accruedPenaltyCents: 0,
    grossDebtCents: 32000, waivedInterestCents: 0, waivedPenaltyCents: 0, commercialDiscountCents: 0,
    negotiatedCents: 32000, negotiatedTotalCents: 32000, downPaymentCents: 2000, financedCents: 30000 },
  schedule: { installmentCount: 2, firstDueDate: manual ? '2026-11-12' : '2026-11-10',
    entries: manual
      ? [initialEntries[0], ...manualEntries.map((entry) => ({ ...entry, kind: 'INSTALLMENT' }))]
      : initialEntries },
  requiresApproval: manual, approvalReasons: manual ? ['CUSTOM_SCHEDULE'] : [], selectionFingerprint: 'selection-test',
  policyFingerprint: 'policy-test', calculationFingerprint: manual ? 'calculation-manual' : 'calculation-initial',
  proposalFingerprint: manual ? 'proposal-manual-validado' : 'proposal-inicial-validado',
});
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};
const dialog = () => document.querySelector('[role="dialog"]');
const button = (label) => [...dialog().querySelectorAll('button')]
  .find((element) => element.textContent.trim() === label);
const footerButton = (label) => [...dialog().querySelectorAll('footer button')]
  .find((element) => element.textContent.includes(label));
const field = (label) => {
  const aria = [...dialog().querySelectorAll('input, textarea')].find((element) => element.getAttribute('aria-label') === label);
  const control = aria || [...dialog().querySelectorAll('label')]
    .find((element) => element.textContent.includes(label))?.querySelector('input, textarea');
  assert.ok(control, `Campo deve existir: ${label}`);
  return control;
};
const setField = async (dom, interact, label, value) => {
  await interact(() => {
    const input = field(label);
    const prototype = input.tagName === 'TEXTAREA'
      ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
};

async function withHarness(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true, url: 'https://universo.test/',
  });
  const fixture = {
    group, closed: 0, saved: [], previewCalls: [], saveCalls: [], previewResponses: [], saveResponses: [],
    itemsQuery: { isPending: false, isError: false, error: null, refetch: async () => {}, data: {
      version: 2, asOf: '2026-10-03', identity, policyDefaults: defaults,
      items: [1, 2].map((number) => ({ receivableId: `rec-${number}`, number,
        label: `Parcela sintética ${number}`, dueDate: '2026-09-10', status: 'PENDENTE', overdue: true,
        lateDays: 23, principalCents: 16000, interestCents: 0, penaltyCents: 0, debtCents: 16000,
        policyKind: 'TECHNICAL', sourceSystem: 'LOCAL', eligibility: { eligible: true, code: 'ELIGIBLE', reason: '' } })),
    } },
  };
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
    __wizardSchedule: fixture };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { mount, interact } = require(bundle);
  const harness = await mount(document.getElementById('root'));
  const review = async () => {
    await interact(() => footerButton('Continuar').click());
    await setField(dom, interact, 'Entrada', '20,00');
    await setField(dom, interact, 'Parcelas restantes', '2');
    await setField(dom, interact, 'Primeiro vencimento', '2026-11-10');
    fixture.previewResponses.push(Promise.resolve(previewResult()));
    assert.equal(footerButton('Simular').disabled, false);
    await interact(() => footerButton('Simular').click());
    assert.match(dialog().textContent, /Etapa 3 de 3/);
  };
  try { await run({ dom, fixture, interact, review }); }
  finally {
    await harness.unmount(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('cronograma manual exige validação canônica, preserva entrada e congela o payload no retry de salvamento', async () => {
  await withHarness(async ({ dom, fixture, interact, review }) => {
    await review();
    assert.equal(field('Vencimento da parcela 1').value, '2026-11-10');
    assert.equal(field('Valor da parcela 1').value, '150,00');
    await setField(dom, interact, 'Vencimento da parcela 1', '2026-11-12');
    await setField(dom, interact, 'Valor da parcela 1', '140,00');
    assert.equal(footerButton('Salvar proposta').disabled, true);
    await interact(() => footerButton('Salvar proposta').click());
    assert.equal(fixture.saveCalls.length, 0, 'rascunho não validado nunca é salvo');
    assert.equal(fixture.previewCalls.length, 1, 'editar não consulta nem calcula automaticamente');
    const invalid = deferred(); fixture.previewResponses.push(invalid.promise);
    await interact(() => button('Validar cronograma').click());
    assert.equal(footerButton('Salvar proposta').disabled, true);
    assert.equal(field('Valor da parcela 1').matches(':disabled'), true);
    await interact(() => invalid.reject(new Error('A soma das parcelas não corresponde ao saldo.')));
    assert.match(dialog().textContent, /A soma das parcelas não corresponde ao saldo/);
    assert.match(dialog().textContent, /Etapa 3 de 3/);
    assert.equal(field('Valor da parcela 1').value, '140,00');
    assert.equal(field('Valor da parcela 1').matches(':disabled'), false, 'erro permite corrigir o rascunho');
    await setField(dom, interact, 'Vencimento da parcela 2', '2026-12-14');
    await setField(dom, interact, 'Valor da parcela 2', '160,00');
    fixture.previewResponses.push(Promise.resolve(previewResult(true)));
    await interact(() => button('Validar cronograma').click());
    assert.deepEqual(fixture.previewCalls.at(-1).terms.scheduleEntries, manualEntries);
    assert.equal(fixture.previewCalls.at(-1).terms.downPaymentCents, 2000);
    assert.equal(fixture.previewCalls.at(-1).terms.scheduleEntries.some((entry) => entry.sequence === 0), false);
    assert.equal(footerButton('Salvar proposta').disabled, true, 'cronograma personalizado exige justificativa canônica');
    await setField(dom, interact, 'Justificativa obrigatória', 'Datas e valores acordados com o aluno.');
    assert.equal(footerButton('Salvar proposta').disabled, false);
    assert.equal(field('Vencimento da parcela 2').value, '2026-12-14');
    const ambiguous = deferred(); fixture.saveResponses.push(ambiguous.promise);
    await interact(() => footerButton('Salvar proposta').click());
    assert.equal(fixture.saveCalls.length, 1);
    const submitted = fixture.saveCalls[0];
    assert.deepEqual(submitted.terms.scheduleEntries, manualEntries);
    assert.equal(submitted.terms.downPaymentCents, 2000);
    assert.equal(submitted.expectedProposalFingerprint, 'proposal-manual-validado');
    assert.equal(submitted.reason, 'Datas e valores acordados com o aluno.');
    assert.match(submitted.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(submitted.submit, true);
    assert.deepEqual(submitted.receivableIds, ['rec-1', 'rec-2']);
    await interact(() => ambiguous.reject(new Error('Resposta perdida depois do envio.')));
    assert.match(dialog().textContent, /Resposta perdida depois do envio/);
    assert.equal(field('Valor da parcela 1').matches(':disabled'), true, 'erro de save não descongela valores enviados');
    assert.equal(field('Vencimento da parcela 1').matches(':disabled'), true);
    assert.equal(footerButton('Voltar').disabled, true, 'não abandonar solicitação ambígua voltando às condições');
    await interact(() => footerButton('Voltar').click());
    assert.match(dialog().textContent, /Etapa 3 de 3/);
    fixture.saveResponses.push(Promise.resolve({ proposal: { id: 'proposta-sintetica' }, replayed: true }));
    await interact(() => footerButton('Tentar novamente').click());
    assert.deepEqual(fixture.saveCalls[1], submitted, 'retry repete exatamente payload e requestId enviados');
    assert.deepEqual(fixture.saved, [{ proposal: { id: 'proposta-sintetica' }, replayed: true }]);
    assert.equal(fixture.closed, 0);
  });
});

test('restaurar descarta rascunho e voltar às Condições não reaproveita cronograma manual antigo', async () => {
  await withHarness(async ({ dom, fixture, interact, review }) => {
    await review();
    await setField(dom, interact, 'Vencimento da parcela 1', '2026-11-12');
    await setField(dom, interact, 'Valor da parcela 1', '140,00');
    await interact(() => button('Restaurar cronograma validado').click());
    assert.equal(field('Vencimento da parcela 1').value, '2026-11-10');
    assert.equal(field('Valor da parcela 1').value, '150,00');
    assert.equal(footerButton('Salvar proposta').disabled, false);
    assert.equal(fixture.previewCalls.length, 1, 'restauração reutiliza somente a última resposta já validada');
    await setField(dom, interact, 'Vencimento da parcela 1', '2026-11-12');
    await setField(dom, interact, 'Valor da parcela 1', '140,00');
    await setField(dom, interact, 'Vencimento da parcela 2', '2026-12-14');
    await setField(dom, interact, 'Valor da parcela 2', '160,00');
    fixture.previewResponses.push(Promise.resolve(previewResult(true)));
    await interact(() => button('Validar cronograma').click());
    await interact(() => footerButton('Voltar').click());
    assert.match(dialog().textContent, /Etapa 2 de 3/);
    fixture.previewResponses.push(Promise.resolve(previewResult()));
    await interact(() => footerButton('Simular').click());
    assert.equal(fixture.previewCalls.at(-1).terms.scheduleEntries, undefined);
    assert.equal(field('Vencimento da parcela 1').value, '2026-11-10');
    assert.equal(field('Valor da parcela 1').value, '150,00');
    assert.equal(fixture.saveCalls.length, 0);
  });
});

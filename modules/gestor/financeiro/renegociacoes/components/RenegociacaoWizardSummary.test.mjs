import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Teste sintético: não usa navegador, sessão, dados reais ou rede.
const require = createRequire(import.meta.url);
const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina RENEGOCIACAO_JSDOM_PATH para jsdom@26.1.0.');
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);
const sourceRoot = process.env.RENEGOCIACAO_TEST_SOURCE_ROOT;
const components = sourceRoot
  ? resolve(sourceRoot, 'modules/gestor/financeiro/renegociacoes/components')
  : fileURLToPath(new URL('.', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'universo-wizard-summary-'));
const bundle = join(temporary, 'wizard-summary.cjs');
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
        const render=()=>interact(()=>root.render(<RenegociacaoWizard
          group={globalThis.__wizardSummary.group} initialSelectedIds={['rec-1','rec-2','rec-3','rec-4']}
          canSave={true} onClose={()=>{}} onSaved={()=>{throw Error('Salvamento não esperado')}}/>));
        await render();
        return {render,unmount:()=>interact(()=>root.unmount())};
      }
    `,
    loader: 'tsx', resolveDir: components, sourcefile: 'wizard-summary.fixture.tsx',
  },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  nodePaths: [dirname(dirname(require.resolve('react/package.json')))],
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'wizard-summary-fixture', setup(api) {
    api.onResolve({ filter: /useRenegociacoesQueries$/ }, () => ({ path: 'queries', namespace: 'fixture' }));
    api.onResolve({ filter: /useRenegociacaoSelectionSummary$/ }, () => ({ path: 'summary', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path === 'queries' ? `
      export const useRenegociacaoCandidateItems=()=>globalThis.__wizardSummary.itemsQuery;
      const mutation={isPending:false,isError:false,error:null,data:undefined,reset:()=>{},
        mutateAsync:async()=>{globalThis.__wizardSummary.mutations++;throw Error('Mutação não esperada')}};
      export const useRenegociacaoMutations=()=>({preview:mutation,save:mutation});
    ` : `
      export const useRenegociacaoSelectionSummary=(identity,ids,asOf)=>{
        const fixture=globalThis.__wizardSummary;
        const key=JSON.stringify([...ids].sort());
        fixture.calls.push({identity:{...identity},ids:[...ids].sort(),asOf});
        return {data:fixture.summaries[key],loading:fixture.loading,error:fixture.error,
          refetch:async()=>{fixture.retries++}};
      };
    ` }));
  } }],
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

const identity = { poloId: 'polo-sintetico', alunoId: 'aluno-sintetico', matriculaId: 'mat-sintetica', turmaId: 'turma-sintetica' };
const defaults = {
  origin: 'TURMA', punctualDiscount: { kind: 'FIXED_CENTS', amountCents: 500 },
  monthlyInterest: { kind: 'MONTHLY_PERCENTAGE', basisPoints: 100 }, penalty: { kind: 'PERCENTAGE', basisPoints: 200 },
};
const group = { ...identity, alunoNome: 'Aluno Sintético', matriculaCodigo: 'MAT-TESTE', turmaNome: 'Turma Sintética',
  policyKind: 'TECHNICAL', courseType: 'TECNICO', openCount: 4, eligibilityPending: true,
  eligibleCount: null, blockedCount: null, overdueCount: 4, futureCount: 0, principalCents: 40000,
  accruedInterestCents: null, accruedPenaltyCents: null, grossDebtCents: null,
  oldestDueDate: '2026-09-10', nextDueDate: null };
const summary = (receivableIds, totals) => ({
  version: 1, asOf: '2026-10-03', identity, receivableIds, count: receivableIds.length, totals,
  discount: { status: 'KNOWN', message: 'Condição sintética conferida no servidor.', appliedToProposal: false },
  payableStatus: 'UNAVAILABLE', payableMessage: 'A cobrança exige conferência antes do pagamento.',
});
const summaries = {
  '["rec-1","rec-2","rec-3","rec-4"]': summary(['rec-1', 'rec-2', 'rec-3', 'rec-4'], {
    principalCents: 40000, punctualDiscountCents: 2000, discountedPrincipalCents: 38000,
    interestCents: 1275, penaltyCents: 400, grossDebtCents: 41675, payableCents: null,
  }),
  '["rec-1","rec-3","rec-4"]': summary(['rec-1', 'rec-3', 'rec-4'], {
    principalCents: 30000, punctualDiscountCents: 1500, discountedPrincipalCents: 28500,
    interestCents: 901, penaltyCents: 300, grossDebtCents: 31201, payableCents: null,
  }),
};
const findSummary = () => [...document.querySelectorAll('h4')]
  .find((heading) => heading.textContent === 'Resumo da seleção')?.closest('section');
const values = (panel) => Object.fromEntries([...panel.querySelectorAll('dt')]
  .map((label) => [label.textContent, label.nextElementSibling.textContent.replace(/\s+/g, ' ').trim()]));
const footerButton = (label) => [...document.querySelectorAll('[role="dialog"] footer button')]
  .find((button) => button.textContent.includes(label));

test('Condições repete o resumo canônico no topo e atualiza os totais após voltar e alterar a seleção', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true, url: 'https://universo.test/',
  });
  const fixture = {
    group, summaries, calls: [], loading: false, error: null, retries: 0, mutations: 0,
    itemsQuery: { isPending: false, isError: false, error: null, refetch: async () => {}, data: {
      version: 2, asOf: '2026-10-03', identity, policyDefaults: defaults,
      items: [1, 2, 3, 4].map((number) => ({
        receivableId: `rec-${number}`, number, label: `Parcela sintética ${number}`, dueDate: '2026-09-10',
        status: 'PENDENTE', overdue: true, lateDays: 23, principalCents: 10000, interestCents: 100,
        penaltyCents: 200, debtCents: 10300, policyKind: 'TECHNICAL', sourceSystem: 'LOCAL',
        eligibility: { eligible: true, code: 'ELIGIBLE', reason: '' },
      })),
    } },
  };
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
    __wizardSummary: fixture,
  };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { mount, interact } = require(bundle);
  const harness = await mount(document.getElementById('root'));
  try {
    const firstValues = values(findSummary());
    assert.equal(firstValues['Parcelas selecionadas'], '4');
    assert.equal(firstValues['Valor normal'], 'R$ 400,00');
    assert.equal(firstValues['Com desconto de pontualidade'], 'R$ 380,00');
    assert.equal(firstValues['Com multa e juros'], 'R$ 416,75');
    await interact(() => footerButton('Continuar').click());
    assert.match(document.querySelector('[role="dialog"]').textContent, /Etapa 2 de 3/);
    const termsSummary = findSummary();
    assert.ok(termsSummary, 'o resumo da seleção permanece visível na etapa Condições');
    assert.deepEqual(values(termsSummary), firstValues, 'não há cálculo ou troca de totais ao avançar');
    const fields = document.querySelector('[role="dialog"] main fieldset');
    assert.ok(fields);
    assert.ok(termsSummary.compareDocumentPosition(fields) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'resumo vem antes dos campos, não no fim do formulário');
    assert.deepEqual(fixture.calls.at(-1).ids, ['rec-1', 'rec-2', 'rec-3', 'rec-4']);
    assert.equal(fixture.calls.at(-1).asOf, '2026-10-03');

    await interact(() => footerButton('Voltar').click());
    await interact(() => document.querySelector('[data-receivable-id="rec-2"]').click());
    const changedValues = values(findSummary());
    assert.equal(changedValues['Parcelas selecionadas'], '3');
    assert.equal(changedValues['Valor normal'], 'R$ 300,00');
    assert.equal(changedValues['Com desconto de pontualidade'], 'R$ 285,00');
    assert.equal(changedValues['Com multa e juros'], 'R$ 312,01');
    await interact(() => footerButton('Continuar').click());
    assert.deepEqual(values(findSummary()), changedValues, 'a etapa 2 acompanha a nova seleção canônica');
    assert.deepEqual(fixture.calls.at(-1).ids, ['rec-1', 'rec-3', 'rec-4']);
    assert.doesNotMatch(findSummary().textContent, /416,75/);
    assert.match(findSummary().textContent, /não é concedido automaticamente à proposta/);

    fixture.loading = true;
    await harness.render();
    assert.match(document.querySelector('[role="dialog"]').textContent, /Conferindo valores/);
    assert.equal(findSummary(), undefined, 'consulta pendente não mantém montantes antigos');
    fixture.loading = false;
    fixture.error = new Error('Falha sintética de consulta');
    await harness.render();
    assert.match(document.querySelector('[role="dialog"]').textContent, /Não foi possível conferir os valores/);
    assert.equal(findSummary(), undefined, 'erro não vira zero nem exibe totais anteriores');
    await interact(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Tentar novamente')).click());
    assert.equal(fixture.retries, 1);
    fixture.error = null;
    await harness.render();
    assert.deepEqual(values(findSummary()), changedValues);
    assert.equal(fixture.mutations, 0, 'navegar entre etapas não simula, salva nem opera cobranças');
  } finally {
    await harness.unmount();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

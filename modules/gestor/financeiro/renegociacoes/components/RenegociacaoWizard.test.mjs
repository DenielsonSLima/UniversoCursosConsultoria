import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) {
  throw new Error('Defina RENEGOCIACAO_JSDOM_PATH com o caminho absoluto do pacote jsdom@26.1.0.');
}

const require = createRequire(import.meta.url);
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0', 'o teste exige jsdom@26.1.0');
const { JSDOM } = require(jsdomPath);
const buildDirectory = await mkdtemp(join(tmpdir(), 'universo-renegociacao-wizard-'));
const bundlePath = join(buildDirectory, 'renegociacao-wizard.fixture.cjs');

after(async () => {
  await rm(buildDirectory, { recursive: true, force: true });
});

const fixture = String.raw`
  import React, { act, useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import CandidateGroups from './CandidateGroups.tsx';
  import RenegociacaoWizard from './RenegociacaoWizard.tsx';

  const candidateGroup = {
    poloId: 'polo-1', alunoId: 'aluno-1', matriculaId: 'mat-1', turmaId: 'turma-1',
    alunoNome: 'Ana Souza', matriculaCodigo: 'MAT-1', turmaNome: 'Turma Alfa',
    policyKind: 'TECHNICAL', courseType: 'TECNICO', openCount: 3, eligibilityPending: true,
    eligibleCount: null, blockedCount: null, overdueCount: 2, futureCount: 1,
    principalCents: 30000, accruedInterestCents: null, accruedPenaltyCents: null,
    grossDebtCents: null, oldestDueDate: '2026-08-10', nextDueDate: '2026-11-10',
  };

  function Harness() {
    const [wizard, setWizard] = useState(null);
    return <>
      <CandidateGroups
        data={{ version: 2, asOf: '2026-10-03', groups: [candidateGroup], totalGroups: 1, totalStudents: 1, pageBy: 'STUDENT', page: 1, pageSize: 20 }}
        loading={false}
        error={null}
        search=""
        onRetry={() => {}}
        onPage={() => {}}
        onStart={(group, selectedIds) => setWizard({ group, selectedIds })}
      />
      {wizard ? <RenegociacaoWizard
        group={wizard.group}
        initialSelectedIds={wizard.selectedIds}
        canSave={true}
        onClose={() => setWizard(null)}
        onSaved={() => {}}
      /> : null}
    </>;
  }

  let mountedRoot;
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  export async function settle() {
    await act(async () => {});
    await nextFrame();
    await act(async () => {});
  }
  export async function mountHarness(container) {
    mountedRoot = createRoot(container);
    await act(async () => { mountedRoot.render(<Harness />); });
    await settle();
    return async () => { await act(async () => { mountedRoot.unmount(); }); };
  }
  export async function rerenderHarness() {
    await act(async () => { mountedRoot.render(<Harness />); });
    await settle();
  }
  export async function interact(action) {
    await act(async () => { action(); });
    await settle();
  }
`;

await build({
  stdin: {
    contents: fixture,
    loader: 'tsx',
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    sourcefile: 'renegociacao-wizard.fixture.tsx',
  },
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{
    name: 'renegociacao-query-fixture',
    setup(buildApi) {
      buildApi.onResolve({ filter: /useRenegociacoesQueries$/ }, () => ({ path: 'renegociacao-query', namespace: 'fixture' }));
      buildApi.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        loader: 'js',
        contents: `
          export const useRenegociacaoCandidateItems = (matriculaId) => matriculaId
            ? globalThis.__wizardQueries[matriculaId]
            : { data: undefined, isPending: false, isError: false, error: null, refetch: async () => {} };
          const mutation = {
            data: undefined, isPending: false, isError: false, error: null,
            mutateAsync: async () => { throw new Error('mutation not expected in selection test'); },
            reset: () => {},
          };
          export const useRenegociacaoMutations = () => ({ preview: mutation, save: mutation });
        `,
      }));
    },
  }],
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

const policyDefaults = {
  origin: 'TURMA',
  punctualDiscount: { kind: 'FIXED_CENTS', amountCents: 0 },
  monthlyInterest: { kind: 'MONTHLY_PERCENTAGE', basisPoints: 100 },
  penalty: { kind: 'PERCENTAGE', basisPoints: 200 },
};
const item = (receivableId, label, eligible, reason = '') => ({
  receivableId, number: 1, label, dueDate: '2026-09-10', status: 'PENDENTE', overdue: true,
  lateDays: 23, principalCents: 10000, interestCents: 100, penaltyCents: 200, debtCents: 10300,
  policyKind: 'TECHNICAL', sourceSystem: 'LOCAL', eligibility: { eligible, code: eligible ? 'ELIGIBLE' : 'LINKED', reason },
});

test('lista entrega 1 ou N IDs ao wizard, que revalida refetch, erro e identidade', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://universo.test/',
  });
  const globalKeys = [
    'window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'FocusEvent',
    'MessageChannel', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
    'IS_REACT_ACT_ENVIRONMENT', '__wizardQueries',
  ];
  const previousGlobals = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalItems = [
    item('rec-1', 'Parcela 1', true),
    item('rec-2', 'Parcela 2', true),
    item('rec-blocked', 'Parcela bloqueada', false, 'Já vinculada a outra proposta.'),
  ];
  const correctData = {
    version: 2,
    asOf: '2026-10-03',
    identity: { poloId: 'polo-1', alunoId: 'aluno-1', matriculaId: 'mat-1', turmaId: 'turma-1' },
    policyDefaults,
    items: originalItems,
  };
  const queries = {
    'mat-1': { data: correctData, isPending: false, isError: false, error: null, refetch: async () => {} },
  };
  const testGlobals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    FocusEvent: dom.window.FocusEvent,
    MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    __wizardQueries: queries,
  };
  for (const [key, value] of Object.entries(testGlobals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const { interact, mountHarness, rerenderHarness } = require(bundlePath);
  const unmount = await mountHarness(document.getElementById('root'));
  const dialog = () => document.querySelector('[role="dialog"]');
  const listPanel = () => document.getElementById('candidate-enrollment-mat-1');
  const listAction = () => [...listPanel().querySelectorAll('button')].find((button) => button.textContent.includes('Continuar com'));
  const closeWizard = async () => {
    const close = dialog().querySelector('button[aria-label="Fechar renegociação"]');
    await interact(() => close.click());
    assert.equal(dialog(), null);
  };

  try {
    await interact(() => document.querySelector('button[aria-controls^="candidate-student-"]').click());
    await interact(() => document.querySelector('button[aria-controls="candidate-enrollment-mat-1"]').click());
    const firstListCheckbox = listPanel().querySelector('[data-receivable-id="rec-1"]');
    await interact(() => firstListCheckbox.click());
    await interact(() => listAction().click());

    let currentDialog = dialog();
    assert.ok(currentDialog, 'ação da lista abre o modal real');
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-1"]').checked, true);
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-2"]').checked, false);
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-blocked"]').disabled, true);
    await closeWizard();

    const selectAll = [...listPanel().querySelectorAll('button')].find((button) => button.textContent.includes('Marcar elegíveis'));
    await interact(() => selectAll.click());
    await interact(() => listAction().click());
    currentDialog = dialog();
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-1"]').checked, true);
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-2"]').checked, true);

    queries['mat-1'] = {
      ...queries['mat-1'],
      data: {
        ...correctData,
        items: originalItems.map((candidate) =>
          candidate.receivableId === 'rec-2'
            ? { ...candidate, eligibility: { eligible: false, code: 'LINKED', reason: 'Bloqueada no refetch.' } }
            : candidate,
        ),
      },
    };
    globalThis.__wizardQueries = queries;
    await rerenderHarness();
    currentDialog = dialog();
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-1"]').checked, true);
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-2"]').checked, false);
    assert.equal(currentDialog.querySelector('[data-receivable-id="rec-2"]').disabled, true);
    const continueButton = [...currentDialog.querySelectorAll('footer button')].find((button) => button.textContent.includes('Continuar'));
    assert.equal(continueButton.disabled, false, 'refetch preserva a parcela que continua elegível');

    queries['mat-1'] = { ...queries['mat-1'], isError: true, error: { message: 'Falha de atualização.' } };
    globalThis.__wizardQueries = queries;
    await rerenderHarness();
    currentDialog = dialog();
    assert.match(currentDialog.textContent, /Não foi possível carregar/);
    assert.equal(continueButton.disabled, true, 'erro com dado anterior não libera avanço');

    queries['mat-1'] = {
      ...queries['mat-1'],
      isError: false,
      error: null,
      data: { ...correctData, identity: { ...correctData.identity, poloId: 'polo-2' } },
    };
    globalThis.__wizardQueries = queries;
    await rerenderHarness();
    currentDialog = dialog();
    assert.match(currentDialog.textContent, /não pertencem a este aluno, matrícula, turma e polo/);
    assert.equal(currentDialog.querySelectorAll('[data-receivable-id]').length, 0);
    assert.equal(continueButton.disabled, true, 'identidade divergente bloqueia o wizard');
    await closeWizard();
  } finally {
    await unmount();
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (!descriptor) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
  }
});

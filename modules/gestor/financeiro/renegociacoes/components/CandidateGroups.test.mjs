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
const buildDirectory = await mkdtemp(join(tmpdir(), 'universo-renegociacao-candidates-'));
const bundlePath = join(buildDirectory, 'candidate-groups.fixture.cjs');

after(async () => {
  await rm(buildDirectory, { recursive: true, force: true });
});

const fixture = String.raw`
  import React, { act, useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import CandidateGroups from './CandidateGroups.tsx';

  const group = (id, turma) => ({
    poloId: 'polo-1', alunoId: 'aluno-1', matriculaId: id, turmaId: 'turma-' + id,
    alunoNome: 'Ana Souza', matriculaCodigo: id.toUpperCase(), turmaNome: turma,
    policyKind: 'TECHNICAL', courseType: 'TECNICO', openCount: 3, eligibilityPending: true,
    eligibleCount: null, blockedCount: null, overdueCount: 2, futureCount: 1,
    principalCents: 30000, accruedInterestCents: null, accruedPenaltyCents: null,
    grossDebtCents: null, oldestDueDate: '2026-08-10', nextDueDate: '2026-11-10',
  });
  const groups = [group('mat-1', 'Turma Alfa'), group('mat-2', 'Turma Beta'), group('mat-3', 'Turma Gama')];

  function Harness() {
    const [started, setStarted] = useState({ groupId: '', ids: [] });
    return <>
      <CandidateGroups
        data={{ version: 2, asOf: '2026-10-03', groups, totalGroups: 3, totalStudents: 1, pageBy: 'STUDENT', page: 1, pageSize: 20 }}
        loading={false}
        error={null}
        search=""
        onRetry={() => {}}
        onPage={() => {}}
        onStart={(candidateGroup, ids) => setStarted({ groupId: candidateGroup.matriculaId, ids })}
      />
      <output id="started" data-group={started.groupId} data-ids={started.ids.join(',')} />
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
    sourcefile: 'candidate-groups.fixture.tsx',
  },
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{
    name: 'candidate-query-fixture',
    setup(build) {
      build.onResolve({ filter: /useRenegociacoesQueries$/ }, () => ({ path: 'candidate-query', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        loader: 'js',
        contents: `
          export const useRenegociacaoCandidateItems = (matriculaId) => {
            if (matriculaId) globalThis.__candidateRequests.push(matriculaId);
            return matriculaId
              ? globalThis.__candidateQueries[matriculaId]
              : { data: undefined, isPending: false, isError: false, error: null, refetch: async () => {} };
          };
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

test('expande sob demanda, seleciona 1 ou N e bloqueia erros de escopo/eligibilidade', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://universo.test/',
  });
  const globalKeys = [
    'window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent',
    'MessageChannel', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
    'IS_REACT_ACT_ENVIRONMENT', '__candidateRequests', '__candidateQueries', '__candidateRetries',
  ];
  const previousGlobals = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const retries = { 'mat-2': 0 };
  const queries = {
    'mat-1': {
      data: {
        version: 2,
        asOf: '2026-10-03',
        identity: { poloId: 'polo-1', alunoId: 'aluno-1', matriculaId: 'mat-1', turmaId: 'turma-mat-1' },
        policyDefaults,
        items: [
          item('rec-1', 'Parcela 1', true),
          item('rec-2', 'Parcela 2', true),
          item('rec-blocked', 'Parcela bloqueada', false, 'Já vinculada a outra proposta.'),
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: async () => {},
    },
    'mat-2': {
      data: undefined,
      isPending: false,
      isError: true,
      error: { message: 'Falha simulada.' },
      refetch: async () => { retries['mat-2'] += 1; },
    },
    'mat-3': {
      data: {
        version: 2,
        asOf: '2026-10-03',
        identity: { poloId: 'polo-2', alunoId: 'aluno-1', matriculaId: 'mat-3', turmaId: 'turma-mat-3' },
        policyDefaults,
        items: [item('foreign', 'Parcela externa', true)],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: async () => {},
    },
  };
  const testGlobals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    __candidateRequests: [],
    __candidateQueries: queries,
    __candidateRetries: retries,
  };
  for (const [key, value] of Object.entries(testGlobals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const { interact, mountHarness, rerenderHarness } = require(bundlePath);
  const unmount = await mountHarness(document.getElementById('root'));
  const enrollmentButtons = () => [...document.querySelectorAll('button[aria-controls^="candidate-enrollment-"]')];
  const started = () => document.getElementById('started').dataset;

  try {
    assert.deepEqual(globalThis.__candidateRequests, [], 'lista inicial não consulta detalhes em N+1');
    const studentButton = document.querySelector('button[aria-controls^="candidate-student-"]');
    assert.equal(studentButton.getAttribute('aria-expanded'), 'false');
    await interact(() => studentButton.click());
    assert.equal(studentButton.getAttribute('aria-expanded'), 'true');
    assert.equal(enrollmentButtons().length, 3);
    assert.deepEqual(globalThis.__candidateRequests, [], 'abrir aluno ainda não consulta cada matrícula');

    await interact(() => enrollmentButtons()[0].click());
    assert.ok(globalThis.__candidateRequests.includes('mat-1'));
    const firstPanel = document.getElementById('candidate-enrollment-mat-1');
    const firstCheckbox = firstPanel.querySelector('[data-receivable-id="rec-1"]');
    const blockedCheckbox = firstPanel.querySelector('[data-receivable-id="rec-blocked"]');
    const actionButton = [...firstPanel.querySelectorAll('button')].find((button) => button.textContent.includes('Continuar com'));
    assert.equal(blockedCheckbox.disabled, true);
    assert.match(blockedCheckbox.closest('label').textContent, /Já vinculada a outra proposta/);
    assert.equal(actionButton.disabled, true);

    await interact(() => firstCheckbox.click());
    assert.equal(actionButton.disabled, false);
    assert.match(actionButton.textContent, /Continuar com 1/);
    await interact(() => actionButton.click());
    assert.deepEqual({ group: started().group, ids: started().ids }, { group: 'mat-1', ids: 'rec-1' });

    const toggleAll = [...firstPanel.querySelectorAll('button')].find((button) => button.textContent.includes('Marcar elegíveis'));
    await interact(() => toggleAll.click());
    assert.match(actionButton.textContent, /Continuar com 2/);
    await interact(() => actionButton.click());
    assert.deepEqual({ group: started().group, ids: started().ids }, { group: 'mat-1', ids: 'rec-1,rec-2' });

    queries['mat-1'] = {
      ...queries['mat-1'],
      data: {
        ...queries['mat-1'].data,
        items: queries['mat-1'].data.items.map((candidate) =>
          candidate.receivableId === 'rec-2'
            ? { ...candidate, eligibility: { eligible: false, code: 'LINKED', reason: 'Vinculada durante a revisão.' } }
            : candidate,
        ),
      },
    };
    globalThis.__candidateQueries = queries;
    await rerenderHarness();
    assert.match(actionButton.textContent, /Continuar com 1/);
    await interact(() => actionButton.click());
    assert.deepEqual(
      { group: started().group, ids: started().ids },
      { group: 'mat-1', ids: 'rec-1' },
      'refetch preserva a elegível e remove a parcela que ficou bloqueada',
    );
    const clearAll = [...firstPanel.querySelectorAll('button')].find((button) => button.textContent.includes('Desmarcar todas'));
    await interact(() => clearAll.click());
    assert.equal(actionButton.disabled, true);

    await interact(() => enrollmentButtons()[1].click());
    const errorPanel = document.getElementById('candidate-enrollment-mat-2');
    assert.match(errorPanel.textContent, /Não foi possível carregar/);
    const retry = [...errorPanel.querySelectorAll('button')].find((button) => button.textContent.includes('Tentar novamente'));
    await interact(() => retry.click());
    assert.equal(retries['mat-2'], 1);

    await interact(() => enrollmentButtons()[2].click());
    const guardedPanel = document.getElementById('candidate-enrollment-mat-3');
    assert.match(guardedPanel.textContent, /não pertencem a este aluno, matrícula, turma e polo/);
    assert.equal(guardedPanel.querySelectorAll('[data-receivable-id]').length, 0);
  } finally {
    await unmount();
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (!descriptor) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
  }
});

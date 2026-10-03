import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina RENEGOCIACAO_JSDOM_PATH para jsdom@26.1.0.');
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);
const temporary = await mkdtemp(join(tmpdir(), 'universo-renegociacao-activation-'));
const bundle = join(temporary, 'activation.cjs');
after(async () => { await rm(temporary, { recursive: true, force: true }); });

await build({
  stdin: { contents: `
    import React, {act} from 'react';
    import {createRoot} from 'react-dom/client';
    import ActivationPanel from './ActivationPanel.tsx';
    export async function mount(container) {
      const root=createRoot(container);
      const render=async()=>{await act(async()=>root.render(<ActivationPanel detail={globalThis.__activation.detail}
        onDialogChange={(open)=>{globalThis.__activation.dialog=open}}
        onBusyChange={(busy)=>{globalThis.__activation.busy=busy}}/>));};
      await render();
      return {render,unmount:async()=>{await act(async()=>root.unmount())}};
    }
    export async function interact(action){await act(async()=>{await action()});}
  `, loader: 'tsx', resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'activation.fixture.tsx' },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'activation-fixture', setup(api) {
    api.onResolve({ filter: /useRenegociacaoActivation$/ }, () => ({ path: 'activation', namespace: 'fixture' }));
    api.onResolve({ filter: /useRenegociacoesQueries$/ }, () => ({ path: 'readiness', namespace: 'fixture' }));
    api.onResolve({ filter: /CanonicalSummary$/ }, () => ({ path: 'summary', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path === 'activation'
      ? `export const useRenegociacaoActivation=()=>globalThis.__activation.hook;`
      : path === 'readiness' ? `export const useRenegociacaoReadiness=()=>globalThis.__activation.readiness;`
        : `export default function CanonicalSummary(){return null;}` }));
  } }],
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('confirmação explícita, progresso parcial, retomada após reabrir, revisão e ACTIVE apenas do servidor', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'https://universo.test/' });
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MessageChannel: TestMessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map([...Object.keys(globals), '__activation'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const calls = [];
  const operation = { data: null, isSuccess: true, isFetching: false, isError: false, error: null, refetch: async () => {} };
  const query = {
    detail: { proposal: { id: 'agreement-1', poloId: 'polo-1', studentName: 'Ana', lifecycleStatus: 'PROPOSED',
      version: 2, proposalFingerprint: 'fingerprint', capabilities: { canActivate: true, canResume: false } },
      canonicalSnapshot: { requiresApproval: false, approvalReasons: [] } },
    readiness: { data: { availability: 'AVAILABLE', capabilities: { activate: false, cancelSourceTitles: true, issueReplacementTitles: true, getActivation: true } },
      isPending: false, isFetching: false, isError: false, refetch: async () => {} },
    hook: { operation, activation: { isPending: false, isError: false, error: null, data: null,
      mutateAsync: async (input) => { calls.push(input); return { state: 'CANCELING_SOURCES' }; } } },
  };
  globalThis.__activation = query;
  const { mount, interact } = require(bundle);
  let harness = await mount(document.getElementById('root'));
  const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.includes(text));
  try {
    assert.equal(button('Conferir e efetivar'), undefined, 'capability backend false não é substituída pela UI');
    query.readiness.data.capabilities.activate = true;
    await harness.render();
    await interact(() => button('Conferir e efetivar').click());
    const confirmation = document.querySelector('[role="dialog"]');
    assert.ok(confirmation.className.includes('h-[100dvh] w-screen'));
    assert.match(confirmation.textContent, /cancela os títulos originais selecionados e emite os novos/);
    assert.equal(button('Confirmar e efetivar').disabled, true);
    assert.equal(calls.length, 0, 'abrir confirmação não chama o banco');
    await interact(() => confirmation.querySelector('input[type="checkbox"]').click());
    await interact(() => { button('Confirmar e efetivar').click(); button('Confirmar e efetivar')?.click(); });
    assert.equal(calls.length, 1, 'duplo clique não duplica invoke');
    const original = calls[0];
    assert.equal(original.approveCustomTerms, false);
    assert.equal(original.expectedVersion, 2);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.doesNotMatch(document.body.textContent, /Acordo efetivado/);

    operation.data = { operationId: 'operation-1', agreementId: 'agreement-1', requestId: original.requestId, approvedCustomTerms: false,
      state: 'CANCELING_SOURCES', expectedVersion: 2, expectedFingerprint: 'fingerprint', agreementVersion: 5,
      proposalFingerprint: 'fingerprint', sourcesTotal: 3, sourcesCanceled: 1,
      replacementsTotal: 2, replacementsIssued: 0, retryable: true };
    query.detail.proposal = { ...query.detail.proposal, lifecycleStatus: 'ACTIVATING', version: 5,
      capabilities: { canActivate: false, canResume: true } };
    await harness.unmount();
    harness = await mount(document.getElementById('root'));
    assert.match(document.body.textContent, /cancelamento confirmado: 1 \/ 3/);
    assert.equal(button('Conferir e efetivar'), undefined);
    await interact(() => button('Continuar operação').click());
    assert.deepEqual(calls[1], original, 'reabertura usa requestId e CAS originais do GET, não a versão atual');

    query.hook.activation.data = { ...operation.data, state: 'ACTIVE', retryable: false, sourcesCanceled: 3, replacementsIssued: 2 };
    await harness.render();
    assert.match(document.body.textContent, /Acordo efetivado/, 'ACTIVE da Edge prevalece sobre GET parcial antigo');
    assert.equal(button('Continuar operação'), undefined);
    query.hook.activation.data = null;

    operation.data = { ...operation.data, state: 'REVIEW_REQUIRED', retryable: false };
    query.detail.proposal.lifecycleStatus = 'REVIEW_REQUIRED';
    query.detail.proposal.capabilities.canResume = false;
    await harness.render();
    assert.match(document.body.textContent, /Revisão necessária/);
    assert.doesNotMatch(document.body.textContent, /Acordo efetivado|Substituição.*confirmada/);
    assert.equal(button('Continuar operação'), undefined);
    assert.equal(button('Conferir e efetivar'), undefined);

    operation.data = { ...operation.data, state: 'ACTIVE', sourcesCanceled: 3, replacementsIssued: 2 };
    query.detail.proposal.lifecycleStatus = 'ACTIVE';
    await harness.render();
    assert.match(document.body.textContent, /Acordo efetivado/);
    assert.doesNotMatch(document.body.textContent, /Acordo pago|honrado|quitado/);
    assert.equal(button('Continuar operação'), undefined);
    assert.equal(calls.length, 2);

    operation.data = null;
    query.detail.proposal = { ...query.detail.proposal, lifecycleStatus: 'PROPOSED', version: 2,
      capabilities: { canActivate: true, canResume: false } };
    const returned = [];
    query.hook.activation.mutateAsync = async (payload) => {
      calls.push(payload);
      const index = returned.length;
      const result = { agreementId: payload.agreementId, operationId: 'operation-2', requestId: payload.requestId,
        state: ['CANCELING_SOURCES', 'ISSUING_REPLACEMENTS', 'ACTIVE'][index],
        sourcesTotal: 3, sourcesCanceled: index === 0 ? 1 : 3, replacementsTotal: 2, replacementsIssued: index,
        retryable: index < 2, success: index === 2, code: null, message: 'Andamento confirmado.' };
      returned.push(result);
      query.hook.activation.data = result;
      return result;
    };
    query.hook.activation.data = null;
    await harness.unmount();
    harness = await mount(document.getElementById('root'));
    await interact(() => button('Conferir e efetivar').click());
    await interact(() => document.querySelector('[role="dialog"] input[type="checkbox"]').click());
    await interact(() => button('Confirmar e efetivar').click());
    assert.deepEqual(returned.map((result) => result.state), ['CANCELING_SOURCES', 'ISSUING_REPLACEMENTS', 'ACTIVE']);
    assert.equal(calls.length, 5, 'uma confirmação processa os três lotes sem exigir clique a cada quatro títulos');
    assert.deepEqual(calls.slice(2), [calls[2], calls[2], calls[2]]);
    assert.match(document.body.textContent, /Acordo efetivado/);
    assert.equal(query.busy, false);

    operation.data = null;
    query.hook.activation.data = null;
    query.detail.canonicalSnapshot.requiresApproval = true;
    query.detail.proposal = { ...query.detail.proposal, lifecycleStatus: 'PROPOSED', version: 2, reason: 'Condição registrada para o aluno.',
      capabilities: { canActivate: true, canResume: false, canApproveCustomTerms: false } };
    await harness.unmount();
    harness = await mount(document.getElementById('root'));
    assert.equal(button('Conferir e efetivar'), undefined, 'permissão custom ausente não é inferida de canActivate');
    query.detail.proposal.capabilities.canApproveCustomTerms = true;
    await harness.render();
    await interact(() => button('Conferir e efetivar').click());
    const customDialog = document.querySelector('[role="dialog"]');
    assert.match(customDialog.textContent, /Condição registrada para o aluno/);
    const customLabel = [...customDialog.querySelectorAll('label')].find((label) => label.textContent.includes('Aprovo explicitamente'));
    const bankLabel = [...customDialog.querySelectorAll('label')].find((label) => label.textContent.includes('Conferi os títulos originais'));
    assert.equal(customLabel.querySelector('input').checked, false, 'aprovação nunca vem marcada por padrão');
    await interact(() => bankLabel.querySelector('input').click());
    assert.equal(button('Confirmar e efetivar').disabled, true, 'confirmar cancelamento não aprova condições personalizadas');
    await interact(() => customLabel.querySelector('input').click());
    assert.equal(button('Confirmar e efetivar').disabled, false);
    query.detail.proposal.capabilities.canApproveCustomTerms = false;
    await harness.render();
    assert.equal(button('Confirmar e efetivar').disabled, true, 'revogação da capability fecha a aprovação já marcada');
    query.detail.proposal.capabilities.canApproveCustomTerms = true;
    await harness.render();
    returned.length = 0;
    await interact(() => button('Confirmar e efetivar').click());
    const approvedRequest = calls[5];
    assert.equal(approvedRequest.approveCustomTerms, true);
    assert.deepEqual(calls.slice(5), [approvedRequest, approvedRequest, approvedRequest], 'lotes automáticos mantêm consentimento e chave originais');

    operation.data = { operationId: 'operation-2', agreementId: 'agreement-1', requestId: approvedRequest.requestId,
      approvedCustomTerms: true, state: 'ISSUING_REPLACEMENTS', expectedVersion: 2, expectedFingerprint: 'fingerprint',
      agreementVersion: 5, proposalFingerprint: 'fingerprint', sourcesTotal: 3, sourcesCanceled: 3,
      replacementsTotal: 2, replacementsIssued: 1, retryable: true };
    query.detail.proposal = { ...query.detail.proposal, lifecycleStatus: 'ACTIVATING', version: 5,
      capabilities: { canActivate: false, canResume: true, canApproveCustomTerms: true } };
    query.hook.activation.data = null;
    query.hook.activation.mutateAsync = async (payload) => {
      calls.push(payload);
      return { ...operation.data, state: 'REVIEW_REQUIRED', retryable: false, success: false, code: 'BANK_REVIEW', message: 'Conferência necessária.' };
    };
    await harness.unmount();
    harness = await mount(document.getElementById('root'));
    assert.match(document.body.textContent, /preserva essa aprovação/);
    await interact(() => button('Continuar operação').click());
    assert.deepEqual(calls.at(-1), approvedRequest, 'retomada após reabrir não troca aprovação verdadeira por false');
  } finally {
    await harness.unmount(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
const jsdomPath = process.env.NFSE_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdomPath ? pathToFileURL(resolve(jsdomPath)).href : 'jsdom');
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
const source = { kind: 'PARTNER_SERVICE', id: id(4) };
const payload = { issuerName: 'EMITENTE SINTÉTICO', issuerCnpj: '00000000000100', recipientName: 'PARCEIRO SINTÉTICO', recipientDocument: '00000000000',
  modelId: id(3), modelVersion: 3, modelName: 'Modelo sintético', amount: '260.00', competenceDate: '2026-11-10', serviceDate: '2026-11-10', series: '123',
  nationalServiceCode: '080201', nbsCode: '122020000', serviceDescription: 'PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS', opSimpNac: '3', regApTribSN: '1', municipalityCode: '2803401', municipalRegistration: 'IM-SINTÉTICA', ibsCbs: { included: true, cst: '000', classificationCode: '000001', operationIndicatorCode: '030101', recipientSameAsAcquirer: true, personalUse: true, governmentPurchase: false } };

test('saved source reviews canonical snapshot and recovers issue and cancellation with the same IDs', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/nfse-source-ui-'));
  const dom = new JSDOM('<!doctype html><button id="opener">Revisar e emitir</button><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const bundle = resolve(temp, 'test.mjs');
  const compiled = await build({ entryPoints: [resolve(base, 'modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.tsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: bundle, loader: { '.css': 'empty' },
    plugins: [{ name: 'block-live-client', setup(builder) {
      builder.onResolve({ filter: /NfseCancellationTemplatePicker$/ }, () => ({ path: 'picker', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'blocked', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'picker' ? 'export default function Picker(props){return globalThis.__nfsePickerTest?.(props)||null;}' : 'export const supabase=new Proxy({},{get(){throw new Error("Live client forbidden")}});', loader: 'js' }));
    } }] });
  await writeFile(bundle, compiled.outputFiles[0].contents);
  const { default: Modal } = await import(pathToFileURL(bundle).href);
  const calls = [], notices = [], accessKey = '1'.repeat(50), expiry = () => new Date(Date.now() + 600_000).toISOString();
  const note = { previewId: id(5), state: 'AUTHORIZED', message: 'Autorização sintética', payload, number: '1', accessKey };
  const cancelPayload = { number: '1', accessKey, reasonCode: '1', justification: 'Erro no valor informado na emissão. Solicito o cancelamento desta NFS-e.' };
  let issuePending, cancelPending;
  const service = {
    previewSource: async (...args) => { calls.push({ action: 'PREVIEW_QUEUE', args }); return { previewId: id(5), expiresAt: expiry(), state: 'PREVIEWED', payload, capability: { available: true, reason: null } }; },
    issue: async (...args) => { calls.push({ action: 'ISSUE', args }); return new Promise((resolve, reject) => { issuePending = { resolve, reject }; }); },
    reconcile: async (...args) => { calls.push({ action: 'RECONCILE', args }); if (args[1] === id(42)) return { ...note, state: 'REJECTED', number: null, accessKey: null, codes: ['E0120', 'E9999'] }; return args[1] === id(40) ? { ...note, state: 'PREVIEWED', number: null, accessKey: null, expiresAt: new Date(Date.now() - 1000).toISOString(), capability: { available: true, reason: null } } : note; },
    previewCancellation: async (...args) => { calls.push({ action: 'CANCEL_PREVIEW', args }); return { previewId: id(5), cancelPreviewId: id(6), expiresAt: expiry(), state: 'PREVIEWED', payload: cancelPayload, capability: { available: true, reason: null } }; },
    cancel: async (...args) => { calls.push({ action: 'CANCEL', args }); return new Promise((resolve, reject) => { cancelPending = { resolve, reject }; }); },
    reconcileCancellation: async (...args) => { calls.push({ action: 'RECONCILE_CANCEL', args }); if (args[1] === id(50)) return { previewId: id(5), cancelPreviewId: id(6), state: 'CANCELLATION_PENDING', message: 'Resultado pendente.', payload: cancelPayload, retry: { availableAt: new Date(Date.now() - 1000).toISOString(), used: false } }; if (args[1] === id(44)) return { previewId: id(5), cancelPreviewId: id(6), state: 'PREVIEWED', message: 'Prévia expirada.', payload: cancelPayload, expiresAt: new Date(Date.now() - 1000).toISOString(), capability: { available: false, reason: 'PRODUCTION_PREVIEW_EXPIRED' } }; return { previewId: id(5), cancelPreviewId: id(6), state: 'CANCELLED', message: 'Evento sintético confirmado', payload: cancelPayload }; },
  };
  const selectedModel = { id: 'SYSTEM:ERROR_AMOUNT', version: 1, source: 'SYSTEM', category: 'VALOR', name: 'Modelo sintético formal', active: true,
    eventCode: '101101', reasonCode: '1', textTemplate: 'Solicito cancelar por erro no valor: {{detalhe}}.', requiresDetail: true };
  service.previewCancellationModel = async (...args) => { calls.push({ action: 'CANCEL_PREVIEW_SELECTED', args }); return {
    previewId: id(5), cancelPreviewId: id(6), state: 'PREVIEWED', expiresAt: expiry(), capability: { available: true, reason: null },
    payload: { ...cancelPayload, cancellationModel: selectedModel, detail: args[4], justification: selectedModel.textTemplate.replaceAll('{{detalhe}}', args[4]) } }; };
  service.retryCancellation = async (...args) => { calls.push({ action: 'RETRY_CANCEL', args }); return { previewId: id(5), cancelPreviewId: id(6), state: 'CANCELLATION_PENDING',
    message: 'Retomada pendente.', payload: cancelPayload, retry: { availableAt: null, used: true } }; };
  const root = createRoot(document.getElementById('root'));
  const render = props => root.render(React.createElement(React.StrictMode, null, React.createElement(Modal, { scope, source, label: payload.recipientName, amount: payload.amount, service, onClose() {}, onChanged() {}, onNotice: notice => notices.push(notice), ...props })));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  const button = text => [...document.querySelectorAll('button')].find(control => control.textContent.trim() === text);
  const click = async control => { assert(control, 'Control missing'); await act(async () => control.click()); await settle(); };
  const check = async text => click([...document.querySelectorAll('label')].find(label => label.textContent.includes(text))?.querySelector('input[type="checkbox"]'));
  const setValue = async (selector, value) => { await act(async () => { const input = document.querySelector(selector); assert(input, selector);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await settle(); };
  try {
    document.getElementById('opener').focus();
    await act(async () => render({})); await settle();
    assert.equal(calls.length, 1, 'Opening prepares once even in StrictMode, without dispatching');
    assert.equal(calls[0].action, 'PREVIEW_QUEUE');
    assert.equal(document.querySelector('input[type="date"]'), null);
    assert.deepEqual(calls[0].args.slice(2), [source]);
    assert(!/recipientDocument|modelId|amount|fiscalInput|Xml/.test(JSON.stringify(calls[0].args)));
    assert(document.body.textContent.includes('versão 3')); assert(document.body.textContent.includes('IBS/CBS')); assert(document.body.textContent.includes('030101'));
    assert(document.body.textContent.includes('260,00')); assert(document.body.textContent.includes(payload.serviceDescription));
    const review = [...document.querySelectorAll('details')].find(item => item.querySelector('summary')?.textContent === 'Ver dados da nota');
    assert(review); assert.equal(review.open, false, 'Review is optional and collapsed on opening');
    await click(review.querySelector('summary')); assert.equal(review.open, true);
    assert.equal(document.querySelector('input[type="checkbox"]'), null);
    assert.equal(button('Emitir NFS-e').disabled, false, 'Canonical capability enables the explicit button without a second acceptance checkbox');
    const send = button('Emitir NFS-e'); await act(async () => { send.click(); send.click(); }); await settle();
    assert.equal(calls.filter(row => row.action === 'ISSUE').length, 1);
    await act(async () => issuePending.reject(new Error('Resposta de emissão não confirmada.'))); await settle();
    assert(document.querySelector('[role="alert"]').textContent.includes('Resposta de emissão não confirmada'));
    assert.equal(button('Emitir NFS-e'), undefined);
    const stored = JSON.parse(dom.window.sessionStorage.getItem(dom.window.sessionStorage.key(0)));
    assert.deepEqual(Object.keys(stored).sort(), ['previewId', 'requestId']);
    await act(async () => render({ key: 'reopened', operation: { operationId: id(5), requestId: stored.requestId } })); await settle();
    assert.equal(calls.filter(row => row.action === 'RECONCILE').length, 1);
    assert.equal(calls.filter(row => row.action === 'ISSUE').length, 1);
    assert.equal(document.querySelector('textarea'), null, 'Summary never exposes cancellation fields');
    assert(button('Cancelar NFS-e').classList.contains('nfse-button-danger'));
    assert.equal(button('Consultar resultado da emissão'), undefined, 'Authorized summary has no manual result query');
    await click(button('Cancelar NFS-e'));
    assert.equal(document.querySelector('[role="dialog"] h2').textContent, 'Cancelar NFS-e');
    await click(button('Voltar ao resumo'));
    assert.equal(document.querySelector('textarea'), null);
    await click(button('Cancelar NFS-e'));
    assert.equal(button('Revisar cancelamento'), undefined); assert.equal(button('Confirmar cancelamento').disabled, true);
    await act(async () => { const input = document.querySelector('textarea[aria-label="Justificativa do cancelamento"]'); Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, cancelPayload.justification); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await settle();
    await check('Conferi a nota, o motivo');
    const cancel = button('Confirmar cancelamento'); await act(async () => { cancel.click(); cancel.click(); }); await settle();
    assert.equal(calls.filter(row => row.action === 'CANCEL').length, 1);
    await act(async () => cancelPending.reject(new Error('Resposta de cancelamento não confirmada.'))); await settle();
    await act(async () => render({ key: 'cancel-reopened', operation: { operationId: id(5), requestId: stored.requestId, cancelPreviewId: id(6), state: 'CANCELLED' } })); await settle();
    assert(document.body.textContent.includes('Cancelada')); assert.equal(calls.filter(row => row.action === 'RECONCILE_CANCEL').length, 1);
    assert(document.querySelector('[aria-label="Consulta do cancelamento"]').textContent.includes(cancelPayload.justification));
    assert.equal(button('Revisar cancelamento'), undefined);
    for (const row of calls.filter(row => row.action !== 'PREVIEW_QUEUE')) assert.equal(row.args[1], stored.requestId);
    assert.equal(calls.filter(row => row.action === 'ISSUE').length, 1); assert.equal(calls.filter(row => row.action === 'CANCEL').length, 1);
    assert.equal(document.querySelector('select,datalist'), null);
    await act(async () => render({ key: 'unsent-review', source: { kind: 'PARTNER_SERVICE', id: id(41) }, operation: { operationId: id(5), requestId: id(40), state: 'PREVIEWED' } })); await settle();
    assert.equal(button('Emitir NFS-e').disabled, true); await click(button('Atualizar dados desta operação'));
    assert.equal(calls.at(-1).action, 'PREVIEW_QUEUE'); assert.equal(calls.at(-1).args[1], id(40));
    assert.equal(button('Emitir NFS-e').disabled, false);
    assert.equal(calls.filter(row => row.action === 'ISSUE').length, 1, 'Reopening and renewal never dispatch automatically');
    await act(async () => render({ key: 'rejected-result', source: { kind: 'PARTNER_SERVICE', id: id(43) }, operation: { operationId: id(5), requestId: id(42), state: 'REJECTED' } })); await settle();
    assert(document.body.textContent.includes('Código(s) retornado(s): E0120, E9999'));
    assert(document.body.textContent.includes('Orientação para o código:')); assert(document.body.textContent.includes('CNC NFS-e'));
    assert.equal(button('Emitir NFS-e'), undefined); assert.equal(calls.filter(row => row.action === 'ISSUE').length, 1);
    await act(async () => render({ key: 'unsent-cancel-review', source: { kind: 'PARTNER_SERVICE', id: id(45) }, operation: { operationId: id(5), requestId: id(44), cancelPreviewId: id(6), state: 'AUTHORIZED' } })); await settle();
    assert(document.querySelector('.nfse-individual-state[role="status"] strong').textContent === 'Emitida');
    await click(button('Cancelar NFS-e'));
    assert.equal(document.querySelector('textarea[aria-label="Justificativa do cancelamento"]').disabled, true);
    assert(!notices.some(notice => notice.title === 'Cancelamento ainda não enviado'), 'GET does not create a new confirmation toast');
    assert.equal(button('Revalidar este cancelamento'), undefined);
    assert.equal(button('Confirmar cancelamento').disabled, true);
    await check('Conferi a nota, o motivo');
    await click(button('Confirmar cancelamento'));
    const renewed = calls.findLast(row => row.action === 'CANCEL_PREVIEW');
    assert.equal(renewed.args[1], id(44)); assert.equal(renewed.args[3], cancelPayload.justification);
    assert.equal(calls.filter(row => row.action === 'CANCEL').length, 2, 'One explicit confirm revalidates then submits');
    await act(async () => cancelPending.reject(new Error('Resposta de cancelamento não confirmada.'))); await settle();
    await act(async () => render({ key: 'readonly-consult', intent: 'CONSULT', source: { kind: 'PARTNER_SERVICE', id: id(46) }, operation: { operationId: id(5), requestId: id(44), cancelPreviewId: id(6), state: 'AUTHORIZED' } })); await settle();
    assert(document.querySelector('[aria-label="Consulta do cancelamento"]'));
    assert.equal([...document.querySelectorAll('summary')].some(item => item.textContent === 'Ver dados da nota'), false, 'Consultation shows issue details directly');
    assert.equal(button('Revalidar este cancelamento'), undefined); assert.equal(button('Emitir NFS-e'), undefined);
    assert.equal(document.querySelector('textarea'), null);
    globalThis.__nfsePickerTest = props => React.createElement('button', { onClick: () => props.onApply(selectedModel) }, 'Selecionar modelo sintético');
    await act(async () => render({ key: 'selected-model', intent: 'CANCEL', source: { kind: 'PARTNER_SERVICE', id: id(48) }, operation: { operationId: id(5), requestId: id(47), state: 'AUTHORIZED' } })); await settle();
    await click(button('Selecionar modelo sintético')); assert.equal(button('Revisar cancelamento'), undefined); assert.equal(button('Confirmar cancelamento').disabled, true);
    await setValue('input[aria-label="Detalhe factual do cancelamento"]', 'Detalhe sintético confirmado pelo usuário.');
    assert.equal(calls.filter(row => row.action === 'CANCEL').length, 2, 'Model selection alone never dispatches');
    await check('Conferi a nota, o motivo'); await click(button('Confirmar cancelamento'));
    const selectedCall = calls.findLast(row => row.action === 'CANCEL_PREVIEW_SELECTED');
    assert.deepEqual(selectedCall.args[3], { id: selectedModel.id, version: 1 });
    assert.equal(selectedCall.args[4], 'Detalhe sintético confirmado pelo usuário.');
    assert.equal(calls.filter(row => row.action === 'CANCEL').length, 3);
    await act(async () => cancelPending.reject(new Error('Resposta de cancelamento não confirmada.'))); await settle();
    await act(async () => render({ key: 'manual-retry', intent: 'CANCEL', source: { kind: 'PARTNER_SERVICE', id: id(51) }, operation: { operationId: id(5), requestId: id(50), cancelPreviewId: id(6), state: 'CANCELLATION_PENDING' } })); await settle();
    assert.equal(calls.filter(row => row.action === 'RETRY_CANCEL').length, 0);
    const retry = button('Retomar pedido'); assert.equal(retry.disabled, false);
    await act(async () => { retry.click(); retry.click(); }); await settle();
    assert.equal(calls.filter(row => row.action === 'RETRY_CANCEL').length, 1);
    const retried = calls.find(row => row.action === 'RETRY_CANCEL');
    const retryStored = JSON.parse(dom.window.sessionStorage.getItem([...Array(dom.window.sessionStorage.length)].map((_, i) => dom.window.sessionStorage.key(i)).find(key => key.endsWith(id(51)))));
    assert.equal(retryStored.retryRequestId, retried.args[4]); assert.equal(retried.args[1], id(50)); assert.equal(retried.args[3], id(6));
    assert.equal(button('Retomar pedido'), undefined); assert(document.body.textContent.includes('Retomada pendente'));
    const cancelCount = calls.filter(row => row.action === 'CANCEL').length;
    const changedService = { ...service, previewCancellation: async () => ({ previewId: id(5), cancelPreviewId: id(6),
      state: 'PREVIEWED', expiresAt: expiry(), capability: { available: true, reason: null },
      payload: { ...cancelPayload, justification: 'Justificativa diferente da que o usuário confirmou.' } }) };
    await act(async () => render({ key: 'canonical-mismatch', intent: 'CANCEL', service: changedService,
      source: { kind: 'PARTNER_SERVICE', id: id(81) }, operation: { operationId: id(5), requestId: id(80), state: 'AUTHORIZED' } })); await settle();
    assert(document.querySelector('[aria-label="Nota selecionada para cancelamento"]').textContent.includes('260,00'));
    await act(async () => { const input = document.querySelector('textarea');
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, cancelPayload.justification);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); await settle();
    await check('Conferi a nota, o motivo'); await click(button('Confirmar cancelamento'));
    assert(document.querySelector('[role="alert"]').textContent.includes('diferem dos confirmados'));
    assert.equal(calls.filter(row => row.action === 'CANCEL').length, cancelCount, 'Canonical mismatch never dispatches');
    let followReads = 0;
    const followingService = { ...service, reconcileCancellation: async () => {
      followReads++;
      return { previewId: id(5), cancelPreviewId: id(6), state: followReads === 1 ? 'CANCELLATION_PENDING' : 'CANCELLED',
        payload: cancelPayload, message: followReads === 1 ? 'Ainda sem confirmação.' : 'Cancelamento confirmado sintético.',
        retry: { availableAt: new Date(Date.now() + 120000).toISOString(), used: false } };
    } };
    const normalTimeout = dom.window.setTimeout.bind(dom.window);
    dom.window.setTimeout = (fn, delay, ...args) => normalTimeout(fn, delay === 3000 ? 50 : delay, ...args);
    await act(async () => render({ key: 'auto-follow', intent: 'CANCEL', service: followingService,
      source: { kind: 'PARTNER_SERVICE', id: id(83) }, operation: { operationId: id(5), requestId: id(82), cancelPreviewId: id(6), state: 'AUTHORIZED' } })); await settle();
    assert(!document.body.textContent.includes('segundo(s)'), 'No countdown is exposed');
    assert.equal(button('Retomar pedido').disabled, true, 'Safety cooldown remains enforced');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    assert.equal(followReads, 2); assert(document.body.textContent.includes('Cancelamento confirmado sintético.'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    assert.equal(followReads, 2, 'Terminal confirmation stops automatic reads');
    assert.equal(calls.filter(row => row.action === 'CANCEL').length, cancelCount, 'Automatic follow-up is GET-only');
    dom.window.setTimeout = normalTimeout;
    const count = calls.length;
    await act(async () => render({ key: 'academic', source: { kind: 'ACADEMIC_QUEUE', id: id(20) }, amount: '300.00' })); await settle();
    assert.equal(document.querySelector('input[type="date"]'), null);
    assert.deepEqual(calls.at(-1).args.slice(2), [{ kind: 'ACADEMIC_QUEUE', id: id(20) }]);
    await act(async () => render({ key: 'homo', scope: { ...scope, environment: 'HOMOLOGACAO' } })); await settle();
    assert(document.body.textContent.includes('executor de emissão deste ambiente ainda não está disponível'));
    assert.equal(calls.length, count + 1); assert.equal(button('Emitir NFS-e').disabled, true);
    const failedRequests = [];
    const blockedService = { ...service, previewSource: async (...args) => {
      failedRequests.push(args); if (failedRequests.length === 1) throw new Error('Validação indisponível.');
      return { previewId: id(70), state: 'PREVIEWED', expiresAt: expiry(), payload, capability: { available: false, reason: 'FISCAL_MODEL_REVIEW_REQUIRED' } };
    } };
    await act(async () => render({ key: 'preview-error', source: { kind: 'ACADEMIC_QUEUE', id: id(70) }, service: blockedService })); await settle();
    assert.equal(failedRequests.length, 1); assert(document.querySelector('[role="alert"]').textContent.includes('Validação indisponível'));
    assert.equal(button('Emitir NFS-e').disabled, true);
    await click(button('Atualizar dados para emissão'));
    assert.equal(failedRequests.length, 2); assert.equal(failedRequests[0][1], failedRequests[1][1], 'Explicit retry reuses the same preview request');
    assert.equal(button('Emitir NFS-e').disabled, true, 'Unavailable canonical capability is never bypassed');
    await click(button('Atualizar dados desta operação'));
    assert.equal(failedRequests.length, 3, 'Blocked but unexpired preview supports explicit canonical refresh');
    assert.equal(failedRequests[2][1], failedRequests[1][1], 'Address correction preserves the original request');
    assert.equal(button('Emitir NFS-e').disabled, true, 'Refresh must not bypass canonical capability');
    assert.equal(calls.filter(row => row.action === 'ISSUE').length, 1);
  } finally { await act(async () => root.unmount()); dom.window.close(); delete globalThis.__nfsePickerTest; await rm(temp, { recursive: true, force: true }); }
});

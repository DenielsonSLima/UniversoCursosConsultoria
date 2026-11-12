import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../types/nfse.types';
import type { IndividualIssueResult, IndividualPayload, NfseIndividualService } from '../individual/nfse-individual.types';
import { batchCanIssue, batchSourceStorageKey, createNfseBatchController, type NfseBatchInput } from './nfse-batch.core';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { poloId: id(1), contextKey: id(2), environment: 'PRODUCAO', month: '2026-11' };
const inputs: NfseBatchInput[] = [10, 11].map(n => ({ source: { kind: 'ACADEMIC_QUEUE', id: id(n) }, label: `ALUNO SINTÉTICO ${n}`, amount: '260.00' }));
const payload: IndividualPayload = { issuerName: 'EMITENTE SINTÉTICO', issuerCnpj: '00000000000100', recipientName: 'ALUNO SINTÉTICO', recipientDocument: '00000000000',
  modelId: id(3), modelVersion: 3, modelName: 'MODELO SINTÉTICO', amount: '260.00', competenceDate: '2026-11-10', serviceDate: '2026-11-10', series: '49998',
  nationalServiceCode: '080201', nbsCode: '122020000', serviceDescription: 'SERVIÇO SINTÉTICO', opSimpNac: '3', regApTribSN: '1', municipalityCode: '2803401', municipalRegistration: null };
const result = (previewId: string, state: IndividualIssueResult['state'] = 'AUTHORIZED'): IndividualIssueResult => ({ previewId, state, message: 'Retorno sintético', payload,
  number: state === 'AUTHORIZED' ? previewId.slice(-2).replace(/^0/, '') : null, accessKey: state === 'AUTHORIZED' ? '1'.repeat(50) : null });
function fixture(overrides: Partial<NfseIndividualService> = {}, entries = inputs) {
  const calls: { action: string; args: unknown[] }[] = [], stored = new Map<string, string>(), notices: unknown[] = [];
  let serial = 100;
  const service = {
    previewSource: async (...args: unknown[]) => { calls.push({ action: 'PREVIEW_QUEUE', args }); const source = args[2] as NfseBatchInput['source']; return {
      previewId: source.id === id(10) ? id(30) : id(31), expiresAt: new Date(Date.now() + 60_000).toISOString(), state: 'PREVIEWED', payload, capability: { available: true, reason: null } }; },
    issue: async (...args: unknown[]) => { calls.push({ action: 'ISSUE', args }); return result(String(args[2])); },
    reconcile: async (...args: unknown[]) => { calls.push({ action: 'RECONCILE', args }); return result(String(args[2])); }, ...overrides,
  } as unknown as NfseIndividualService;
  const storage = { getItem: (key: string) => stored.get(key) || null, setItem: (key: string, value: string) => { stored.set(key, value); } };
  const controller = createNfseBatchController(scope, entries, service, storage, { uuid: () => id(++serial), onNotice: notice => notices.push(notice) });
  return { controller, calls, stored, storage, notices, service };
}

test('batch requires canonical server preview, preserves only IDs and dispatches sequentially on an explicit click', async () => {
  let resolveFirst: (value: IndividualIssueResult) => void = () => {};
  const sent: unknown[][] = [];
  const f = fixture({ issue: async (...args) => { sent.push(args); if (sent.length === 1) return await new Promise(resolve => { resolveFirst = resolve; }); return result(args[2]); } });
  await f.controller.issue(); assert.equal(sent.length, 0);
  await f.controller.review(); assert.equal(f.calls.length, 2); assert(f.calls.every(call => call.args[3] === undefined));
  assert.equal(batchCanIssue(f.controller.getSnapshot().items[0]), true);
  assert.equal(sent.length, 0, 'Canonical review alone does not send a note');
  const running = f.controller.issue(); await f.controller.issue(); assert.equal(sent.length, 1);
  resolveFirst(result(id(30))); await running;
  assert.equal(sent.length, 2); assert.deepEqual(sent.map(args => args[2]), [id(30), id(31)]);
  assert(f.controller.getSnapshot().items.every(item => item.result?.state === 'AUTHORIZED'));
  for (const value of f.stored.values()) assert.deepEqual(Object.keys(JSON.parse(value)).sort(), ['previewId', 'requestId']);
  assert(!/recipient|amount|Xml|certificate/.test(JSON.stringify([...f.stored.values()])));
  await f.controller.issue(); assert.equal(sent.length, 2);
});

test('uncertain first POST pauses batch; recovery only GETs the same identity and remaining notes need an explicit continuation', async () => {
  const sent: unknown[][] = [], consulted: unknown[][] = [];
  const f = fixture({ issue: async (...args) => { sent.push(args); if (sent.length === 1) throw new Error('Resposta perdida'); return result(args[2]); },
    reconcile: async (...args) => { consulted.push(args); return result(args[2]); } });
  await f.controller.review();
  await f.controller.issue(); assert.equal(sent.length, 1); assert.equal(f.controller.getSnapshot().paused, true);
  await f.controller.issue(); assert.equal(sent.length, 1);
  await f.controller.consult(0); assert.equal(consulted.length, 1); assert.equal(sent.length, 1);
  assert.deepEqual(consulted[0].slice(1), sent[0].slice(1));
  await f.controller.issue(); assert.equal(sent.length, 2); assert.equal(sent[1][2], id(31));
});

test('dispose and explicit pause never dispatch the next note after the current response', async () => {
  for (const dispose of [false, true]) {
    let release: (value: IndividualIssueResult) => void = () => {};
    const sent: unknown[][] = [];
    const f = fixture({ issue: async (...args) => { sent.push(args); return await new Promise(resolve => { release = resolve; }); } });
    await f.controller.review();
    const pending = f.controller.issue();
    if (dispose) f.controller.dispose(); else f.controller.stop();
    release(result(id(30))); await pending;
    assert.equal(sent.length, 1);
  }
});

test('reopening stored operations consults instead of creating a new preview or dispatching, including already authorized notes', async () => {
  const f = fixture(); await f.controller.review();
  const reopened = createNfseBatchController(scope, inputs, f.service, f.storage);
  await reopened.review();
  assert.equal(f.calls.filter(call => call.action === 'PREVIEW_QUEUE').length, 2);
  assert.equal(f.calls.filter(call => call.action === 'RECONCILE').length, 2);
  await reopened.issue(); assert.equal(f.calls.filter(call => call.action === 'ISSUE').length, 0);
  assert.equal(JSON.parse(f.storage.getItem(batchSourceStorageKey(scope, inputs[0].source))!).previewId, id(30));
});

test('failed ID persistence prevents fiscal dispatch and leaves financial source untouched', async () => {
  const f = fixture();
  const controller = createNfseBatchController(scope, inputs, f.service, { getItem: () => null, setItem() { throw new Error('Storage unavailable'); } });
  await controller.review(); await controller.issue();
  assert.equal(f.calls.filter(call => call.action === 'ISSUE').length, 0);
  assert(controller.getSnapshot().items.every(item => item.error));
});

test('unavailable or expired server capability remains blocked without acceptance checkboxes', async () => {
  const f = fixture({ previewSource: async (_scope, _requestId, source) => ({
    previewId: source.id === id(10) ? id(30) : id(31), state: 'PREVIEWED', payload,
    expiresAt: new Date(Date.now() + (source.id === id(10) ? 60_000 : -1000)).toISOString(),
    capability: source.id === id(10) ? { available: false, reason: 'FISCAL_MODEL_REVIEW_REQUIRED' } : { available: true, reason: null },
  }) });
  await f.controller.review();
  assert(f.controller.getSnapshot().items.every(item => !batchCanIssue(item)));
  await f.controller.issue();
  assert.equal(f.calls.filter(call => call.action === 'ISSUE').length, 0);
});


test('blocked unsigned batch refreshes canonical data with the same identity and never dispatches', async () => {
  const f = fixture({ reconcile: async (_scope, _request, previewId) => ({ ...result(previewId, 'PREVIEWED'),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), capability: { available: false, reason: 'FISCAL_RECIPIENT_ADDRESS_NUMBER_REQUIRED' } }) });
  await f.controller.review();
  const original = f.calls.filter(row => row.action === 'PREVIEW_QUEUE').map(row => row.args);
  const reopened = createNfseBatchController(scope, inputs, f.service, f.storage);
  await reopened.review();
  const repeated = f.calls.filter(row => row.action === 'PREVIEW_QUEUE').slice(2).map(row => row.args);
  assert.deepEqual(repeated, original);
  assert(reopened.getSnapshot().items.every(item => batchCanIssue(item)));
  assert.equal(f.calls.filter(row => row.action === 'ISSUE').length, 0);
});

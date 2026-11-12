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
function fixture(overrides: Partial<NfseIndividualService> = {}, entries = inputs, confirmationDelays: readonly number[] = [], requestTimeoutMs?: number, confirmationTimeoutMs?: number) {
  const calls: { action: string; args: unknown[] }[] = [], stored = new Map<string, string>(), notices: unknown[] = [];
  let serial = 100;
  const service = {
    previewSource: async (...args: unknown[]) => { calls.push({ action: 'PREVIEW_QUEUE', args }); const source = args[2] as NfseBatchInput['source']; return {
      previewId: source.id === id(10) ? id(30) : id(31), expiresAt: new Date(Date.now() + 60_000).toISOString(), state: 'PREVIEWED', payload, capability: { available: true, reason: null } }; },
    issue: async (...args: unknown[]) => { calls.push({ action: 'ISSUE', args }); return result(String(args[2])); },
    reconcile: async (...args: unknown[]) => { calls.push({ action: 'RECONCILE', args }); return result(String(args[2])); },
    observe: async (...args: unknown[]) => { calls.push({ action: 'OBSERVE', args }); return result(String(args[2])); }, ...overrides,
  } as unknown as NfseIndividualService;
  const storage = { getItem: (key: string) => stored.get(key) || null, setItem: (key: string, value: string) => { stored.set(key, value); } };
  const controller = createNfseBatchController(scope, entries, service, storage, { confirmationDelays, requestTimeoutMs, confirmationTimeoutMs, uuid: () => id(++serial), onNotice: notice => notices.push(notice) });
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

test('uncertain first POST pauses dispatch until canonical recovery, then continues only the already approved notes', async () => {
  const sent: unknown[][] = [], consulted: unknown[][] = [];
  const f = fixture({ issue: async (...args) => { sent.push(args); if (sent.length === 1) throw new Error('Resposta perdida'); return result(args[2]); },
    observe: async (...args) => { consulted.push(args); return result(args[2]); } });
  await f.controller.review();
  await f.controller.issue(); assert.equal(sent.length, 1); assert.equal(f.controller.getSnapshot().paused, true);
  await f.controller.issue(); assert.equal(sent.length, 1);
  await f.controller.consult(0); await flushMicrotasks(); assert.equal(consulted.length, 1); assert.equal(sent.length, 2);
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


test('awaiting response is reconciled automatically with same DPS before advancing and never resubmitted', async () => {
  const sent: string[] = [], reads: string[] = [];
  const f = fixture({ issue: async (_scope, _request, previewId) => {
    sent.push(previewId); return result(previewId, 'AWAITING_CONFIRMATION');
  }, observe: async (_scope, _request, previewId) => { reads.push(previewId); return result(previewId); } }, inputs, [0]);
  await f.controller.review(); await f.controller.issue();
  assert.deepEqual(sent, [id(30), id(31)]); assert.deepEqual(reads, sent);
  assert(f.controller.getSnapshot().items.every(item => item.result?.state === 'AUTHORIZED'));
  await f.controller.issue(); assert.equal(sent.length, 2);
});

test('confirmation exhaustion stays uncertain and never claims success or sends another note', async () => {
  let sent = 0, reads = 0;
  const f = fixture({ issue: async (_s, _r, previewId) => { sent++; return result(previewId, 'AWAITING_CONFIRMATION'); },
    observe: async (_s, _r, previewId) => { reads++; return result(previewId, 'AWAITING_CONFIRMATION'); } }, inputs, [0, 0]);
  await f.controller.review(); await f.controller.issue();
  assert.equal(sent, 1); assert.equal(reads, 2); assert.equal(f.controller.getSnapshot().paused, true);
  assert.equal(f.controller.getSnapshot().items[0].uncertain, true);
  assert(!JSON.stringify(f.notices).includes('success'));
});

test('transport exception reconciles without resending and automatically continues remaining approved notes', async () => {
  let sent = 0;
  const f = fixture({ issue: async () => { sent++; throw new Error('Network timeout'); } }, inputs, [0]);
  await f.controller.review(); await f.controller.issue();
  assert.equal(sent, 2); assert(f.controller.getSnapshot().items.every(item => item.result?.state === 'AUTHORIZED'));
  assert.equal(f.controller.getSnapshot().paused, false);
});

test('realtime wakes pending confirmation; disposal cancels waiting without dispatching another note', async () => {
  for (const dispose of [false, true]) {
    let sent = 0, reads = 0;
    const f = fixture({ issue: async (_s, _r, previewId) => { sent++; return result(previewId, 'AWAITING_CONFIRMATION'); },
      observe: async (_s, _r, previewId) => { reads++; return result(previewId); } }, [inputs[0]], [60_000]);
    await f.controller.review();
    const pending = f.controller.issue();
    await Promise.resolve(); await Promise.resolve();
    if (dispose) f.controller.dispose(); else f.controller.signalChange();
    await pending;
    assert.equal(sent, 1); assert.equal(reads, dispose ? 0 : 1);
  }
});


test('idle realtime recovers exhausted confirmation once, ignores feedback and never reissues', async () => {
  let sent = 0, reads = 0;
  const f = fixture({ issue: async (_s, _r, previewId) => { sent++; return result(previewId, 'AWAITING_CONFIRMATION'); },
    observe: async (_s, _r, previewId) => { reads++; f.controller.signalChange(); return result(previewId); } }, [inputs[0]], []);
  await f.controller.review(); await f.controller.issue();
  f.controller.signalChange(); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(reads, 1); assert.equal(sent, 1);
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
  f.controller.signalChange(); assert.equal(reads, 1);
});

test('hanging ISSUE times out to uncertainty and bounded read-only recovery, no duplicate dispatch', async () => {
  let sent = 0;
  const f = fixture({ issue: async () => { sent++; return new Promise(() => {}); } }, inputs, [0], 5);
  await f.controller.review(); await f.controller.issue();
  assert.equal(sent, 2); assert.equal(f.controller.getSnapshot().busy, false);
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
});

test('explicit pause releases hanging request and disables automatic event recovery', async () => {
  let sent = 0, reads = 0;
  const f = fixture({ issue: async () => { sent++; return new Promise(() => {}); },
    observe: async (_s, _r, previewId) => { reads++; return result(previewId); } });
  await f.controller.review(); const pending = f.controller.issue(); f.controller.stop(); await pending;
  f.controller.signalChange(); await Promise.resolve();
  assert.equal(f.controller.getSnapshot().busy, false); assert.equal(sent, 1); assert.equal(reads, 0);
  assert.equal(f.controller.getSnapshot().items[0].uncertain, true);
});


test('confirmation wall clock includes slow requests and reuses unresolved physical read after timeout', async () => {
  let reads = 0, release!: (value: IndividualIssueResult) => void;
  const f = fixture({ issue: async (_s, _r, p) => result(p, 'AWAITING_CONFIRMATION'),
    observe: async () => { reads++; return new Promise(resolve => { release = resolve; }); } }, [inputs[0]], [0, 0, 0, 0, 0, 0], 1000, 25);
  await f.controller.review(); const start = globalThis.performance.now(); await f.controller.issue();
  assert(globalThis.performance.now() - start < 250, 'wall clock budget, not 6 individual timeouts');
  assert.equal(reads, 1); assert.equal(f.controller.getSnapshot().items[0].uncertain, true);
  const pending = f.controller.consult(0);
  f.controller.signalChange(); f.controller.signalChange();
  assert.equal(reads, 1, 'underlying request remains single-flight');
  release(result(id(30))); await pending;
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
});

test('late ISSUE authorization is retained and stale GET cannot downgrade or enable resend', async () => {
  let sent = 0, releaseIssue!: (value: IndividualIssueResult) => void;
  let releaseRead!: (value: IndividualIssueResult) => void;
  const f = fixture({ issue: async () => { sent++; return new Promise(resolve => { releaseIssue = resolve; }); },
    observe: async () => new Promise(resolve => { releaseRead = resolve; }) }, [inputs[0]], [0], 5, 15);
  await f.controller.review(); await f.controller.issue();
  releaseIssue(result(id(30))); await new Promise(resolve => setTimeout(resolve, 0));
  releaseRead(result(id(30), 'AWAITING_CONFIRMATION')); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
  await f.controller.issue(); assert.equal(sent, 1);
});

test('PREVIEWED during lost POST never resets dispatched flag or authorizes resend', async () => {
  let sent = 0;
  const f = fixture({ issue: async () => { sent++; return new Promise(() => {}); },
    observe: async (_s, _r, p) => result(p, 'PREVIEWED') }, [inputs[0]], [0], 5, 15);
  await f.controller.review(); await f.controller.issue(); await f.controller.issue();
  assert.equal(sent, 1); assert.equal(f.controller.getSnapshot().items[0].uncertain, true);
});

test('dispose releases monitoring and consumes late rejection without callbacks or another request', async () => {
  let rejectRead!: (error: Error) => void, changed = 0, notifications = 0;
  const f = fixture({ observe: async () => new Promise((_resolve, reject) => { rejectRead = reject; }) });
  const controller = createNfseBatchController(scope, [{ ...inputs[0], operation: { requestId: id(101), operationId: id(30) } } as NfseBatchInput],
    f.service, f.storage, { onChanged: () => { changed++; }, requestTimeoutMs: 1000 });
  controller.subscribe(() => { notifications++; });
  const running = controller.consult(0); controller.dispose(); await running;
  const before = notifications; rejectRead(new Error('late transport failure'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(notifications, before); assert.equal(changed, 0); assert.equal(controller.getSnapshot().busy, false);
});

test('late POST authorization immediately releases active confirmation even while GET hangs', async () => {
  let releaseIssue!: (value: IndividualIssueResult) => void;
  let releaseRead!: (value: IndividualIssueResult) => void;
  let startedRead!: () => void;
  const readStarted = new Promise<void>(resolve => { startedRead = resolve; });
  const f = fixture({ issue: async () => new Promise(resolve => { releaseIssue = resolve; }),
    observe: async () => { startedRead(); return new Promise(resolve => { releaseRead = resolve; }); } }, [inputs[0]], [0, 0], 100, 1000);
  await f.controller.review(); const running = f.controller.issue(); await readStarted;
  releaseIssue(result(id(30)));
  const ended = await Promise.race([running.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 25))]);
  assert.equal(ended, true, 'must not wait for GET timeout after confirmed authorization');
  assert.equal(f.controller.getSnapshot().busy, false);
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
  releaseRead(result(id(30), 'AWAITING_CONFIRMATION')); await running;
});

const flushMicrotasks = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };

test('a hint inside cooldown schedules one trailing canonical observation without another event', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  let reads = 0, sent = 0, authorized = false;
  const f = fixture({ issue: async (_s, _r, p) => { sent++; return result(p, 'AWAITING_CONFIRMATION'); },
    reconcile: async () => { throw new Error('Fiscal reconciliation forbidden in observation'); },
    observe: async (_s, _r, p) => { reads++; return result(p, authorized ? 'AUTHORIZED' : 'AWAITING_CONFIRMATION'); } }, [inputs[0]]);
  await f.controller.review(); await f.controller.issue();
  f.controller.signalChange(); await flushMicrotasks(); assert.equal(reads, 1);
  f.controller.signalChange(); f.controller.signalChange(); authorized = true;
  t.mock.timers.tick(9999); await flushMicrotasks(); assert.equal(reads, 1);
  t.mock.timers.tick(1); await flushMicrotasks();
  assert.equal(reads, 2); assert.equal(sent, 1);
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
  assert.equal(f.controller.getSnapshot().paused, false, 'The one-note approved batch is now complete');
  f.controller.dispose();
});

test('canonical realtime immediately recovers after the 32-second follow window, regardless of cooldown', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  let reads = 0, sent = 0, authorized = false;
  const f = fixture({ issue: async (_s, _r, p) => { sent++; return result(p, 'AWAITING_CONFIRMATION'); },
    observe: async (_s, _r, p) => { reads++; return result(p, authorized ? 'AUTHORIZED' : 'AWAITING_CONFIRMATION'); } },
  [inputs[0]], [10_000, 10_000, 10_000, 10_000]);
  await f.controller.review(); const running = f.controller.issue(); await flushMicrotasks();
  for (let index = 0; index < 3; index++) { t.mock.timers.tick(10_000); await flushMicrotasks(); }
  t.mock.timers.tick(2000); await flushMicrotasks(); await running;
  assert.equal(reads, 3); assert.equal(f.controller.getSnapshot().busy, false);
  assert.equal(f.controller.getSnapshot().items[0].uncertain, true);
  authorized = true; f.controller.signalChange(true); await flushMicrotasks();
  assert.equal(reads, 4); assert.equal(sent, 1);
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
  f.controller.dispose();
});

test('events during a physical read coalesce into one fresh observation after its stale response', async () => {
  let reads = 0, active = 0, maxActive = 0, sent = 0, release!: (value: IndividualIssueResult) => void;
  const f = fixture({ issue: async (_s, _r, p) => { sent++; return result(p, 'AWAITING_CONFIRMATION'); },
    observe: async (_s, _r, p) => {
      reads++; active++; maxActive = Math.max(maxActive, active);
      try { return reads === 1 ? await new Promise<IndividualIssueResult>(resolve => { release = resolve; }) : result(p); }
      finally { active--; }
    } }, [inputs[0]]);
  await f.controller.review(); await f.controller.issue();
  f.controller.signalChange(true); await flushMicrotasks();
  f.controller.signalChange(true); f.controller.signalChange(true); await flushMicrotasks();
  assert.equal(reads, 1);
  release(result(id(30), 'AWAITING_CONFIRMATION')); await flushMicrotasks();
  assert.equal(reads, 2); assert.equal(maxActive, 1); assert.equal(sent, 1);
  assert.equal(f.controller.getSnapshot().items[0].result?.state, 'AUTHORIZED');
  f.controller.dispose();
});

test('stop/dispose cancel trailing reads; activation recovers disposal but preserves an explicit user pause', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  for (const explicitStop of [false, true]) {
    let reads = 0, authorized = false;
    const f = fixture({ issue: async (_s, _r, p) => result(p, 'AWAITING_CONFIRMATION'),
      observe: async (_s, _r, p) => { reads++; return result(p, authorized ? 'AUTHORIZED' : 'AWAITING_CONFIRMATION'); } }, [inputs[0]]);
    await f.controller.review(); await f.controller.issue();
    f.controller.signalChange(); await flushMicrotasks(); assert.equal(reads, 1);
    f.controller.signalChange();
    if (explicitStop) f.controller.stop();
    f.controller.dispose(); authorized = true;
    t.mock.timers.tick(20_000); await flushMicrotasks(); assert.equal(reads, 1);
    f.controller.activate(); f.controller.signalChange(true); await flushMicrotasks();
    assert.equal(reads, explicitStop ? 1 : 2);
    f.controller.dispose();
  }
});


test('a late authorization event resumes the same approved batch in order, without a second click or repeated POST', async () => {
  const sent: string[] = [], observed: string[] = [];
  const f = fixture({ issue: async (_s, _r, p) => { sent.push(p); return result(p, sent.length === 1 ? 'AWAITING_CONFIRMATION' : 'AUTHORIZED'); },
    observe: async (_s, _r, p) => { observed.push(p); return result(p); } });
  await f.controller.review(); const identities = f.controller.getSnapshot().items.map(item => [item.requestId, item.previewId]);
  await f.controller.issue(); assert.deepEqual(sent, [id(30)]);
  assert.equal(f.controller.getSnapshot().monitoringPaused, false);
  f.controller.signalChange(true); f.controller.signalChange(true); await flushMicrotasks();
  assert.deepEqual(observed, [id(30)]); assert.deepEqual(sent, [id(30), id(31)]);
  assert(f.controller.getSnapshot().items.every(item => item.result?.state === 'AUTHORIZED'));
  assert.deepEqual(f.controller.getSnapshot().items.map(item => [item.requestId, item.previewId]), identities);
  f.controller.signalChange(true); await flushMicrotasks(); assert.equal(sent.length, 2);
  f.controller.dispose();
});

test('explicit pause and disposal cancel the original dispatch intent even when its POST later authorizes', async () => {
  for (const dispose of [false, true]) {
    const sent: string[] = []; let finish!: (value: IndividualIssueResult) => void;
    const f = fixture({ issue: async (_s, _r, p) => { sent.push(p); return new Promise(resolve => { finish = resolve; }); } });
    await f.controller.review(); const running = f.controller.issue();
    if (dispose) f.controller.dispose(); else f.controller.stop();
    finish(result(id(30))); await running;
    f.controller.activate(); f.controller.signalChange(true); await flushMicrotasks();
    assert.deepEqual(sent, [id(30)]);
    assert.equal(f.controller.getSnapshot().monitoringPaused, !dispose);
    f.controller.dispose();
  }
});

test('reopening or reviewing stored identities observes status without inheriting an old dispatch approval', async () => {
  let sent = 0;
  const f = fixture({ issue: async (_s, _r, p) => { sent++; return result(p, 'AWAITING_CONFIRMATION'); },
    reconcile: async (_s, _r, p) => p === id(30) ? result(p) : { ...result(p, 'PREVIEWED'), expiresAt: new Date(Date.now() + 60_000).toISOString(), capability: { available: true, reason: null } } });
  await f.controller.review(); await f.controller.issue(); f.controller.dispose();
  const reopened = createNfseBatchController(scope, inputs, f.service, f.storage, { confirmationDelays: [] });
  await reopened.review(); reopened.signalChange(true); await flushMicrotasks();
  assert.equal(sent, 1); assert.equal(batchCanIssue(reopened.getSnapshot().items[1]), true);
  reopened.dispose();
});

test('rejection or blocking cancels automatic continuation of the previously approved remaining notes', async () => {
  for (const state of ['REJECTED', 'BLOCKED'] as const) {
    const sent: string[] = [];
    const f = fixture({ issue: async (_s, _r, p) => { sent.push(p); return result(p, 'AWAITING_CONFIRMATION'); },
      observe: async (_s, _r, p) => result(p, state) });
    await f.controller.review(); await f.controller.issue();
    f.controller.signalChange(true); await flushMicrotasks(); f.controller.signalChange(true); await flushMicrotasks();
    assert.deepEqual(sent, [id(30)]); assert.equal(f.controller.getSnapshot().items[0].result?.state, state);
    assert.equal(f.controller.getSnapshot().paused, true); assert.equal(f.controller.getSnapshot().monitoringPaused, false);
    f.controller.dispose();
  }
});

test('an approved preview expiring while the first note awaits confirmation stops continuation without renewing or changing data', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  const sent: string[] = [];
  const f = fixture({ issue: async (_s, _r, p) => { sent.push(p); return result(p, 'AWAITING_CONFIRMATION'); },
    observe: async (_s, _r, p) => result(p) });
  await f.controller.review(); await f.controller.issue();
  t.mock.timers.tick(60_001); f.controller.signalChange(true); await flushMicrotasks();
  assert.deepEqual(sent, [id(30)]); assert.equal(f.calls.filter(call => call.action === 'PREVIEW_QUEUE').length, 2);
  assert.equal(f.controller.getSnapshot().items[1].dispatched, false); assert.equal(f.controller.getSnapshot().paused, true);
  f.controller.dispose();
});

test('late POST authorization and a stale in-flight observation resume the next approved note only once', async () => {
  const sent: string[] = [];
  let finishIssue!: (value: IndividualIssueResult) => void, finishRead!: (value: IndividualIssueResult) => void;
  const f = fixture({ issue: async (_s, _r, p) => {
    sent.push(p); return p === id(30) ? new Promise(resolve => { finishIssue = resolve; }) : result(p);
  }, observe: async () => new Promise(resolve => { finishRead = resolve; }) }, inputs, [0], 5, 10);
  await f.controller.review(); await f.controller.issue();
  f.controller.signalChange(true); finishIssue(result(id(30))); await flushMicrotasks();
  assert.deepEqual(sent, [id(30), id(31)]);
  finishRead(result(id(30), 'AWAITING_CONFIRMATION')); await flushMicrotasks();
  f.controller.signalChange(true); await flushMicrotasks();
  assert.deepEqual(sent, [id(30), id(31)]);
  assert(f.controller.getSnapshot().items.every(item => item.result?.state === 'AUTHORIZED'));
  f.controller.dispose();
});


test('an incomplete observation transport fails closed without invoking fiscal reconciliation', async () => {
  let sent = 0;
  const f = fixture({ issue: async (_s, _r, p) => { sent++; return result(p, 'AWAITING_CONFIRMATION'); } }, [inputs[0]]);
  await f.controller.review(); Reflect.deleteProperty(f.service, 'observe');
  await f.controller.issue(); f.controller.signalChange(true); await flushMicrotasks();
  assert.equal(sent, 1); assert.equal(f.calls.filter(call => call.action === 'RECONCILE').length, 0);
  assert.equal(f.controller.getSnapshot().items[0].uncertain, true);
  f.controller.dispose();
});

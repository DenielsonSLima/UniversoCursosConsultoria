import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseBatchController } from './nfse-batch.core';
import type { NfseIndividualService } from '../individual/nfse-individual.types';
const scope = { contextKey: 'ctx', poloId: 'polo', environment: 'PRODUCAO' as const, month: '2026-11' };
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const flush = async () => { for (let n = 0; n < 100; n++) await Promise.resolve(); };
const quota = (delay = 60000) => Object.assign(new Error('Quota'), { code: 'RATE_LIMITED', status: 429, beforeDispatch: true, retryAfterMs: delay });
function fixture(fail: (call: number) => Error | undefined, saved = false, interval = 8000, count = 2, timeout = 1000) {
  const calls: { kind: string; at: number; request: string; source: string }[] = [];
  let reviews = 0;
  const preview = (source: string) => ({ state: 'PREVIEWED', previewId: source, expiresAt: new Date(Date.now() + 600000).toISOString(), capability: { available: true }, payload: {} });
  const check = (kind: string, request: string, source: string) => {
    calls.push({ kind, at: Date.now(), request, source });
    const error = fail(++reviews); if (error) throw error; return preview(source);
  };
  const service = {
    previewSource: async (_s: unknown, request: string, source: { id: string }) => check('preview', request, source.id),
    reconcile: async (_s: unknown, request: string, source: string) => check('reconcile', request, source),
    issue: async (_s: unknown, request: string, source: string) => { calls.push({ kind: 'issue', at: Date.now(), request, source }); return { ...preview(source), state: 'AUTHORIZED' }; },
  } as unknown as NfseIndividualService;
  const controller = createNfseBatchController(scope, Array.from({ length: count }, (_, i) => i + 1).map(n => ({ source: { kind: 'ACADEMIC_QUEUE' as const, id: id(n) }, label: 'synthetic', amount: '1.00',
    ...(saved ? { operation: { operationId: id(n), requestId: id(n + 20) } as never } : {}) })), service,
    { getItem: () => null, setItem() {} }, { uuid: () => id(99), commandIntervalMs: interval, requestTimeoutMs: timeout, confirmationDelays: [] });
  return { controller, calls, service };
}
test('review respects quota120s, signals cannot skip, same item then8s start cadence and no automatic issue', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const f = fixture(n => n === 1 ? quota(120000) : undefined); let done = false;
  const review = f.controller.review().then(() => { done = true; }); await flush();
  assert.equal(f.calls.length, 1); assert.equal(f.controller.getSnapshot().retryAt, 1120000);
  f.controller.signalChange(true); await f.controller.issue();
  t.mock.timers.tick(119999); await flush(); assert.equal(f.calls.length, 1); assert.equal(done, false);
  t.mock.timers.tick(1); await flush(); assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0].source, f.calls[1].source);
  t.mock.timers.tick(8000); await flush(); await review; assert.equal(f.calls.length, 3);
  assert(f.calls.every(c => c.kind === 'preview')); assert.equal(done, true);
  const issue = f.controller.issue(); await flush(); assert.equal(f.calls.length, 3);
  t.mock.timers.tick(8000); await flush(); assert.equal(f.calls.length, 4);
  t.mock.timers.tick(8000); await flush(); await issue; assert.equal(f.calls.length, 5); f.controller.dispose();
});
test('saved reconcile retries same operation, repeated quota and pause stop entire review', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  for (const stop of ['stop', 'dispose'] as const) {
    const f = fixture(() => quota(), true); const review = f.controller.review(); await flush();
    assert.equal(f.calls[0].kind, 'reconcile');
    t.mock.timers.tick(60000); await flush(); assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].request, f.calls[1].request); assert.equal(f.calls[0].source, f.calls[1].source);
    f.controller[stop](); await flush(); await review;
    t.mock.timers.tick(120000); await flush(); assert.equal(f.calls.length, 2); f.controller.dispose();
  }
});
test('retry budget stops whole review rather than burning the remaining items', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const f = fixture(() => quota()); const review = f.controller.review(); await flush();
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(60000); await flush(); }
  await review; assert.equal(f.calls.length, 4); assert.equal(f.controller.getSnapshot().paused, true);
  assert(f.calls.every(c => c.source === id(1))); f.controller.dispose();
});
test('non proven errors do not retry the same command; pause during pacing prevents next command', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const f = fixture(() => Object.assign(new Error('Forbidden'), { status: 403 }));
  const review = f.controller.review(); await flush(); assert.equal(f.calls.length, 1);
  f.controller.stop(); await flush(); await review;
  t.mock.timers.tick(60000); await flush(); assert.equal(f.calls.length, 1); f.controller.dispose();
});

test('ninth preview429 waits without advancing and disposal plus activation cannot resume old review', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const f = fixture(n => n === 9 ? quota() : undefined, false, 8000, 10);
  const review = f.controller.review(); await flush();
  for (let n = 0; n < 8; n++) { t.mock.timers.tick(8000); await flush(); }
  assert.equal(f.calls.length, 9); assert.equal(f.controller.getSnapshot().paused, true);
  f.controller.dispose(); f.controller.activate(); await flush(); await review;
  t.mock.timers.tick(120000); await flush(); assert.equal(f.calls.length, 9); f.controller.dispose();
});
test('disposal during pacing and immediate activation never starts delayed command', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const f = fixture(() => undefined); const review = f.controller.review(); await flush();
  f.controller.dispose(); f.controller.activate(); await flush(); await review;
  t.mock.timers.tick(10000); await flush(); assert.equal(f.calls.length, 1); f.controller.dispose();
});

test('slow saved reconciliation remains physically single-flight after timeout and re-review', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const f = fixture(() => undefined, true, 0, 1); let requests = 0;
  f.service.reconcile = async () => { requests++; return await new Promise(() => {}); };
  const first = f.controller.review(); await flush(); t.mock.timers.tick(1000); await flush(); await first;
  const second = f.controller.review(); await flush(); t.mock.timers.tick(1000); await flush(); f.controller.dispose(); f.controller.activate(); await second;
  assert.equal(requests, 1); await f.controller.issue(); assert.equal(f.calls.length, 0); f.controller.dispose();
});

for (const duration of [0, 4000, 20000]) for (const fails of [false, true]) {
  test(`physical response ${duration}ms, failure=${fails}: next=max(start+8s,end+5s)`, async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
    const f = fixture(() => undefined, false, 8000, 2, 45000);
    const original = f.service.previewSource!; let release!: () => void; let started = 0;
    f.service.previewSource = async (...args) => {
      started++; const result = await original(...args);
      if (started === 1) {
        await new Promise<void>(resolve => { release = resolve; });
        if (fails) throw new Error('Provider unavailable');
      }
      return result;
    };
    const review = f.controller.review(); await flush();
    t.mock.timers.tick(duration); await flush(); assert.equal(started, 1);
    release(); await flush();
    const rest = Math.max(8000 - duration, 5000);
    t.mock.timers.tick(rest - 1); await flush(); assert.equal(started, 1);
    t.mock.timers.tick(1); await flush(); await review; assert.equal(started, 2);
    assert.equal(f.calls[1].at - f.calls[0].at, Math.max(8000, duration + 5000)); f.controller.dispose();
  });
}

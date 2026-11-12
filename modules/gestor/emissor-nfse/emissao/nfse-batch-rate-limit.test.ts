import assert from 'node:assert/strict';
import test from 'node:test';
import type { IndividualIssueResult, IndividualPayload, NfseIndividualService } from '../individual/nfse-individual.types';
import { createNfseBatchController } from './nfse-batch.core';
const id = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO' as const, month: '2026-11' };
const payload = { recipientName: 'SINTÉTICO', amount: '1.00' } as IndividualPayload;
const result = (previewId: string, state: IndividualIssueResult['state']): IndividualIssueResult => ({
  previewId, state, payload, message: 'Sintético', number: state === 'AUTHORIZED' ? '1' : null, accessKey: state === 'AUTHORIZED' ? '1'.repeat(50) : null,
});
const flush = async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); };
const limited = (retryAfterMs = 60_000) => Object.assign(new Error('Limite de comandos atingido antes do envio.'), {
  code: 'RATE_LIMITED', status: 429, beforeDispatch: true, retryAfterMs,
});
function fixture(error: Error, validityMs = 600_000, limitedAttempts = 1) {
  const posts: { requestId: string; previewId: string }[] = []; let serial = 10;
  const service = {
    previewSource: async (_scope: unknown, _request: unknown, source: { id: string }) => ({ previewId: source.id, state: 'PREVIEWED', payload,
      expiresAt: new Date(Date.now() + validityMs).toISOString(), capability: { available: true, reason: null } }),
    issue: async (_scope: unknown, requestId: string, previewId: string) => {
      posts.push({ requestId, previewId }); if (posts.length <= limitedAttempts) throw error; return result(previewId, 'AUTHORIZED');
    },
    observe: async (_scope: unknown, _request: unknown, previewId: string) => result(previewId, 'PREVIEWED'),
    reconcile: async () => { throw new Error('Fiscal reconciliation forbidden'); },
  } as unknown as NfseIndividualService;
  const controller = createNfseBatchController(scope, [id(3), id(4)].map(sourceId => ({ source: { kind: 'PARTNER_SERVICE', id: sourceId }, label: 'SINTÉTICO', amount: '1.00' })),
    service, { getItem: () => null, setItem() {} }, { confirmationDelays: [], uuid: () => id(++serial) });
  return { controller, posts, service };
}

test('a proven pre-dispatch 429 retries only the same approved preview after Retry-After, then continues the approved batch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  const f = fixture(limited(120_000));
  await f.controller.review(); await f.controller.issue();
  const first = f.controller.getSnapshot().items[0];
  assert.equal(first.uncertain, false); assert.equal(first.dispatched, false); assert(first.preview);
  t.mock.timers.tick(119_999); await flush(); assert.equal(f.posts.length, 1);
  t.mock.timers.tick(1); await flush();
  assert.equal(f.posts.length, 3); assert.deepEqual(f.posts[0], f.posts[1]);
  assert.notEqual(f.posts[1].previewId, f.posts[2].previewId);
  assert(f.controller.getSnapshot().items.every(item => item.result?.state === 'AUTHORIZED'));
  f.controller.dispose();
});


test('the pre-dispatch retry waits at least 60 seconds and clicks/events cannot bypass its deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  const f = fixture(limited(1)); await f.controller.review(); await f.controller.issue();
  const retryAt = f.controller.getSnapshot().retryAt;
  assert.equal(retryAt, Date.now() + 60_000);
  f.controller.signalChange(true); f.controller.signalChange(); await f.controller.issue(); await flush();
  t.mock.timers.tick(59_999); await flush(); assert.equal(f.posts.length, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(f.posts.length, 3);
  assert.equal(f.controller.getSnapshot().retryAt, null); f.controller.dispose();
});

test('a repeated proven rate limit schedules a new window instead of cycling fiscal POSTs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  const f = fixture(limited(), 600_000, 2); await f.controller.review(); await f.controller.issue();
  t.mock.timers.tick(60_000); await flush(); assert.equal(f.posts.length, 2);
  assert.equal(f.controller.getSnapshot().retryAt, Date.now() + 60_000);
  f.controller.signalChange(true); await flush(); assert.equal(f.posts.length, 2);
  t.mock.timers.tick(60_000); await flush(); assert.equal(f.posts.length, 4);
  assert.deepEqual(f.posts[0], f.posts[1]); assert.deepEqual(f.posts[1], f.posts[2]); f.controller.dispose();
});

test('pause/dispose cancel pre-dispatch rate-limit retries, including after activation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  for (const dispose of [false, true]) {
    const f = fixture(limited()); await f.controller.review(); await f.controller.issue();
    if (dispose) f.controller.dispose(); else f.controller.stop();
    f.controller.activate(); f.controller.signalChange(true);
    t.mock.timers.tick(120_000); await flush(); assert.equal(f.posts.length, 1);
    assert.equal(f.controller.getSnapshot().retryAt, null); f.controller.dispose();
  }
});

test('the approved preview expiring during a pre-dispatch rate-limit window is not renewed or sent automatically', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  const f = fixture(limited(), 30_000); await f.controller.review(); await f.controller.issue();
  t.mock.timers.tick(60_000); await flush();
  assert.equal(f.posts.length, 1); assert.equal(f.controller.getSnapshot().items[0].dispatched, false);
  assert.equal(f.controller.getSnapshot().items[0].uncertain, false); assert.equal(f.controller.getSnapshot().paused, true);
  f.controller.dispose();
});

test('timeouts, unproven 429s and provider failures stay uncertain and never authorize another POST', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  for (const error of [new Error('Ambiguous timeout'),
    Object.assign(new Error('Unproven limit'), { code: 'RATE_LIMITED', status: 429, retryAfterMs: 60_000 }),
    Object.assign(new Error('Provider limit'), { code: 'PROVIDER_RATE_LIMITED', status: 429, beforeDispatch: true }),
    Object.assign(new Error('Gateway failure'), { code: 'RATE_LIMITED', status: 503, beforeDispatch: true })]) {
    const f = fixture(error); await f.controller.review(); await f.controller.issue();
    f.controller.signalChange(true); await flush(); t.mock.timers.tick(180_000); await flush();
    assert.equal(f.posts.length, 1); assert.equal(f.controller.getSnapshot().retryAt, null);
    assert.equal(f.controller.getSnapshot().items[0].uncertain, true); f.controller.dispose();
  }
});

test('the delayed retry and concurrent Realtime cannot overlap or dispatch the same approved note twice', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-11-12T18:00:00Z') });
  const f = fixture(limited()); await f.controller.review(); await f.controller.issue();
  let finish!: (value: IndividualIssueResult) => void, active = 0, maxActive = 0;
  f.service.issue = async (_scope, requestId, previewId) => {
    f.posts.push({ requestId, previewId }); active++; maxActive = Math.max(maxActive, active);
    try { return f.posts.length === 2 ? await new Promise(resolve => { finish = resolve; }) : result(previewId, 'AUTHORIZED'); }
    finally { active--; }
  };
  t.mock.timers.tick(60_000); await flush(); assert.equal(f.posts.length, 2);
  f.controller.signalChange(true); f.controller.signalChange(true); await f.controller.issue(); await flush();
  assert.equal(f.posts.length, 2); finish(result(id(3), 'AUTHORIZED')); await flush();
  assert.equal(f.posts.length, 3); assert.equal(maxActive, 1);
  assert.deepEqual(f.posts[0], f.posts[1]); f.controller.dispose();
});

/* global ReadableStream: readonly */
import { createHandler } from './handler.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Call = { name: string; action: unknown; payload: Record<string, unknown> };

function fixture(failAt = 0) {
  const calls: Call[] = [];
  const rpc = (name: string, args: Record<string, unknown>) => {
    const action = args.p_action;
    const payload = (args.p_payload ?? {}) as Record<string, unknown>;
    calls.push({ name, action, payload });
    let data: unknown;
    if (name === 'proesc_sync_runtime_service' && action === 'authorize') data = { actorId: 'actor' };
    else {
      assert(args.p_actor_id === 'actor');
      if (name === 'proesc_sync_runtime_service' && action === 'claim') data = {
        claimed: true, leaseId: id(80), lastId: id(1), referenceTime: '2026-09-26T01:00:00+00:00',
        links: [{ linkId: id(1), classId: id(2), unitId: '1', sourceClassId: '2',
          externalKey: '3', receivableId: id(3), personHash: 'synthetic', dueDate: '2026-02-15',
          principalCents: 10000, status: 'PENDENTE', paidCents: 0, paymentDate: null, expectedBefore: 'before' }],
      };
      else if (name === 'proesc_cycle_review_runtime_service' && action === 'claim') {
        data = { claimed: true, leaseId: id(81) };
      } else if (action === 'finish') data = { finished: true };
      else if (name === 'proesc_cycle_review_batch_service' && action === 'targets') {
        data = { groups: [
          { representativeId: id(10), matriculaIds: [id(10)] },
          { representativeId: id(11), matriculaIds: [id(11)] },
        ] };
      } else if (name === 'proesc_cycle_review_cache_service' && action === 'begin') data = {
        cacheId: id(20), lease: id(21), cached: false, tokenRevision: 'revision',
        context: { unitId: '1', firstYear: 2026, lastYear: 2026, classIds: ['2'] },
      };
      else if (name === 'proesc_cycle_review_pages_service') data = action === 'read'
        ? { version: 1, unitId: '1', tokenRevision: 'revision', pages: [] }
        : { saved: true, reused: false, hash: 'a'.repeat(64) };
      else if (name === 'proesc_workspace_service') data = { token: 'a'.repeat(32), revision: 'revision' };
      else if (name === 'proesc_cycle_review_cache_service') {
        if (action === 'complete') assert((payload.periods as unknown[]).length === 12,
          'Incomplete source window reached cycle cache completion');
        data = { cacheId: id(20), complete: true };
      } else if (name === 'proesc_try_reuse_observation_service') data = { reused: false };
      else if (name === 'proesc_record_financial_snapshot_service') data = { snapshotId: id(30) };
      else if (name === 'proesc_cycle_review_batch_service' && action === 'record') {
        data = { success: true, reviewed: 1, failed: 0, c1: 0, full: 0, unknown: 1, protected: 0, eligible: 0 };
      } else throw new Error('Unexpected financial operation');
    }
    return Promise.resolve({ data, error: null });
  };
  const admin = { rpc } as unknown as Parameters<typeof createHandler>[0];
  let requests = 0, active = 0, maximum = 0;
  const transport: typeof fetch = (_input, init) => {
    assert(init?.method === 'GET');
    requests++; active++; maximum = Math.max(maximum, active);
    const status = requests === failAt ? 429 : 200;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true; active--; clearTimeout(timer);
    };
    return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        timer = setTimeout(() => {
          finish();
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ status: 'success', data: [] })));
          controller.close();
        }, 2);
      },
      cancel() { finish(); },
    }), { status, headers: { 'Content-Type': 'application/json' } }));
  };
  const request = new Request('https://local.invalid/proesc', {
    method: 'POST', headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) },
    body: JSON.stringify({ action: 'internal_sync' }),
  });
  return {
    calls, run: () => createHandler(admin, transport)(request),
    stats: () => ({ requests, active, maximum }),
  };
}

Deno.test('both real internal workers share one GET including the full response body', async () => {
  const f = fixture(); const response = await f.run(); const body = await response.json();
  assert(response.status === 200 && body.failed === 0 && body.consulted === 1);
  assert(body.cycleReview.success && body.cycleReview.reviewed === 2);
  assert(f.stats().requests === 15, 'Cycle pages were not shared between groups or periods were dropped');
  assert(f.stats().maximum === 1 && f.stats().active === 0, 'Workers overlapped their V1 bodies');
  assert(f.calls.filter((call) => call.action === 'finish').length === 2);
  assert(!f.calls.some((call) => call.name === 'proesc_apply_financial_snapshot_service'));
});

Deno.test('429 in either worker closes the shared execution and later groups cannot produce more GETs', async () => {
  for (const failAt of [1, 2]) {
    const f = fixture(failAt); const response = await f.run(); const body = await response.json();
    assert(response.status === 200 && body.failed === 1 && body.consulted === 0);
    assert(!body.cycleReview.success && body.cycleReview.failed === 2);
    assert(f.stats().requests === failAt && f.stats().maximum === 1);
    assert(!f.calls.some((call) => call.action === 'complete' || call.action === 'record'
      || call.name === 'proesc_try_reuse_observation_service'
      || call.name === 'proesc_record_financial_snapshot_service'
      || call.name === 'proesc_apply_financial_snapshot_service'), 'Partial observation reached a financial write');
    const finishes = f.calls.filter((call) => call.action === 'finish');
    assert(finishes.length === 2 && finishes.every((call) => call.payload.success === false));
    const syncFinish = finishes.find((call) => call.name === 'proesc_sync_runtime_service');
    assert(syncFinish?.payload.completedCount === 0 && syncFinish.payload.completedLastId === null);
  }
});

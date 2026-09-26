import { reviewProescClassCycles, runProescCycleReviewWorker } from './cycle-review-batch.ts';
import { ensureProescCycleCache } from './cycle-review.ts';
import { CycleCollectionPending } from './cycle-review-pages.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Call = { name: string; action: unknown; payload: Record<string, unknown> };
function fixture() {
  const calls: Call[] = [], requests: number[] = [];
  const stored = new Map<string, Record<string, unknown>>();
  let clock = Date.now(), failAt = 0, abortAt = 0;
  const controller = new AbortController();
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const action = args.p_action, payload = (args.p_payload ?? {}) as Record<string, unknown>;
    calls.push({ name, action, payload });
    let data: unknown;
    if (name === 'proesc_cycle_review_runtime_service') data = action === 'claim'
      ? { claimed: true, leaseId: id(90) } : { finished: true };
    else if (name === 'proesc_cycle_review_batch_service') {
      data = action === 'targets' ? { groups: [{ representativeId: id(1), matriculaIds: [id(1), id(2)] }] }
        : { reviewed: 2, failed: 0, c1: 0, full: 0, unknown: 2, protected: 0, eligible: 0 };
    } else if (name === 'proesc_workspace_service') data = { token: 'a'.repeat(32), revision: 'revision' };
    else if (name === 'proesc_cycle_review_pages_service') {
      if (action === 'read') data = { version: 1, unitId: '1', tokenRevision: 'revision', pages: [...stored.values()] };
      else {
        const month = Number(payload.month), key = `${payload.year}:${month}`, existing = stored.get(key);
        const hash = (Number(payload.year) * 100 + month).toString(16).padStart(64, '0');
        if (!existing) stored.set(key, { year: payload.year, month, rows: payload.rows, observedAt: payload.observedAt, hash });
        data = { saved: !existing, reused: !!existing, hash };
      }
    } else {
      assert(name === 'proesc_cycle_review_cache_service', 'Unexpected financial operation');
      data = action === 'begin' ? { cacheId: id(20), lease: id(21), tokenRevision: 'revision',
        context: { unitId: '1', firstYear: 2026, lastYear: 2026, classIds: ['2'] } } : { complete: true };
      if (action === 'complete') {
        assert(payload.resumeVersion === 1);
        assert((payload.pageHashes as unknown[]).length === 12 && (payload.periods as unknown[]).length === 12);
        const manifest = payload.pageHashes as Array<{ year: number; month: number; hash: string }>;
        const evidence = manifest.map((item) => {
          const page = stored.get(`${item.year}:${item.month}`);
          assert(page && page.hash === item.hash, 'Completion did not bind the persisted page');
          return page;
        });
        const oldest = Math.min(...evidence.map((item) => Date.parse(String(item.observedAt))));
        assert(Date.parse(String(payload.sourceObservedAt)) === oldest, 'Completion renewed a source timestamp');
      }
    }
    return { data, error: null };
  };
  const transport: typeof fetch = async (input) => {
    const month = Number(new URL(String(input)).searchParams.get('mes'));
    requests.push(month); clock += 10;
    if (abortAt === requests.length) controller.abort();
    return requests.length === failAt ? new Response('', { status: 429 }) : Response.json({ status: 'success', data: [] });
  };
  return { calls, stored, requests, controller, rpc, transport, now: () => clock,
    budget: (ms: number) => ({ deadlineAt: clock + ms, now: () => clock }),
    advance: (ms: number) => { clock += ms; }, fail: (n: number) => { failAt = n; }, abort: (n: number) => { abortAt = n; } };
}

Deno.test('soft yield persists complete pages and another invocation fetches only the missing months', async () => {
  const f = fixture();
  const first = await reviewProescClassCycles(f, 'actor', null, f.transport, undefined, id(90), f.budget(25));
  assert(!first.success && first.pending === 2 && first.failed === 0 && first.progressiveCount === 3 && !first.sourceFailed);
  assert(f.stored.size === 3 && f.requests.join(',') === '1,2,3');
  assert(f.calls.some((call) => call.action === 'abort'));
  assert(!f.calls.some((call) => call.action === 'complete' || call.action === 'record'), 'Partial eligibility was written');
  f.advance(120_000);
  const second = await reviewProescClassCycles(f, 'actor', null, f.transport, undefined, id(90), f.budget(1000));
  assert(second.success && second.pending === 0 && second.sourceRequests === 9 && second.progressiveCount === 9);
  assert(f.requests.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12', 'Continuation restarted the full window');
  assert(f.calls.filter((call) => call.action === 'complete').length === 1);
  assert(f.calls.filter((call) => call.action === 'record').length === 1);
});

Deno.test('source failure retains durable progress but is a failure, not a successful partial review', async () => {
  const f = fixture(); f.fail(3);
  const result = await reviewProescClassCycles(f, 'actor', null, f.transport, undefined, id(90), f.budget(1000));
  assert(!result.success && result.failed === 2 && result.pending === 0 && result.sourceFailed);
  assert(result.progressiveCount === 2 && result.sourceRequests === 3 && f.stored.size === 2);
  assert(!f.calls.some((call) => call.action === 'complete' || call.action === 'record'));
});

Deno.test('expired saved pages are reread and the oldest timestamp cannot be renewed at completion', async () => {
  const f = fixture();
  await reviewProescClassCycles(f, 'actor', null, f.transport, undefined, id(90), f.budget(15));
  f.advance(300_001);
  // Model the RPC retention removing expired entries before accepting a replacement.
  f.stored.clear();
  const result = await reviewProescClassCycles(f, 'actor', null, f.transport, undefined, id(90), f.budget(1000));
  assert(result.success && result.sourceRequests === 12 && f.requests.slice(2).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12');
});

Deno.test('abort after a source response cannot append it, complete the window or record eligibility', async () => {
  const f = fixture(); f.abort(3);
  const result = await reviewProescClassCycles(f, 'actor', null, f.transport, f.controller.signal, id(90), f.budget(1000));
  assert(!result.success && f.stored.size === 2 && f.requests.length === 3);
  assert(!f.calls.some((call) => call.action === 'complete' || call.action === 'record'));
});

Deno.test('all pages becoming stale during collection yields without a partial cache completion', async () => {
  const f = fixture();
  const transport: typeof fetch = (input, init) => { f.advance(30_000); return f.transport(input, init); };
  let pending = false;
  try { await ensureProescCycleCache(f, 'actor', id(1), transport, { budget: f.budget(500_000) }); }
  catch (error) { pending = error instanceof CycleCollectionPending; }
  assert(pending && f.stored.size === 12 && !f.calls.some((call) => call.action === 'complete'));
});

Deno.test('runtime always finishes the lease after an upstream failure, retaining failure/progress counters', async () => {
  const f = fixture(); f.fail(2);
  await runProescCycleReviewWorker(f, 'actor', f.transport);
  const finish = f.calls.find((call) => call.name === 'proesc_cycle_review_runtime_service' && call.action === 'finish');
  const result = finish?.payload.result as Record<string, unknown>;
  assert(finish?.payload.success === false && result.sourceFailed === true && result.progressiveCount === 1);
});

Deno.test('runtime finishes a soft yield with pending/progress counters and no classification write', async () => {
  const f = fixture();
  const originalNow = Date.now;
  Date.now = f.now;
  try {
    await runProescCycleReviewWorker(f, 'actor', (input, init) => { f.advance(30_000); return f.transport(input, init); });
    const finish = f.calls.find((call) => call.name === 'proesc_cycle_review_runtime_service' && call.action === 'finish');
    const result = finish?.payload.result as Record<string, unknown>;
    assert(finish?.payload.success === false && result.pending === 2 && result.failed === 0
      && result.progressiveCount === 3 && result.sourceFailed === false);
    assert(!f.calls.some((call) => call.action === 'complete' || call.action === 'record'));
  } finally { Date.now = originalNow; }
});

Deno.test('invalid persisted identity and missing append attestation fail closed before completion', async () => {
  for (const invalidRead of [true, false]) {
    const f = fixture();
    const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'proesc_cycle_review_pages_service' && (invalidRead || args.p_action === 'append')) {
        return { data: invalidRead ? { version: 1, unitId: 'OTHER', tokenRevision: 'revision', pages: [] }
          : { saved: true, reused: false, hash: 'corrupted' }, error: null };
      }
      return await f.rpc(name, args);
    } };
    const result = await reviewProescClassCycles(admin, 'actor', null, f.transport, undefined, id(90), f.budget(1000));
    assert(!result.success && result.failed === 2 && result.progressiveCount === 0);
    assert(f.requests.length === (invalidRead ? 0 : 1));
    assert(!f.calls.some((call) => call.action === 'complete' || call.action === 'record'));
  }
});

Deno.test('a pending large window does not block a smaller fully observed group after the soft limit', async () => {
  const f = fixture();
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === 'proesc_cycle_review_batch_service' && args.p_action === 'targets') return { data: { groups: [
      { representativeId: id(1), matriculaIds: [id(1), id(2)] },
      { representativeId: id(3), matriculaIds: [id(3), id(4)] },
    ] }, error: null };
    if (name === 'proesc_cycle_review_cache_service' && args.p_action === 'begin' && args.p_matricula_id === id(1)) {
      return { data: { cacheId: id(22), lease: id(21), tokenRevision: 'revision',
        context: { unitId: '1', firstYear: 2026, lastYear: 2027, classIds: ['2'] } }, error: null };
    }
    if (name === 'proesc_cycle_review_pages_service' && args.p_action === 'read' && args.p_matricula_id === id(3)) {
      return { data: { version: 1, unitId: '1', tokenRevision: 'revision',
        pages: [...f.stored.values()].filter((page) => page.year === 2026) }, error: null };
    }
    return await f.rpc(name, args);
  } };
  const result = await reviewProescClassCycles(admin, 'actor', null, f.transport, undefined, id(90), f.budget(125));
  assert(!result.success && result.pending === 2 && result.reviewed === 2 && result.failed === 0);
  assert(result.sourceRequests === 13 && result.progressiveCount === 13, 'A GET started after the soft limit');
  assert(f.calls.filter((call) => call.action === 'complete').length === 1
    && f.calls.filter((call) => call.action === 'record').length === 1);
});

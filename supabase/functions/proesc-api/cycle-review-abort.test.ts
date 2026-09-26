import { ensureProescCycleCache } from './cycle-review.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rejected = async (promise: Promise<unknown>) => {
  try { await promise; } catch { return true; }
  return false;
};
function fixture(busy = false) {
  const actions: string[] = [];
  return { actions, rpc: async (name: string, args: Record<string, unknown>) => {
    const action = String(args.p_action); actions.push(action);
    if (name === 'proesc_cycle_review_pages_service') return { data: args.p_action === 'read'
      ? { version: 1, unitId: '1', tokenRevision: 'revision', pages: [] }
      : { saved: true, reused: false, hash: 'a'.repeat(64) }, error: null };
    if (name === 'proesc_workspace_service') {
      return { data: { token: 'a'.repeat(32), revision: 'revision' }, error: null };
    }
    assert(name === 'proesc_cycle_review_cache_service');
    return { data: action === 'begin' ? busy ? { busy: true } : {
      cacheId: id(20), lease: id(21), cached: false, tokenRevision: 'revision',
      context: { unitId: '1', firstYear: 2026, lastYear: 2026, classIds: ['2'] },
    } : { cacheId: id(20), complete: true }, error: null };
  } };
}

Deno.test('a deadline while waiting for another cache owner settles without cancelling that owner', async () => {
  const owner = fixture(); const ownerSignal = new AbortController();
  let started: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const transport: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    started();
    init?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true });
  });
  const ownerResult = rejected(ensureProescCycleCache(owner, 'actor', id(1), transport,
    { signal: ownerSignal.signal }));
  await ready;
  const waiter = fixture(true); const waiterSignal = new AbortController();
  const waiting = rejected(ensureProescCycleCache(waiter, 'actor', id(2), transport,
    { signal: waiterSignal.signal }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  waiterSignal.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const settled = await Promise.race([waiting,
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), 30); })]);
    assert(settled, 'Busy wait ignored its own deadline');
    assert(!ownerSignal.signal.aborted && waiter.actions.join(',') === 'begin');
  } finally { clearTimeout(timer); ownerSignal.abort(); await ownerResult; }
  assert(owner.actions.includes('abort') && !owner.actions.includes('complete'));
});

Deno.test('an already aborted review does not begin a lease or read credentials', async () => {
  const admin = fixture(); const controller = new AbortController(); controller.abort();
  assert(await rejected(ensureProescCycleCache(admin, 'actor', id(1), fetch,
    { signal: controller.signal })));
  assert(admin.actions.length === 0);
});

Deno.test('aborting after all twelve bodies during source normalization never completes the cache', async () => {
  const admin = fixture(); const controller = new AbortController(); let reads = 0;
  const originalDigest = crypto.subtle.digest;
  crypto.subtle.digest = function (...args: Parameters<typeof originalDigest>) {
    assert(reads === 12, 'Abort fixture did not reach normalization after the complete source');
    controller.abort();
    return originalDigest.apply(this, args);
  };
  try {
    const failed = await rejected(ensureProescCycleCache(admin, 'actor', id(1), async (input) => {
      reads++;
      const month = new URL(String(input)).searchParams.get('mes');
      return Response.json({ status: 'success', data: month === '12' ? [{
        chave_id: '3', id: '1', valor: '100.00', unidade_id: '1', turma_id: '2',
        aluno_cpf: '12345678901', data_vencimento: '2026-01-15', data_cricao: '2026-01-01',
        data_pagamento: null, registro_cancelado: false, pagamento_renegociacao: false,
      }] : [] });
    }, { signal: controller.signal }));
    assert(failed && reads === 12 && admin.actions.includes('abort') && !admin.actions.includes('complete'));
  } finally { crypto.subtle.digest = originalDigest; }
});

/* global ReadableStream: readonly */
import { createHandler } from './handler.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Call = { name: string; action: unknown; payload: Record<string, unknown> };

function fixture(failAt = 0) {
  const calls: Call[] = [];
  let claims = 0;
  const rpc = (name: string, args: Record<string, unknown>) => {
    const action = args.p_action;
    const payload = (args.p_payload ?? {}) as Record<string, unknown>;
    calls.push({ name, action, payload });
    let data: unknown;
    if (name === 'proesc_v2_worker_service' && action === 'authorize') data = { actorId: 'actor' };
    else {
      assert(args.p_actor_id === 'actor');
      if (name === 'proesc_v2_runtime_service' && action === 'claim') {
        claims++;
        data = claims <= 3 ? { claimed: true, taskId: id(70), leaseId: id(80), credentialRevision: id(90),
          resource: claims === 3 ? 'apply' : 'invoices', unitId: '1', year: 2026, month: 9, page: claims }
          : { claimed: false };
      } else if (name === 'proesc_connection_service') {
        assert(action === 'credential' && payload.version === 'v2');
        data = { token: 'synthetic-v2-bearer', revision: id(90), wafHeader: null };
      } else if (name === 'proesc_v2_runtime_service' && action === 'commit') data = { committed: true };
      else if (name === 'proesc_v2_runtime_service' && action === 'apply') data = { applied: 2 };
      else if (name === 'proesc_v2_runtime_service' && action === 'fail') data = { failed: true };
      else throw new Error('Unexpected financial operation');
    }
    return Promise.resolve({ data, error: null });
  };
  const admin = { rpc } as unknown as Parameters<typeof createHandler>[0];
  let requests = 0, active = 0, maximum = 0;
  const transport: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    assert(init?.method === 'GET' && url.origin === 'https://api.proesc.com');
    assert(url.pathname === '/api/v2/invoices' && url.searchParams.get('expiration_month') === '09');
    assert(new Headers(init.headers).get('Authorization') === 'Bearer synthetic-v2-bearer');
    requests++; active++; maximum = Math.max(maximum, active);
    const page = Number(url.searchParams.get('page'));
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
          controller.enqueue(new TextEncoder().encode(JSON.stringify({
            data: [{ invoice_id: page, person_id: 7, pessoa: { id: 7, cadastro_nacional: '01234567890' },
              matricula: { id: 8, turma_id: 9 }, due_date: '2026-09-15', status: 'VENCIDO',
              original_invoice_amount: '279,90', paid_invoice_amount: '0,00', payment_date: null }],
            meta: { current_page: page, last_page: 2, total: 2 },
          })));
          controller.close();
        }, 2);
      },
      cancel() { finish(); },
    }), { status, headers: { 'Content-Type': 'application/json' } }));
  };
  const request = () => new Request('https://local.invalid/proesc', {
    method: 'POST', headers: { 'X-Proesc-Sync-Secret': 'a'.repeat(64) },
    body: JSON.stringify({ action: 'internal_v2_sync', p_actor_id: 'forged' }),
  });
  return { calls, run: () => createHandler(admin, transport)(request()), stats: () => ({ requests, active, maximum }) };
}

Deno.test('entrada interna V2 conclui páginas sequenciais antes de apply sem consultasV1', async () => {
  const f = fixture();
  const response = await f.run(); const body = await response.json();
  assert(response.status === 200 && body.version === 'v2' && body.failed === 0 && body.pages === 2);
  assert(body.records === 2 && body.applyBatches === 1);
  assert(f.stats().requests === 2 && f.stats().maximum === 1 && f.stats().active === 0);
  const commits = f.calls.filter((call) => call.action === 'commit');
  assert(commits.length === 2 && commits[0].payload.page === 1 && commits[1].payload.page === 2);
  assert(f.calls.findIndex((call) => call.action === 'apply') > f.calls.lastIndexOf(commits[1]));
  assert(!JSON.stringify(commits).includes('01234567890'));
  assert(!f.calls.some((call) => ['proesc_sync_runtime_service', 'proesc_cycle_review_runtime_service',
    'proesc_workspace_service', 'proesc_apply_financial_snapshot_service'].includes(call.name)));
});

Deno.test('HTTP429 interrompe pipelineV2 preserva páginascommitted e impedeapply oufallback', async () => {
  for (const failAt of [1, 2]) {
    const f = fixture(failAt);
    const response = await f.run(); const body = await response.json();
    assert(response.status === 200 && body.failed === 1 && body.pages === failAt - 1);
    assert(f.stats().requests === failAt && f.stats().maximum === 1 && f.stats().active === 0);
    assert(f.calls.filter((call) => call.action === 'commit').length === failAt - 1);
    assert(!f.calls.some((call) => call.action === 'apply'));
    const failures = f.calls.filter((call) => call.action === 'fail');
    assert(failures.length === 1 && failures[0].payload.errorCode === 'RATE_LIMIT');
    assert(!JSON.stringify(body).includes('synthetic-v2-bearer'));
  }
});

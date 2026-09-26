import { runProescSync } from './sync-worker.ts';

const assert = (value: unknown, message = 'Assertion failed') => {
  if (!value) throw new Error(message);
};
type Call = { name: string; args: Record<string, unknown> };
type Finish = {
  success: boolean; completedCount: number; completedLastId: string | null;
  telemetry: { errorCode: string | null; http: unknown[] };
};

function fixture(reference: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const periods: string[] = [];
  const link = {
    linkId: 'link', classId: 'local', unitId: '1', sourceClassId: '2',
    externalKey: '3', receivableId: 'receipt', personHash: 'synthetic',
    dueDate: '2026-01-15', principalCents: 10000, status: 'PENDENTE',
    paidCents: 0, paymentDate: '2026-02-15', expectedBefore: 'before',
  };
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      let data: unknown = { finished: true };
      if (name === 'proesc_sync_runtime_service' && args.p_action === 'claim') {
        data = { claimed: true, leaseId: 'lease', lastId: link.linkId, links: [link], ...reference };
      } else if (name === 'proesc_workspace_service') {
        data = { token: 'a'.repeat(32), revision: 'revision' };
      } else if (name === 'proesc_try_reuse_observation_service') {
        data = { reused: true, snapshotId: 'existing', stage: 'SNAPSHOT' };
      }
      return Promise.resolve({ data, error: null });
    },
  };
  const transport: typeof fetch = (input) => {
    const params = new URL(String(input)).searchParams;
    periods.push(`${params.get('ano_letivo')}-${Number(params.get('mes'))}`);
    return Promise.resolve(Response.json({ status: 'success', data: [] }));
  };
  return {
    admin, transport, calls, periods,
    finish: () => calls.findLast((call) => call.name === 'proesc_sync_runtime_service'
      && call.args.p_action === 'finish')?.args.p_payload as Finish,
    observation: () => calls.find((call) => call.name === 'proesc_try_reuse_observation_service')
      ?.args.p_observation as { observedAt: string },
  };
}

Deno.test('claim timestamp preserves the four budgeted months across a UTC month boundary', async () => {
  const f = fixture({ referenceTime: '2026-10-01T00:00:00.000001+00:00' });
  const startedAt = new Date('2026-09-30T23:59:59.999Z');
  const result = await runProescSync(f.admin, 'actor', f.transport, startedAt);
  assert('failed' in result && result.failed === 0);
  assert(JSON.stringify(f.periods) === JSON.stringify(['2026-1', '2026-2', '2026-10', '2026-9']),
    'Worker fetched months outside the server claim budget');
  assert(f.observation().observedAt === startedAt.toISOString(), 'Claim changed the observation timestamp');
  assert(f.finish().success && f.finish().completedCount === 1 && f.finish().completedLastId === 'link');
});

Deno.test('UTC claim reference supports Z and a year rollover without duplicating due months', async () => {
  const f = fixture({ referenceTime: '2027-01-01T00:00:00Z' });
  await runProescSync(f.admin, 'actor', f.transport, new Date('2026-12-31T23:59:59Z'));
  assert(JSON.stringify(f.periods) === JSON.stringify(['2026-1', '2026-2', '2027-1', '2026-12']));
  assert(f.finish().success);
});

Deno.test('claim timestamp with an offset selects months by UTC', async () => {
  const f = fixture({ referenceTime: '2027-01-01T01:00:00+03:00' });
  await runProescSync(f.admin, 'actor', f.transport, new Date('2027-01-01T01:00:00Z'));
  assert(JSON.stringify(f.periods) === JSON.stringify(['2026-1', '2026-2', '2026-12', '2026-11']));
  assert(f.finish().success);
});

Deno.test('older claims without a reference retain the original worker clock', async () => {
  const f = fixture();
  await runProescSync(f.admin, 'actor', f.transport, new Date('2026-09-30T23:59:59Z'));
  assert(JSON.stringify(f.periods) === JSON.stringify(['2026-1', '2026-2', '2026-9', '2026-8']));
  assert(f.finish().success);
});

Deno.test('a present invalid claim reference fails before credentials, GETs and financial work', async () => {
  for (const referenceTime of [null, undefined, 0, {}, '', 'yesterday', '2026-10-01',
    '2026-10-01T00:00:00', '2026-13-01T00:00:00Z', '2026-10-01T99:00:00+00:00']) {
    const f = fixture({ referenceTime });
    const result = await runProescSync(f.admin, 'actor', f.transport, new Date('2026-09-30T23:59:59Z'));
    assert('failed' in result && result.failed === 1 && result.consulted === 0);
    assert(f.periods.length === 0);
    assert(f.calls.length === 2 && f.calls.every((call) => call.name === 'proesc_sync_runtime_service'),
      'Invalid reference reached credentials or financial work');
    assert(!f.finish().success && f.finish().completedCount === 0 && f.finish().completedLastId === null);
    assert(f.finish().telemetry.errorCode === 'INTERNAL_ERROR' && f.finish().telemetry.http.length === 0);
  }
});

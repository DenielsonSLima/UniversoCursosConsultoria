import { runProescSync } from './sync-worker.ts';
import { sha256 } from './sync-observation.ts';

const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const now = new Date('2026-09-12T17:00:00Z');
const token = 'a'.repeat(32);
type Result = { data: unknown; error: unknown };
type RecordCall = { name: string; args: Record<string, unknown> };
type Scenario = { count: number; delayMs?: number; failIndex?: number; failApplyIndex?: number; rotate?: boolean };

async function fixture(scenario: Scenario) {
  const calls: RecordCall[] = [];
  const personHash = await sha256('12345678901');
  const links = Array.from({ length: scenario.count }, (_, index) => ({
    linkId: `link-${String(index).padStart(3, '0')}`, classId: 'local', unitId: '1', sourceClassId: '2',
    externalKey: String(index + 1000), receivableId: `receipt-${index}`, personHash,
    dueDate: '2026-09-15', principalCents: 27990, status: 'PENDENTE', paidCents: 0,
    paymentDate: null, expectedBefore: `hash-${index}`,
  }));
  let active = 0;
  let maxActive = 0;
  let reads = 0;
  let credentialReads = 0;
  const delayed = (result: Result, delayMs: number) => {
    let settled = false;
    let settle: (result: Result) => void;
    let removeAbort = () => {};
    active++; maxActive = Math.max(maxActive, active);
    const promise = new Promise<Result>((resolve) => { settle = resolve; });
    const complete = (value: Result) => {
      if (settled) return;
      settled = true; active--; clearTimeout(timer); removeAbort(); settle(value);
    };
    const timer = setTimeout(() => complete(result), delayMs);
    return Object.assign(promise, {
      abortSignal(signal: AbortSignal) {
        const abort = () => complete({ data: null, error: 'ABORTED' });
        signal.addEventListener('abort', abort, { once: true });
        removeAbort = () => signal.removeEventListener('abort', abort);
        if (signal.aborted) abort();
        return promise;
      },
    });
  };
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === 'proesc_sync_runtime_service' && args.p_action === 'claim') {
      return Promise.resolve({ error: null, data: { claimed: true, leaseId: 'lease', lastId: links.at(-1)?.linkId, links } });
    }
    if (name === 'proesc_workspace_service') {
      credentialReads++;
      return Promise.resolve({ error: null, data: { token, revision: scenario.rotate && credentialReads > 1 ? 'rotated' : 'revision' } });
    }
    if (name === 'proesc_record_financial_snapshot_service') {
      const payload = args.p_payload as { linkId: string };
      const index = Number(payload.linkId.split('-').at(-1));
      const failed = index === scenario.failIndex;
      return delayed({ error: failed ? 'synthetic failure' : null,
        data: failed ? null : { snapshotId: `snapshot-${index}` } }, failed ? 12 : scenario.delayMs ?? 2);
    }
    if (name === 'proesc_apply_financial_snapshot_service') {
      const index = Number((args.p_payload as { snapshotId: string }).snapshotId.split('-').at(-1));
      return delayed({ error: index === scenario.failApplyIndex ? 'CAS_REVIEW' : null,
        data: index === scenario.failApplyIndex ? null : { result: 'APPLIED' } }, scenario.delayMs ?? 2);
    }
    return Promise.resolve({ error: null, data: { finished: true } });
  } };
  const transport: typeof fetch = (input) => {
    reads++;
    const month = Number(new URL(String(input)).searchParams.get('mes'));
    const data = month === 9 ? links.flatMap((link) => {
      const common = { chave_id: link.externalKey, unidade_id: '1', turma_id: '2', aluno_cpf: '12345678901',
        data_vencimento: link.dueDate, registro_cancelado: false, pagamento_renegociacao: false };
      return [{ ...common, id: 1, valor: '279.90', data_pagamento: null },
        { ...common, id: 2, valor: '260.00', data_pagamento: '2026-09-12' }];
    }) : [];
    return Promise.resolve(Response.json({ status: 'success', data }));
  };
  const finish = () => calls.findLast((call) => call.args.p_action === 'finish')?.args.p_payload as {
    completedCount: number; completedLastId: string | null; success: boolean;
  };
  return { calls, admin, transport, links, finish, stats: () => ({ active, maxActive, reads }) };
}

Deno.test('60 linked obligations share period fetches and no more than three database requests', async () => {
  const f = await fixture({ count: 60 });
  const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('applied' in result && result.applied === 60 && result.failed === 0);
  assert(f.stats().maxActive === 3 && f.stats().active === 0, 'Database concurrency exceeded its bound');
  assert(f.stats().reads === 2, 'Repeated monthly requests were not grouped');
  assert(f.finish().completedCount === 60 && f.finish().completedLastId === f.links[59].linkId && f.finish().success);
  const text = JSON.stringify(result);
  assert(!text.includes(token) && !text.includes('12345678901') && !text.includes('link-'));
});

Deno.test('out of order successful writes cannot advance the cursor across a failed link', async () => {
  const f = await fixture({ count: 12, failIndex: 1, delayMs: 2 });
  const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('failed' in result && result.failed === 1);
  assert(f.finish().completedCount === 1 && f.finish().completedLastId === f.links[0].linkId);
  assert(f.finish().success === false && f.stats().active === 0);
  assert(f.stats().maxActive <= 3);
});

Deno.test('deadline aborts in-flight requests and reports only the completed prefix', async () => {
  const f = await fixture({ count: 60, delayMs: 8 });
  const result = await runProescSync(f.admin, 'actor', f.transport, now, { deadlineMs: 45 });
  assert('failed' in result && result.failed > 0);
  assert(f.finish().completedCount > 0 && f.finish().completedCount < 60);
  assert(f.finish().completedLastId === f.links[f.finish().completedCount - 1].linkId);
  assert(f.finish().success === false && f.stats().active === 0);
  const finishIndex = f.calls.findIndex((call) => call.args.p_action === 'finish');
  assert(!f.calls.slice(finishIndex + 1).some((call) => call.name.includes('snapshot')), 'Work escaped the deadline');
});

Deno.test('token rotation prevents all writes and cannot advance any prefix', async () => {
  const f = await fixture({ count: 60, rotate: true });
  const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('failed' in result && result.failed === 1);
  assert(!f.calls.some((call) => call.name.includes('snapshot')));
  assert(f.finish().completedCount === 0 && f.finish().completedLastId === null && !f.finish().success);
});

Deno.test('one APPLY guard failure remains review while the other links finish', async () => {
  const f = await fixture({ count: 12, failApplyIndex: 0 });
  const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('applied' in result && result.applied === 11 && result.review === 1 && result.failed === 0);
  assert(f.finish().completedCount === 12 && f.finish().completedLastId === f.links[11].linkId && f.finish().success);
  assert(f.stats().active === 0 && f.stats().maxActive <= 3);
});

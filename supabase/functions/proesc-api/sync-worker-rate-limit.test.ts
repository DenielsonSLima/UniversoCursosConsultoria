import { runProescSync } from './sync-worker.ts';
import { sha256 } from './sync-observation.ts';

const assert = (value: unknown, message = 'Assertion failed') => {
  if (!value) throw new Error(message);
};
const now = new Date('2026-09-25T17:00:00Z');
const token = 'a'.repeat(32);
type Options = { alwaysRateLimited?: boolean; delayMs?: number };
type RpcCall = { name: string; args: Record<string, unknown> };
type Finish = {
  completedCount: number; completedLastId: string | null; success: boolean;
  telemetry: {
    stage: string | null; errorCode: string | null;
    http: Array<{ httpStatus: number; errorCode: string | null }>;
    items: unknown[];
  };
};

async function fixture(options: Options = {}) {
  const link = {
    linkId: 'link', classId: 'local', unitId: '1', sourceClassId: '2',
    externalKey: '3', receivableId: 'receipt', personHash: await sha256('12345678901'),
    dueDate: '2026-01-15', principalCents: 10000, status: 'PENDENTE',
    paidCents: 0, paymentDate: null, expectedBefore: 'before',
  };
  const calls: RpcCall[] = [];
  let activeReads = 0;
  let maxActiveReads = 0;
  let startedReads = 0;
  let successfulReads = 0;
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      let data: unknown = { finished: true };
      if (name === 'proesc_sync_runtime_service' && args.p_action === 'claim') {
        data = { claimed: true, leaseId: 'lease', lastId: link.linkId, links: [link] };
      } else if (name === 'proesc_workspace_service') {
        data = { token, revision: 'revision' };
      } else if (name === 'proesc_try_reuse_observation_service') {
        assert(activeReads === 0 && successfulReads === 3, 'Incomplete source reached financial work');
        data = { reused: false };
      } else if (name === 'proesc_record_financial_snapshot_service') {
        data = { snapshotId: 'snapshot' };
      } else if (name === 'proesc_apply_financial_snapshot_service') {
        data = { result: 'APPLIED' };
      }
      return Promise.resolve({ data, error: null });
    },
  };

  // Simulate the provider rejecting overlapping monthly GETs. No network is used.
  const transport: typeof fetch = (input, init) => new Promise((resolve, reject) => {
    startedReads++;
    activeReads++;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    const overlapped = activeReads > 1;
    const signal = init?.signal;
    let settled = false;
    const release = () => {
      if (settled) return false;
      settled = true;
      activeReads--;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      return true;
    };
    const abort = () => {
      if (release()) reject(new Error('SYNTHETIC_ABORT'));
    };
    const timer = setTimeout(() => {
      if (!release()) return;
      if (options.alwaysRateLimited || overlapped) {
        resolve(Response.json({ error: 'synthetic rate limit', token }, {
          status: 429, headers: { 'Retry-After': '60' },
        }));
        return;
      }
      successfulReads++;
      const month = Number(new URL(String(input)).searchParams.get('mes'));
      const common = {
        chave_id: '3', unidade_id: '1', turma_id: '2', aluno_cpf: '12345678901',
        data_vencimento: link.dueDate, registro_cancelado: false,
        pagamento_renegociacao: false,
      };
      const data = month === 1
        ? [{ ...common, id: 1, valor: '100.00', data_pagamento: null }]
        : month === 9
        ? [{ ...common, id: 2, valor: '100.00', data_pagamento: '2026-09-12' }]
        : [];
      resolve(Response.json({ status: 'success', data }));
    }, options.delayMs ?? 10);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  return {
    admin, transport,
    stats: () => ({ activeReads, maxActiveReads, startedReads, successfulReads }),
    financialCalls: () => calls.filter((call) => [
      'proesc_try_reuse_observation_service', 'proesc_record_financial_snapshot_service',
      'proesc_apply_financial_snapshot_service',
    ].includes(call.name)),
    finish: () => calls.findLast((call) => call.name === 'proesc_sync_runtime_service'
      && call.args.p_action === 'finish')?.args.p_payload as Finish,
  };
}

Deno.test('monthly reads run sequentially and finish before applying a verified payment', async () => {
  const f = await fixture();
  const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('applied' in result && result.applied === 1 && result.failed === 0,
    'Concurrent monthly GETs triggered a provider 429');
  assert(f.stats().startedReads === 3 && f.stats().successfulReads === 3);
  assert(f.stats().maxActiveReads === 1 && f.stats().activeReads === 0);
  assert(f.financialCalls().length === 3);
  assert(f.finish().success && f.finish().completedCount === 1);
  assert(f.finish().telemetry.http.every((entry) => entry.httpStatus === 200));
});

Deno.test('a remaining provider 429 stops queued reads and preserves the failure without financial writes', async () => {
  const f = await fixture({ alwaysRateLimited: true });
  const result = await runProescSync(f.admin, 'actor', f.transport, now);
  assert('failed' in result && result.failed === 1 && result.consulted === 0);
  assert(f.stats().startedReads === 1, 'Queued periods escaped the first rate limit');
  assert(f.stats().activeReads === 0 && f.financialCalls().length === 0);
  const finish = f.finish();
  assert(!finish.success && finish.completedCount === 0 && finish.completedLastId === null);
  assert(finish.telemetry.stage === 'FETCH' && finish.telemetry.errorCode === 'HTTP_ERROR');
  assert(finish.telemetry.http.length === 1 && finish.telemetry.http[0].httpStatus === 429);
  assert(finish.telemetry.http[0].errorCode === 'HTTP_ERROR' && finish.telemetry.items.length === 0);
  assert(!JSON.stringify(finish).includes(token), 'Provider body escaped into telemetry');
});

Deno.test('deadline cancels the single active monthly read without starting another period', async () => {
  const f = await fixture({ delayMs: 100 });
  const result = await runProescSync(f.admin, 'actor', f.transport, now, { deadlineMs: 10 });
  assert('failed' in result && result.failed === 1 && result.consulted === 0);
  assert(f.stats().startedReads === 1 && f.stats().activeReads === 0);
  assert(f.financialCalls().length === 0);
  const finish = f.finish();
  assert(!finish.success && finish.completedCount === 0 && finish.completedLastId === null);
  assert(finish.telemetry.stage === 'FETCH' && finish.telemetry.errorCode === 'ABORTED');
});

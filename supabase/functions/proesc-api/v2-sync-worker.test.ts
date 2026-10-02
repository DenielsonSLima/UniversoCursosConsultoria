import { runProescV2Sync, type V2WorkerAdmin } from './v2-sync-worker.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const actorId = '11111111-1111-1111-1111-111111111111';
const revision = '22222222-2222-2222-2222-222222222222';
const leaseId = '33333333-3333-3333-3333-333333333333';
const taskId = '44444444-4444-4444-4444-444444444444';
const credentials = { token: 'synthetic-v2-token', wafHeader: null, revision };
const task = (resource = 'invoices', page = 1) => ({
  claimed: true, taskId, leaseId, credentialRevision: revision,
  resource, unitId: '1', year: 2026, month: 9, page,
});
const invoice = (id: number) => ({
  invoice_id: id, person_id: 7, pessoa: { id: 7, cadastro_nacional: '01234567890', nome: 'PRIVATE_NAME' },
  matricula: { id: 8, turma_id: 9 }, due_date: '2026-09-15', original_invoice_amount: '279,90',
  paid_invoice_amount: '0,00', payment_date: null, status: 'VENCIDO',
  invoice_group_id: 11, order: 1, invoice_group_total: 12,
});
const response = (data: unknown[], page = 1, lastPage = 1, total = data.length) =>
  Response.json({ data, meta: { current_page: page, last_page: lastPage, total } });
type Call = { name: string; args: Record<string, unknown> };
type FixtureOptions = {
  credentials?: (call: number) => Record<string, unknown>;
  commit?: Record<string, unknown>;
  apply?: Record<string, unknown>;
  hangCommit?: boolean;
};
function fixture(tasks: Record<string, unknown>[], options: FixtureOptions = {}) {
  const calls: Call[] = [];
  let claimed = 0;
  let credentialCalls = 0;
  const admin: V2WorkerAdmin = { rpc(name, args) {
    calls.push({ name, args });
    if (name === 'proesc_connection_service') {
      assert(args.p_action === 'credential');
      assert(JSON.stringify(args.p_payload) === '{"version":"v2"}');
      return Promise.resolve({ data: options.credentials?.(++credentialCalls) ?? credentials });
    }
    assert(name === 'proesc_v2_runtime_service' && args.p_actor_id === actorId);
    switch (args.p_action) {
      case 'claim': return Promise.resolve({ data: tasks[claimed++] ?? { claimed: false } });
      case 'commit': return options.hangCommit ? new Promise(() => undefined)
        : Promise.resolve({ data: options.commit ?? { committed: true } });
      case 'apply': return Promise.resolve({ data: options.apply ?? { applied: 20 } });
      case 'fail': return Promise.resolve({ data: { failed: true } });
      default: throw new Error('Unexpected RPC action');
    }
  } };
  const payloads = (action: string) => calls.filter((call) => call.args.p_action === action)
    .map((call) => call.args.p_payload as Record<string, unknown>);
  return { admin, calls, payloads };
}

Deno.test('worker V2 pagina pelo claimdurável e persiste sóhashCPF', async () => {
  const f = fixture([task('invoices', 1), task('invoices', 2)]);
  const requested: number[] = [];
  const transport = ((input) => {
    const url = new URL(String(input));
    assert(url.origin === 'https://api.proesc.com' && url.pathname === '/api/v2/invoices');
    const page = Number(url.searchParams.get('page'));
    requested.push(page);
    return Promise.resolve(response([invoice(page)], page, 2, 2));
  }) as typeof fetch;
  const result = await runProescV2Sync(f.admin, actorId, transport);
  assert(result.pages === 2 && result.records === 2 && result.failed === 0);
  assert(requested.join(',') === '1,2');
  const commits = f.payloads('commit');
  assert(commits[0].page === 1 && commits[1].page === 2 && commits[1].lastPage === 2 && commits[1].total === 2);
  const records = commits[0].records as Record<string, unknown>[];
  const expectedHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('01234567890')))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  assert(records[0].personHash === expectedHash && !('studentDocument' in records[0]));
  assert(!JSON.stringify(f.calls).includes('01234567890') && !JSON.stringify(f.calls).includes('PRIVATE_NAME'));
});

Deno.test('worker V2 pessoas usa50 e envia somente pessoa/hash/vínculos', async () => {
  const f = fixture([task('people')]);
  const result = await runProescV2Sync(f.admin, actorId, ((input) => {
    const url = new URL(String(input));
    assert(url.pathname === '/api/v2/people' && url.searchParams.get('limit') === '50');
    return Promise.resolve(response([{ id: 7, cpf_number: '01234567890', name: 'PRIVATE_NAME',
      enrollments: [{ id: 8, class: { id: 9 } }] }]));
  }) as typeof fetch);
  assert(result.pages === 1 && result.records === 1 && result.failed === 0);
  const row = (f.payloads('commit')[0].records as Record<string, unknown>[])[0];
  assert(Object.keys(row).sort().join(',') === 'enrollments,personHash,personId');
  assert(!JSON.stringify(f.calls).includes('01234567890'));
});

Deno.test('worker V2 apply usa somenteRPC sem lercredencial oubuscarrede', async () => {
  const f = fixture([task('apply')]);
  let fetched = false;
  const result = await runProescV2Sync(f.admin, actorId, (() => { fetched = true; throw new Error('No fetch'); }) as typeof fetch);
  assert(result.applyBatches === 1 && result.failed === 0 && !fetched);
  assert(f.calls.every((call) => call.name === 'proesc_v2_runtime_service'));
  assert(f.payloads('commit').length === 0 && f.payloads('apply').length === 1);
});

Deno.test('worker V2 revisão/token mudados descartam página antescommit e usam falha aceitaSQL', async () => {
  const allowed = ['TIMEOUT', 'HTTP_ERROR', 'RATE_LIMIT', 'TRANSPORT_ERROR', 'INVALID_RESPONSE',
    'COMMIT_REJECTED', 'APPLY_REJECTED', 'CREDENTIAL_CHANGED'];
  for (const changeAt of [1, 2]) {
    const f = fixture([task()], { credentials: (call) => call >= changeAt
      ? { ...credentials, revision: '55555555-5555-5555-5555-555555555555' } : credentials });
    let requests = 0;
    const result = await runProescV2Sync(f.admin, actorId, (() => {
      requests++;
      return Promise.resolve(response([invoice(10)]));
    }) as typeof fetch);
    assert(result.failed === 1 && result.pages === 0 && f.payloads('commit').length === 0);
    assert(requests === (changeAt === 1 ? 0 : 1));
    assert(f.payloads('fail').length === 1);
    assert(allowed.includes(String(f.payloads('fail')[0].errorCode)), 'Failure code rejected by SQL allowlist');
    assert(f.payloads('fail')[0].errorCode === 'CREDENTIAL_CHANGED');
  }
});

Deno.test('worker V2 HTTP429 libera lease sanitizado semcommit nemfallback', async () => {
  const f = fixture([task()]);
  const result = await runProescV2Sync(f.admin, actorId,
    (() => Promise.resolve(new Response('PRIVATE_SERVER_DETAILS', { status: 429 }))) as typeof fetch);
  assert(result.failed === 1 && result.pages === 0 && f.payloads('commit').length === 0);
  assert(f.payloads('fail')[0].errorCode === 'RATE_LIMIT');
  assert(!JSON.stringify(f.calls).includes('PRIVATE_SERVER_DETAILS'));
});

Deno.test('worker V2 aborta transportependente e usa novo prazo para liberarlease', async () => {
  const f = fixture([task()]);
  let aborted = false;
  const result = await runProescV2Sync(f.admin, actorId, ((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('PRIVATE_TIMEOUT')); }, { once: true });
  })) as typeof fetch, { deadlineMs: 25 });
  assert(aborted && result.failed === 1 && result.pages === 0);
  assert(f.payloads('fail')[0].errorCode === 'TIMEOUT' && f.payloads('commit').length === 0);
});

Deno.test('worker V2 RPCpendente aborta semPromiseeterna e libera lease', async () => {
  const f = fixture([task()], { hangCommit: true });
  const result = await runProescV2Sync(f.admin, actorId,
    (() => Promise.resolve(response([invoice(10)]))) as typeof fetch, { deadlineMs: 25 });
  assert(result.failed === 1 && result.pages === 0 && f.payloads('commit').length === 1);
  assert(f.payloads('fail')[0].errorCode === 'TIMEOUT');
});

Deno.test('worker V2 rejeita commit/apply não confirmados e respeita orçamento de passos', async () => {
  for (const resource of ['invoices', 'apply']) {
    const f = fixture([task(resource)], { commit: { committed: false }, apply: { applied: false } });
    const result = await runProescV2Sync(f.admin, actorId,
      (() => Promise.resolve(response([invoice(10)]))) as typeof fetch);
    assert(result.failed === 1 && result.pages === 0 && result.applyBatches === 0 && f.payloads('fail').length === 1);
    assert(f.payloads('fail')[0].errorCode === (resource === 'apply' ? 'APPLY_REJECTED' : 'COMMIT_REJECTED'));
  }
  const f = fixture([task('apply'), task('apply')]);
  const result = await runProescV2Sync(f.admin, actorId, fetch, { maxSteps: 1 });
  assert(result.applyBatches === 1 && f.payloads('claim').length === 1);
});

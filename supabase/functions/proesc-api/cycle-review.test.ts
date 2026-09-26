import { reviewProescCycles } from './cycle-review.ts';
import { cycleSourceObligations } from './cycle-schedule-source.ts';
import { parseProescV1Accounting } from './v1-accounting.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const enrollment = '00000000-0000-0000-0000-000000000001';
const cache = '00000000-0000-0000-0000-000000000002';
const lease = '00000000-0000-0000-0000-000000000003';
const token = 'a'.repeat(32);
const row = (key = '100', change = {}) => ({
  chave_id: key, id: '1', valor: '279.90', unidade_id: '1', turma_id: '2', curso: '3',
  aluno_cpf: '12345678901', data_vencimento: '2026-01-15', data_cricao: '2026-01-01',
  data_pagamento: null, registro_cancelado: false, pagamento_renegociacao: false, ...change,
});
const page = (rows: unknown[]) => parseProescV1Accounting({ status: 'success', data: rows }, { unitId: '1', year: 2026, month: 1 });

Deno.test('source preflight hashes identity and retains conflicts, missing identity and renegotiation', async () => {
  const normal = await cycleSourceObligations([page([row()])], ['2']);
  assert(normal.length === 1 && normal[0].unsafe === false && normal[0].personHash?.length === 64);
  assert(!JSON.stringify(normal).includes('12345678901'));
  for (const altered of [
    [row(), row()],
    [row('100', { pagamento_renegociacao: true })],
    [row('100', { registro_cancelado: null })],
  ]) assert((await cycleSourceObligations([page(altered)], ['2']))[0].unsafe);
  assert((await cycleSourceObligations([page([row('100', { registro_cancelado: true })])], ['2'])).length === 0);
  assert((await cycleSourceObligations([page([row('100', { aluno_cpf: null })])], ['2']))[0].personHash === null);
  for (const ambiguous of [
    [row('100', { turma_id: '9' }), row('100')],
    [row('100', { id: '2', turma_id: null })],
  ]) {
    const markers = await cycleSourceObligations([page(ambiguous)], ['2']);
    assert(markers.length === 1 && markers[0].unsafe && markers[0].ambiguity,
      'Ambiguous class identity must remain a blocker for the possible owner');
  }
});

function fakeAdmin(cached = false) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return { calls, rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'proesc_cycle_review_cache_service') {
      return { data: args.p_action === 'begin' ? {
        cacheId: cache, lease, cached, tokenRevision: 'revision',
        context: { unitId: '1', firstYear: 2026, lastYear: 2028, classIds: ['2'] },
      } : { cacheId: cache, complete: true }, error: null };
    }
    if (name === 'proesc_cycle_review_pages_service') return { data: args.p_action === 'read'
      ? { version: 1, unitId: '1', tokenRevision: 'revision', pages: [] }
      : { saved: true, reused: false, hash: 'a'.repeat(64) }, error: null };
    if (name === 'proesc_workspace_service') return { data: { token, revision: 'revision' }, error: null };
    assert(name === 'proesc_record_api_cycle_review_service', 'Unexpected financial mutation');
    return { data: { classification: 'UNKNOWN', eligible: false, source: 'API_SCHEDULE_REVIEW' }, error: null };
  } };
}

Deno.test('preflight uses a complete shared window, bounded concurrency, GET only and no issuance', async () => {
  const admin = fakeAdmin();
  const requests: string[] = [];
  let active = 0, maximum = 0;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert(url.origin === 'https://app.proesc.com' && url.pathname.endsWith('/accounting_data'));
    assert(init?.method === 'GET' && init.redirect === 'error' && !url.searchParams.has('id_chave'));
    requests.push(`${url.searchParams.get('ano_letivo')}-${url.searchParams.get('mes')}`);
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return Response.json({ status: 'success', data: [] });
  };
  const result = await reviewProescCycles(admin, 'actor', enrollment, transport);
  assert(result.classification === 'UNKNOWN' && requests.length === 36 && new Set(requests).size === 36);
  assert(maximum <= 4);
  const complete = admin.calls.find((call) => call.args.p_action === 'complete');
  assert(complete && (complete.args.p_payload as { periods: unknown[] }).periods.length === 36);
});

Deno.test('fresh cache avoids any upstream request and only records the verified review', async () => {
  const admin = fakeAdmin(true);
  await reviewProescCycles(admin, 'actor', enrollment, () => { throw new Error('No upstream request expected'); });
  assert(admin.calls.length === 2 && !admin.calls.some((call) => call.name === 'proesc_workspace_service'));
});

Deno.test('partial upstream failure never completes cache or records eligibility', async () => {
  const admin = fakeAdmin();
  let rejected = false;
  try {
    await reviewProescCycles(admin, 'actor', enrollment, async () => new Response('SECRET_BODY', { status: 503 }));
  } catch (error) {
    rejected = true;
    assert(!String(error).includes(token) && !String(error).includes('SECRET_BODY'));
  }
  assert(rejected && !admin.calls.some((call) => call.args.p_action === 'complete'
    || call.name === 'proesc_record_api_cycle_review_service'));
});

Deno.test('unauthorized enrollment stops before accessing credentials or Proesc', async () => {
  const names: string[] = [];
  let rejected = false;
  try {
    await reviewProescCycles({ rpc: (name) => {
      names.push(name); return Promise.resolve({ data: null, error: { code: '42501' } });
    } }, 'actor', enrollment, () => { throw new Error('Unexpected API call'); });
  } catch { rejected = true; }
  assert(rejected && names.join(',') === 'proesc_cycle_review_cache_service');
});

Deno.test('missing class is preserved by possible person without contaminating unrelated identities', async () => {
  const result = await cycleSourceObligations([page([
    row('100'), row('101', { turma_id: null, aluno_cpf: '98765432100' }),
    row('102', { turma_id: '9', aluno_cpf: null }),
  ])], ['2', '3']);
  assert(result.length === 3);
  const normal = result.find((item) => item.key === '100')!;
  const ambiguous = result.filter((item) => item.key === '101');
  assert(ambiguous.length === 2 && ambiguous.every((item) => item.unsafe
    && item.personHash !== normal.personHash && item.ambiguity === 'MISSING_CLASS_ID'));
  assert(!result.some((item) => item.key === '102'), 'Identified outside class must stay outside scope');
});

Deno.test('missing person blocks every possible class and conflicting people remain separate unsafe markers', async () => {
  const unknown = await cycleSourceObligations([page([row('100', { turma_id: null, aluno_cpf: null })])], ['2', '3']);
  assert(unknown.length === 2 && unknown.every((item) => item.personHash === null && item.unsafe));
  const conflicting = await cycleSourceObligations([page([
    row('100', { turma_id: '9' }), row('100', { aluno_cpf: '98765432100' }),
  ])], ['2', '3']);
  assert(conflicting.length === 2 && conflicting.every((item) => item.classId === '2' && item.unsafe));
  assert(new Set(conflicting.map((item) => item.personHash)).size === 2);
});

Deno.test('conflicting person in the same class keeps both possible owners blocked', async () => {
  const result = await cycleSourceObligations([page([
    row('100', { aluno_cpf: '98765432100' }), row('100', { id: '2' }),
  ])], ['2']);
  assert(result.length === 2 && result.every((item) => item.unsafe && item.classId === '2'));
  const knownTarget = (await cycleSourceObligations([page([row('101')])], ['2']))[0].personHash;
  assert(result.some((item) => item.personHash === knownTarget), 'Secondary owner must not disappear');
});

Deno.test('temporal evidence requires every group row anonymous, dated and free of renegotiation', async () => {
  const anonymous = (change = {}) => row('100', { turma_id: null, aluno_cpf: null, ...change });
  const normalized = async (rows: unknown[]) => (await cycleSourceObligations([page(rows)], ['2']))[0];
  assert((await normalized([anonymous()])).unidentifiedGroupLatestDate === '2026-01-15');
  const later = await normalized([anonymous(), anonymous({ id: '2', data_vencimento: '2026-09-15' })]);
  assert(later.unidentifiedGroupLatestDate === '2026-09-15', 'Secondary date cannot be hidden by the primary');
  const laterCreation = await normalized([anonymous(), anonymous({ id: '2', data_cricao: '2026-10-01' })]);
  assert(laterCreation.unidentifiedGroupLatestDate === '2026-10-01');
  for (const rows of [
    [anonymous(), row('100', { id: '2' })],
    [anonymous(), anonymous({ id: '2', turma_id: '2' })],
    [anonymous(), anonymous({ id: '2', aluno_cpf: '12345678901' })],
    [anonymous(), anonymous({ id: '2', data_cricao: null })],
    [anonymous({ pagamento_renegociacao: true })],
    [anonymous(), anonymous()],
  ]) assert(!(await normalized(rows)).unidentifiedGroupLatestDate,
    'Mixed identity, absent dates and conflicting principals must retain the full blocker');
});

import { parseProescV1Accounting, PROESC_V1_MAX_ROWS } from './v1-accounting.ts';
import { parseCycleSavedPages, projectCyclePage, type CycleEvidenceRow } from './cycle-page-evidence.ts';
import { cycleEvidenceObligations, cycleSourceObligations } from './cycle-schedule-source.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const raw = (change = {}) => ({ chave_id: '100', id: '1', valor: '279.90', unidade_id: '1', turma_id: '2',
  aluno_cpf: '12345678901', data_vencimento: '2026-01-15', data_cricao: '2026-01-01',
  registro_cancelado: false, pagamento_renegociacao: false, ...change });
const page = (data: unknown[], month = 1) => parseProescV1Accounting({ status: 'success', data }, { unitId: '1', year: 2026, month });
const context = { unitId: '1', tokenRevision: 'revision', firstYear: 2026, lastYear: 2026 };
const now = Date.now();
const observedAt = new Date(now - 1_000).toISOString();
const saved = (rows: unknown) => ({ year: 2026, month: 1, observedAt, hash: 'a'.repeat(64), rows });
const response = (pages: unknown[]) => ({ version: 1, unitId: '1', tokenRevision: 'revision', pages });
const rejected = (run: () => unknown) => { try { run(); } catch { return true; } return false; };

Deno.test('compact page roundtrip retains duplicates, cancelled principals and cross-page identity conflicts', async () => {
  const source = [page([raw({ registro_cancelado: true }), raw({ chave_id: '101', turma_id: null, aluno_cpf: null })]),
    page([raw(), raw({ id: '2', aluno_cpf: '98765432100' }), raw({ chave_id: '102', valor: '-1.00' })], 2)];
  const stored = await Promise.all(source.map(async (item) => ({ ...saved(await projectCyclePage(item)), month: item.source.month })));
  const loaded = parseCycleSavedPages(response(JSON.parse(JSON.stringify(stored))), context, now);
  assert(loaded.reduce((sum, item) => sum + item.rows.length, 0) === 5, 'Projection dropped or deduplicated a row');
  assert(!JSON.stringify(stored).includes('12345678901') && !JSON.stringify(stored).includes('98765432100'));
  assert(loaded[1].rows[2][2] === -100, 'Negative source amount was prematurely normalized');
  const obligations = cycleEvidenceObligations(loaded, ['2', '3']);
  assert(obligations.filter((item) => item.key === '100').length === 2);
  assert(obligations.every((item) => item.unsafe), 'Cross-page cancelled/mixed identity was lost');
  assert(obligations.filter((item) => item.key === '101').every((item) => item.personHash === null
    && item.ambiguity === 'MISSING_CLASS_ID' && item.unidentifiedGroupLatestDate === '2026-01-15'));
  assert(JSON.stringify(obligations) === JSON.stringify(await cycleSourceObligations(source, ['2', '3'])));
});

Deno.test('saved-page boundary rejects identity, window, hash, tuple and timestamp corruption', async () => {
  const rows = await projectCyclePage(page([raw()]));
  const valid = response([saved(rows)]);
  assert(parseCycleSavedPages(valid, context, now).length === 1);
  for (const invalid of [
    { ...valid, unitId: '2' }, { ...valid, tokenRevision: 'other' }, { ...valid, version: 2 },
    response([saved(rows), saved(rows)]), response([{ ...saved(rows), year: 2025 }]),
    response([{ ...saved(rows), month: 13 }]), response([{ ...saved(rows), hash: 'invalid' }]),
    response([{ ...saved(rows), observedAt: new Date(now + 5_001).toISOString() }]),
    response([{ ...saved(rows), observedAt: 'invalid' }]), response([saved([[...rows[0], 'raw personal data']])]),
    response([saved([[...rows[0].slice(0, 4), '12345678901', ...rows[0].slice(5)]])]),
    response([saved([[rows[0][0], rows[0][1], 0.5, ...rows[0].slice(3)]])]),
  ]) assert(rejected(() => parseCycleSavedPages(invalid, context, now)), 'Invalid saved evidence accepted');
  assert(parseCycleSavedPages(response([{ ...saved(rows), observedAt: new Date(now - 300_000).toISOString() }]),
    context, now).length === 0, 'Expired evidence must be collected again, never renewed');
});

Deno.test('page limits reject whole pages without truncating evidence', async () => {
  const row = (await projectCyclePage(page([raw()])))[0];
  assert(rejected(() => parseCycleSavedPages(response([saved(Array(PROESC_V1_MAX_ROWS).fill(row))]), context, now)));
  const long: CycleEvidenceRow = ['1'.repeat(80), true, 1, '2'.repeat(80), 'a'.repeat(64), '2026-01-01', null, false, false, false];
  assert(rejected(() => parseCycleSavedPages(response([saved(Array(10_000).fill(long))]), context, now)),
    'A page exceeding the byte quota cannot be silently shortened');
});

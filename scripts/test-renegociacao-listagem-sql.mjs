import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE_PATH) {
  throw new Error('Defina PGLITE_MODULE_PATH para @electric-sql/pglite/dist/index.js.');
}
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href);
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const { parseCandidatePageV2 } = await import(pathToFileURL(resolve(
  root, 'modules/gestor/financeiro/renegociacoes/renegociacoes.candidates.ts',
)).href);
const db = new PGlite();

try {
  await db.exec(read('supabase/tests/receivable_renegotiation_pglite_base.sql'));
  // Colunas reais de proveniência ausentes no harness inicial, não schema novo.
  await db.exec(`alter table public.contas_receber
    add column gateway_provider text,
    add column asaas_payment_id text,
    add column asaas_payment_link_id text;`);
  for (const migration of [
    '20261003040301_receivable_renegotiation_proposal_schema.sql',
    '20261003040303_receivable_renegotiation_proposal_reads.sql',
    '20261003040307_receivable_renegotiation_proposal_mutations.sql',
    '20261003040309_receivable_renegotiation_policy_helpers.sql',
    '20261003040312_receivable_renegotiation_eligibility.sql',
    '20261003040314_receivable_renegotiation_calculation_helpers.sql',
    '20261003040317_receivable_renegotiation_preview.sql',
    '20261003040319_receivable_renegotiation_candidate_rpcs.sql',
    '20261003040737_receivable_renegotiation_rls_guard.sql',
    '20261003044712_receivable_renegotiation_candidate_listing_v2.sql',
  ]) await db.exec(read(`supabase/migrations/${migration}`));

  const before = (await db.query(`select id, status, valor, valor_pago,
    data_pagamento, data_vencimento from public.contas_receber order by id`)).rows;
  const initial = (await db.query(`select
    public.list_receivable_renegotiation_candidate_groups_v2_secure(
      '00000000-0000-0000-0000-000000000010', null, 1, 20, null, null, null
    ) as page`)).rows[0].page;
  const parsed = parseCandidatePageV2(initial);
  assert.equal(parsed.totalStudents, 1);
  assert.equal(parsed.groups[0].openCount, 3);
  assert.equal(parsed.groups[0].principalCents, 60000);
  assert.equal(parsed.groups[0].grossDebtCents, null);
  await db.exec(read('supabase/tests/receivable_renegotiation_listing_v2_readonly.sql'));
  const started = performance.now();
  await db.exec(read('supabase/tests/receivable_renegotiation_listing_v2.transaction.sql'));
  const elapsed = Math.round(performance.now() - started);
  const after = (await db.query(`select id, status, valor, valor_pago,
    data_pagamento, data_vencimento from public.contas_receber order by id`)).rows;
  assert.deepEqual(after, before, 'O teste deve encerrar com rollback integral.');
  const state = (await db.query(`select
    (select count(*)::int from public.receivable_renegotiation_agreements) agreements,
    (select count(*)::int from public.receivable_renegotiation_source_items) sources,
    (select count(*)::int from public.receivable_renegotiation_events) events`)).rows[0];
  assert.deepEqual(state, { agreements: 0, sources: 0, events: 0 });
  console.log(JSON.stringify({
    status: 'PASS', fixtureStudents: 1000, fixtureReceivables: 12000,
    elapsedMs: elapsed, writesRolledBack: true, bankCalls: false,
    coverage: ['student-pagination', 'course-class-search-filters', 'scope',
      'no-list-eligibility-N+1', 'no-fake-eligibility', 'unchanged-detail-preview',
      'forbidden-anon', 'missing-identity', 'unsupported-source-excluded'],
  }, null, 2));
} finally {
  await db.close();
}

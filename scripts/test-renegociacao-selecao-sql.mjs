import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE_PATH) throw new Error('Defina PGLITE_MODULE_PATH.');
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href);
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const { parseSelectionSummary } = await import(pathToFileURL(resolve(root,
  'modules/gestor/financeiro/renegociacoes/renegociacoes.selection-summary.ts')).href);
const db = new PGlite();
try {
  await db.exec(read('supabase/tests/receivable_renegotiation_pglite_base.sql'));
  await db.exec(`alter table public.contas_receber
    add column gateway_financial_terms jsonb,
    add column gateway_financial_terms_confirmed_at timestamptz,
    add column gateway_provider text,
    add column gateway_payment_method text,
    add column gateway_boleto_nosso_numero text,
    add column gateway_last_error text;`);
  for (const migration of [
    '20260912221000_banese_verified_banking_grace.sql',
    '20261003040301_receivable_renegotiation_proposal_schema.sql',
    '20261003040303_receivable_renegotiation_proposal_reads.sql',
    '20261003040307_receivable_renegotiation_proposal_mutations.sql',
    '20261003040309_receivable_renegotiation_policy_helpers.sql',
    '20261003040312_receivable_renegotiation_eligibility.sql',
    '20261003040314_receivable_renegotiation_calculation_helpers.sql',
    '20261003040317_receivable_renegotiation_preview.sql',
    '20261003040319_receivable_renegotiation_candidate_rpcs.sql',
    '20261003040737_receivable_renegotiation_rls_guard.sql',
  ]) await db.exec(read(`supabase/migrations/${migration}`));
  const contract = async () => (await db.query(`select proname, prosrc from pg_proc
    where pronamespace = 'internal_finance'::regnamespace and proname in (
      'receivable_renegotiation_source_item', 'build_receivable_renegotiation_snapshot'
    ) order by proname`)).rows;
  const previous = await contract();
  await db.exec(read('supabase/migrations/20261003053418_receivable_renegotiation_selection_summary.sql'));
  assert.deepEqual(await contract(), previous, 'Prévia/source_item não podem mudar.');
  const balances = async () => (await db.query(`select id, status, valor, valor_pago,
    data_vencimento, data_pagamento from public.contas_receber order by id`)).rows;
  const before = await balances();
  const initial = (await db.query(`select
    public.summarize_receivable_renegotiation_selection_secure(
      array['00000000-0000-0000-0000-000000000401'::uuid,
        '00000000-0000-0000-0000-000000000403'::uuid], null
    ) as summary`)).rows[0].summary;
  const parsed = parseSelectionSummary(initial, {
    poloId: '00000000-0000-0000-0000-000000000010',
    alunoId: '00000000-0000-0000-0000-000000000100',
    matriculaId: '00000000-0000-0000-0000-000000000300',
    turmaId: '00000000-0000-0000-0000-000000000200',
  }, ['00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000403']);
  assert.equal(parsed.count, 2);
  assert.equal(parsed.totals.principalCents, 40000);
  assert.equal(parsed.totals.grossDebtCents, 41100);
  assert.equal(parsed.discount.appliedToProposal, false);
  await db.exec(read('supabase/tests/receivable_renegotiation_selection_summary_readonly.sql'));
  await db.exec(read('supabase/tests/receivable_renegotiation_selection_summary.transaction.sql'));
  assert.deepEqual(await balances(), before);
  console.log(JSON.stringify({ status: 'PASS', originalRulesUnchanged: true,
    mutations: false, bankCalls: false,
    coverage: ['selection-scope', 'duplicates', 'empty-max-selection', 'partial-excluded',
      'local-future-overdue-disabled-discount', 'banese-confirmed-percentage',
      'banese-missing-terms', 'removed-discount', '2026-banking-grace',
      'unsupported-calendar', 'discount-and-payable-separated', 'anonymous-denied'],
  }, null, 2));
} finally {
  await db.close();
}

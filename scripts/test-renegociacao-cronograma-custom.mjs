import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE_PATH) throw new Error('Defina PGLITE_MODULE_PATH.');
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href);
const db = new PGlite();
const candidateRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const sourceRoot = resolve(process.env.RENEGOCIACAO_SOURCE_ROOT || candidateRoot);
const read = (path) => {
  const candidate = resolve(candidateRoot, path);
  return readFileSync(existsSync(candidate) ? candidate : resolve(sourceRoot, path), 'utf8');
};
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const expectCode = async (operation, code) => {
  await assert.rejects(operation, (error) => error.code === code,
    `A operação deveria falhar com SQLSTATE ${code}.`);
};
const ids = [
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402',
];
const migrations = [
  '20261003040301_receivable_renegotiation_proposal_schema',
  '20261003040303_receivable_renegotiation_proposal_reads',
  '20261003040307_receivable_renegotiation_proposal_mutations',
  '20261003040309_receivable_renegotiation_policy_helpers',
  '20261003040312_receivable_renegotiation_eligibility',
  '20261003040314_receivable_renegotiation_calculation_helpers',
  '20261003040317_receivable_renegotiation_preview',
  '20261003040319_receivable_renegotiation_candidate_rpcs',
  '20261003040737_receivable_renegotiation_rls_guard',
  '20261003153539_receivable_renegotiation_schedule_v2',
  '20261003153612_receivable_renegotiation_terms_v2',
];

try {
  await db.exec(read('supabase/tests/receivable_renegotiation_pglite_base.sql'));
  for (const name of migrations) await db.exec(read(`supabase/migrations/${name}.sql`));
  const today = (await one("select (now() at time zone 'America/Maceio')::date::text today")).today;
  const dates = await one(`select
    ($1::date + 10)::text first_due,
    ($1::date + 27)::text second_due,
    ($1::date + 49)::text third_due,
    ($1::date - 1)::text yesterday`, [today]);
  const preview = async (terms = {}, overrides = {}) => (await one(
    'select public.preview_receivable_renegotiation_secure($1,$2,$3) result',
    [ids, terms, overrides],
  )).result;
  const baselineBefore = await preview({ installmentCount: 3, firstDueDate: dates.first_due });
  const appliedV2Hashes = await one(`select
    md5(pg_get_functiondef('internal_finance.build_receivable_renegotiation_schedule_v2(bigint,bigint,integer,date,date,text,integer)'::regprocedure)) schedule,
    md5(pg_get_functiondef('internal_finance.receivable_renegotiation_bank_schedule(jsonb,jsonb)'::regprocedure)) bank,
    md5(pg_get_functiondef('internal_finance.build_receivable_renegotiation_snapshot(uuid[],jsonb,jsonb,date)'::regprocedure)) snapshot`);
  assert.deepEqual(appliedV2Hashes, {
    schedule: '2c3ffa786b7e80a7c5a9de5667601908',
    bank: '9d29d675323fce4eafce7d4836782ec6',
    snapshot: '557da4c42e383e3b616e79f4d16df905',
  }, 'As migrations v2 locais devem reproduzir exatamente as funções aplicadas.');
  const builderOidBefore = (await one(`select oid::text value from pg_proc
    where oid = 'internal_finance.build_receivable_renegotiation_snapshot(uuid[],jsonb,jsonb,date)'::regprocedure`)).value;
  const originalProjection = baselineBefore.schedule.entries
    .filter((entry) => entry.kind === 'INSTALLMENT')
    .map(({ sequence, dueDate, amountCents }) => ({ sequence, dueDate, amountCents }));
  await expectCode(() => preview({ ...baselineBefore.terms, scheduleEntries: originalProjection }), '22023');

  await db.exec(read('supabase/migrations/20261003190000_receivable_renegotiation_custom_schedule_helper.sql'));
  await db.exec(read('supabase/migrations/20261003190001_receivable_renegotiation_custom_schedule_snapshot.sql'));
  const builderOidAfter = (await one(`select oid::text value from pg_proc
    where oid = 'internal_finance.build_receivable_renegotiation_snapshot(uuid[],jsonb,jsonb,date)'::regprocedure`)).value;
  assert.equal(builderOidAfter, builderOidBefore, 'CREATE OR REPLACE deve preservar o OID canônico.');
  const helperPrivileges = await one(`select
    has_function_privilege('authenticated',
      'internal_finance.apply_receivable_renegotiation_custom_schedule(jsonb,jsonb,boolean)', 'EXECUTE') authenticated,
    has_function_privilege('service_role',
      'internal_finance.apply_receivable_renegotiation_custom_schedule(jsonb,jsonb,boolean)', 'EXECUTE') service_role`);
  assert.deepEqual(helperPrivileges, { authenticated: false, service_role: false });

  const baselineAfter = await preview({ installmentCount: 3, firstDueDate: dates.first_due });
  assert.deepEqual(baselineAfter, baselineBefore,
    'A extensão não pode alterar a prévia v2 quando não há cronograma customizado.');

  const target = baselineAfter.totals.grossDebtCents - 1000;
  const regularTerms = {
    targetNegotiatedCents: target,
    downPaymentCents: 5000,
    installmentCount: 3,
    firstDueDate: dates.first_due,
    cadence: 'MONTHLY',
  };
  const regular = await preview(regularTerms);
  const regularProjection = regular.schedule.entries
    .filter((entry) => entry.kind === 'INSTALLMENT')
    .map(({ sequence, dueDate, amountCents }) => ({ sequence, dueDate, amountCents }));
  const noOp = await preview({ ...regularTerms, scheduleEntries: regularProjection });
  assert.equal(noOp.version, 2);
  assert.equal(noOp.proposalFingerprint, regular.proposalFingerprint);
  assert.equal(noOp.terms.scheduleEntries, undefined);
  assert.equal(noOp.approvalReasons.includes('CUSTOM_SCHEDULE'), false);
  const shiftedDates = await one(`with base as (select ($1::date + 12) due)
    select public.data_vencimento_mensal(due, extract(day from due)::integer, 0)::text d1,
      public.data_vencimento_mensal(due, extract(day from due)::integer, 1)::text d2,
      public.data_vencimento_mensal(due, extract(day from due)::integer, 2)::text d3
    from base`, [today]);
  const shiftedRows = regularProjection.map((entry, index) => ({ ...entry,
    dueDate: [shiftedDates.d1, shiftedDates.d2, shiftedDates.d3][index],
  }));
  const shifted = await preview({ ...regularTerms, scheduleEntries: shiftedRows });
  assert.equal(shifted.version, 3);
  const shiftedRoundTrip = await preview(shifted.terms);
  assert.equal(shiftedRoundTrip.version, 3,
    'Cadência CUSTOM canônica deve preservar a intenção mesmo quando as datas formam série mensal.');
  assert.equal(shiftedRoundTrip.proposalFingerprint, shifted.proposalFingerprint);

  const customRows = [
    { sequence: 1, dueDate: dates.first_due, amountCents: regularProjection[0].amountCents - 100 },
    { sequence: 2, dueDate: dates.second_due, amountCents: regularProjection[1].amountCents + 40 },
    { sequence: 3, dueDate: dates.third_due, amountCents: regularProjection[2].amountCents + 60 },
  ];
  const customInputOrder = [customRows[2], customRows[0], customRows[1]];
  const custom = await preview({ ...regularTerms, scheduleEntries: customInputOrder });
  assert.equal(custom.version, 3);
  assert.equal(custom.schedule.cadence, 'CUSTOM');
  assert.equal(custom.schedule.intervalDays, null);
  assert.equal(custom.schedule.firstDueDate, dates.first_due);
  assert.deepEqual(custom.terms.scheduleEntries, customRows);
  assert.equal(custom.terms.cadence, 'CUSTOM');
  assert.equal(custom.terms.intervalDays, undefined);
  assert.equal(custom.terms.firstDueDate, dates.first_due);
  assert.equal(custom.requiresApproval, true);
  assert.ok(custom.approvalReasons.includes('CUSTOM_SCHEDULE'));
  assert.equal(custom.totals.commercialDiscountCents, 1000);
  assert.equal(custom.totals.downPaymentCents, 5000);
  assert.equal(custom.totals.financedCents,
    customRows.reduce((sum, entry) => sum + entry.amountCents, 0));
  assert.equal(custom.schedule.entries.reduce((sum, entry) => sum + entry.amountCents, 0), target);
  assert.notEqual(custom.calculationFingerprint, regular.calculationFingerprint);
  assert.notEqual(custom.proposalFingerprint, regular.proposalFingerprint);
  assert.deepEqual(custom.schedule.entries[0], {
    sequence: 0,
    kind: 'DOWN_PAYMENT',
    dueDate: today,
    amountCents: 5000,
    financialTerms: custom.schedule.entries[0].financialTerms,
  });
  for (const [index, entry] of custom.schedule.entries.slice(1).entries()) {
    assert.equal(entry.sequence, index + 1);
    assert.equal(entry.kind, 'INSTALLMENT');
    assert.equal(entry.amountCents, customRows[index].amountCents);
    assert.equal(entry.dueDate, customRows[index].dueDate);
    assert.equal(entry.financialTerms.nominalAmount, entry.amountCents / 100);
    assert.equal(entry.financialTerms.dueDate, entry.dueDate);
  }
  const canonicalReplayPreview = await preview(custom.terms);
  assert.equal(canonicalReplayPreview.proposalFingerprint, custom.proposalFingerprint);
  assert.deepEqual(canonicalReplayPreview.schedule, custom.schedule);
  const scheduleAuthoritative = await preview({ ...regularTerms, firstDueDate: today,
    scheduleEntries: customRows });
  assert.equal(scheduleAuthoritative.proposalFingerprint, custom.proposalFingerprint);
  assert.equal(scheduleAuthoritative.terms.firstDueDate, dates.first_due);

  const badSchedules = [
    customRows.slice(0, 2),
    customRows.map((entry, index) => index === 0 ? { ...entry, amountCents: entry.amountCents + 1 } : entry),
    customRows.map((entry, index) => index === 0 ? { ...entry, amountCents: 0 } : entry),
    customRows.map((entry, index) => index === 1 ? { ...entry, sequence: 1 } : entry),
    customRows.map((entry, index) => index === 0 ? { ...entry, dueDate: dates.yesterday } : entry),
    customRows.map((entry, index) => index === 1 ? { ...entry, dueDate: dates.first_due } : entry),
    customRows.map((entry, index) => index === 1 ? { ...entry, dueDate: '2026-02-30' } : entry),
    customRows.map((entry, index) => index === 0 ? { ...entry, kind: 'INSTALLMENT' } : entry),
  ];
  for (const scheduleEntries of badSchedules) {
    await expectCode(() => preview({ ...regularTerms, scheduleEntries }), '22023');
  }
  for (const scheduleEntries of [null, {}, 'invalid']) {
    await expectCode(() => preview({ ...regularTerms, scheduleEntries }), '22023');
  }
  await expectCode(() => preview({ ...regularTerms, cadence: 'CUSTOM' }), '22023');
  await expectCode(() => preview({ ...regularTerms, cadence: 'CUSTOM', intervalDays: 15,
    scheduleEntries: customRows }), '22023');

  const sourceBefore = (await db.query('select * from public.contas_receber order by id')).rows;
  const save = async (requestId, terms, fingerprint, reason = 'Cronograma ajustado com o aluno.') =>
    (await one(`select public.save_receivable_renegotiation_proposal_secure(
      $1,$2,$3,$4,'{}'::jsonb,null,true,$5
    ) result`, [requestId, ids, fingerprint, terms, reason])).result;
  const mutationCounts = async () => one(`select
    (select count(*)::integer from public.receivable_renegotiation_agreements) agreements,
    (select count(*)::integer from public.receivable_renegotiation_requests) requests,
    (select count(*)::integer from public.receivable_renegotiation_events) events`);
  const emptyCounts = await mutationCounts();
  await db.exec('set role anon');
  try {
    await expectCode(() => save('00000000-0000-0000-0000-000000000801', custom.terms,
      custom.proposalFingerprint), '42501');
  } finally {
    await db.exec('reset role');
  }
  const restoreFinanceScope = `create or replace function public.gestor_has_any_module_for_polo(
    p_modules text[], p_polo_id uuid
  ) returns boolean language sql stable as $function$
    select p_polo_id = '00000000-0000-0000-0000-000000000010'::uuid
      and 'financeiro' = any(p_modules);
  $function$;`;
  await db.exec(`create or replace function public.gestor_has_any_module_for_polo(
    p_modules text[], p_polo_id uuid
  ) returns boolean language sql stable as $function$ select false; $function$;`);
  try {
    await expectCode(() => save('00000000-0000-0000-0000-000000000802', custom.terms,
      custom.proposalFingerprint), '42501');
  } finally {
    await db.exec(restoreFinanceScope);
  }
  await db.exec(`create or replace function public.gestor_has_any_module_for_polo(
    p_modules text[], p_polo_id uuid
  ) returns boolean language sql stable as $function$
    select p_polo_id = '00000000-0000-0000-0000-000000000011'::uuid
      and 'financeiro' = any(p_modules);
  $function$;`);
  try {
    await expectCode(() => save('00000000-0000-0000-0000-000000000803', custom.terms,
      custom.proposalFingerprint), '42501');
  } finally {
    await db.exec(restoreFinanceScope);
  }
  assert.deepEqual(await mutationCounts(), emptyCounts,
    'Negativas de autorização não podem criar proposta, request ou evento.');
  await expectCode(() => save('00000000-0000-0000-0000-000000000810', custom.terms,
    regular.proposalFingerprint), '40001');
  await expectCode(() => save('00000000-0000-0000-0000-000000000811', custom.terms,
    custom.proposalFingerprint, null), '22023');
  const changedRows = customRows.map((entry, index) => index === 0
    ? { ...entry, amountCents: entry.amountCents - 1 }
    : index === 1 ? { ...entry, amountCents: entry.amountCents + 1 } : entry);
  const changed = await preview({ ...regularTerms, scheduleEntries: changedRows });
  const requestId = '00000000-0000-0000-0000-000000000812';
  const saved = await save(requestId, custom.terms, custom.proposalFingerprint);
  assert.equal(saved.replayed, false);
  assert.equal(saved.proposal.installmentCount, 3);
  assert.equal(saved.proposal.firstDueDate, dates.first_due);
  const replay = await save(requestId, custom.terms, custom.proposalFingerprint);
  assert.equal(replay.replayed, true);
  await expectCode(() => save(requestId, changed.terms, changed.proposalFingerprint), '22023');

  const detail = (await one(
    'select public.get_receivable_renegotiation_proposal_secure($1) result',
    [saved.proposal.id],
  )).result;
  assert.equal(detail.canonicalSnapshot.version, 3);
  assert.deepEqual(detail.canonicalSnapshot.terms.scheduleEntries, customRows);
  assert.deepEqual(detail.canonicalSnapshot.schedule, custom.schedule);
  assert.equal(detail.canonicalSnapshot.totals.commercialDiscountCents, 1000);
  assert.ok(detail.canonicalSnapshot.approvalReasons.includes('CUSTOM_SCHEDULE'));
  assert.deepEqual((await db.query('select * from public.contas_receber order by id')).rows, sourceBefore);
  console.log('Renegociação cronograma customizado: matriz canônica, CAS e replay aprovados.');
} finally {
  await db.close();
}

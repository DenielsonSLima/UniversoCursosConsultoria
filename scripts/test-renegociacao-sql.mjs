import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
if (!modulePath) {
  throw new Error('Defina PGLITE_MODULE_PATH para o dist/index.js de @electric-sql/pglite.');
}
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const db = new PGlite();
const realRules = process.env.RENEGOTIATION_RULES_MODE === 'real';
const uiModel = realRules ? await import(pathToFileURL(resolve(
  root, 'modules/gestor/financeiro/renegociacoes/renegociacoes.model.ts',
)).href) : null;

const idsSql = `array[
  '00000000-0000-0000-0000-000000000401'::uuid,
  '00000000-0000-0000-0000-000000000402'::uuid
]`;
const termsSql = `jsonb_build_object(
  'commercialDiscountCents', 1000,
  'downPaymentCents', 5000,
  'installmentCount', 2,
  'firstDueDate', (now() at time zone 'America/Maceio')::date + 30
)`;
const overridesSql = `'{
  "monthlyInterestBasisPoints":150,
  "waivedInterestCents":0
}'::jsonb`;

const one = async (sql) => (await db.query(sql)).rows[0];
const expectSqlState = async (promise, code) => {
  let caught;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Era esperado erro SQLSTATE ${code}.`);
  assert.equal(caught.code, code, caught.message);
};

try {
  await db.exec(read('supabase/tests/receivable_renegotiation_pglite_base.sql'));
  for (const migration of [
    '20261003040301_receivable_renegotiation_proposal_schema.sql',
    '20261003040303_receivable_renegotiation_proposal_reads.sql',
    '20261003040307_receivable_renegotiation_proposal_mutations.sql',
  ]) {
    await db.exec(read(`supabase/migrations/${migration}`));
  }

  const partial = (await one(
    `select public.get_receivable_renegotiation_readiness_secure(null) readiness`,
  )).readiness;
  assert.equal(partial.applied, true);
  assert.equal(partial.rulesReady, false);
  assert.equal(partial.capabilities.saveProposal, false);
  assert.equal(partial.capabilities.discardProposal, true);
  assert.equal(partial.capabilities.activateProposal, false);
  if (uiModel) assert.equal(uiModel.parseReadiness(partial).rulesReady, false);
  await expectSqlState(one(`
    select public.list_receivable_renegotiation_proposals_secure(
      '00000000-0000-0000-0000-000000000099'::uuid, null, null, 1, 20
    ) page
  `), '42501');

  if (realRules) {
    for (const migration of [
      '20261003040309_receivable_renegotiation_policy_helpers.sql',
      '20261003040312_receivable_renegotiation_eligibility.sql',
      '20261003040314_receivable_renegotiation_calculation_helpers.sql',
      '20261003040317_receivable_renegotiation_preview.sql',
      '20261003040319_receivable_renegotiation_candidate_rpcs.sql',
    ]) {
      await db.exec(read(`supabase/migrations/${migration}`));
    }
    await db.exec(read('supabase/tests/receivable_renegotiation_rules.transaction.sql'));
  } else {
    await db.exec(read('supabase/tests/receivable_renegotiation_pglite_rules.sql'));
  }
  await db.exec(read(
    'supabase/migrations/20261003040737_receivable_renegotiation_rls_guard.sql',
  ));
  const ready = (await one(
    `select public.get_receivable_renegotiation_readiness_secure(null) readiness`,
  )).readiness;
  assert.equal(ready.buildReady, true);
  assert.equal(ready.rulesReady, realRules);
  assert.equal(ready.capabilities.previewProposal, realRules);
  assert.equal(ready.capabilities.saveProposal, realRules);
  assert.equal(ready.capabilities.cancelSourceTitles, false);
  if (uiModel) assert.equal(uiModel.parseReadiness(ready).rulesReady, true);

  if (realRules) {
    const groups = (await one(`
      select public.list_receivable_renegotiation_candidate_groups_secure(
        '00000000-0000-0000-0000-000000000010'::uuid, null, 1, 20, null
      ) groups
    `)).groups;
    assert.equal(groups.totalGroups, 1);
    assert.equal(groups.groups[0].eligibleCount, 3);
    assert.equal(groups.groups[0].blockedCount, 1);
    assert.equal(uiModel.parseCandidatePage(groups).groups[0].blockedCount, 1);
    const items = (await one(`
      select public.list_receivable_renegotiation_candidate_items_secure(
        '00000000-0000-0000-0000-000000000300'::uuid, null
      ) items
    `)).items;
    assert.equal(items.items.length, 4);
    assert.equal(items.items.filter((item) => item.eligibility.eligible).length, 3);
    assert.equal(uiModel.parseCandidateItems(items).items.length, 4);

    const eligibility = async (id = '00000000-0000-0000-0000-000000000401') => (
      await one(`select internal_finance.receivable_renegotiation_eligibility(
        '${id}'::uuid, (now() at time zone 'America/Maceio')::date
      ) eligibility`)
    ).eligibility;
    await db.exec(`begin; update public.contas_receber set valor_pago = 1
      where id = '00000000-0000-0000-0000-000000000401'::uuid`);
    assert.equal((await eligibility()).code, 'PARTIAL_PAYMENT');
    await db.exec('rollback');
    await db.exec(`begin; insert into internal_proesc.obligation_links(receivable_id)
      values ('00000000-0000-0000-0000-000000000401'::uuid)`);
    assert.equal((await eligibility()).code, 'PROESC_MANAGED');
    await db.exec('rollback');
    await db.exec(`begin; update public.contas_receber
      set gateway_submission_status = 'TEST_CONFLICT'
      where id = '00000000-0000-0000-0000-000000000401'::uuid`);
    assert.equal((await eligibility()).code, 'CONFLICTING_SOURCE');
    await db.exec('rollback');
    await db.exec(`begin; update public.contas_receber
      set regra_financeira_tecnica_snapshot = null
      where id = '00000000-0000-0000-0000-000000000401'::uuid`);
    assert.equal((await eligibility()).code, 'UNKNOWN_POLICY');
    await db.exec('rollback');

    const noncontiguous = (await one(`
      select public.preview_receivable_renegotiation_secure(
        array[
          '00000000-0000-0000-0000-000000000403'::uuid,
          '00000000-0000-0000-0000-000000000401'::uuid
        ], ${termsSql}, ${overridesSql}, null
      ) preview
    `)).preview;
    assert.deepEqual(noncontiguous.selection.receivableIds, [
      '00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000403',
    ]);
    assert.deepEqual(noncontiguous.sourceItems.map((item) => item.position), [1, 2]);
    const future = noncontiguous.sourceItems.find(
      (item) => item.receivableId === '00000000-0000-0000-0000-000000000403',
    );
    assert.equal(future.interestCents, 0);
    assert.equal(future.penaltyCents, 0);
  }

  const before = (await db.query(`
    select id::text, status, valor::text, valor_pago::text,
      data_vencimento::text, data_pagamento::text
    from public.contas_receber order by id
  `)).rows;
  const previewFunction = realRules
    ? 'public.preview_receivable_renegotiation_secure'
    : 'internal_finance.build_receivable_renegotiation_snapshot';
  const preview = (await one(`
    select ${previewFunction}(
      ${idsSql}, ${termsSql}, ${overridesSql},
      (now() at time zone 'America/Maceio')::date
    ) snapshot
  `)).snapshot;
  assert.match(preview.proposalFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(preview.sourceItems.length, 2);
  if (uiModel) assert.equal(uiModel.parsePreview(preview).sourceItems.length, 2);

  const saveSql = (requestId, reason = 'Teste sintetico', submit = true) => `
    select public.save_receivable_renegotiation_proposal_secure(
      '${requestId}'::uuid,
      ${idsSql},
      '${preview.proposalFingerprint}',
      ${termsSql},
      ${overridesSql},
      (now() at time zone 'America/Maceio')::date,
      ${submit ? 'true' : 'false'},
      ${reason === null ? 'null' : `'${reason}'`}
    ) result
  `;
  if (realRules) {
    await db.exec(`begin; update public.contas_receber set
      valor = 101,
      regra_financeira_tecnica_snapshot = jsonb_set(
        regra_financeira_tecnica_snapshot, '{valorBase}', '"101.00"'::jsonb
      ),
      updated_at = updated_at + interval '1 second'
      where id = '00000000-0000-0000-0000-000000000401'::uuid`);
    await expectSqlState(one(saveSql(
      '00000000-0000-0000-0000-000000000706', 'Preview antigo',
    )), '40001');
    await db.exec('rollback');
  }
  await expectSqlState(one(saveSql(
    '00000000-0000-0000-0000-000000000700', null,
  )), '22023');
  const saveRequest = '00000000-0000-0000-0000-000000000701';
  const saved = (await one(saveSql(saveRequest))).result;
  assert.equal(saved.replayed, false);
  assert.equal(saved.proposal.lifecycleStatus, 'PROPOSED');
  assert.equal(saved.proposal.sourceCount, 2);
  assert.equal(saved.proposal.sourceOpenCents, 30000);
  assert.equal(saved.proposal.negotiatedCents, preview.totals.negotiatedCents);
  if (uiModel) assert.equal(uiModel.parseMutationResult(saved).proposal.sourceCount, 2);
  if (realRules) {
    const linkedEligibility = (await one(`
      select internal_finance.receivable_renegotiation_eligibility(
        '00000000-0000-0000-0000-000000000401'::uuid,
        (now() at time zone 'America/Maceio')::date
      ) eligibility
    `)).eligibility;
    assert.equal(linkedEligibility.code, 'CONFLICTING_RENEGOTIATION');
  }

  const counts = await one(`select
    (select count(*)::int from public.receivable_renegotiation_agreements) agreements,
    (select count(*)::int from public.receivable_renegotiation_source_items) sources,
    (select count(*)::int from public.receivable_renegotiation_events) events,
    (select count(*)::int from public.receivable_renegotiation_requests) requests`);
  assert.deepEqual(counts, { agreements: 1, sources: 2, events: 1, requests: 1 });
  const afterSave = (await db.query(`
    select id::text, status, valor::text, valor_pago::text,
      data_vencimento::text, data_pagamento::text
    from public.contas_receber order by id
  `)).rows;
  assert.deepEqual(afterSave, before, 'Salvar proposta não pode alterar títulos de origem.');

  await db.exec(`begin; create or replace function public.is_gestor()
    returns boolean language sql stable as $function$ select false; $function$`);
  await expectSqlState(one(saveSql(saveRequest)), '42501');
  await db.exec('rollback');
  const replayedSave = (await one(saveSql(saveRequest))).result;
  assert.equal(replayedSave.replayed, true);
  // Desloca somente o relógio da RPC no banco descartável. O payload e os
  // registros persistidos ficam intactos: simula retry após a virada do dia.
  await db.exec('begin');
  const saveDefinition = (await one(`select pg_get_functiondef(
    'public.save_receivable_renegotiation_proposal_secure(uuid,uuid[],text,jsonb,jsonb,date,boolean,text)'::regprocedure
  ) definition`)).definition;
  const shiftedDefinition = saveDefinition.replace(
    "v_today date := (now() at time zone 'America/Maceio')::date;",
    "v_today date := (now() at time zone 'America/Maceio')::date + 1;",
  );
  assert.notEqual(shiftedDefinition, saveDefinition, 'O relógio da RPC deve ser deslocado.');
  await db.exec(shiftedDefinition);
  assert.equal((await one(saveSql(saveRequest))).result.replayed, true);
  await expectSqlState(one(saveSql(
    '00000000-0000-0000-0000-000000000708',
  )), '22023');
  await db.exec('rollback');
  assert.equal((await one(`select count(*)::int count
    from public.receivable_renegotiation_agreements`)).count, 1);
  await expectSqlState(one(saveSql(saveRequest, 'Payload diferente')), '22023');
  await expectSqlState(
    one(saveSql('00000000-0000-0000-0000-000000000702')),
    '23514',
  );

  const agreementId = saved.proposal.id;
  const detail = (await one(`
    select public.get_receivable_renegotiation_proposal_secure(
      '${agreementId}'::uuid
    ) detail
  `)).detail;
  assert.equal(detail.sourceItems.length, 2);
  assert.equal(detail.events.length, 1);
  assert.equal(detail.terms.installmentCount, 2);
  assert.equal(detail.policyOverrides.monthlyInterestBasisPoints, 150);
  assert.equal(detail.schedule.entries.length, preview.schedule.entries.length);
  assert.equal(detail.fingerprints.proposal, preview.proposalFingerprint);
  assert.equal(detail.capabilities.canActivate, false);
  if (uiModel) assert.equal(uiModel.parseProposalDetail(detail).sourceItems.length, 2);

  await db.exec(`begin; create or replace function public.gestor_has_any_module_for_polo(
    p_modules text[], p_polo_id uuid
  ) returns boolean language sql stable as $function$ select false; $function$`);
  await expectSqlState(one(`
    select public.get_receivable_renegotiation_proposal_secure(
      '${agreementId}'::uuid
    ) detail
  `), '42501');
  await db.exec('rollback');
  await db.exec(`begin; create or replace function public.gestor_has_any_module_for_polo(
    p_modules text[], p_polo_id uuid
  ) returns boolean language sql stable as $function$ select false; $function$`);
  await expectSqlState(one(`
    select public.discard_receivable_renegotiation_proposal_secure(
      '00000000-0000-0000-0000-000000000707'::uuid,
      '${agreementId}'::uuid, 1, '${preview.proposalFingerprint}', 'fora do escopo'
    ) result
  `), '42501');
  await db.exec('rollback');

  const page = (await one(`
    select public.list_receivable_renegotiation_proposals_secure(
      '00000000-0000-0000-0000-000000000010'::uuid,
      'Aluno Sintetico', 'PROPOSED', 1, 20
    ) page
  `)).page;
  assert.equal(page.totalItems, 1);
  assert.equal(page.rows[0].id, agreementId);
  if (uiModel) assert.equal(uiModel.parseProposalPage(page).rows[0].id, agreementId);

  await expectSqlState(one(`
    select public.discard_receivable_renegotiation_proposal_secure(
      '00000000-0000-0000-0000-000000000703'::uuid,
      '${agreementId}'::uuid, 999, '${preview.proposalFingerprint}', 'stale'
    ) result
  `), '40001');
  const discardSql = `
    select public.discard_receivable_renegotiation_proposal_secure(
      '00000000-0000-0000-0000-000000000704'::uuid,
      '${agreementId}'::uuid, 1, '${preview.proposalFingerprint}',
      'Proposta substituida'
    ) result
  `;
  const discarded = (await one(discardSql)).result;
  assert.equal(discarded.replayed, false);
  assert.equal(discarded.proposal.lifecycleStatus, 'CANCELED');
  assert.equal(discarded.proposal.version, 2);
  assert.equal((await one(`select count(*)::int count
    from public.receivable_renegotiation_source_items
    where agreement_id = '${agreementId}'::uuid and released_at is not null`)).count, 2);
  assert.equal((await one(discardSql)).result.replayed, true);

  const afterDiscard = (await db.query(`
    select id::text, status, valor::text, valor_pago::text,
      data_vencimento::text, data_pagamento::text
    from public.contas_receber order by id
  `)).rows;
  assert.deepEqual(afterDiscard, before, 'Descartar proposta não pode alterar títulos de origem.');

  const previewAfterRelease = (await one(`
    select internal_finance.build_receivable_renegotiation_snapshot(
      ${idsSql}, ${termsSql}, ${overridesSql},
      (now() at time zone 'America/Maceio')::date
    ) snapshot
  `)).snapshot;
  assert.equal(previewAfterRelease.proposalFingerprint, preview.proposalFingerprint);
  const drafted = (await one(
    saveSql('00000000-0000-0000-0000-000000000705', null, false),
  )).result;
  assert.equal(drafted.proposal.lifecycleStatus, 'DRAFT');

  await db.exec('set role authenticated');
  const publicReadiness = (await one(`select
    public.get_receivable_renegotiation_readiness_secure(
      '00000000-0000-0000-0000-000000000010'::uuid
    ) readiness`)).readiness;
  assert.equal(publicReadiness.applied, true);
  assert.equal((await one(`select has_function_privilege('authenticated',
    'public.gestor_has_effective_financeiro_tab(text)', 'EXECUTE') allowed`)).allowed, false);
  assert.equal((await one(`select public.can_read_receivable_renegotiation_for_polo(
    '00000000-0000-0000-0000-000000000099'::uuid) allowed`)).allowed, false);
  assert.equal((await one(`select public.can_read_receivable_renegotiation_for_polo(
    null) allowed`)).allowed, false);
  assert.equal((await one(`select count(*)::int count
    from public.receivable_renegotiation_agreements`)).count, 2);
  await expectSqlState(db.exec(`update public.receivable_renegotiation_agreements
    set reason = reason`), '42501');
  await expectSqlState(db.query(`select count(*)
    from public.receivable_renegotiation_requests`), '42501');
  await db.exec('reset role');

  await db.exec(`begin; create or replace function public.gestor_has_any_module_for_polo(
    p_modules text[], p_polo_id uuid
  ) returns boolean language sql stable as $function$ select false; $function$;
  set local role authenticated`);
  for (const table of ['agreements', 'source_items', 'events']) {
    assert.equal((await one(`select count(*)::int count
      from public.receivable_renegotiation_${table}`)).count, 0);
  }
  await db.exec('rollback');

  for (const signature of ['public.is_gestor()', 'public.gestor_has_effective_financeiro_tab(p_tab text)']) {
    await db.exec(`begin; create or replace function ${signature}
      returns boolean language sql stable as $function$ select false; $function$;
      set local role authenticated`);
    assert.equal((await one(`select count(*)::int count
      from public.receivable_renegotiation_agreements`)).count, 0);
    await db.exec('rollback');
  }

  await db.exec('set role anon');
  await expectSqlState(one(`select
    public.get_receivable_renegotiation_readiness_secure(null)`), '42501');
  await expectSqlState(db.query(`select count(*)
    from public.receivable_renegotiation_agreements`), '42501');
  await db.exec('reset role');

  if (realRules) {
    // Exercita o ensaio de release inteiro. Só o vetor criptográfico é adaptado
    // ao digest sintético documentado; pgcrypto real é verificado via MCP.
    const fixtureDigest = (await one(`select encode(extensions.digest(
      convert_to('abc', 'UTF8'), 'sha256'), 'hex') digest`)).digest;
    await db.exec(read('supabase/tests/receivable_renegotiation_release_readonly.sql').replace(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      fixtureDigest,
    ));
  }

  assert.equal((await one(`select to_regprocedure(
    'public.activate_receivable_renegotiation_proposal_secure(uuid)'
  ) is null missing`)).missing, true);
  console.log(`renegociacao SQL (${realRules ? 'regras reais' : 'stub isolado'}): `
    + 'suíte concluída em PGlite descartável');
} finally {
  await db.close();
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
if (!modulePath) throw new Error('Defina PGLITE_MODULE_PATH para @electric-sql/pglite.');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const { assertActivationReads } = await import(pathToFileURL(resolve(
  root, 'supabase/tests/receivable_renegotiation_activation_reads.behavior.mjs',
)).href);
const { assertActivationEdgeFlow } = await import(pathToFileURL(resolve(
  root, 'supabase/tests/receivable_renegotiation_activation_edge.behavior.mjs',
)).href);
const { assertActivationApproval, assertActivationApprovalHttpContract } =
  await import(pathToFileURL(resolve(root,
    'supabase/tests/receivable_renegotiation_activation_approval.behavior.mjs',
  )).href);
const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const expectState = async (promise, code) => {
  let caught;
  try { await promise; } catch (error) { caught = error; }
  assert.ok(caught, `Era esperado SQLSTATE ${code}.`);
  assert.equal(caught.code, code, caught.message);
};
const setClaims = async (role, sub = '00000000-0000-0000-0000-000000000500') =>
  one("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub })]);
const migrationNames = [
  '20261003040301_receivable_renegotiation_proposal_schema.sql',
  '20261003040303_receivable_renegotiation_proposal_reads.sql',
  '20261003040307_receivable_renegotiation_proposal_mutations.sql',
  '20261003040309_receivable_renegotiation_policy_helpers.sql',
  '20261003040312_receivable_renegotiation_eligibility.sql',
  '20261003040314_receivable_renegotiation_calculation_helpers.sql',
  '20261003040317_receivable_renegotiation_preview.sql',
  '20261003040319_receivable_renegotiation_candidate_rpcs.sql',
  '20261003040737_receivable_renegotiation_rls_guard.sql',
  '20261003153539_receivable_renegotiation_schedule_v2.sql',
  '20261003153612_receivable_renegotiation_terms_v2.sql',
  '20261003153620_receivable_renegotiation_activation_schema.sql',
  '20261003153628_receivable_renegotiation_activation_fences.sql',
  '20261003153635_receivable_renegotiation_activation_helpers.sql',
  '20261003153953_receivable_renegotiation_activation_start.sql',
  '20261003154011_receivable_renegotiation_activation_claim.sql',
  '20261003154021_receivable_renegotiation_activation_sources.sql',
  '20261003154029_receivable_renegotiation_activation_prepare.sql',
  '20261003154035_receivable_renegotiation_activation_issuance.sql',
  '20261003154110_receivable_renegotiation_activation_finish.sql',
  '20261003154119_receivable_renegotiation_activation_reads.sql',
  '20261003154125_receivable_renegotiation_operational_ui.sql',
];

try {
  await db.exec(read('supabase/tests/receivable_renegotiation_pglite_base.sql'));
  await db.exec(read('supabase/tests/receivable_renegotiation_activation.fixture.sql'));
  for (const name of migrationNames.slice(0, 11)) {
    await db.exec(read(`supabase/migrations/${name}`));
  }
  await db.exec(`
    update public.contas_receber set
      gateway_provider='banese_card', gateway_environment='production',
      gateway_payment_method='BOLETO', gateway_payment_id='000000011',
      gateway_status='PENDING', gateway_submission_channel='API',
      gateway_submission_status='API_REGISTERED',
      gateway_issuer_polo_id='00000000-0000-0000-0000-000000000010',
      gateway_boleto_nosso_numero='000000011',
      gateway_boleto_convenio='12345', gateway_boleto_agencia='123',
      gateway_boleto_linha_digitavel=repeat('1',47),
      gateway_boleto_codigo_barras=repeat('1',44),
      gateway_financial_terms=jsonb_build_object(
        'nominalAmount',valor,'dueDate',data_vencimento,
        'discount',null,'penalty',null,'interest',null
      ), gateway_financial_terms_confirmed_at=clock_timestamp(),
      gateway_boleto_issued_at=clock_timestamp(), updated_at=clock_timestamp()
    where id='00000000-0000-0000-0000-000000000401';
    insert into public.payment_gateway_transactions(
      id,receivable_id,provider_code,environment,payment_method,
      remote_payment_id,remote_status,amount,origin_polo_id,issuer_polo_id,
      installments,bank_slip_digitable_line,bank_slip_barcode,
      bank_slip_our_number,synced_at
    ) values (
      '00000000-0000-0000-0000-000000000811',
      '00000000-0000-0000-0000-000000000401','banese_card','production',
      'BOLETO','000000011','PENDING',100,
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000010',1,repeat('1',47),
      repeat('1',44),'000000011',clock_timestamp()
    );
  `);
  const terms = (await one(`select jsonb_build_object(
    'downPaymentCents',0,'installmentCount',2,
    'firstDueDate',(now() at time zone 'America/Maceio')::date+30,
    'cadence','MONTHLY'
  ) value`)).value;
  const ids = [
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000402',
  ];
  const preview = (await one(`select public.preview_receivable_renegotiation_secure(
    $1::uuid[],$2::jsonb,'{}'::jsonb,null
  ) result`, [ids, terms])).result;
  assert.equal(preview.version, 2);
  assert.equal(preview.requiresApproval, false);
  assert.equal(preview.schedule.entries.length, 2);
  assert.equal(preview.policySnapshot.receiptPolicy.daysAfterDue, 60);
  const saved = (await one(`select public.save_receivable_renegotiation_proposal_secure(
    '00000000-0000-0000-0000-000000000820',$1::uuid[],$2,$3::jsonb,
    '{}'::jsonb,null,true,'Proposta operacional sintética'
  ) result`, [ids, preview.proposalFingerprint, terms])).result;
  const agreementId = saved.proposal.id;
  const edgeTerms = { ...terms, installmentCount: 1 };
  const edgePreview = (await one(`select public.preview_receivable_renegotiation_secure(
    array['00000000-0000-0000-0000-000000000403'::uuid],$1::jsonb,
    '{}'::jsonb,null
  ) result`, [edgeTerms])).result;
  const edgeSaved = (await one(`select public.save_receivable_renegotiation_proposal_secure(
    '00000000-0000-0000-0000-000000000826',
    array['00000000-0000-0000-0000-000000000403'::uuid],$1,$2::jsonb,
    '{}'::jsonb,null,true,'Proposta Edge sintética'
  ) result`, [edgePreview.proposalFingerprint, edgeTerms])).result;
  const edgeAgreementId = edgeSaved.proposal.id;
  const customBaseTerms = { ...terms, installmentCount: 1 };
  const customBase = (await one(`select public.preview_receivable_renegotiation_secure(
    array['00000000-0000-0000-0000-000000000405'::uuid],$1::jsonb,
    '{}'::jsonb,null
  ) result`, [customBaseTerms])).result;
  const customTerms = { ...customBaseTerms,
    targetNegotiatedCents: customBase.totals.grossDebtCents - 500 };
  const customPreview = (await one(`select public.preview_receivable_renegotiation_secure(
    array['00000000-0000-0000-0000-000000000405'::uuid],$1::jsonb,
    '{}'::jsonb,null
  ) result`, [customTerms])).result;
  assert.equal(customPreview.requiresApproval, true);
  const customSaved = (await one(`select public.save_receivable_renegotiation_proposal_secure(
    '00000000-0000-0000-0000-000000000828',
    array['00000000-0000-0000-0000-000000000405'::uuid],$1,$2::jsonb,
    $3::jsonb,null,true,'Concessão comercial sintética aprovada'
  ) result`, [customPreview.proposalFingerprint, customPreview.terms,
    customPreview.policyOverrides])).result;
  const customAgreementId = customSaved.proposal.id;
  for (const name of migrationNames.slice(11)) {
    await db.exec(read(`supabase/migrations/${name}`));
  }
  assertActivationApprovalHttpContract();
  await assertActivationApproval({ db, agreementId: customAgreementId,
    sourceReceivableId: '00000000-0000-0000-0000-000000000405',
    one, setClaims, expectState });
  await assertActivationReads(db, agreementId);

  const agreement = await one(`select version,proposal_fingerprint
    from public.receivable_renegotiation_agreements where id=$1`, [agreementId]);
  const requestId = '00000000-0000-0000-0000-000000000821';
  await db.exec('begin');
  const pastDue = (await one(`select ((clock_timestamp() at time zone
    'America/Maceio')::date-1)::text value`)).value;
  await db.query(`update public.receivable_renegotiation_agreements set
    canonical_snapshot=jsonb_set(jsonb_set(canonical_snapshot,
      '{schedule,entries,0,dueDate}',to_jsonb($2::text)),
      '{schedule,entries,0,financialTerms,dueDate}',to_jsonb($2::text))
    where id=$1`, [agreementId, pastDue]);
  await expectState(one(`select public.start_receivable_renegotiation_activation_secure(
    $1,'00000000-0000-0000-0000-000000000822',$2,$3,true,false
  ) result`, [agreementId, Number(agreement.version), agreement.proposal_fingerprint]), '23514');
  await db.exec('rollback');
  await expectState(one(`select public.start_receivable_renegotiation_activation_secure(
    $1,'00000000-0000-0000-0000-000000000823',$2,$3,true,false
  ) result`, [agreementId, Number(agreement.version), 'f'.repeat(64)]), '40001');
  await expectState(one(`select public.start_receivable_renegotiation_activation_secure(
    $1,'00000000-0000-0000-0000-000000000824',$2,$3,true,true
  ) result`, [agreementId, Number(agreement.version), agreement.proposal_fingerprint]), '22023');
  await db.exec('begin');
  await db.query(`update public.receivable_renegotiation_agreements set
    canonical_snapshot=jsonb_set(jsonb_set(canonical_snapshot,
      '{requiresApproval}','true'::jsonb),'{approvalReasons}',
      '["COMMERCIAL_DISCOUNT"]'::jsonb) where id=$1`, [agreementId]);
  await expectState(one(`select public.start_receivable_renegotiation_activation_secure(
    $1,'00000000-0000-0000-0000-000000000825',$2,$3,true,false
  ) result`, [agreementId, Number(agreement.version), agreement.proposal_fingerprint]), '42501');
  await db.exec('rollback');
  const started = (await one(`select public.start_receivable_renegotiation_activation_secure(
    $1,$2,$3,$4,true,false
  ) result`, [agreementId, requestId, Number(agreement.version),
    agreement.proposal_fingerprint])).result;
  assert.equal(started.state, 'CANCELING_SOURCES');
  assert.equal(started.replayed, false);
  const replayed = (await one(`select public.start_receivable_renegotiation_activation_secure(
    $1,$2,$3,$4,true,false
  ) result`, [agreementId, requestId, Number(agreement.version),
    agreement.proposal_fingerprint])).result;
  assert.equal(replayed.replayed, true);
  await setClaims('authenticated', '00000000-0000-0000-0000-000000000501');
  await expectState(one(`select public.start_receivable_renegotiation_activation_secure(
    $1,$2,$3,$4,true,false
  ) result`, [agreementId, requestId, Number(agreement.version),
    agreement.proposal_fingerprint]), '22023');
  await setClaims('authenticated');
  await assertActivationReads(db, agreementId);

  await setClaims('service_role');
  let context = (await one(`select public.claim_receivable_renegotiation_activation_secure(
    $1,180
  ) result`, [started.operationId])).result;
  assert.equal(context.payerDocument, '12345678901');
  assert.equal(context.sources.length, 2);
  assert.equal(context.replacementPlan.length, 2);
  await expectState(one(`select public.claim_receivable_renegotiation_activation_secure(
    $1,180
  ) result`, [started.operationId]), '55P03');
  const bank = context.sources.find((source) => source.kind === 'BANESE');
  const local = context.sources.find((source) => source.kind === 'LOCAL');
  assert.ok(bank && local);
  const itemArgs = (item) => [context.operationId, item.receivableId,
    context.leaseToken, item.attemptKey];
  await db.exec('begin');
  await db.query(`update public.receivable_renegotiation_activation_operations
    set lease_until=clock_timestamp()-interval '1 second' where id=$1`,
  [context.operationId]);
  await expectState(one(`select public.mark_receivable_renegotiation_cancel_intent_secure(
    $1,$2,$3,$4
  ) result`, itemArgs(bank)), 'PT409');
  await db.exec('rollback');
  const intent = (await one(`select public.mark_receivable_renegotiation_cancel_intent_secure(
    $1,$2,$3,$4
  ) result`, itemArgs(bank))).result;
  assert.equal(intent.mode, 'PUT_ALLOWED');
  assert.equal((await one(`select public.mark_receivable_renegotiation_cancel_intent_secure(
    $1,$2,$3,$4
  ) result`, itemArgs(bank))).result.mode, 'GET_ONLY');
  await expectState(db.query(`insert into public.payment_gateway_transactions(
    receivable_id,provider_code,environment,payment_method
  ) values($1,'banese_card','production','BOLETO')`, [bank.receivableId]), 'PT409');

  await db.exec('begin');
  await db.query(`update public.payment_gateway_transactions set
    remote_status='PAID',synced_at=clock_timestamp(),updated_at=clock_timestamp()
    where receivable_id=$1`, [bank.receivableId]);
  assert.equal((await one(`select state from
    public.receivable_renegotiation_activation_operations where id=$1`,
  [context.operationId])).state, 'REVIEW_REQUIRED');
  assert.equal((await one(`select remote_status from public.payment_gateway_transactions
    where receivable_id=$1`, [bank.receivableId])).remote_status, 'PAID');
  await db.exec('rollback');

  const bankEvidence = {
    kind: 'BANESE', situationCode: 5, paymentsVerified: true, paymentCount: 0,
    identityVerified: true, evidenceFingerprint: 'a'.repeat(64),
    confirmedAt: new Date().toISOString(),
  };
  context = (await one(`select public.confirm_receivable_renegotiation_source_cancel_secure(
    $1,$2,$3,$4,$5::jsonb
  ) result`, [...itemArgs(bank), bankEvidence])).result;
  assert.equal(context.sources.find((item) => item.receivableId === bank.receivableId).state,
    'CANCELED_CONFIRMED');
  await expectState(one(`select public.prepare_receivable_renegotiation_replacements_secure(
    $1,$2
  ) result`, [context.operationId, context.leaseToken]), 'PT409');
  const localEvidence = {
    kind: 'LOCAL', situationCode: null, paymentsVerified: false, paymentCount: 0,
    identityVerified: true, evidenceFingerprint: 'b'.repeat(64),
    confirmedAt: new Date().toISOString(),
  };
  context = (await one(`select public.confirm_receivable_renegotiation_source_cancel_secure(
    $1,$2,$3,$4,$5::jsonb
  ) result`, [...itemArgs(local), localEvidence])).result;
  assert.equal((await one(`select count(*)::int count from
    public.receivable_renegotiation_replacements where operation_id=$1`,
  [context.operationId])).count, 0);
  context = (await one(`select public.prepare_receivable_renegotiation_replacements_secure(
    $1,$2
  ) result`, [context.operationId, context.leaseToken])).result;
  assert.equal(context.state, 'ISSUING_REPLACEMENTS');
  assert.equal(context.replacements.length, 2);
  assert.equal((await one(`select count(*)::int count from public.contas_receber
    where renegotiation_agreement_id=$1 and categoria='MENSALIDADE'`,
  [agreementId])).count, 2);

  const cooldownSeconds = [60, 300, 3600];
  for (let index = 0; index < cooldownSeconds.length; index += 1) {
    const released = (await one(`select public.release_receivable_renegotiation_activation_secure(
      $1,$2,'BANESE_PIX_PENDING'
    ) result`, [context.operationId, context.leaseToken])).result;
    assert.equal(released.retryCode, 'BANESE_PIX_PENDING');
    const recovery = await one(`select pix_recovery_count,
      extract(epoch from (next_attempt_at-clock_timestamp()))::int delay
      from public.receivable_renegotiation_activation_operations where id=$1`,
    [context.operationId]);
    assert.equal(recovery.pix_recovery_count, index + 1);
    assert.ok(recovery.delay >= cooldownSeconds[index] - 2);
    await expectState(one(`select public.claim_receivable_renegotiation_activation_secure(
      $1,180
    ) result`, [context.operationId]), '55P03');
    await db.query(`update public.receivable_renegotiation_activation_operations
      set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1`,
    [context.operationId]);
    context = (await one(`select public.claim_receivable_renegotiation_activation_secure(
      $1,180
    ) result`, [context.operationId])).result;
  }
  await db.exec('begin');
  await db.query(`update public.receivable_renegotiation_activation_operations
    set pix_recovery_first_pending_at=clock_timestamp()-interval '7 days'
    where id=$1`, [context.operationId]);
  const expiredRecovery = (await one(`select
    public.release_receivable_renegotiation_activation_secure(
      $1,$2,'BANESE_PIX_PENDING'
    ) result`, [context.operationId, context.leaseToken])).result;
  assert.equal(expiredRecovery.state, 'REVIEW_REQUIRED');
  assert.equal(expiredRecovery.retryCode, 'BANESE_PIX_RECOVERY_EXPIRED');
  await db.exec('rollback');
  await db.exec('begin');
  await db.query(`update public.receivable_renegotiation_activation_operations
    set lease_token=null,lease_until=null,next_attempt_at=clock_timestamp()-interval '1 second',
      pix_recovery_first_pending_at=clock_timestamp()-interval '7 days'
    where id=$1`, [context.operationId]);
  const expiredClaim = (await one(`select
    public.claim_receivable_renegotiation_activation_secure($1,180) result`,
  [context.operationId])).result;
  assert.equal(expiredClaim.state, 'REVIEW_REQUIRED');
  await db.exec('rollback');

  let sequence = 21;
  for (const replacement of context.replacements) {
    const args = itemArgs(replacement);
    const claim = (await one(`select public.mark_receivable_renegotiation_issuance_intent_secure(
      $1,$2,$3,$4
    ) result`, args)).result;
    assert.equal(claim.mode, 'POST_ALLOWED');
    const nossoNumero = String(sequence++).padStart(9, '0');
    await db.query(`update public.contas_receber set gateway_boleto_nosso_numero=$2,
      updated_at=clock_timestamp() where id=$1`, [replacement.receivableId, nossoNumero]);
    await db.query(`update public.contas_receber set gateway_submission_channel='API',
      gateway_submission_status='API_AMBIGUOUS',updated_at=clock_timestamp()
      where id=$1`, [replacement.receivableId]);
    const receivable = await one(`select valor::text amount,data_vencimento::text due
      from public.contas_receber where id=$1`, [replacement.receivableId]);
    const capture = {
      response: { CodigoSituacaoBoleto: 2 },
      request: { nossoNumero, amount: Number(receivable.amount), dueDate: receivable.due,
        convenio: context.runtime.convenio, agency: context.runtime.agency },
    };
    const recorded = (await one(`select public.record_receivable_renegotiation_bank_response_secure(
      $1,$2,$3,$4,$5::jsonb
    ) result`, [...args, capture])).result;
    assert.deepEqual(recorded, { recorded: true, replayed: false });
    assert.deepEqual((await one(`select public.record_receivable_renegotiation_bank_response_secure(
      $1,$2,$3,$4,$5::jsonb
    ) result`, [...args, capture])).result, { recorded: true, replayed: true });
    const amountCents = Math.round(Number(receivable.amount) * 100);
    const barcode = '047900000' + String(amountCents).padStart(10, '0')
      + '0'.repeat(11) + nossoNumero + '0'.repeat(5);
    const result = {
      providerCode: 'banese_card', remotePaymentId: nossoNumero,
      remotePaymentLinkId: null, remoteCustomerId: null, remoteStatus: 'PENDING',
      invoiceUrl: null, bankSlipUrl: null, pixPayload: 'PIX-SYNTHETIC',
      pixEncodedImage: 'data:image/png;base64,AA==',
      bankSlipDigitableLine: '0'.repeat(47), bankSlipBarcode: barcode,
      bankSlipOurNumber: nossoNumero, issuerPoloId: context.runtime.issuerPoloId,
      financialTerms: replacement.financialTerms, rawPayload: { synthetic: true },
    };
    context = (await one(`select public.confirm_receivable_renegotiation_replacement_issued_secure(
      $1,$2,$3,$4,$5::jsonb
    ) result`, [...args, result])).result;
    assert.equal(context.replacements.find((item) =>
      item.receivableId === replacement.receivableId).state, 'ISSUED');
    await expectState(db.query(`update public.contas_receber set valor=valor+1
      where id=$1`, [replacement.receivableId]), 'PT409');
    await expectState(db.query(`update public.contas_receber
      set gateway_boleto_nosso_numero='999999999' where id=$1`,
    [replacement.receivableId]), 'PT409');
  }
  context = (await one(`select public.finish_receivable_renegotiation_activation_secure(
    $1,$2
  ) result`, [context.operationId, context.leaseToken])).result;
  assert.equal(context.state, 'ACTIVE');
  await setClaims('authenticated');
  await assertActivationReads(db, agreementId);

  await setClaims('service_role');
  await db.query(`update public.payment_gateway_transactions set remote_status='PAID',
    synced_at=clock_timestamp(),updated_at=clock_timestamp()
    where receivable_id=$1`, [bank.receivableId]);
  const late = await one(`select operation.state,operation.completed_at,
    agreement.lifecycle_status,agreement.activated_at
    from public.receivable_renegotiation_activation_operations operation
    join public.receivable_renegotiation_agreements agreement
      on agreement.id=operation.agreement_id where operation.id=$1`, [context.operationId]);
  assert.equal(late.state, 'REVIEW_REQUIRED');
  assert.ok(late.completed_at && late.activated_at);
  assert.equal(late.lifecycle_status, 'REVIEW_REQUIRED');
  assert.equal((await one(`select remote_status from public.payment_gateway_transactions
    where receivable_id=$1`, [bank.receivableId])).remote_status, 'PAID');
  await setClaims('authenticated');
  await assertActivationReads(db, agreementId);

  const edgeMetrics = await assertActivationEdgeFlow({
    db, agreementId: edgeAgreementId,
    requestId: '00000000-0000-0000-0000-000000000827', one, setClaims,
  });
  assert.equal(edgeMetrics.sources, 1);
  assert.equal(edgeMetrics.replacements, 1);
  assert.equal(edgeMetrics.posts, 1);
  assert.equal(edgeMetrics.recoveryGets, 1);
  await setClaims('authenticated');
  await assertActivationReads(db, edgeAgreementId);

  const counts = await one(`select
    (select count(*)::int from public.contas_receber receivable
      join public.receivable_renegotiation_source_items source
        on source.receivable_id=receivable.id
      where source.agreement_id=$1 and receivable.status='CANCELADO') canceled,
    (select count(*)::int from public.contas_receber
      where renegotiation_agreement_id=$1) replacements,
    (select count(*)::int from public.payment_gateway_transactions
      where receivable_id in (select receivable_id from
        public.receivable_renegotiation_replacements where agreement_id=$1)) issued`,
  [agreementId]);
  assert.deepEqual(counts, { canceled: 2, replacements: 2, issued: 2 });
  console.log('renegociação activation SQL: saga e fences concluídos em PGlite descartável');
} finally {
  await db.close();
}

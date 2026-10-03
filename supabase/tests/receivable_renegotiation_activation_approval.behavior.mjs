import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const code = stripTypeScriptTypes(readFileSync(new URL(
  '../functions/receivable-renegotiation-activate/contract.ts', import.meta.url,
), 'utf8'), { mode: 'transform', sourceMap: false });
const contractUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { parseActivationRequest } = await import(contractUrl);

export const assertActivationApprovalHttpContract = () => {
  const base = {
    agreementId: '00000000-0000-0000-0000-000000000900',
    requestId: '00000000-0000-0000-0000-000000000901',
    expectedVersion: 1,
    expectedFingerprint: 'a'.repeat(64),
    confirm: true,
  };
  assert.equal(parseActivationRequest({ ...base, approveCustomTerms: true })
    .approveCustomTerms, true);
  assert.equal(parseActivationRequest({ ...base, approveCustomTerms: false })
    .approveCustomTerms, false);
  for (const invalid of [null, 'true', 1, {}, []]) {
    assert.throws(() => parseActivationRequest({
      ...base, approveCustomTerms: invalid,
    }), (error) => error.code === 'INVALID_REQUEST' && error.status === 400);
  }
};

export const assertActivationApproval = async ({
  db, agreementId, sourceReceivableId, one, setClaims, expectState,
}) => {
  const actorId = '00000000-0000-0000-0000-000000000500';
  const otherPolo = '00000000-0000-0000-0000-000000000099';
  const agreement = await one(`select version,proposal_fingerprint,reason,
    canonical_snapshot from public.receivable_renegotiation_agreements where id=$1`,
  [agreementId]);
  assert.equal(agreement.canonical_snapshot.requiresApproval, true);
  assert.ok(agreement.canonical_snapshot.approvalReasons.length > 0);

  const setAccess = async ({ role = 'authenticated', sub = actorId, module = 'financeiro',
    polo = '00000000-0000-0000-0000-000000000010', gestor = true,
    receber = true } = {}) => {
    await setClaims(role, sub);
    await one("select set_config('app.test_module',$1,false)", [module]);
    await one("select set_config('app.test_allowed_polo',$1,false)", [polo]);
    await one("select set_config('app.test_gestor_access',$1,false)", [String(gestor)]);
    await one("select set_config('app.test_receber_tab',$1,false)", [String(receber)]);
  };
  const start = (requestId, approve) => one(`select
    public.start_receivable_renegotiation_activation_secure(
      $1,$2,$3,$4,true,$5
    ) result`, [agreementId, requestId, Number(agreement.version),
    agreement.proposal_fingerprint, approve]);
  const unchangedState = async () => one(`select
    agreement.lifecycle_status,agreement.version,receivable.status,
    receivable.data_pagamento,receivable.valor_pago,
    (select count(*)::int from public.receivable_renegotiation_activation_operations
      where agreement_id=$1) operations,
    (select count(*)::int from public.receivable_renegotiation_activation_sources source
      join public.receivable_renegotiation_activation_operations operation
        on operation.id=source.operation_id where operation.agreement_id=$1) sources,
    (select count(*)::int from public.receivable_renegotiation_events
      where agreement_id=$1 and event_type='ACTIVATION_STARTED') activation_events,
    (select count(*)::int from public.payment_gateway_transactions
      where receivable_id=$2) bank_transactions
    from public.receivable_renegotiation_agreements agreement
    join public.contas_receber receivable on receivable.id=$2
    where agreement.id=$1`, [agreementId, sourceReceivableId]);

  await setAccess();
  const detail = (await one(`select
    public.get_receivable_renegotiation_proposal_secure($1) result`,
  [agreementId])).result;
  assert.equal(detail.capabilities.canApproveCustomTerms, true);
  const helperAcl = await one(`select
    has_function_privilege('anon',
      'internal_finance.can_approve_receivable_renegotiation_terms(uuid)',
      'EXECUTE') anon,
    has_function_privilege('authenticated',
      'internal_finance.can_approve_receivable_renegotiation_terms(uuid)',
      'EXECUTE') authenticated,
    has_function_privilege('service_role',
      'internal_finance.can_approve_receivable_renegotiation_terms(uuid)',
      'EXECUTE') service`);
  assert.deepEqual(helperAcl, { anon: false, authenticated: false, service: false });
  const pristine = await unchangedState();
  await db.exec('begin');
  await db.query(`update public.receivable_renegotiation_agreements
    set reason=null where id=$1`, [agreementId]);
  await expectState(start('00000000-0000-0000-0000-000000000909', true), '22023');
  await db.exec('rollback');
  assert.deepEqual(await unchangedState(), pristine);
  await expectState(start('00000000-0000-0000-0000-000000000910', false), '42501');
  assert.deepEqual(await unchangedState(), pristine);

  const denied = [
    ['00000000-0000-0000-0000-000000000911', { module: 'caixa' }],
    ['00000000-0000-0000-0000-000000000912', { module: 'none' }],
    ['00000000-0000-0000-0000-000000000913', { polo: otherPolo }],
    // O mock false representa a barreira conjunta de identidade/horário efetivo;
    // o algoritmo de agenda real pertence à suíte canônica de Auth.
    ['00000000-0000-0000-0000-000000000914', { gestor: false }],
    ['00000000-0000-0000-0000-000000000915', { sub: null }],
    ['00000000-0000-0000-0000-000000000916', { receber: false }],
    ['00000000-0000-0000-0000-000000000918', { role: 'service_role', sub: null }],
    ['00000000-0000-0000-0000-000000000919', { role: 'service_role' }],
  ];
  for (const [requestId, access] of denied) {
    await setAccess(access);
    await expectState(start(requestId, true), '42501');
    assert.deepEqual(await unchangedState(), pristine);
  }

  await setAccess();
  // A tentativa false anterior não consome o requestId; consentimento humano true
  // pode então iniciar a operação com a mesma chave idempotente.
  const requestId = '00000000-0000-0000-0000-000000000910';
  const started = (await start(requestId, true)).result;
  assert.equal(started.state, 'CANCELING_SOURCES');
  assert.equal(started.replayed, false);
  assert.equal(started.approvedCustomTerms, true);
  const beforeConsentDowngrade = await unchangedState();
  // Após persistir true, trocar o consentimento muda o payload idempotente.
  await expectState(start(requestId, false), '22023');
  assert.deepEqual(await unchangedState(), beforeConsentDowngrade);
  const replayed = (await start(requestId, true)).result;
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.approvedCustomTerms, true);

  const audit = await one(`select operation.activation_snapshot,
    operation.snapshot_fingerprint,
    internal_finance.receivable_renegotiation_hash(operation.activation_snapshot)
      calculated_fingerprint,
    event.actor_id,event.request_id,event.payload_hash,event.details
    from public.receivable_renegotiation_activation_operations operation
    join public.receivable_renegotiation_events event
      on event.agreement_id=operation.agreement_id
      and event.event_type='ACTIVATION_STARTED'
    where operation.agreement_id=$1`, [agreementId]);
  const approval = audit.activation_snapshot.customTermsApproval;
  assert.equal(approval.approved, true);
  assert.equal(approval.authority, 'FINANCEIRO');
  assert.equal(approval.actorId, actorId);
  assert.equal(approval.proposalFingerprint, agreement.proposal_fingerprint);
  assert.deepEqual(approval.approvalReasons,
    agreement.canonical_snapshot.approvalReasons);
  assert.equal(approval.reason, agreement.reason);
  assert.ok(Number.isFinite(Date.parse(approval.approvedAt)));
  assert.equal(audit.snapshot_fingerprint, audit.calculated_fingerprint);
  assert.equal(audit.actor_id, actorId);
  assert.equal(audit.request_id, requestId);
  assert.match(audit.payload_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(audit.details.customTermsApproval, approval);

  const source = await one(`select receivable.status,receivable.data_pagamento,
    receivable.valor_pago,source.kind,source.state,
    (select count(*)::int from public.receivable_renegotiation_replacements replacement
      where replacement.operation_id=source.operation_id) replacements,
    (select count(*)::int from public.payment_gateway_transactions transaction
      where transaction.receivable_id=receivable.id) bank_transactions
    from public.receivable_renegotiation_activation_sources source
    join public.contas_receber receivable on receivable.id=source.receivable_id
    where source.receivable_id=$1`, [sourceReceivableId]);
  assert.deepEqual(source, { status: 'PENDENTE', data_pagamento: null,
    valor_pago: null, kind: 'LOCAL', state: 'PENDING', replacements: 0,
    bank_transactions: 0 });
  const activation = (await one(`select
    public.get_receivable_renegotiation_activation_secure($1) result`,
  [agreementId])).result;
  assert.equal(activation.approvedCustomTerms, true);

  const beforeRevokedReplay = await unchangedState();
  for (const [, access] of denied) {
    await setAccess(access);
    await expectState(start(requestId, true), '42501');
    assert.deepEqual(await unchangedState(), beforeRevokedReplay);
  }
  await setAccess();
};

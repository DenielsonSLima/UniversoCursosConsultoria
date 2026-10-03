import assert from 'node:assert/strict';

// Recebe o banco descartável já migrado pelo ensaio da saga; nenhuma conexão remota.
export const assertActivationReads = async (db, agreementId) => {
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const agreement = await one('select * from public.receivable_renegotiation_agreements where id=$1', [agreementId]);
  assert.ok(agreement);
  const readiness = (await one('select public.get_receivable_renegotiation_readiness_secure($1) result', [agreement.polo_id])).result;
  assert.equal(readiness.proposalOnly, false);
  for (const key of ['activateProposal', 'cancelSourceTitles', 'issueReplacementTitles', 'getActivation']) {
    assert.equal(readiness.capabilities[key], true, `readiness ${key}`);
  }
  assert.ok(readiness.lifecycleStatuses.includes('ACTIVE'));
  assert.ok(readiness.lifecycleStatuses.includes('REVIEW_REQUIRED'));
  const detail = (await one('select public.get_receivable_renegotiation_proposal_secure($1) result', [agreementId])).result;
  assert.equal(detail.proposal.lifecycleStatus, agreement.lifecycle_status);
  assert.deepEqual(detail.capabilities, detail.proposal.capabilities);
  const operation = (await one('select public.get_receivable_renegotiation_activation_secure($1) result', [agreementId])).result;
  if (operation) {
    assert.deepEqual(Object.keys(operation).sort(), [
      'operationId', 'agreementId', 'requestId', 'state', 'expectedVersion',
      'expectedFingerprint', 'agreementVersion', 'proposalFingerprint', 'sourcesTotal',
      'sourcesCanceled', 'replacementsTotal', 'replacementsIssued', 'retryable',
      'approvedCustomTerms', 'lastErrorCode', 'createdAt', 'updatedAt', 'completedAt',
    ].sort());
    assert.equal(operation.agreementId, agreementId);
    assert.equal(operation.agreementVersion, Number(agreement.version));
    assert.equal(operation.proposalFingerprint, agreement.proposal_fingerprint);
    assert.equal(typeof operation.approvedCustomTerms, 'boolean');
    assert.equal(detail.capabilities.canActivate, false);
    assert.equal(detail.capabilities.canDiscard, false);
    const counts = await one(`select
      (select count(*)::int from public.receivable_renegotiation_activation_sources
        where operation_id=$1 and state='CANCELED_CONFIRMED') canceled,
      (select count(*)::int from public.receivable_renegotiation_replacements
        where operation_id=$1 and state='ISSUED') issued`, [operation.operationId]);
    assert.equal(operation.sourcesCanceled, counts.canceled);
    assert.equal(operation.replacementsIssued, counts.issued);
    if (['ACTIVE', 'REVIEW_REQUIRED'].includes(operation.state)) {
      assert.equal(operation.retryable, false);
      assert.equal(detail.capabilities.canResume, false);
    }
  } else if (agreement.lifecycle_status === 'PROPOSED') {
    assert.equal(detail.capabilities.canActivate, agreement.canonical_snapshot.version === 2
      && agreement.canonical_snapshot.requiresApproval === false);
    assert.equal(detail.capabilities.canDiscard, true);
  }
  for (const status of ['ACTIVATING', 'ACTIVE', 'REVIEW_REQUIRED']) {
    const list = (await one('select public.list_receivable_renegotiation_proposals_secure($1,null,$2) result', [agreement.polo_id, status])).result;
    assert.ok(list.rows.every((row) => row.lifecycleStatus === status));
  }
  const acl = await one(`select
    has_function_privilege('authenticated', 'public.get_receivable_renegotiation_activation_secure(uuid)', 'EXECUTE') allowed,
    has_function_privilege('anon', 'public.get_receivable_renegotiation_activation_secure(uuid)', 'EXECUTE') anonymous,
    has_table_privilege('authenticated', 'public.receivable_renegotiation_activation_operations', 'SELECT') direct,
    has_function_privilege('authenticated', 'internal_finance.receivable_renegotiation_activation_capabilities(uuid)', 'EXECUTE') helper`);
  assert.deepEqual(acl, { allowed: true, anonymous: false, direct: false, helper: false });
  await assert.rejects(() => one('select public.get_receivable_renegotiation_activation_secure($1)',
    ['ffffffff-ffff-ffff-ffff-ffffffffffff']), (error) => error.code === '42501');
  const claims = (await one("select current_setting('request.jwt.claims', true) claims")).claims;
  try {
    await one("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'authenticated', sub: null })]);
    await assert.rejects(() => one('select public.get_receivable_renegotiation_activation_secure($1)', [agreementId]),
      (error) => error.code === '42501');
  } finally {
    await one("select set_config('request.jwt.claims', $1, false)", [claims || '']);
  }
};

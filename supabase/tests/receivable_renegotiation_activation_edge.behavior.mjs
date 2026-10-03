import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const code = (path) => stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'),
  { mode: 'transform', sourceMap: false });
const asModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const contractUrl = asModule(code('../functions/receivable-renegotiation-activate/contract.ts'));
const orchestratorUrl = asModule(code('../functions/receivable-renegotiation-activate/orchestrator.ts')
  .replaceAll('"./contract.ts"', JSON.stringify(contractUrl)));
const { ActivationError } = await import(contractUrl);
const { runActivation, assertActivationContext } = await import(orchestratorUrl);
const { buildBanesePixPayloadFixture, buildBanesePixImageFixture } = await import(asModule(
  code('../functions/banese/internal/testing/pix-fixture.ts'),
));

// Real Edge orchestrator + real PostgreSQL RPCs in disposable PGlite.
// Only bank I/O/preflight runtime are mocked: no network, keys or personal data.
export const assertActivationEdgeFlow = async ({ db, agreementId, requestId, one, setClaims }) => {
  const call = async (name, args) => (await one(
    `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) result`, args,
  )).result;
  const agreement = await one(`select version,proposal_fingerprint
    from public.receivable_renegotiation_agreements where id=$1`, [agreementId]);
  const request = { agreementId, requestId, expectedVersion: Number(agreement.version),
    expectedFingerprint: agreement.proposal_fingerprint, confirm: true, approveCustomTerms: false };
  const itemArgs = (context, item) => [context.operationId, item.receivableId,
    context.leaseToken, item.attemptKey];
  const operationArgs = (context) => [context.operationId, context.leaseToken];
  const events = [];
  const issued = new Map();
  let dropFirstPostResponse = true;
  let operationId;
  let nextNumber = 100;
  let posted = 0;
  let getOnly = 0;
  let cancels = 0;

  const dependencies = {
    start: async (input) => {
      events.push('AUTHORIZE');
      await setClaims('authenticated');
      const started = await call('start_receivable_renegotiation_activation_secure', [
        input.agreementId, input.requestId, input.expectedVersion,
        input.expectedFingerprint, input.confirm, false,
      ]);
      operationId = started.operationId;
      return started;
    },
    claim: async (id) => {
      events.push('CLAIM');
      await setClaims('service_role');
      return call('claim_receivable_renegotiation_activation_secure', [id, 180]);
    },
    preflight: async (context) => {
      events.push('PREFLIGHT');
      assertActivationContext(request, context);
      assert.equal(context.payerDocument, '12345678901');
      assert.ok(context.sources.every((source) => source.kind === 'LOCAL'));
      assert.ok(context.replacementPlan.every((entry) => entry.collectionPolicy.daysAfterDue === 60));
    },
    markCancelIntent: async (context, source) => {
      const result = await call('mark_receivable_renegotiation_cancel_intent_secure', itemArgs(context, source));
      assert.equal(result.mode, 'PUT_ALLOWED');
    },
    cancelSource: async (_context, source) => {
      // LOCAL sources never call a bank. Cancellation projection still uses the real RPC.
      assert.equal(source.kind, 'LOCAL');
      events.push('CANCEL_LOCAL'); cancels += 1;
      return { kind: 'LOCAL', situationCode: null, paymentsVerified: false,
        paymentCount: 0, identityVerified: true, evidenceFingerprint: 'b'.repeat(64),
        confirmedAt: new Date().toISOString() };
    },
    confirmSource: async (context, source, evidence) => {
      const persisted = await call('confirm_receivable_renegotiation_source_cancel_secure',
        [...itemArgs(context, source), evidence]);
      assertActivationContext(request, persisted);
      assert.equal(persisted.sources.find((item) => item.receivableId === source.receivableId)?.state,
        'CANCELED_CONFIRMED');
      events.push('CONFIRM_SOURCE');
    },
    prepareReplacements: async (context) => {
      assert.ok(context.sources.every((source) => source.state === 'CANCELED_CONFIRMED'));
      events.push('PREPARE');
      return call('prepare_receivable_renegotiation_replacements_secure', operationArgs(context));
    },
    issueReplacement: async (context, item) => {
      assert.ok(context.sources.every((source) => source.state === 'CANCELED_CONFIRMED'));
      const args = itemArgs(context, item);
      const intent = await call('mark_receivable_renegotiation_issuance_intent_secure', args);
      let result;
      if (intent.mode === 'GET_ONLY') {
        events.push('GET_ONLY'); getOnly += 1;
        assert.ok(intent.creationResponse, 'Original POST response must survive failed invocation');
        result = issued.get(item.receivableId);
        assert.ok(result, 'Mock bank must already have this exact title');
        assert.equal(intent.creationResponse.request.nossoNumero, result.remotePaymentId);
      } else {
        assert.equal(intent.mode, 'POST_ALLOWED');
        assert.equal(issued.has(item.receivableId), false, 'Never POST twice for the same replacement');
        const nossoNumero = String(nextNumber++).padStart(9, '0');
        await db.query(`update public.contas_receber set gateway_boleto_nosso_numero=$2,
          updated_at=clock_timestamp() where id=$1`, [item.receivableId, nossoNumero]);
        await db.query(`update public.contas_receber set gateway_submission_channel='API',
          gateway_submission_status='API_AMBIGUOUS',updated_at=clock_timestamp()
          where id=$1`, [item.receivableId]);
        const amountCents = Math.round(item.financialTerms.nominalAmount * 100);
        result = {
          providerCode: 'banese_card', remotePaymentId: nossoNumero,
          remotePaymentLinkId: null, remoteCustomerId: null, remoteStatus: 'PENDING',
          invoiceUrl: null, bankSlipUrl: null,
          pixPayload: buildBanesePixPayloadFixture(`SYNTHETIC-${nossoNumero}`, amountCents / 100),
          pixEncodedImage: buildBanesePixImageFixture(nextNumber),
          bankSlipDigitableLine: '0'.repeat(47),
          bankSlipBarcode: '047900000' + String(amountCents).padStart(10, '0')
            + '0'.repeat(11) + nossoNumero + '0'.repeat(5),
          bankSlipOurNumber: nossoNumero, issuerPoloId: context.runtime.issuerPoloId,
          financialTerms: item.financialTerms, rawPayload: { syntheticBank: true },
        };
        posted += 1; events.push('POST'); issued.set(item.receivableId, result);
        const capture = { response: { CodigoSituacaoBoleto: 2, NossoNumero: nossoNumero },
          request: { nossoNumero, amount: item.financialTerms.nominalAmount,
            dueDate: item.financialTerms.dueDate, convenio: context.runtime.convenio,
            agency: context.runtime.agency } };
        const saved = await call('record_receivable_renegotiation_bank_response_secure', [...args, capture]);
        assert.equal(saved.recorded, true); events.push('CAPTURE_POST');
        if (dropFirstPostResponse) {
          dropFirstPostResponse = false;
          throw new ActivationError('BANK_TEMPORARILY_UNAVAILABLE', 'Synthetic timeout after durable POST capture', true);
        }
      }
      return result;
    },
    confirmReplacement: async (context, item, result) => {
      const persisted = await call('confirm_receivable_renegotiation_replacement_issued_secure',
        [...itemArgs(context, item), result]);
      assertActivationContext(request, persisted);
      assert.equal(persisted.replacements.find((row) => row.receivableId === item.receivableId)?.state, 'ISSUED');
      events.push('CONFIRM_REPLACEMENT');
    },
    finish: async (context) => {
      const persisted = await call('finish_receivable_renegotiation_activation_secure', operationArgs(context));
      assertActivationContext(request, persisted);
      assert.equal(persisted.state, 'ACTIVE'); events.push('FINISH');
    },
    release: async (context) => {
      assert.equal((await call('release_receivable_renegotiation_activation_secure', [...operationArgs(context), null])).released, true);
    },
    fail: async (context, error) => {
      assert.equal(error.retryable, true, `Unexpected integrity failure: ${error.code}`);
      assert.equal((await call('release_receivable_renegotiation_activation_secure',
        [...operationArgs(context), error.code === 'BANESE_PIX_PENDING' ? error.code : null])).released, true);
      events.push('PRESERVE_RETRY');
    },
  };

  const first = await runActivation(request, dependencies);
  assert.equal(first.state, 'ISSUING_REPLACEMENTS');
  assert.equal(first.success, false); assert.equal(first.retryable, true);
  assert.equal(first.replacementsIssued, 0); assert.equal(posted, 1);
  assert.equal(events.indexOf('PREPARE') > events.lastIndexOf('CONFIRM_SOURCE'), true);
  assert.equal(events.indexOf('CAPTURE_POST') < events.indexOf('PRESERVE_RETRY'), true);
  assert.equal(events.includes('FINISH'), false);
  // Advance only the disposable test scheduler; never bypass a real lease/cooldown.
  await db.query(`update public.receivable_renegotiation_activation_operations
    set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1`, [operationId]);
  const second = await runActivation(request, dependencies);
  assert.equal(second.state, 'ACTIVE'); assert.equal(second.success, true);
  assert.equal(second.sourcesCanceled, second.sourcesTotal);
  assert.equal(second.replacementsIssued, second.replacementsTotal);
  assert.equal(cancels, second.sourcesTotal, 'Confirmed originals must never be canceled again');
  assert.equal(posted, second.replacementsTotal, 'Exactly one POST per replacement');
  assert.equal(getOnly, 1, 'Ambiguous issued title must resume with GET only');
  const beforeReplay = { posted, getOnly, cancels, events: events.length };
  const replay = await runActivation(request, dependencies);
  assert.equal(replay.success, true); assert.equal(replay.state, 'ACTIVE');
  assert.equal(posted, beforeReplay.posted); assert.equal(getOnly, beforeReplay.getOnly);
  assert.equal(cancels, beforeReplay.cancels);
  assert.deepEqual(events.slice(beforeReplay.events), ['AUTHORIZE', 'CLAIM']);
  assert.equal((await one(`select count(*)::int count from public.payment_gateway_transactions
    where receivable_id in (select receivable_id from public.receivable_renegotiation_replacements
      where agreement_id=$1)`, [agreementId])).count, posted);
  assert.equal(JSON.stringify(replay).includes('payerDocument'), false);
  return { sources: second.sourcesTotal, replacements: second.replacementsTotal, posts: posted, recoveryGets: getOnly };
};

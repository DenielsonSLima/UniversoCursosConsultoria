import assert from "node:assert/strict";

Deno.test("worker interno retoma o run e nunca prepara um ciclo novo", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assert.match(source, /action:\s*"resume"/);
  assert.match(source, /runManualCycleIssuance/);
  assert.match(source, /recoverReviewedCycleItems/);
  assert.match(source, /internalRecovery:/);
  assert.match(source, /X-Banese-Worker-Token/);
  assert.match(source, /safeEqual\(requestSecret, configuredSecret\)/);
  assert.doesNotMatch(source, /action:\s*"generate"/);
  assert.doesNotMatch(source, /preparar_emissao_ciclo/);
});

Deno.test("dependências usam somente as RPCs service de recuperação", async () => {
  const source = await Deno.readTextFile(
    new URL(
      "../technical-manual-cycle-issuance/dependencies.ts",
      import.meta.url,
    ),
  );
  assert.match(
    source,
    /assert_technical_manual_cycle_recovery_service/,
  );
  assert.match(
    source,
    /authorize_technical_manual_receivable_issuance_recovery_service/,
  );
  assert.match(source, /p_expected_cycle_request_id/);
  assert.match(source, /p_expected_matricula_id/);
  assert.match(source, /p_expected_cycle_number/);
  assert.match(source, /p_expected_item_count/);
  assert.match(
    source,
    /if \(input\.internalRecovery\)[\s\S]*?não pode preparar um novo ciclo/,
  );
});

Deno.test("revisão terminal recupera Pix ou substitui título sem POST cego", async () => {
  const source = await Deno.readTextFile(
    new URL("./review-recovery.ts", import.meta.url),
  );
  assert.match(source, /queryBaneseBoleto/);
  assert.match(source, /cancelBaneseBoleto/);
  assert.match(source, /stopWhenPixAvailable:\s*true/);
  assert.match(source, /onMutationStart/);
  assert.match(source, /BANESE_REVIEW_EXACT_GET_ONLY/);
  assert.match(
    source,
    /claim_technical_manual_cycle_banese_review_recovery_service/,
  );
  assert.match(
    source,
    /persist_technical_manual_cycle_banese_review_recovery_service/,
  );
  assert.match(
    source,
    /begin_technical_manual_cycle_banese_review_cancel_service/,
  );
  assert.match(
    source,
    /mark_technical_manual_cycle_banese_cancel_intent_service/,
  );
  assert.match(
    source,
    /prepare_technical_manual_cycle_banese_reissue_service/,
  );
  assert.match(source, /CANCEL_ALLOWED_AFTER_GET/);
  assert.match(source, /requiresNewNossoNumero/);
  assert.match(source, /REMOTE_RECOVERY_TIMEOUT_MS\s*=\s*45_000/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal,?/);
  assert.match(source, /clearTimeout\(timeout\)/);
  assert.doesNotMatch(source, /createGatewayCharge/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});

Deno.test("lane de substituição exige baixa code 5 e Nosso Número novo", async () => {
  const base = new URL("../../migrations/", import.meta.url);
  const lane = await Deno.readTextFile(
    new URL(
      "20260902091200_create_technical_manual_banese_reissue_lane.sql",
      base,
    ),
  );
  const begin = await Deno.readTextFile(
    new URL("20260902091300_begin_technical_manual_banese_reissue.sql", base),
  );
  const prepare = await Deno.readTextFile(
    new URL("20260902091400_prepare_technical_manual_banese_reissue.sql", base),
  );
  const closure = await Deno.readTextFile(
    new URL(
      "20260902091500_harden_technical_banese_reissue_closure.sql",
      base,
    ),
  );
  const resetGuard = await Deno.readTextFile(
    new URL(
      "20260902091600_fix_manual_technical_banese_reset_guard.sql",
      base,
    ),
  );
  assert.match(lane, /unique \(environment, convenio, canceled_nosso_numero\)/);
  assert.match(lane, /lease_valid_until > pg_catalog\.clock_timestamp\(\)/);
  assert.match(lane, /banese_ead_title_replacement_archive/);
  assert.match(begin, /Job de baixa técnica ocupado por lease ativo/);
  assert.match(begin, /cancel_mutation_intent_count >= 3/);
  assert.match(begin, /gateway_transaction_receipt_url is null/);
  assert.match(
    begin,
    /technical_manual_banese_reissue_archive archive[\s\S]*?archive\.receivable_id = v_receivable\.id/,
  );
  assert.match(
    begin,
    /terminal_job\.status in \('RECOVERED_PIX', 'RESET_COMPLETE'\)/,
  );
  assert.match(begin, /já consumiu sua única substituição/);
  assert.match(prepare, /p_confirmed_situation_code is distinct from 5/);
  assert.match(prepare, /gateway_boleto_nosso_numero = null/);
  assert.match(prepare, /requiresNewNossoNumero', true/);
  assert.match(closure, /status in \('FENCED', 'CANCEL_INTENT'\)/);
  assert.match(
    closure,
    /v_job\.cancel_mutation_intent_at > v_now - interval '3 minutes'/,
  );
  assert.match(closure, /persistência Pix bloqueada/);
  assert.match(closure, /REISSUE_RECOVERED_PIX/);
  assert.match(closure, /receivable\.id <> new\.receivable_id/);
  assert.match(
    closure,
    /gateway_boleto_nosso_numero = new\.canceled_nosso_numero/,
  );
  assert.match(
    resetGuard,
    /gateway_submission_status is distinct from 'API_REGISTERED'/,
  );
  assert.doesNotMatch(
    resetGuard,
    /gateway_submission_status <> 'API_REGISTERED'/,
  );
});

Deno.test("SQL aceita o GUI Pix real sem relaxar as demais guardas", async () => {
  const pixMigration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260902091000_align_technical_manual_banese_pix_contract.sql",
      import.meta.url,
    ),
  );
  assert.equal(pixMigration.match(/!~\*/g)?.length, 2);
  assert.match(pixMigration, /BR\[\.\]GOV\[\.\]BCB\[\.\]PIX/);
  assert.match(pixMigration, /technical_manual_banese_receivable_complete/);
  assert.match(pixMigration, /persist_technical_manual_cycle_banese_issuance/);

  const reviewMigration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260902091100_reconcile_reviewed_technical_bolepix.sql",
      import.meta.url,
    ),
  );
  assert.match(reviewMigration, /API_REVIEW/);
  assert.match(reviewMigration, /API_AMBIGUOUS/);
  assert.match(reviewMigration, /INTERNAL_GET/);
  assert.match(reviewMigration, /p_expected_cycle_request_id/);
  assert.match(reviewMigration, /payment_gateway_transactions/);

  const fenceMigration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260902091150_harden_review_recovery_fence.sql",
      import.meta.url,
    ),
  );
  assert.match(fenceMigration, /auth\.role\(\)/);
  assert.match(fenceMigration, /service_role/);
});

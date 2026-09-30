import assert from "node:assert/strict";

const migrations = new URL("../../migrations/", import.meta.url);
const readMigration = (name: string) =>
  Deno.readTextFile(new URL(name, migrations));

Deno.test("overlay one-off é imutável, privado e preserva o run histórico", async () => {
  const source = await readMigration(
    "20260930191000_create_oneoff_technical_due_date_overlay.sql",
  );
  assert.match(source, /technical_manual_banese_due_date_overlay/);
  assert.match(source, /enable row level security/);
  assert.match(source, /prevent_technical_manual_due_date_overlay_mutation/);
  assert.match(source, /original_due_date = date '2027-10-15'/);
  assert.match(source, /corrected_due_date = date '2026-10-15'/);
  assert.match(source, /reviewed_item_key = 'ciclo-1-parc-12'/);
  assert.match(
    source,
    /md5\(v_assert_definition\).*841f8620ce502c55e3443f3b3521dbd9/s,
  );
  assert.match(
    source,
    /md5\(v_identity_definition\).*ed137a83b6bad60fb4677d60921a318c/s,
  );
  assert.match(source, /destinoCobranca/);
  assert.doesNotMatch(
    source,
    /update\s+internal_academic\.technical_manual_cycle_runs/i,
  );
  assert.doesNotMatch(source, /set\s+reviewed_items\s*=/i);
});

Deno.test("begin cerca recebível, run antigo, transação, autorização e fila exatos", async () => {
  const source = await readMigration(
    "20260930191100_begin_oneoff_technical_due_date_correction.sql",
  );
  for (
    const expected of [
      "22c59dbe-0d77-4c2f-8842-4327b1c17147",
      "4c47d993-aa6e-403e-8569-e89ce543fa5a",
      "340d0d1e-1171-41e9-95d2-b517b91bb450",
      "35190871-1521-5acc-b39d-d22759309b75",
      "ciclo-1-parc-12",
    ]
  ) assert.match(source, new RegExp(expected));
  assert.match(source, /technical_manual_oneoff_due_date_candidate/);
  assert.match(source, /state = 'REPLACEMENT_FENCED'/);
  assert.match(source, /'FENCED', 'CANCEL_INTENT', 'CANCEL_CONFIRMED'/);
  assert.match(source, /v_job\.status = 'RESET_COMPLETE'/);
  assert.match(source, /remote_cancel_situation_code = 5/);
  assert.doesNotMatch(source, /errcode = '40001'/);
  assert.doesNotMatch(
    source,
    /where\s+[^;]*turma_id\s*=\s*p_expected_turma_id\s*;/is,
  );
});

Deno.test("intenção durável precede qualquer PUT e não amplia o alvo", async () => {
  const [sql, worker, adapter] = await Promise.all([
    readMigration(
      "20260930191200_mark_oneoff_technical_due_date_cancel_intent.sql",
    ),
    Deno.readTextFile(new URL("./due-date-correction.ts", import.meta.url)),
    Deno.readTextFile(
      new URL("../banese/core/adapter/boleto-cancellation.ts", import.meta.url),
    ),
  ]);
  assert.match(sql, /cancel_mutation_intent_count >= 3/);
  assert.match(sql, /to_jsonb\(v_transaction\).*transaction_pre_snapshot/s);
  assert.match(sql, /queue\.state is distinct from 'REPLACEMENT_FENCED'/);
  assert.match(worker, /stopWhenPixAvailable:\s*false/);
  assert.match(worker, /onMutationStart:\s*async/);
  assert.match(
    worker,
    /mark_technical_due_date_cancel_intent_service/,
  );
  assert.match(worker, /\["CANCEL_INTENT", "CANCEL_CONFIRMED"\]/);
  assert.match(worker, /Replay após intenção de baixa é somente GET/);
  assert.doesNotMatch(worker, /fetch\s*\(/);
  assert.ok(
    adapter.indexOf("await input.onMutationStart?.()") <
      adapter.indexOf('method: "PUT"'),
  );
});

Deno.test("RPCs one-off usam nomes menores que o limite do PostgreSQL", async () => {
  const source = await readMigration(
    "20260930191500_shorten_oneoff_due_date_rpc_names.sql",
  );
  assert.match(
    source,
    /rename to mark_technical_due_date_cancel_intent_service/,
  );
  assert.match(
    source,
    /rename to prepare_technical_due_date_correction_service/,
  );
  assert.match(source, /notify pgrst, 'reload schema'/);
  assert.ok("mark_technical_due_date_cancel_intent_service".length <= 63);
  assert.ok("prepare_technical_due_date_correction_service".length <= 63);
});

Deno.test("bypass do reset reconhece service role pelo contrato atual", async () => {
  const source = await readMigration(
    "20260930191600_fix_oneoff_due_date_service_role_bypass.sql",
  );
  assert.match(
    source,
    /coalesce\(\(select auth\.role\(\)\), ''\) = 'service_role'/,
  );
  assert.doesNotMatch(
    source,
    /current_setting\(\s*'request\.jwt\.claim\.role'/,
  );
  assert.match(source, /remote_cancel_situation_code = 5/);
  assert.match(
    source,
    /to_jsonb\(receivable\) = overlay\.receivable_pre_snapshot/,
  );
});

Deno.test("reset exige code 5, arquiva, desanexa e gira data, termos e fingerprint", async () => {
  const [fence, prepare] = await Promise.all([
    readMigration("20260930191300_allow_oneoff_technical_due_date_reset.sql"),
    readMigration(
      "20260930191400_prepare_oneoff_technical_due_date_correction.sql",
    ),
  ]);
  assert.match(fence, /87090839a344c05ff7bde2c33c15cb3a/);
  assert.match(fence, /old\.data_vencimento = date '2027-10-15'/);
  assert.match(fence, /new\.data_vencimento = date '2026-10-15'/);
  assert.match(fence, /technical_manual_banese_expected_terms\(new\)/);
  assert.match(prepare, /p_confirmed_situation_code is distinct from 5/);
  assert.match(prepare, /technical_manual_banese_reissue_archive/);
  assert.match(prepare, /set receivable_id = null, remote_status = 'CANCELED'/);
  assert.match(prepare, /data_vencimento = p_corrected_due_date/);
  assert.match(prepare, /gateway_financial_terms = v_corrected_terms/);
  assert.match(prepare, /set receivable_fingerprint =/);
  assert.match(prepare, /queue\.state = 'DONE'/);
  assert.match(prepare, /status = 'RESET_COMPLETE'/);
  assert.match(prepare, /v_job\.status = 'CANCEL_CONFIRMED'/);
  assert.match(prepare, /requiresNewNossoNumero', true/);
  assert.doesNotMatch(prepare, /errcode = '40001'/);
  assert.doesNotMatch(
    prepare,
    /update\s+internal_academic\.technical_manual_cycle_runs/i,
  );
});

Deno.test("reemissão usa apenas resume do run antigo e bloqueia irmãos", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assert.match(source, /action:\s*"resume"/);
  assert.match(source, /receivableId !== internal\.receivableId/);
  assert.match(source, /não pode emitir outro recebível do run/);
  assert.doesNotMatch(source, /action:\s*"generate"/);
  assert.doesNotMatch(source, /preparar_emissao_ciclo/);
});

Deno.test("o mesmo recebível volta ao emissor e a fila sai de DONE para READY", async () => {
  const [issuer, queueBase, queueFence] = await Promise.all([
    Deno.readTextFile(
      new URL(
        "../technical-manual-cycle-issuance/receivable-issuance.ts",
        import.meta.url,
      ),
    ),
    readMigration("20260827224610_requeue_banese_post_settlement.sql"),
    readMigration("20260827224642_harden_banese_reconciliation_provenance.sql"),
  ]);
  assert.match(issuer, /p_receivable_id:\s*receivableId/);
  assert.match(issuer, /persistence\.data\?\.receivableId !== receivableId/);
  assert.match(issuer, /createGatewayCharge/);
  assert.match(queueFence, /new\.gateway_submission_status <> 'API_AMBIGUOUS'/);
  assert.match(queueBase, /else 'READY'/);
});

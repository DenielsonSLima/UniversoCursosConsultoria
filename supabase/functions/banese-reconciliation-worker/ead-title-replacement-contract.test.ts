import assert from "node:assert/strict";

const read = (relative: string) =>
  Deno.readTextFile(new URL(relative, import.meta.url));

Deno.test("substituicao EAD usa GET/baixa oficial e nunca reemite ambiguo", async () => {
  const [query, payments, cancel, worker] = await Promise.all([
    read("../banese/core/adapter/boleto-query.ts"),
    read("../banese/core/adapter/boleto-payment-query.ts"),
    read("../banese/core/adapter/boleto-cancellation.ts"),
    read("./ead-title-replacement.ts"),
  ]);
  assert.match(
    query,
    /\/convenios\/\$\{convenio\}\/boletos\/\$\{nossoNumero\}/,
  );
  assert.match(payments, /pagamentos\/efetivados/);
  assert.match(
    cancel,
    /\/convenios\/\$\{convenio\}\/boletos\/\$\{nossoNumero\}\/baixa/,
  );
  assert.match(cancel, /current\.situationCode === 2/);
  assert.match(worker, /persist_banese_ead_title_pix_before_cancel/);
  assert.match(
    worker,
    /beforeCheckout\.state === "AMBIGUOUS"[\s\S]*reconcileBaneseReceivable/,
  );
  assert.match(worker, /REPLACEMENT_AMBIGUOUS_TITLE_NOT_CONFIRMED/);
  assert.ok(
    worker.indexOf('beforeCheckout.state === "AMBIGUOUS"') <
      worker.lastIndexOf("reissueThroughOfficialCheckout"),
  );
});

Deno.test("migrations cercam somente EAD e arquivam o titulo antigo", async () => {
  const [enqueue, fence, guard, prepare, finish] = await Promise.all([
    read(
      "../../migrations/20260831231700_claim_ead_banese_title_replacement.sql",
    ),
    read("../../migrations/20260831231800_fence_ead_banese_remote_cancel.sql"),
    read(
      "../../migrations/20260901000400_guard_and_persist_ead_banese_replacement_pix.sql",
    ),
    read(
      "../../migrations/20260901000500_prepare_ead_banese_title_reissue.sql",
    ),
    read(
      "../../migrations/20260901000600_finish_ead_banese_title_replacement.sql",
    ),
  ]);
  for (const source of [enqueue, fence, prepare, finish]) {
    assert.match(source, /modalidade[\s\S]*EAD/i);
    assert.match(source, /banese_card/);
    assert.match(source, /BOLETO/);
  }
  assert.match(fence, /REPLACEMENT_FENCED/);
  assert.match(guard, /guard_banese_ead_reissue_receivable_route/);
  assert.match(guard, /persist_banese_ead_title_pix_before_cancel/);
  assert.match(
    prepare,
    /insert into public\.banese_ead_title_replacement_archive/,
  );
  assert.match(prepare, /set receivable_id = null, remote_status = 'CANCELED'/);
  assert.doesNotMatch(
    prepare,
    /delete\s+from\s+public\.payment_gateway_transactions/i,
  );
  assert.match(
    finish,
    /p_replacement_nosso_numero = v_job\.canceled_nosso_numero/,
  );
  assert.match(finish, /gateway_pix_payload/);
  assert.match(finish, /gateway_pix_encoded_image/);
});

Deno.test("retomada registrada converge inscricao sem segundo POST", async () => {
  const worker = await read("./ead-title-replacement.ts");
  const complete = worker.indexOf('classified.state !== "REGISTERED_COMPLETE"');
  const repair = worker.indexOf("repairCheckoutInscricao", complete);
  const finish = worker.indexOf("await finishJob", repair);
  assert.ok(complete >= 0 && repair > complete && finish > repair);
  assert.doesNotMatch(
    worker.slice(complete, finish),
    /createGatewayCharge|handleGatewayCheckout/,
  );
});

Deno.test("persistencia atomica grava transacao antes do recebivel", async () => {
  const [persistence, guard] = await Promise.all([
    read(
      "../../migrations/20260827224600_persist_banese_reconciliation_atomically.sql",
    ),
    read(
      "../../migrations/20260901000400_guard_and_persist_ead_banese_replacement_pix.sql",
    ),
  ]);
  const transactionInsert = persistence.indexOf(
    "insert into public.payment_gateway_transactions",
  );
  const transactionUpdate = persistence.indexOf(
    "update public.payment_gateway_transactions as transaction",
    transactionInsert,
  );
  const receivableUpdate = persistence.indexOf(
    "update public.contas_receber as receivable",
    transactionUpdate,
  );
  assert.ok(transactionInsert >= 0);
  assert.ok(transactionUpdate > transactionInsert);
  assert.ok(receivableUpdate > transactionUpdate);
  assert.match(
    guard,
    /gateway_boleto_nosso_numero is not null[\s\S]*<> v_candidate_nosso_numero/,
  );
  assert.doesNotMatch(
    guard,
    /new\.remote_payment_id is distinct from v_receivable\.gateway_boleto_nosso_numero/,
  );
  assert.match(
    guard,
    /gateway_submission_channel is null[\s\S]*gateway_submission_status is null[\s\S]*gateway_submission_channel = 'API'[\s\S]*gateway_submission_status = 'API_AMBIGUOUS'/,
  );
  assert.match(guard, /transaction\.remote_status = 'PAID'/);
});

Deno.test("titulo reemitido pago exige identidade bancaria e inscricao integrais", async () => {
  const [validator, finish] = await Promise.all([
    read(
      "../../migrations/20260901000550_validate_ead_banese_reissued_paid.sql",
    ),
    read(
      "../../migrations/20260901000600_finish_ead_banese_title_replacement.sql",
    ),
  ]);
  assert.match(
    validator,
    /concat\(substring\([\s\S]*gateway_boleto_codigo_barras/,
  );
  for (
    const required of [
      "v_inscription.aluno_id",
      "v_inscription.turma_id",
      "v_inscription.gateway_provider",
      "v_inscription.gateway_environment",
      "v_transaction.inscricao_online_id",
    ]
  ) {
    assert.ok(validator.includes(required), `${required} deve ser validado`);
  }
  assert.match(
    finish,
    /REISSUED_PAID[\s\S]*banese_ead_reissued_paid_identity_valid/,
  );
});

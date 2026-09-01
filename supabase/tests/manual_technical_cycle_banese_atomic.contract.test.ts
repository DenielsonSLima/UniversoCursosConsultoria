import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const termsSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260901120675_validate_integrated_manual_cycle_banese_terms.sql",
    import.meta.url,
  ),
);
const persistSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260901120700_persist_integrated_manual_cycle_banese.sql",
    import.meta.url,
  ),
);
const reviewStateSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260901120705_allow_banese_api_review_state.sql",
    import.meta.url,
  ),
);
const settlementFenceSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260901120708_add_manual_cycle_banese_settlement_fence.sql",
    import.meta.url,
  ),
);
const recoverySql = await Deno.readTextFile(
  new URL(
    "../migrations/20260901120710_resume_and_fail_integrated_manual_cycle_banese.sql",
    import.meta.url,
  ),
);
const reviewProjectionSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260901120715_distinguish_manual_cycle_banese_review_state.sql",
    import.meta.url,
  ),
);

const functionBody = (sql: string, name: string) => {
  const marker = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${
      name.replaceAll(".", "\\.")
    }\\s*\\(`,
    "i",
  );
  const match = marker.exec(sql);
  assert.ok(match, `função ausente: ${name}`);
  const end = sql.indexOf("$function$;", match.index);
  assert.ok(end > match.index, `fim ausente: ${name}`);
  return sql.slice(match.index, end + "$function$;".length);
};

Deno.test("persistência BolePix é service-only e grava transação antes do recebível", () => {
  const body = functionBody(
    persistSql,
    "public.persist_technical_manual_cycle_banese_issuance",
  );
  assert.match(body, /auth\.role\(\)[\s\S]*?'service_role'/i);
  assert.match(
    persistSql,
    /revoke all on function[\s\S]*?persist_technical_manual_cycle_banese_issuance[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to service_role;/i,
  );
  assert.doesNotMatch(
    persistSql,
    /grant execute[\s\S]{0,180}?persist_technical_manual_cycle_banese_issuance[\s\S]{0,180}?to authenticated/i,
  );
  const insertAt = body.indexOf(
    "insert into public.payment_gateway_transactions",
  );
  const contextAt = body.indexOf(
    "app.technical_manual_cycle_atomic_receivable_id",
  );
  const receivableAt = body.indexOf("update public.contas_receber receivable");
  assert.ok(insertAt >= 0 && insertAt < contextAt && contextAt < receivableAt);
  assert.match(body, /gateway_boleto_issued_at\s*=\s*v_now/i);
  assert.match(body, /gateway_submission_status\s*=\s*'API_REGISTERED'/i);
  assert.match(body, /gateway_creation_token\s*=\s*null/i);
});

Deno.test("resultado exige snapshot v2, autorização, ownership e termos congelados", () => {
  const terms = functionBody(
    termsSql,
    "internal_academic.technical_manual_banese_expected_terms",
  );
  const persist = functionBody(
    persistSql,
    "public.persist_technical_manual_cycle_banese_issuance",
  );
  assert.match(terms, /'versao'\)::integer, 0\)\s*<>\s*2/i);
  for (
    const field of [
      "requestId",
      "cicloNumero",
      "regraFingerprint",
      "politicaFingerprint",
      "cronogramaFingerprint",
      "multaAtrasoPercentual",
      "multaAtrasoValor",
    ]
  ) assert.match(terms, new RegExp(`'${field}'`, "i"));
  assert.match(
    terms,
    /origem_cronograma_id is distinct from \([\s\S]*?case v_kind[\s\S]*?end[\s\S]*?\)\s*then/i,
  );
  assert.match(
    terms,
    /round\(v_fine_value, 2\)[\s\S]*?round\(p_receivable\.valor \* v_fine_percent \/ 100\.0, 2\)/i,
  );
  assert.match(terms, /'type', 'percentage'[\s\S]*?'startsOn'/i);
  assert.match(
    persist,
    /technical_manual_receivable_issuance_authorizations[\s\S]*?request_id\s*=\s*p_authorization_request_id/i,
  );
  assert.match(persist, /first_claimed_at is null[\s\S]*?claim_count < 1/i);
  assert.match(
    persist,
    /receivable_fingerprint is distinct from[\s\S]*?technical_manual_receivable_issuance_fingerprint/i,
  );
  assert.match(
    persist,
    /gateway_creation_token is distinct from[\s\S]*?p_expected_creation_token/i,
  );
  assert.match(
    persist,
    /gateway_financial_terms is distinct from v_expected_terms[\s\S]*?p_result -> 'financialTerms' is distinct from v_expected_terms/i,
  );
});

Deno.test("Edge valida os termos no mesmo helper SQL antes do POST", () => {
  const service = functionBody(
    termsSql,
    "public.technical_manual_banese_expected_terms_service",
  );
  assert.match(service, /auth\.role\(\)[\s\S]*?'service_role'/i);
  assert.match(
    service,
    /internal_academic\.technical_manual_banese_expected_terms\([\s\S]*?v_receivable/i,
  );
  assert.match(
    termsSql,
    /revoke all on function[\s\S]*?technical_manual_banese_expected_terms_service\(uuid\)[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?grant execute[\s\S]*?to service_role;/i,
  );
});

Deno.test("identidade bancária e par Pix são validados e únicos no ciclo", () => {
  const persist = functionBody(
    persistSql,
    "public.persist_technical_manual_cycle_banese_issuance",
  );
  const complete = functionBody(
    persistSql,
    "internal_academic.technical_manual_banese_receivable_complete",
  );
  assert.match(
    persist,
    /coalesce\(v_our_number, ''\) !~ '\^\[0-9\]\{9\}\$'/i,
  );
  assert.match(persist, /coalesce\(v_line, ''\) !~ '\^0479\[0-9\]\{43\}\$'/i);
  assert.match(
    persist,
    /coalesce\(v_barcode, ''\) !~ '\^0479\[0-9\]\{40\}\$'/i,
  );
  assert.match(
    persist,
    /substring\(v_barcode from 31 for 9\) <> v_our_number/i,
  );
  assert.match(
    persist,
    /concat\(substring\(v_line from 1 for 4\)[\s\S]*?<> v_barcode/i,
  );
  assert.match(
    persist,
    /BR\[\.\]GOV\[\.\]BCB\[\.\]PIX[\s\S]*?6304\[0-9A-Fa-f\]\{4\}/i,
  );
  assert.match(persist, /data:image\/\(png\|jpeg\);base64/i);
  assert.match(persist, /v_remote_status <> 'PENDING'/i);
  assert.match(
    complete,
    /p_receivable\.gateway_status, ''\)\) <> 'PENDING'/i,
  );
  assert.match(
    complete,
    /transaction\.origin_polo_id = p_receivable\.polo_id/i,
  );
  assert.match(
    complete,
    /transaction\.issuer_polo_id = p_receivable\.gateway_issuer_polo_id/i,
  );
  for (
    const field of [
      "gateway_boleto_nosso_numero",
      "gateway_boleto_linha_digitavel",
      "gateway_boleto_codigo_barras",
      "gateway_pix_payload",
    ]
  ) assert.match(complete, new RegExp(`sibling\\.${field}`, "i"));
  assert.match(complete, /return v_total = 1 and v_matching = 1/i);
});

Deno.test("conciliação ambígua possui backoff, idade máxima e fences", () => {
  const claim = functionBody(
    recoverySql,
    "public.claim_technical_manual_cycle_banese_reconciliation",
  );
  assert.match(claim, /auth\.role\(\)[\s\S]*?'service_role'/i);
  assert.match(
    claim,
    /gateway_submission_status is distinct from 'API_AMBIGUOUS'/i,
  );
  assert.match(
    claim,
    /gateway_creation_token is distinct from[\s\S]*?p_expected_creation_token/i,
  );
  assert.match(claim, /v_age >= interval '7 days'/i);
  assert.match(claim, /gateway_submission_status = 'API_REVIEW'/i);
  assert.match(claim, /v_age < interval '6 hours'.*interval '1 minute'/i);
  assert.match(claim, /v_age < interval '24 hours'.*interval '5 minutes'/i);
  assert.match(claim, /else interval '1 hour'/i);
  assert.match(claim, /last_claimed_at > v_now - v_cooldown/i);
  assert.match(
    claim,
    /'claimed', false, 'retryAfterSeconds', v_retry_seconds/i,
  );
  assert.match(
    claim,
    /set last_claimed_at = v_now,[\s\S]*?claim_count = claim_count \+ 1/i,
  );
  assert.match(claim, /gateway_settlement_recorded_at is not null/i);
  assert.match(claim, /gateway_transaction_receipt_url is not null/i);
});

Deno.test("API_REVIEW é aceito somente como terminal após ambiguidade", () => {
  assert.match(
    reviewStateSql,
    /gateway_submission_status in \([\s\S]*?'API_AMBIGUOUS'[\s\S]*?'API_REGISTERED'[\s\S]*?'API_REVIEW'/i,
  );
  assert.match(
    reviewStateSql,
    /gateway_submission_channel = 'API'[\s\S]*?gateway_submission_status in \([\s\S]*?'API_REVIEW'/i,
  );
  const fence = functionBody(
    reviewStateSql,
    "public.enforce_receivable_gateway_submission_fence",
  );
  assert.match(
    fence,
    /when 'API_AMBIGUOUS' then new\.gateway_submission_status in[\s\S]*?\('API_REGISTERED', 'API_REVIEW'\)/i,
  );
  assert.match(fence, /when 'API_REGISTERED' then false/i);
  assert.match(fence, /when 'API_REVIEW' then false/i);
});

Deno.test("replay só passa com a mesma tentativa e transação canônica", () => {
  const persist = functionBody(
    persistSql,
    "public.persist_technical_manual_cycle_banese_issuance",
  );
  assert.match(
    persist,
    /gateway_submission_status = 'API_REGISTERED'[\s\S]*?technical_manual_banese_receivable_complete/i,
  );
  assert.match(
    persist,
    /manualCycleIssuance[\s\S]*?attemptToken[\s\S]*?p_expected_creation_token/i,
  );
  assert.match(
    persist,
    /authorizationRequestId[\s\S]*?p_authorization_request_id/i,
  );
  assert.match(
    persist,
    /resultFingerprint[\s\S]*?v_result_fingerprint/i,
  );
  assert.match(
    persist,
    /gateway_payment_id is distinct from[\s\S]*?remotePaymentId/i,
  );
  assert.match(
    persist,
    /gateway_status is distinct from v_remote_status/i,
  );
  assert.match(
    persist,
    /gateway_financial_terms is distinct from[\s\S]*?financialTerms/i,
  );
  assert.match(
    persist,
    /'nossoNumero',\s*v_receivable\.gateway_boleto_nosso_numero/i,
  );
  assert.match(persist, /'replayed', true/i);
});

Deno.test("persistência serializa o ciclo e repete o fence de liquidação no CAS", () => {
  const persist = functionBody(
    persistSql,
    "public.persist_technical_manual_cycle_banese_issuance",
  );
  assert.match(
    persist,
    /technical-manual-banese-cycle:[\s\S]*?v_run\.matricula_id[\s\S]*?v_run\.cycle_number/i,
  );
  assert.match(
    persist,
    /upper\(coalesce\(v_receivable\.status, ''\)\) not in \('PENDENTE', 'VENCIDO'\)/i,
  );
  assert.match(
    persist,
    /upper\(coalesce\(receivable\.status, ''\)\) in \('PENDENTE', 'VENCIDO'\)/i,
  );
  for (
    const field of [
      "data_pagamento",
      "valor_pago",
      "manual_settlement_id",
      "gateway_settlement_channel",
      "gateway_settlement_source",
      "gateway_settlement_evidence",
      "gateway_settlement_recorded_at",
      "gateway_transaction_receipt_url",
    ]
  ) {
    assert.match(
      persist,
      new RegExp(`v_receivable\\.${field} is not null`, "i"),
    );
    assert.match(persist, new RegExp(`receivable\\.${field} is null`, "i"));
  }
});

Deno.test("falha pré-remota libera claim e ambiguidade nunca libera novo POST", () => {
  const failure = functionBody(
    recoverySql,
    "public.mark_technical_manual_cycle_banese_failure",
  );
  assert.match(
    failure,
    /not coalesce\(p_remote_payment_may_exist, false\)[\s\S]*?gateway_submission_channel is not null[\s\S]*?gateway_payment_id is not null[\s\S]*?payment_gateway_transactions/i,
  );
  assert.match(failure, /gateway_invoice_url is not null/i);
  assert.match(failure, /gateway_bank_slip_url is not null/i);
  assert.match(failure, /gateway_transaction_receipt_url is not null/i);
  assert.match(
    failure,
    /set gateway_status = null, gateway_creation_token = null/i,
  );
  assert.match(
    failure,
    /set gateway_submission_channel = 'API',[\s\S]*?p_retryable_reconciliation[\s\S]*?'API_AMBIGUOUS'[\s\S]*?'API_REVIEW'/i,
  );
  assert.match(failure, /p_diagnostic_code/i);
  assert.match(failure, /CICLO_MANUAL_BANESE_RETRY_/i);
  assert.match(failure, /CICLO_MANUAL_BANESE_REVISAO/i);
  assert.match(failure, /'PENDENTE_RETOMADA'/i);
  assert.match(failure, /'EM_REVISAO'/i);
});

Deno.test("falha controlada rejeita qualquer evidência de liquidação", () => {
  const settlementFence = functionBody(
    settlementFenceSql,
    "internal_academic.technical_manual_banese_has_settlement_evidence",
  );
  const failure = functionBody(
    recoverySql,
    "public.mark_technical_manual_cycle_banese_failure",
  );
  for (
    const field of [
      "data_pagamento",
      "valor_pago",
      "manual_settlement_id",
      "manual_settlement_principal_cents",
      "manual_settlement_interest_cents",
      "manual_settlement_penalty_cents",
      "manual_settlement_addition_cents",
      "manual_settlement_discount_cents",
      "manual_settlement_received_cents",
      "manual_settlement_reversed_at",
      "gateway_settlement_channel",
      "gateway_settlement_source",
      "gateway_settlement_evidence",
      "gateway_settlement_recorded_at",
      "gateway_transaction_receipt_url",
    ]
  ) assert.match(settlementFence, new RegExp(`${field} is not null`, "i"));
  const fenceAt = failure.indexOf(
    "technical_manual_banese_has_settlement_evidence",
  );
  assert.ok(
    fenceAt >= 0 && fenceAt < failure.indexOf("update public.contas_receber"),
  );
});

Deno.test("resume projeta somente progresso estrito e não expõe PII textual", () => {
  const resume = functionBody(
    recoverySql,
    "public.obter_emissao_ciclo_financeiro_tecnico_manual_service",
  );
  assert.match(resume, /run\.state = 'LOCAL_CREATED'/i);
  assert.match(resume, /technical_manual_banese_receivable_complete/i);
  assert.match(resume, /gateway_pix_encoded_image is not null/i);
  assert.match(resume, /gateway_submission_status is not null/i);
  assert.match(resume, /gateway_boleto_nosso_numero/i);
  assert.match(
    resume,
    /p_matricula_id is null or p_ciclo_numero is null[\s\S]*?not in \(1, 2\)/i,
  );
  for (
    const field of [
      "requestId",
      "matriculaId",
      "turmaId",
      "poloId",
      "numero",
      "status",
      "quantidadeItens",
      "total",
      "emitidosBanese",
      "pendentesEmissao",
      "emRevisao",
      "recebiveis",
      "emissaoBanese",
      "cicloManual",
    ]
  ) assert.match(resume, new RegExp(`'${field}'`, "i"));
  assert.match(resume, /'EMITIDO_BANESE'/i);
  assert.doesNotMatch(
    resume,
    /cpf|cnpj|email|telefone|endereco|data_nascimento/i,
  );
});

Deno.test("projeção separa ambiguidade retomável de revisão manual terminal", () => {
  const resume = functionBody(
    recoverySql,
    "public.obter_emissao_ciclo_financeiro_tecnico_manual_service",
  );
  const reviewAt = resume.indexOf(
    "v_receivable.gateway_submission_status = 'API_REVIEW'",
  );
  const manualAt = resume.indexOf("v_item_state := 'REVISAO_MANUAL'");
  const resumableAt = resume.indexOf("v_item_state := 'REVISAO'", manualAt + 1);
  assert.ok(reviewAt >= 0 && reviewAt < manualAt && manualAt < resumableAt);
  assert.match(
    resume,
    /'REVISAO_MANUAL'; v_review := v_review \+ 1;[\s\S]*?'REVISAO';[\s\S]*?'pendentesEmissao', greatest\(v_run\.item_count - v_emitted - v_review, 0\)/i,
  );
  const state = functionBody(
    reviewProjectionSql,
    "internal_academic.technical_manual_cycle_state",
  );
  assert.match(
    state,
    /count\(\*\) filter \(\s*where receivable\.gateway_submission_status = 'API_REVIEW'\s*\)::integer/i,
  );
  assert.doesNotMatch(state, /gateway_submission_status = 'API_AMBIGUOUS'/i);
});

Deno.test("migrations manuais respeitam teto e não executam rede", () => {
  const combinedSql =
    `${termsSql}\n${persistSql}\n${reviewStateSql}\n${settlementFenceSql}\n${recoverySql}\n${reviewProjectionSql}`;
  assert.ok(termsSql.split("\n").length <= 500);
  assert.ok(persistSql.split("\n").length <= 500);
  assert.ok(reviewStateSql.split("\n").length <= 500);
  assert.ok(settlementFenceSql.split("\n").length <= 500);
  assert.ok(recoverySql.split("\n").length <= 500);
  assert.ok(reviewProjectionSql.split("\n").length <= 500);
  assert.doesNotMatch(combinedSql, /http|net\.|fetch\s*\(/i);
  assert.doesNotMatch(combinedSql, /\bauthorization\.\*/i);
});

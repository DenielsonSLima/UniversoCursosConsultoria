import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const files = [
  "20261001010000_create_imported_cycle_facts.sql",
  "20261001010100_capture_imported_banese_cycle_facts.sql",
  "20261001010150_capture_external_cycle_coverage_facts.sql",
  "20261001010175_allow_seed_imported_cycle_review.sql",
  "20261001010200_apply_imported_cycle_fact_guards.sql",
  "20261001010250_allow_imported_banese_c1_continuation.sql",
];
const sql = Object.fromEntries(files.map((file) => [file, readFileSync(
  resolve(root, "supabase/migrations", file), "utf8",
)]));
const allSql = Object.values(sql).join("\n");
const baneseContinuationFixture = readFileSync(resolve(
  root,
  "supabase/tests/imported_banese_c1_continuation.rollback.sql",
), "utf8");

test("fato é privado, imutável e único por matrícula+ciclo", () => {
  const core = sql[files[0]];
  assert.match(core, /primary key \(matricula_id, cycle_number\)/i);
  assert.match(core, /enable row level security/i);
  assert.match(
    core,
    /revoke all on internal_academic\.technical_imported_cycle_facts[\s\S]*?service_role/i,
  );
  assert.match(core, /before update or delete[\s\S]*?immutable/i);
  assert.match(core, /technical_imported_cycle_fact_conflicts/i);
  assert.match(core, /pg_advisory_xact_lock[\s\S]*?matricula_id[\s\S]*?cycle_number/i);
  assert.match(
    core,
    /for v_candidate[\s\S]*?lock_technical_imported_cycle_fact[\s\S]*?insert into internal_academic\.technical_imported_cycle_facts/i,
  );
  assert.doesNotMatch(core, /on delete cascade/i);
});

test("prova positiva futura cria fato; UNKNOWN jamais cria nem apaga", () => {
  const core = sql[files[0]];
  const coverage = sql[files[2]];
  assert.match(
    core,
    /after insert on internal_proesc\.cycle_evidence_requests/i,
  );
  assert.match(core, /verification'[\s\S]*?'CONFIRMED'/i);
  assert.match(core, /v_classification not in \('C1', 'FULL'\)/i);
  assert.match(core, /completeApiWindow[\s\S]*?derived[\s\S]*?sourceHash/i);
  assert.match(core, /obligation_manifest_hash[\s\S]*?manifestHash/i);
  assert.match(core, /unitId[\s\S]*?classId[\s\S]*?personHash/i);
  assert.match(core, /UNKNOWN itself never creates a fact/i);
  assert.doesNotMatch(core, /cycle_review_cache|token_revision|connection token/i);
  assert.match(
    coverage,
    /after insert or update[\s\S]*?technical_external_cycle_coverage/i,
  );
});

test("Banese importado exige run, 100% dos títulos e transação canônica", () => {
  const banese = sql[files[1]];
  assert.match(banese, /state = 'PROTECTED_EXISTING'/i);
  assert.match(banese, /cardinality\(run\.receivable_ids\) = run\.item_count/i);
  assert.match(banese, /count\(distinct receivable\.id\)[\s\S]*?= run\.item_count/i);
  assert.match(banese, /gateway_provider[\s\S]*?in \([\s\S]*?'banese'[\s\S]*?'banese_card'/i);
  assert.doesNotMatch(banese, /gateway_submission_status\s*=/i);
  assert.match(banese, /select count\(\*\)[\s\S]*?payment_gateway_transactions[\s\S]*?\) = 1/i);
  assert.match(banese, /gateway_tx\.environment = receivable\.gateway_environment/i);
  assert.match(banese, /bank_slip_our_number[\s\S]*?gateway_boleto_nosso_numero/i);
  assert.match(banese, /remote_payment_id = receivable\.gateway_payment_id/i);
  assert.match(banese, /gateway_tx\.amount = receivable\.valor/i);
  assert.match(banese, /technical_imported_receivable_provenance/i);
  assert.match(banese, /technical_imported_banese_cycle_is_durable/i);
  assert.match(banese, /run\.state = 'PROTECTED_EXISTING'/i);
  assert.match(banese, /factRecorded[\s\S]*?conflictRecorded/i);
  assert.doesNotMatch(
    banese,
    /insert\s+into\s+public\.(contas_receber|payment_gateway_transactions)/i,
  );
});

test("C1 durável libera só C2 e C2 confirmado cerca duplicidade", () => {
  const guards = sql[files[4]];
  const baneseContinuation = sql[files[5]];
  assert.match(
    guards,
    /technical_imported_cycle_has_confirmed\([\s\S]*?enrollment\.id, 1[\s\S]*?not internal_academic\.technical_imported_cycle_exists\(enrollment\.id, 2\)/i,
  );
  assert.match(guards, /upper\(enrollment\.status\) in \('ATIVO', 'PENDENTE'\)/i);
  assert.match(guards, /matriculas_tecnicas_financeiro_config/i);
  assert.match(guards, /not internal_academic\.technical_cycle_history_outside_enrollment/i);
  assert.match(guards, /technical_external_cycle_coverage/i);
  assert.match(guards, /source_cycle in \('SECOND', 'FULL_CONTRACT'\)/i);
  assert.match(guards, /pg_current_xact_id_if_assigned\(\)::xid/i);
  assert.match(guards, /run\.state = 'GENERATING'/i);
  assert.match(
    guards,
    /technical_imported_banese_cycle_is_durable[\s\S]*?cycle_number = 1[\s\S]*?PROTECTED_EXISTING[\s\S]*?cycle_number = 2[\s\S]*?GENERATING/i,
  );
  assert.match(
    guards,
    /estado' <> 'PROTEGIDO_EXISTENTE'[\s\S]*?technical_imported_banese_cycle_is_durable/i,
  );
  assert.match(
    baneseContinuation,
    /technical_imported_banese_local_c2_is_valid[\s\S]*?LOCAL_CREATED[\s\S]*?cicloManual,requestId[\s\S]*?cicloManual,cicloNumero/i,
  );
  assert.match(
    baneseContinuation,
    /technical_imported_banese_c2_claim_is_current[\s\S]*?technical_imported_cycle_generation_permitted[\s\S]*?pg_current_xact_id_if_assigned/i,
  );
  assert.match(
    baneseContinuation,
    /technical_imported_banese_receivable_is_local_c2[\s\S]*?LOCAL_CREATED[\s\S]*?receivable_ids/i,
  );
  assert.match(
    baneseContinuation,
    /guard_technical_manual_cycle_insert[\s\S]*?is_technical_manual_cycle_protected[\s\S]*?technical_imported_banese_c2_claim_is_current/i,
  );
  assert.match(
    baneseContinuation,
    /authorize_technical_manual_receivable_issuance_secure[\s\S]*?technical_imported_banese_receivable_is_local_c2/i,
  );
  assert.match(
    baneseContinuation,
    /guard_manual_technical_receivable_first_bank_claim[\s\S]*?v_protected_enrollment[\s\S]*?technical_imported_banese_receivable_is_local_c2/i,
  );
  assert.match(
    baneseContinuation,
    /guard_protected_technical_bank_post[\s\S]*?is_technical_manual_cycle_protected[\s\S]*?technical_imported_banese_receivable_is_local_c2/i,
  );
  assert.doesNotMatch(
    baneseContinuation,
    /create or replace function internal_academic\.is_technical_manual_cycle_protected/i,
  );
  assert.match(guards, /PROESC_CONTRATO_EXTERNO/i);
  assert.match(guards, /HISTORICO_IMPORTADO_IDENTIDADE_DIVERGENTE/i);
  assert.match(guards, /CICLO_IMPORTADO_ORIGENS_CONFLITANTES/i);
  assert.match(
    guards,
    /assert_fresh_cycle_generation[\s\S]*?technical_imported_cycle_has_conflict[\s\S]*?raise exception[\s\S]*?technical_imported_cycle_exists[\s\S]*?raise exception/i,
  );
  assert.doesNotMatch(
    guards,
    /api_cycle_schedule_(is_fresh|matches_source)|cycle_review_cache|token_revision/i,
  );
});

test("revisão assistida vale para qualquer seed confirmado sem aceitar prova vazia", () => {
  const assisted = sql[files[3]];
  assert.match(
    assisted,
    /batch_id IS NULL[\s\S]*?financial_mode='CICLO1_PROESC'/i,
  );
  assert.match(assisted, /complete contract and[\s\S]*?obligation-by-obligation/i);
  assert.match(assisted, /LEFT JOIN internal_proesc\.obligation_imports/i);
  assert.match(assisted, /v_scope\.batch_id IS NULL[\s\S]*?source_person_hash/i);
  assert.doesNotMatch(assisted, /ENF-T42|class\.codigo/i);
  assert.match(assisted, /to service_role/i);
  assert.doesNotMatch(assisted, /to authenticated/i);
});

test("fixture Banese percorre estado, INSERT e claims reais sem liberar o C1", () => {
  assert.match(
    baneseContinuationFixture,
    /technical_manual_cycle_state[\s\S]*?'ELEGIVEL'[\s\S]*?'proximoCicloNumero'/i,
  );
  assert.match(
    baneseContinuationFixture,
    /set gateway_creation_token = gen_random_uuid\(\)[\s\S]*?v_c1_receivable[\s\S]*?unexpectedly accepted a first bank claim/i,
  );
  assert.match(
    baneseContinuationFixture,
    /cycle_number, state, request_id[\s\S]*?2, 'GENERATING'[\s\S]*?insert into public\.contas_receber[\s\S]*?v_c2_receivable/i,
  );
  assert.match(
    baneseContinuationFixture,
    /technical_manual_receivable_issuance_authorizations[\s\S]*?technical_manual_receivable_issuance_fingerprint[\s\S]*?issuance_auth\.claim_count = 1/i,
  );
  assert.match(
    baneseContinuationFixture,
    /not internal_academic\.technical_imported_cycle_generation_permitted[\s\S]*?FIXTURE DUPLICIDADE PROIBIDA[\s\S]*?was not blocked/i,
  );
  assert.match(baneseContinuationFixture, /rollback;\s*$/i);
});

test("manifesto mantém arquivos manuais abaixo do teto e não toca ledger/banco", () => {
  for (const file of files) {
    assert.ok(
      sql[file].split(/\r?\n/).length <= 500,
      `${file} ultrapassou 500 linhas`,
    );
  }
  assert.doesNotMatch(
    allSql,
    /(?:insert\s+into|update|delete\s+from)\s+public\.contas_receber/i,
  );
  assert.doesNotMatch(
    allSql,
    /(?:insert\s+into|update|delete\s+from)\s+public\.payment_gateway_transactions/i,
  );
  assert.doesNotMatch(allSql, /https?:\/\/|banese-cnab240-api|net\.http/i);
});

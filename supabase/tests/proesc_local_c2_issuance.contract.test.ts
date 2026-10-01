import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(resolve(
  root,
  "supabase/migrations/20261001091400_allow_external_proesc_c1_local_c2_issuance.sql",
), "utf8");
const fixture = readFileSync(resolve(
  root,
  "supabase/tests/proesc_local_c2_issuance.rollback.sql",
), "utf8");
const baneseFixture = readFileSync(resolve(
  root,
  "supabase/tests/imported_banese_c1_continuation.rollback.sql",
), "utf8");

test("helpers are volatile, locked and private", () => {
  for (const name of [
    "technical_external_proesc_local_c2_is_valid",
    "technical_imported_c1_receivable_is_local_c2",
  ]) {
    const start = migration.indexOf(`create function\ninternal_academic.${name}`);
    const body = migration.slice(start, migration.indexOf("$function$;", start));
    assert.ok(start >= 0, `${name} missing`);
    assert.match(body, /language plpgsql[\s\S]*?volatile/i);
    const enrollmentLock = body.indexOf("pg_try_advisory_xact_lock");
    const factLock = body.indexOf("lock_technical_imported_cycle_fact");
    assert.ok(
      enrollmentLock >= 0 && enrollmentLock < factLock,
      `${name} must try the enrollment lock before taking the C2 fact lock`,
    );
    assert.match(body, /technical-manual-cycle-enrollment:/i);
    assert.match(body, /p_matricula_id, 2/i);
  }
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function[\s\S]*?technical_external_proesc_local_c2_is_valid\(uuid\),[\s\S]*?technical_imported_c1_receivable_is_local_c2\(uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
});

test("common C2 fence precedes both Banese and Proesc positive lanes", () => {
  const wrapper = migration.slice(
    migration.indexOf("technical_imported_c1_receivable_is_local_c2"),
    migration.indexOf("do $patch_guards$"),
  );
  const c2Fence = wrapper.indexOf("technical_imported_cycle_exists");
  const baneseLane = wrapper.indexOf(
    "technical_imported_banese_receivable_is_local_c2",
  );
  const proescLane = wrapper.indexOf(
    "technical_external_proesc_local_c2_is_valid",
  );
  assert.ok(c2Fence >= 0 && c2Fence < baneseLane && baneseLane < proescLane);
  assert.match(wrapper, /technical_imported_cycle_has_conflict/i);
  assert.match(wrapper, /classification = 'FULL'[\s\S]*?has_external_cycle2 is true/i);
  assert.match(wrapper, /technical_external_cycle_coverage/i);
  assert.match(wrapper, /source_cycle in \('SECOND', 'FULL_CONTRACT'\)/i);
});

test("Proesc lane proves exact reviewed bank membership and identity", () => {
  assert.match(migration, /administration_origin = 'EXTERNAL_PROESC'/i);
  assert.match(migration, /source_system = 'PROESC'/i);
  assert.match(migration, /run\.cycle_number = 2[\s\S]*?run\.state = 'LOCAL_CREATED'/i);
  assert.match(migration, /jsonb_array_length\(run\.reviewed_items\) = run\.item_count/i);
  assert.match(migration, /p_receivable_id = any\(run\.receivable_ids\)/i);
  assert.match(migration, /receivable\.cliente_id = enrollment\.aluno_id/i);
  assert.match(migration, /receivable\.polo_id = class\.polo_id/i);
  assert.match(migration, /\{cicloManual,requestId\}/i);
  assert.match(migration, /\{cicloManual,cicloNumero\}' = '2'/i);
  assert.match(migration, /destinoCobranca' = 'BANESE'/i);
  assert.match(migration, /<> 'SISTEMA_ANTERIOR'/i);
  assert.match(migration, /obligation_links/i);
});

test("patch is limited to the three post-creation issuance guards", () => {
  for (const signature of [
    "public.authorize_technical_manual_receivable_issuance_secure(uuid,uuid)",
    "internal_academic.guard_manual_technical_receivable_first_bank_claim()",
    "internal_academic.guard_protected_technical_bank_post()",
  ]) {
    assert.ok(migration.includes(`'${signature}'`), `${signature} missing`);
  }
  assert.match(
    migration,
    /v_old text := 'technical_imported_banese_receivable_is_local_c2'[\s\S]*?v_new text := 'technical_imported_c1_receivable_is_local_c2'/i,
  );
  assert.doesNotMatch(
    migration,
    /create (?:or replace )?function internal_academic\.(?:technical_imported_cycle_generation_permitted|is_technical_manual_cycle_protected|guard_technical_manual_cycle_insert)/i,
  );
  assert.doesNotMatch(
    migration,
    /create (?:or replace )?function public\.(?:gerar|preparar)_emissao_ciclo_financeiro_tecnico_manual/i,
  );
  assert.doesNotMatch(
    migration,
    /(?:insert into|update|delete from) public\.(?:contas_receber|payment_gateway_transactions)/i,
  );
});

test("transactional fixtures cross real RPC/claim and fail closed", () => {
  assert.match(fixture, /preparar_emissao_ciclo_financeiro_tecnico_manual_secure/i);
  assert.match(fixture, /obter_emissao_ciclo_financeiro_tecnico_manual_service/i);
  assert.match(fixture, /quantidadeItens}' = '13'[\s\S]*?emitidosBanese}' = '0'/i);
  assert.match(fixture, /authorize_technical_manual_receivable_issuance_secure/i);
  assert.match(
    fixture,
    /set gateway_creation_token = v_attempt,[\s\S]*?gateway_submission_channel = 'API',[\s\S]*?gateway_submission_status = 'API_AMBIGUOUS'/i,
  );
  assert.match(fixture, /authz\.claim_count = 1[\s\S]*?authz\.first_claimed_at is not null/i);
  for (const negative of [
    "Missing proof", "Imported Proesc C2", "Hybrid local C1 history",
    "Paid C2", "LOCAL destination", "Changed Proesc scope",
    "foreign polo", "foreign person", "duplicate technical title",
  ]) assert.match(fixture, new RegExp(negative, "i"));
  assert.match(fixture, /lock_technical_imported_cycle_fact\(v_enrollment, 2\)/i);
  assert.match(fixture, /rollback;\s*$/i);
});

test("Banese positive lane is retained but an external C2 closes it", () => {
  assert.match(
    baneseFixture,
    /technical_imported_c1_receivable_is_local_c2\([\s\S]*?valid Banese continuation/i,
  );
  assert.match(
    baneseFixture,
    /lock_technical_imported_cycle_fact\([\s\S]*?v_enrollment, 2[\s\S]*?cycle_number[\s\S]*?EXTERNAL_PROESC[\s\S]*?v_sqlstate = '42501'/i,
  );
  assert.match(baneseFixture, /rollback to the valid positive lane/i);
});

test("manifest remains bounded and contains no network operation", () => {
  for (const [name, source] of [
    ["migration", migration], ["fixture", fixture],
    ["banese fixture", baneseFixture],
  ] as const) {
    assert.ok(source.split(/\r?\n/).length <= 500, `${name} exceeds 500 lines`);
    assert.doesNotMatch(source, /https?:\/\/|net\.http|banese-cnab240-api/i);
  }
});

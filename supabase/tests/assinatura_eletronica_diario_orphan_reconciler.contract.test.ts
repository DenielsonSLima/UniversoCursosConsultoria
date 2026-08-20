// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260819203338_add_diario_artifact_orphan_reconciler.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

const reserve = functionBlock(
  "public.assinatura_eletronica_internal_reservar_upload_diario(",
);
const intentTrigger = functionBlock(
  "public.assinatura_eletronica_exigir_upload_intent_diario(",
);
const claim = functionBlock(
  "public.assinatura_eletronica_internal_claim_uploads_orfaos(",
);
const validate = functionBlock(
  "public.assinatura_eletronica_internal_validar_claim_orfao(",
);
const complete = functionBlock(
  "public.assinatura_eletronica_internal_concluir_cleanup_upload(",
);
const report = functionBlock(
  "public.assinatura_eletronica_internal_reportar_cleanup_upload(",
);

Deno.test("migration é incremental, atômica e nunca apaga Storage por SQL", () => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+storage\.objects/i);
  assert.doesNotMatch(sql, /UPDATE\s+storage\.objects/i);
  assert.doesNotMatch(sql, /TRUNCATE\s+storage\.objects/i);
});

Deno.test("intenção congela path, classe, tamanho e hash antes do upload", () => {
  assert.match(
    sql,
    /CREATE TABLE public\.assinatura_eletronica_upload_intents/i,
  );
  assert.match(
    sql,
    /UNIQUE \(envelope_id, classe\)[\s\S]*?UNIQUE \(bucket_id, storage_path\)/i,
  );
  assert.match(
    sql,
    /storage_path = 'envelopes\/' \|\| envelope_id::text[\s\S]*?documento-original\.pdf[\s\S]*?documento-final\.pdf[\s\S]*?comprovante-evidencia\.pdf/i,
  );
  assert.match(
    sql,
    /sha256 text NOT NULL CHECK \(sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/i,
  );
  assert.match(sql, /expira_em > reservado_em/i);
  assert.match(sql, /interval '30 minutes'/i);
  assert.match(
    sql,
    /estado = 'EM_LIMPEZA'[\s\S]*?cleanup_lease_token IS NOT NULL/i,
  );
});

Deno.test("reserva revalida ator/sessão/preflight e só permite rebind após remoção comprovada", () => {
  const service = reserve.indexOf(
    "assinatura_eletronica_exigir_service_role()",
  );
  const authorization = reserve.indexOf(
    "assinatura_eletronica_autorizar_original_diario_seguro",
  );
  const lock = reserve.indexOf("FOR UPDATE;");
  const operation = reserve.indexOf("assinatura_eletronica_operacoes");
  assert.ok(service >= 0 && authorization > service && lock > authorization);
  assert.ok(operation > lock);
  assert.match(reserve, /operacao\.actor_scope = v_actor_scope/i);
  assert.match(reserve, /operacao\.request_id = p_request_id/i);
  assert.match(
    reserve,
    /v_intent\.estado <> 'REMOVIDO'[\s\S]*?storage\.objects[\s\S]*?assinatura_eletronica_artefatos/i,
  );
  assert.match(
    reserve,
    /v_intent\.tamanho_bytes IS DISTINCT FROM p_tamanho_bytes[\s\S]*?v_intent\.sha256 IS DISTINCT FROM v_sha256/i,
  );
  assert.match(
    reserve,
    /IF v_intent\.estado = 'EM_LIMPEZA' THEN[\s\S]*?ASSINATURA_UPLOAD_INTENT_EM_RECONCILIACAO/i,
  );
  assert.doesNotMatch(
    reserve,
    /v_intent\.estado = 'EM_LIMPEZA'\s+AND\s+v_intent\.cleanup_lease_expira_em/i,
  );
});

Deno.test("registro canônico exige intenção RESERVADO exata na mesma transação", () => {
  assert.match(
    sql,
    /CREATE TRIGGER assinatura_eletronica_artefatos_05_require_upload_intent[\s\S]*?BEFORE INSERT ON public\.assinatura_eletronica_artefatos/i,
  );
  assert.match(intentTrigger, /FOR UPDATE;/i);
  assert.match(intentTrigger, /v_intent\.estado <> 'RESERVADO'/i);
  for (
    const field of ["bucket_id", "storage_path", "tamanho_bytes", "sha256"]
  ) {
    assert.match(
      intentTrigger,
      new RegExp(`v_intent\\.${field} IS DISTINCT FROM NEW\\.${field}`, "i"),
    );
  }
  assert.match(
    intentTrigger,
    /SET estado = 'REGISTRADO'[\s\S]*?registrado_em = v_now/i,
  );
});

Deno.test("claim usa TTL, lease, lock ordenado e nunca seleciona artefato referenciado", () => {
  assert.match(claim, /estado = 'RESERVADO' AND intent\.expira_em <= v_now/i);
  assert.match(
    claim,
    /estado = 'EM_LIMPEZA'[\s\S]*?intent\.cleanup_lease_expira_em <= v_now/i,
  );
  assert.match(
    claim,
    /cleanup_delete_authorized_em IS NULL[\s\S]*?cleanup_delete_authorized_em <= v_now - interval '15 minutes'/i,
  );
  const envelopeLock = claim.indexOf(
    "FROM public.assinatura_eletronica_envelopes AS envelope",
  );
  const intentLock = claim.indexOf(
    "FROM public.assinatura_eletronica_upload_intents AS intent",
    envelopeLock,
  );
  assert.ok(envelopeLock >= 0 && intentLock > envelopeLock);
  assert.match(claim, /FOR UPDATE SKIP LOCKED/i);
  assert.match(claim, /assinatura_eletronica_artefatos/i);
  assert.match(claim, /storage\.objects/i);
  assert.match(
    claim,
    /SET estado = 'EM_LIMPEZA'[\s\S]*?interval '5 minutes'/i,
  );
});

Deno.test("segunda validação bloqueia corrida antes da Storage API", () => {
  assert.match(validate, /cleanup_lease_token IS DISTINCT FROM p_lease_token/i);
  assert.match(validate, /cleanup_lease_expira_em <= v_now/i);
  assert.match(validate, /assinatura_eletronica_artefatos/i);
  assert.match(validate, /storage\.objects/i);
  assert.match(
    validate,
    /cleanup_delete_authorized_em = coalesce\(cleanup_delete_authorized_em, v_now\)/i,
  );
  assert.match(validate, /'deleteAllowed', true/i);
  assert.match(validate, /'deleteAllowed', false/i);
  assert.match(complete, /assinatura_eletronica_artefatos/i);
  assert.match(complete, /ASSINATURA_RECONCILIACAO_STORAGE_AINDA_PRESENTE/i);
});

Deno.test("hash divergente vira incidente e falha transitória volta ao TTL", () => {
  assert.match(report, /p_resultado IS NULL/i);
  assert.match(report, /p_resultado = 'HASH_DIVERGENTE'/i);
  assert.match(
    report,
    /SET estado = 'DIVERGENTE'[\s\S]*?cleanup_ultimo_resultado = 'HASH_DIVERGENTE'/i,
  );
  assert.match(
    report,
    /SET estado = 'RESERVADO'[\s\S]*?expira_em = v_now \+ interval '5 minutes'/i,
  );
  assert.match(
    report,
    /IF v_intent\.cleanup_delete_authorized_em IS NOT NULL THEN[\s\S]*?state', 'QUARANTINED'/i,
  );
  assert.match(
    report,
    /cleanup_lease_expira_em = LEAST\(cleanup_lease_expira_em, v_now\)/i,
  );
});

Deno.test("stale cleaner só perde o fence após quarentena e token novo", () => {
  assert.match(
    claim,
    /cleanup_delete_authorized_em <= v_now - interval '15 minutes'/i,
  );
  assert.match(claim, /v_token := gen_random_uuid\(\)/i);
  assert.match(
    claim,
    /SET estado = 'EM_LIMPEZA', cleanup_lease_token = v_token[\s\S]*?cleanup_delete_authorized_em = NULL/i,
  );
  assert.match(
    validate,
    /cleanup_lease_token IS DISTINCT FROM p_lease_token/i,
  );
  assert.match(
    complete,
    /cleanup_lease_token IS DISTINCT FROM p_lease_token/i,
  );
});

Deno.test("RLS e ACL expõem somente wrappers mínimos ao service_role", () => {
  assert.match(
    sql,
    /ALTER TABLE public\.assinatura_eletronica_upload_intents ENABLE ROW LEVEL SECURITY/i,
  );
  assert.match(
    sql,
    /AS RESTRICTIVE FOR ALL TO anon, authenticated[\s\S]*?USING \(false\)[\s\S]*?WITH CHECK \(false\)/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.assinatura_eletronica_upload_intents[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  );
  for (
    const name of [
      "reservar_upload_diario",
      "claim_uploads_orfaos",
      "validar_claim_orfao",
      "concluir_cleanup_upload",
      "reportar_cleanup_upload",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.assinatura_eletronica_internal_${name}`,
        "i",
      ),
    );
  }
});

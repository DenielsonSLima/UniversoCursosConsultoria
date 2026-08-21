// @ts-nocheck -- contrato estático da coluna canônica de validação v4.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260821002336_align_signature_stamp_validation_column_v4.sql",
  import.meta.url,
);
const v5Url = new URL(
  "../migrations/20260820113000_add_signature_editor_v5_global_stamp_template.sql",
  import.meta.url,
);
const individualProofsV1Url = new URL(
  "../migrations/20260820010500_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);

const [sql, v5, individualProofsV1] = await Promise.all([
  Deno.readTextFile(migrationUrl),
  Deno.readTextFile(v5Url),
  Deno.readTextFile(individualProofsV1Url),
]);

const occurrences = (source: string, fragment: string) =>
  source.split(fragment).length - 1;

const literal = (name: string) => {
  const expression = new RegExp(
    `v_${name} constant text :=\\s*\\$[^$]+\\$([\\s\\S]*?)\\$[^$]+\\$;`,
    "u",
  );
  const match = sql.match(expression);
  assert.ok(match?.[1], `Literal ${name} ausente.`);
  return match[1];
};

Deno.test("v4 é incremental e preserva as migrations probatórias aplicadas", () => {
  assert.match(
    migrationUrl.pathname,
    /20260821002336_align_signature_stamp_validation_column_v4\.sql$/u,
  );
  assert.match(sql, /^-- .*\n(?:-- .*\n)*\nBEGIN;/u);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/DO \$migration\$/gu) ?? []).length, 2);
  assert.match(
    individualProofsV1,
    /assinatura_eletronica_congelar_cpf_participante/u,
  );
  assert.doesNotMatch(
    sql,
    /(?:ALTER|DROP|TRUNCATE)\s+TABLE\s+public\.assinatura_eletronica_(?:envelopes|participantes|evidencias)/iu,
  );
});

Deno.test("o default é patchado somente a partir das três geometrias legadas exatas", () => {
  const codeOld = literal("code_old");
  const codeNew = literal("code_new");
  const urlOld = literal("url_old");
  const urlNew = literal("url_new");
  const qrOld = literal("qr_old");
  const qrNew = literal("qr_new");

  assert.equal(occurrences(v5, codeOld), 1);
  assert.equal(occurrences(v5, urlOld), 1);
  assert.equal(occurrences(v5, qrOld), 1);
  assert.match(
    codeNew,
    /'xBp', 71000, 'yBp', 39000, 'widthBp', 29000, 'heightBp', 19000/u,
  );
  assert.match(
    urlNew,
    /'xBp', 71000, 'yBp', 59000, 'widthBp', 29000, 'heightBp', 26000/u,
  );
  assert.match(
    qrNew,
    /'xBp', 65000, 'yBp', 3000, 'widthBp', 35000, 'heightBp', 35000/u,
  );
  assert.match(sql, /pg_catalog\.to_regprocedure\(v_target_signature\)/u);
  assert.match(sql, /pg_catalog\.pg_get_functiondef\(procedimento\.oid\)/u);
  assert.match(
    sql,
    /v_code_occurrences <> 1[\s\S]*?v_url_occurrences <> 1[\s\S]*?v_qr_occurrences <> 1/u,
  );
  assert.match(
    sql,
    /pg_catalog\.replace\(v_definition, v_code_old, v_code_new\)/u,
  );
  assert.match(sql, /pg_catalog\.replace\(v_patched, v_url_old, v_url_new\)/u);
  assert.match(sql, /pg_catalog\.replace\(v_patched, v_qr_old, v_qr_new\)/u);
  assert.match(sql, /ASSINATURA_CARIMBO_VALIDATION_COLUMN_V4_GEOMETRIA_DRIFT/u);
});

Deno.test("o patch conserva segurança, volatilidade, search_path e ACL da função", () => {
  assert.match(sql, /v_security_definer_before IS TRUE/u);
  assert.match(sql, /v_provolatile_before IS DISTINCT FROM 'i'/u);
  assert.match(sql, /ARRAY\['search_path=""'\]::text\[\]/u);
  assert.match(sql, /v_acl_after IS DISTINCT FROM v_acl_before/u);
  assert.match(
    sql,
    /public\.assinatura_eletronica_template_carimbo_v5_valido\(\s*v_default_template\s*\)/u,
  );
});

Deno.test("a normalização in-place exige um global schema 5 e banco sem envelopes", () => {
  assert.match(
    sql,
    /LOCK TABLE public\.assinatura_eletronica_politicas\s+IN SHARE ROW EXCLUSIVE MODE/u,
  );
  assert.match(
    sql,
    /LOCK TABLE public\.assinatura_eletronica_envelopes\s+IN SHARE ROW EXCLUSIVE MODE/u,
  );
  assert.match(
    sql,
    /LOCK TABLE public\.assinatura_eletronica_politica_carimbo_assets\s+IN SHARE ROW EXCLUSIVE MODE/u,
  );
  assert.match(sql, /v_policy_count <> 1/u);
  assert.match(sql, /politica\.documento = 'MODELO_PADRAO'/u);
  assert.match(sql, /politica\.company_id IS NULL/u);
  assert.match(sql, /politica\.polo_id IS NULL/u);
  assert.match(sql, /politica\.arquivada_em IS NULL/u);
  assert.match(sql, /envelope\.politica_id = v_policy\.id/u);
  assert.match(sql, /v_envelope_count <> 0/u);
  assert.match(
    sql,
    /v_editor_before ->> 'schemaVersion' IS DISTINCT FROM '5'/u,
  );
  assert.match(
    sql,
    /v_editor_before IS DISTINCT FROM\s+public\.assinatura_eletronica_normalizar_editor\(v_editor_before\)/u,
  );
});

Deno.test("somente a geometria de QR, código e URL muda; snapshot, hidden e vínculo ficam idênticos", () => {
  assert.match(
    sql,
    /v_template_before -> 'elements' -> 7 ->> 'id'[\s\S]*?'verificationCode'/u,
  );
  assert.match(
    sql,
    /v_template_before -> 'elements' -> 8 ->> 'id'[\s\S]*?'verificationUrl'/u,
  );
  assert.match(
    sql,
    /v_template_before -> 'elements' -> 9 ->> 'id'[\s\S]*?'verificationQr'/u,
  );
  assert.match(sql, /v_template_after - 'elements'/u);
  assert.match(sql, /FOR v_index IN 0\.\.10 LOOP/u);
  assert.match(sql, /IF v_index NOT IN \(7, 8, 9\)/u);
  assert.match(sql, /v_policy_after\.politica - 'editor'/u);
  assert.match(
    sql,
    /v_policy_after\.politica -> 'signatureStampAssetSnapshot'[\s\S]*?v_asset_snapshot/u,
  );
  assert.match(sql, /v_link_after IS DISTINCT FROM v_link/u);
  assert.doesNotMatch(sql, /hiddenElementIds[^\n]*=/u);
  assert.doesNotMatch(
    sql,
    /jsonb_set\([^;]*ARRAY\['signatureStampAssetSnapshot'\]/u,
  );
});

Deno.test("a geometria final é validada após a atualização", () => {
  assert.match(sql, /v_code_after ->> 'xBp' IS DISTINCT FROM '71000'/u);
  assert.match(sql, /v_code_after ->> 'yBp' IS DISTINCT FROM '39000'/u);
  assert.match(sql, /v_url_after ->> 'xBp' IS DISTINCT FROM '71000'/u);
  assert.match(sql, /v_url_after ->> 'yBp' IS DISTINCT FROM '59000'/u);
  assert.match(sql, /v_qr_after ->> 'xBp' IS DISTINCT FROM '65000'/u);
  assert.match(sql, /v_qr_after ->> 'yBp' IS DISTINCT FROM '3000'/u);
  assert.match(
    sql,
    /v_policy_after\.politica -> 'editor'\s+IS DISTINCT FROM public\.assinatura_eletronica_normalizar_editor/u,
  );
  assert.match(
    sql,
    /public\.assinatura_eletronica_template_carimbo_v5_valido\(\s*v_policy_after\.politica/u,
  );
});

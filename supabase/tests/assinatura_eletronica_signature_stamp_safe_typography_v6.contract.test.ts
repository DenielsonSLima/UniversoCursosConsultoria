import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260821050000_enable_signature_stamp_safe_typography_v6.sql",
  import.meta.url,
);
const qrProjectionMigrationUrl = new URL(
  "../migrations/20260821043000_align_signature_stamp_qr_edge_projection_v6.sql",
  import.meta.url,
);

Deno.test("tipografia v6 preserva provas e limita a customizacao segura", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  assert.match(sql, /^BEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.match(
    sql,
    /assinatura_eletronica_template_carimbo_v5_estilo_valido/u,
  );
  assert.match(sql, /v_font_size NOT BETWEEN 4000 AND 16000/u);
  assert.match(sql, /v_font_size % 500 <> 0/u);
  assert.match(sql, /'LEFT', 'CENTER', 'RIGHT'/u);
  assert.match(sql, /'HELVETICA_BOLD_OBLIQUE'/u);
  assert.match(sql, /'COURIER_BOLD_OBLIQUE'/u);
  assert.match(sql, /v_label NOT IN \('', 'Assinante: '\)/u);
  assert.match(
    sql,
    /v_style ->> 'color' IS DISTINCT FROM p_expected_style ->> 'color'/u,
  );
  assert.match(
    sql,
    /v_label IS DISTINCT FROM p_expected_style ->> 'label'/u,
  );

  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_envelopes/iu,
  );
  assert.doesNotMatch(sql, /DELETE\s+FROM/iu);
  assert.doesNotMatch(sql, /DROP\s+(?:FUNCTION|TABLE|COLUMN)/iu);
  assert.doesNotMatch(sql, /add_individual_signature_proofs_v1/u);
});

Deno.test("tipografia v6 reconcilia contrato remoto ou estado local ja corrigido", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  assert.match(sql, /IF v_helper_occurrences = 0 THEN/u);
  assert.match(
    sql,
    /ELSIF v_helper_occurrences <> 1 OR v_old_occurrences <> 0 THEN/u,
  );
  assert.match(sql, /IF v_old_occurrences > 1 THEN/u);
  assert.match(sql, /ELSIF v_old_occurrences = 1 THEN/u);
  assert.match(sql, /pg_catalog\.strpos\(v_patched, v_old\) > 0/u);
  assert.doesNotMatch(sql, /v_new_occurrences/u);
  assert.match(sql, /v_acl_after IS DISTINCT FROM v_acl_before/u);
  assert.match(sql, /v_proconfig_after IS DISTINCT FROM v_proconfig_before/u);
});

Deno.test("default v6 remove prefixo legado e continua aceito pelo validador", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  assert.match(
    sql,
    /v_old constant text := \$old\$'label', 'Assinante: '\$old\$/u,
  );
  assert.match(sql, /v_new constant text := \$new\$'label', ''\$new\$/u);
  assert.match(
    sql,
    /v_default_template -> 'elements' -> 3 ->> 'id'[\s\S]*IS DISTINCT FROM 'signerName'/u,
  );
  assert.match(
    sql,
    /v_default_template -> 'elements' -> 3 -> 'style' ->> 'label'[\s\S]*IS DISTINCT FROM ''/u,
  );
  assert.match(
    sql,
    /NOT public\.assinatura_eletronica_template_carimbo_v5_valido\([\s\S]*v_default_template[\s\S]*\)/u,
  );
});

Deno.test("tipografia 050000 compoe sem restaurar teto ou projecao antiga do QR 043000", async () => {
  const [typographySql, qrProjectionSql] = await Promise.all([
    Deno.readTextFile(migrationUrl),
    Deno.readTextFile(qrProjectionMigrationUrl),
  ]);

  assert.match(qrProjectionSql, /v_geometry_new[\s\S]*?OR v_width < 29000/u);
  assert.match(
    qrProjectionSql,
    /WHEN v_qr_width = 100000 THEN[\s\S]*?100000 \* 19 - v_qr_physical_side/u,
  );
  assert.match(
    typographySql,
    /pg_catalog\.pg_get_functiondef\(procedimento\.oid\)[\s\S]*?v_patched := pg_catalog\.replace\(v_definition, v_old, v_new\)[\s\S]*?EXECUTE v_patched/u,
  );
  assert.doesNotMatch(
    typographySql,
    /v_width NOT BETWEEN 29000 AND 40000/u,
  );
  assert.doesNotMatch(
    typographySql,
    /v_qr_x \* 19\s*\+ \(v_qr_physical_width - v_qr_physical_side\) \/ 2/u,
  );
});

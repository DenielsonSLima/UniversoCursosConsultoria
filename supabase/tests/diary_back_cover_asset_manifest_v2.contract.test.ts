// @ts-nocheck -- contrato estático da migration incremental.

import assert from "node:assert/strict";

const sql = await Deno.readTextFile(
  new URL(
    "../migrations/20260823170800_freeze_diary_back_cover_assets_manifest_v2.sql",
    import.meta.url,
  ),
);

Deno.test("migration do manifesto v2 é atômica e respeita o teto", () => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.ok(sql.split("\n").length <= 500);
});

Deno.test("validador mantém v1 histórico e reconhece v2 estrito", () => {
  assert.match(
    sql,
    /RENAME TO assinatura_pdf_asset_manifest_diario_v1_valido/u,
  );
  assert.match(
    sql,
    /WHEN '1' THEN public\.assinatura_pdf_asset_manifest_diario_v1_valido/u,
  );
  assert.match(
    sql,
    /WHEN '2' THEN public\.assinatura_pdf_asset_manifest_diario_v2_valido/u,
  );
  assert.match(sql, /UNIVERSO_DIARIO_PDF_ASSETS_V2/u);
  assert.match(
    sql,
    /'backCoverBackground'[\s\S]*?'backCoverImages'/u,
  );
  assert.match(
    sql,
    /v_assets - ARRAY\[[\s\S]*?'backCoverImages'[\s\S]*?\]::text\[\] <> '\{\}'::jsonb/u,
  );
});

Deno.test("fontes da contracapa ficam vinculadas ao snapshot", () => {
  assert.match(
    sql,
    /p_document_snapshot -> 'assetSources' ->> 'backCoverUrl'/u,
  );
  assert.match(
    sql,
    /p_document_snapshot -> 'template' ->> 'contracapaUrl'/u,
  );
  assert.match(
    sql,
    /p_document_snapshot -> 'templateSource' -> 'raw' -> 'contracapaCampos'/u,
  );
  assert.match(sql, /campo -> 'visible' = 'true'::jsonb/u);
  assert.match(sql, /campo -> 'isImage' = 'true'::jsonb/u);
  assert.match(sql, /jsonb_typeof\(campo -> 'imageUrl'\) <> 'string'/u);
  assert.match(sql, /'fieldId', campo ->> 'id'/u);
  assert.match(sql, /'sourceUrl', campo ->> 'imageUrl'/u);
  assert.match(
    sql,
    /WITH ORDINALITY[\s\S]*?AS campos\(campo, ordinalidade\)/u,
  );
  assert.match(sql, /ORDER BY ordinalidade/u);
  assert.match(sql, /v_actual_images IS DISTINCT FROM v_expected_images/u);
  assert.match(sql, /assinatura_pdf_manifest_image_valida/u);
  assert.match(sql, /jsonb_array_length\(v_images\) > 20/u);
  assert.match(sql, /v_total_back_cover_bytes > 25165824/u);
});

Deno.test("novas publicações exigem v2 sem invalidar linhas históricas", () => {
  assert.match(
    sql,
    /pdf_asset_manifest_snapshot IS NULL[\s\S]*?assinatura_eletronica_pdf_asset_manifest_diario_valido/u,
  );
  assert.match(
    sql,
    /NEW\.pdf_asset_manifest_snapshot ->> 'schemaVersion' <> '2'/u,
  );
  assert.match(
    sql,
    /OLD\.pdf_asset_manifest_snapshot IS NOT NULL/u,
  );
  assert.match(
    sql,
    /VALIDATE CONSTRAINT assinatura_eletronica_envelopes_pdf_asset_manifest_check/u,
  );
});

Deno.test("helpers do manifesto continuam privados", () => {
  for (
    const name of [
      "assinatura_pdf_manifest_image_valida",
      "assinatura_pdf_asset_manifest_diario_v1_valido",
      "assinatura_pdf_asset_manifest_diario_v2_valido",
      "assinatura_eletronica_pdf_asset_manifest_diario_valido",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(`, "u"),
    );
  }
  assert.match(sql, /FROM PUBLIC, anon, authenticated/u);
});

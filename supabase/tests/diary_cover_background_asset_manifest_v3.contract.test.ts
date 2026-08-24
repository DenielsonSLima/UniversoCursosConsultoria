// @ts-nocheck -- contrato estático da migration incremental.

import assert from "node:assert/strict";

const sql = await Deno.readTextFile(
  new URL(
    "../migrations/20260824080000_freeze_diary_cover_background_assets_manifest_v3.sql",
    import.meta.url,
  ),
);

Deno.test("migration do manifesto v3 é incremental, atômica e respeita o teto", () => {
  assert.doesNotMatch(sql, /ALTER FUNCTION[\s\S]*?RENAME TO/u);
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.ok(sql.split("\n").length <= 500);
});

Deno.test("v3 aceita somente as chaves exatas e delega o legado v2", () => {
  assert.match(sql, /UNIVERSO_DIARIO_PDF_ASSETS_V3/u);
  assert.match(
    sql,
    /'headerLogo', 'watermark', 'validationQr', 'coverBackground',[\s\S]*?'backCoverBackground', 'backCoverImages'/u,
  );
  assert.match(
    sql,
    /v_assets - ARRAY\[[\s\S]*?'coverBackground'[\s\S]*?\]::text\[\] <> '\{\}'::jsonb/u,
  );
  assert.match(
    sql,
    /assinatura_pdf_asset_manifest_diario_v2_valido\([\s\S]*?'assets', v_assets - 'coverBackground'/u,
  );
});

Deno.test("capa fica vinculada às duas fontes e aos bytes congelados", () => {
  assert.match(
    sql,
    /p_document_snapshot -> 'assetSources' ->> 'coverUrl'/u,
  );
  assert.match(sql, /p_document_snapshot -> 'template' ->> 'capaUrl'/u);
  assert.match(
    sql,
    /v_cover ->> 'sourceUrl' IS DISTINCT FROM v_expected_cover/u,
  );
  assert.match(
    sql,
    /v_expected_cover IS NULL[\s\S]*?v_cover <> 'null'::jsonb/u,
  );
  assert.match(
    sql,
    /v_cover - ARRAY\[[\s\S]*?'sha256'[\s\S]*?<> '\{\}'::jsonb/u,
  );
  assert.match(
    sql,
    /assinatura_pdf_manifest_image_valida\(v_cover, 12582912\)/u,
  );
  assert.ok(
    sql.includes(
      "^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$",
    ),
  );
});

Deno.test("leitura histórica permanece e novas mutações exigem v3", () => {
  assert.match(
    sql,
    /WHEN '1' THEN public\.assinatura_pdf_asset_manifest_diario_v1_valido/u,
  );
  assert.match(
    sql,
    /WHEN '2' THEN public\.assinatura_pdf_asset_manifest_diario_v2_valido/u,
  );
  assert.match(
    sql,
    /WHEN '3' THEN public\.assinatura_pdf_asset_manifest_diario_v3_valido/u,
  );
  assert.match(
    sql,
    /IF NEW\.pdf_asset_manifest_snapshot IS DISTINCT FROM OLD\.pdf_asset_manifest_snapshot/u,
  );
  assert.match(
    sql,
    /OLD\.pdf_asset_manifest_snapshot IS NOT NULL[\s\S]*?schemaVersion' <> '3'/u,
  );
});

Deno.test("helpers v3 continuam privados", () => {
  for (
    const name of [
      "assinatura_pdf_asset_manifest_diario_v3_valido",
      "assinatura_eletronica_pdf_asset_manifest_diario_valido",
      "assinatura_eletronica_proteger_pdf_asset_manifest",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(`, "u"),
    );
  }
  assert.match(sql, /FROM PUBLIC, anon, authenticated/u);
});

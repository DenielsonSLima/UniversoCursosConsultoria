// @ts-nocheck -- contrato estático da projeção lógica/visual do QR.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260821043000_align_signature_stamp_qr_edge_projection_v6.sql",
  import.meta.url,
);
const appliedV3Url = new URL(
  "../migrations/20260821002331_align_signature_stamp_template_qr_visual_bounds_v3.sql",
  import.meta.url,
);
const appliedIndividualProofsV1Url = new URL(
  "../migrations/20260820010500_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const templateHelperUrl = new URL(
  "../../modules/shared/assinatura-eletronica/signature-stamp-template.ts",
  import.meta.url,
);
const finalPdfUrl = new URL(
  "../../modules/shared/assinatura-eletronica/pdf-document-signature.server.ts",
  import.meta.url,
);
const previewPdfUrl = new URL(
  "../../modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.ts",
  import.meta.url,
);

const [
  sql,
  appliedV3,
  appliedIndividualProofsV1,
  templateHelper,
  finalPdf,
  previewPdf,
] = await Promise.all([
  Deno.readTextFile(migrationUrl),
  Deno.readTextFile(appliedV3Url),
  Deno.readTextFile(appliedIndividualProofsV1Url),
  Deno.readTextFile(templateHelperUrl),
  Deno.readTextFile(finalPdfUrl),
  Deno.readTextFile(previewPdfUrl),
]);

const sha256 = async (source: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const projectedVisualBounds = (
  xBp: number,
  yBp: number,
  widthBp: number,
  heightBp: number,
) => {
  const physicalSide = Math.min(widthBp * 19, heightBp * 7);
  const visualWidthBp = physicalSide / 19;
  const visualHeightBp = physicalSide / 7;
  const leftBp = widthBp === 100_000
    ? (100_000 - visualWidthBp) / 2
    : xBp * (100_000 - visualWidthBp) / (100_000 - widthBp);
  const topBp = heightBp === 100_000
    ? (100_000 - visualHeightBp) / 2
    : yBp * (100_000 - visualHeightBp) / (100_000 - heightBp);
  return {
    leftBp,
    topBp,
    rightBp: leftBp + visualWidthBp,
    bottomBp: topBp + visualHeightBp,
  };
};

Deno.test("v6 é incremental e preserva byte a byte a migration v3 aplicada", async () => {
  assert.match(
    migrationUrl.pathname,
    /20260821043000_align_signature_stamp_qr_edge_projection_v6\.sql$/u,
  );
  assert.equal(
    await sha256(appliedV3),
    "52af61faef8f72e0e183d1392095b23eab76d241625400cd8777e6fff93a49af",
  );
  assert.equal(
    await sha256(appliedIndividualProofsV1),
    "e63ce27f1d2047b5f61146d8ce3c15870ce62903c52b74ea81d87897a8e0ab0e",
  );
  assert.match(sql, /^BEGIN;$/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+TABLE)\b/iu,
  );
  assert.doesNotMatch(sql, /add_individual_signature_proofs_v1/u);
});

Deno.test("v6 substitui uma única projeção centralizada e falha fechada em drift", () => {
  assert.match(
    appliedV3,
    /v_qr_visual_left := v_qr_x \* 19[\s\S]*?v_qr_visual_top := v_qr_y \* 7/u,
  );
  assert.match(sql, /pg_catalog\.to_regprocedure\(v_target_signature\)/u);
  assert.match(sql, /pg_catalog\.pg_get_functiondef/u);
  assert.match(sql, /v_comment_occurrences <> 1/u);
  assert.match(sql, /v_projection_occurrences <> 1/u);
  assert.match(sql, /v_geometry_occurrences <> 1/u);
  assert.match(sql, /ASSINATURA_CARIMBO_QR_EDGE_V6_PROJECAO_DRIFT/u);
  assert.match(sql, /pg_catalog\.replace\(v_definition, v_old, v_new\)/u);
  assert.match(
    sql,
    /pg_catalog\.replace\(v_patched, v_left_old, v_left_new\)/u,
  );
  assert.match(sql, /v_security_definer_before IS TRUE/u);
  assert.match(sql, /v_provolatile_before IS DISTINCT FROM 'i'/u);
  assert.match(sql, /ARRAY\['search_path=""'\]::text\[\]/u);
  assert.match(sql, /v_acl_after IS DISTINCT FROM v_acl_before/u);
});

Deno.test("SQL, editor e PDFs usam a mesma projeção por extremos", () => {
  assert.match(
    sql,
    /v_qr_x[\s\S]*?\* \(100000 \* 19 - v_qr_physical_side\)[\s\S]*?\/ \(100000 - v_qr_width\)/u,
  );
  assert.match(
    sql,
    /v_qr_y[\s\S]*?\* \(100000 \* 7 - v_qr_physical_side\)[\s\S]*?\/ \(100000 - v_qr_height\)/u,
  );
  assert.match(sql, /WHEN v_qr_width = 100000 THEN/u);
  assert.match(sql, /WHEN v_qr_height = 100000 THEN/u);
  assert.match(templateHelper, /projectLogicalPositionToVisual/u);
  assert.match(templateHelper, /projectVisualPositionToLogical/u);
  assert.match(
    templateHelper,
    /getSignatureStampTemplateElementVisualBoundsForSurface/u,
  );
  assert.match(
    finalPdf,
    /getSignatureStampTemplateElementVisualBoundsForSurface/u,
  );
  assert.match(
    previewPdf,
    /getSignatureStampTemplateElementVisualBoundsForSurface/u,
  );

  const topLeft = projectedVisualBounds(0, 0, 30_000, 30_000);
  const bottomRight = projectedVisualBounds(
    70_000,
    70_000,
    30_000,
    30_000,
  );
  assert.equal(topLeft.leftBp, 0);
  assert.equal(topLeft.topBp, 0);
  assert.ok(Math.abs(bottomRight.rightBp - 100_000) < 0.001);
  assert.ok(Math.abs(bottomRight.bottomBp - 100_000) < 0.001);
  assert.ok(bottomRight.leftBp > 80_000);

  const fullCanvas = projectedVisualBounds(0, 0, 100_000, 100_000);
  assert.ok(fullCanvas.leftBp > 0);
  assert.equal(fullCanvas.topBp, 0);
  assert.ok(
    Math.abs(fullCanvas.rightBp - (100_000 - fullCanvas.leftBp)) < 0.001,
  );
  assert.equal(fullCanvas.bottomBp, 100_000);
});

Deno.test("migration comprova que o frame lógico de 30% não vira barreira invisível", () => {
  assert.match(sql, /'\{elements,9,xBp\}'[\s\S]*?'70000'::jsonb/u);
  assert.match(sql, /'\{elements,9,yBp\}'[\s\S]*?'70000'::jsonb/u);
  assert.match(sql, /'\{elements,9,widthBp\}'[\s\S]*?'30000'::jsonb/u);
  assert.match(sql, /'\{elements,9,heightBp\}'[\s\S]*?'30000'::jsonb/u);
  assert.match(sql, /'\{elements,10,xBp\}'[\s\S]*?'72000'::jsonb/u);
  assert.match(sql, /'\{elements,10,widthBp\}'[\s\S]*?'8000'::jsonb/u);
  assert.match(
    sql,
    /assinatura_eletronica_template_carimbo_v5_valido\([\s\S]*?v_edge_template/u,
  );
  assert.match(sql, /ASSINATURA_CARIMBO_QR_EDGE_V6_FRAME_30_INVALIDO/u);
});

Deno.test("migration remove o teto de 40% e limita o QR somente ao canvas", () => {
  assert.match(
    sql,
    /v_geometry_old[\s\S]*?v_width NOT BETWEEN 29000 AND 40000/u,
  );
  assert.match(sql, /v_geometry_new[\s\S]*?OR v_width < 29000/u);
  assert.match(
    sql,
    /pg_catalog\.replace\([\s\S]*?v_geometry_old,[\s\S]*?v_geometry_new/u,
  );
  assert.match(sql, /'\{elements,9,widthBp\}'[\s\S]*?'50000'::jsonb/u);
  assert.match(sql, /'\{elements,9,heightBp\}'[\s\S]*?'50000'::jsonb/u);
  assert.match(sql, /ASSINATURA_CARIMBO_QR_EDGE_V6_FRAME_50_INVALIDO/u);
  assert.match(sql, /ASSINATURA_CARIMBO_QR_EDGE_V6_FRAME_100_INESPERADO/u);

  assert.doesNotMatch(templateHelper, /widthBp > 40_000/u);
  assert.doesNotMatch(finalPdf, /widthBp > 40_000/u);
  assert.match(
    templateHelper,
    /Math\.min\(maximumWidth, maximumHeight\)/u,
  );
});

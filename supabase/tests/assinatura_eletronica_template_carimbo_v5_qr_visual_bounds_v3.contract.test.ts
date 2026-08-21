// @ts-nocheck -- contrato estático da correção incremental de bounds do QR.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260821002331_align_signature_stamp_template_qr_visual_bounds_v3.sql",
  import.meta.url,
);
const optionalVisualV2Url = new URL(
  "../migrations/20260820232636_allow_signature_stamp_optional_visual_elements_v2.sql",
  import.meta.url,
);
const individualProofsV1Url = new URL(
  "../migrations/20260820010500_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const templateHelperUrl = new URL(
  "../../modules/shared/assinatura-eletronica/signature-stamp-template.ts",
  import.meta.url,
);

const [sql, optionalVisualV2, individualProofsV1, templateHelper] =
  await Promise.all([
    Deno.readTextFile(migrationUrl),
    Deno.readTextFile(optionalVisualV2Url),
    Deno.readTextFile(individualProofsV1Url),
    Deno.readTextFile(templateHelperUrl),
  ]);

const occurrences = (source: string, fragment: string) =>
  source.split(fragment).length - 1;

const dollarLiteral = (name: string) => {
  const opening = `v_${name} text := $${name}$`;
  const start = sql.indexOf(opening);
  const end = sql.indexOf(`$${name}$;`, start + opening.length);
  assert.ok(start >= 0 && end > start, `Literal ${name} ausente.`);
  return sql.slice(start + opening.length, end);
};

const sha256 = async (source: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const physicalQrBounds = (
  xBp: number,
  yBp: number,
  widthBp: number,
  heightBp: number,
) => {
  const physicalWidth = widthBp * 19;
  const physicalHeight = heightBp * 7;
  const side = Math.min(physicalWidth, physicalHeight);
  const left = xBp * 19 + (physicalWidth - side) / 2;
  const top = yBp * 7 + (physicalHeight - side) / 2;
  return { left, top, right: left + side, bottom: top + side, side };
};

const overlapsPhysicalQr = (
  qr: ReturnType<typeof physicalQrBounds>,
  xBp: number,
  yBp: number,
  widthBp: number,
  heightBp: number,
) => (
  qr.left < (xBp + widthBp) * 19 &&
  qr.right > xBp * 19 &&
  qr.top < (yBp + heightBp) * 7 &&
  qr.bottom > yBp * 7
);

Deno.test("v3 é incremental, mantém v2 aplicada intacta e não toca CPF", async () => {
  assert.match(
    migrationUrl.pathname,
    /20260821002331_align_signature_stamp_template_qr_visual_bounds_v3\.sql$/u,
  );
  assert.match(sql, /^-- .*\n\nBEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/DO \$migration\$/gu) ?? []).length, 1);
  assert.equal(
    await sha256(optionalVisualV2),
    "4358d57b2aaede10de3ef85ef00a64262009142789e47723b9a12ff46f31b25c",
  );
  assert.match(
    individualProofsV1,
    /assinatura_eletronica_congelar_cpf_participante/u,
  );
  assert.doesNotMatch(sql, /\b(?:CPF|signerCpfMasked|SIGNER_CPF_MASKED)\b/u);
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+TABLE)\b/iu,
  );
});

Deno.test("v3 parte do validador opcional v2 exato e falha fechada em drift", () => {
  assert.match(
    optionalVisualV2,
    /-- A quiet zone do QR continua reservada contra todos os elementos visíveis\./u,
  );
  assert.match(
    optionalVisualV2,
    /\(v_qr ->> 'xBp'\)::integer[\s\S]*?\(v_qr ->> 'widthBp'\)::integer/u,
  );
  assert.match(
    sql,
    /public\.assinatura_eletronica_template_carimbo_v5_valido\(jsonb\)/u,
  );
  assert.match(sql, /pg_catalog\.to_regprocedure\(/u);
  assert.match(sql, /pg_catalog\.pg_get_functiondef\(/u);
  assert.match(sql, /v_occurrences <> 1/u);
  assert.match(
    sql,
    /ASSINATURA_TEMPLATE_CARIMBO_V5_QR_VISUAL_V3_COLISAO_DRIFT/u,
  );
  assert.match(sql, /pg_catalog\.replace\(v_definition, v_old, v_new\)/u);
  assert.match(
    sql,
    /ASSINATURA_TEMPLATE_CARIMBO_V5_QR_VISUAL_V3_PATCH_INCOMPLETO/u,
  );
  assert.match(sql, /v_security_definer_before IS TRUE/u);
  assert.match(sql, /v_provolatile_before IS DISTINCT FROM 'i'/u);
  assert.match(sql, /ARRAY\['search_path=""'\]::text\[\]/u);
  assert.match(sql, /v_acl_after IS DISTINCT FROM v_acl_before/u);
});

Deno.test("o bloco legado substituído é literalmente o bloco de colisão da v2", () => {
  const oldCollision = dollarLiteral("old");
  const newCollision = dollarLiteral("new");

  assert.equal(occurrences(optionalVisualV2, oldCollision), 1);
  assert.match(oldCollision, /\(v_qr ->> 'xBp'\)::integer/u);
  assert.match(oldCollision, /\(v_qr ->> 'widthBp'\)::integer/u);
  assert.match(
    oldCollision,
    /NOT \(v_expected_ids\[v_index \+ 1\] = ANY\(v_hidden_element_ids\)\)/u,
  );
  assert.match(newCollision, /<<qr_visual_bounds>>/u);
  assert.match(newCollision, /END qr_visual_bounds;/u);
  assert.doesNotMatch(
    newCollision,
    /\(v_qr ->> 'xBp'\)::integer\s*<\s*\(v_element/u,
  );
});

Deno.test("a colisão usa o quadrado físico centralizado do canvas 19:7", () => {
  assert.match(
    templateHelper,
    /SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_WIDTH = 19/u,
  );
  assert.match(
    templateHelper,
    /SIGNATURE_STAMP_TEMPLATE_SURFACE_ASPECT_HEIGHT = 7/u,
  );
  assert.match(
    templateHelper,
    /getSignatureStampTemplateElementVisualBounds[\s\S]*?physicalWidth = element\.widthBp \*[\s\S]*?physicalHeight = element\.heightBp \*/u,
  );
  assert.match(sql, /v_qr_physical_width := v_qr_width \* 19/u);
  assert.match(sql, /v_qr_physical_height := v_qr_height \* 7/u);
  assert.match(
    sql,
    /v_qr_physical_side := least\([\s\S]*?v_qr_physical_width,[\s\S]*?v_qr_physical_height/u,
  );
  assert.match(
    sql,
    /v_qr_visual_left := v_qr_x \* 19[\s\S]*?\(v_qr_physical_width - v_qr_physical_side\) \/ 2/u,
  );
  assert.match(
    sql,
    /v_qr_visual_top := v_qr_y \* 7[\s\S]*?\(v_qr_physical_height - v_qr_physical_side\) \/ 2/u,
  );
  assert.match(sql, /v_qr_visual_right > v_element_x \* 19/u);
  assert.match(sql, /v_qr_visual_bottom > v_element_y \* 7/u);
  assert.match(
    sql,
    /NOT \(v_expected_ids\[v_index \+ 1\] = ANY\(v_hidden_element_ids\)\)/u,
  );

  const qr = physicalQrBounds(71_000, 29_000, 29_000, 29_000);
  assert.equal(qr.side, 29_000 * 7);
  assert.equal(qr.right - qr.left, qr.bottom - qr.top);

  // Este elemento toca apenas a margem lógica vazia à esquerda do QR.
  assert.equal(
    overlapsPhysicalQr(qr, 72_000, 30_000, 8_000, 8_000),
    false,
  );
  // Este já invade o quadrado desenhado e deve continuar sendo rejeitado.
  assert.equal(
    overlapsPhysicalQr(qr, 82_000, 30_000, 8_000, 8_000),
    true,
  );
});

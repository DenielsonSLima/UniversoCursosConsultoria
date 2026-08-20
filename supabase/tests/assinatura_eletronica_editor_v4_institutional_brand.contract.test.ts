// @ts-nocheck -- contrato estático da migration incremental e da Edge.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260820180207_add_signature_editor_v4_institutional_brand.sql",
  import.meta.url,
);
const previousMigrationUrl = new URL(
  "../migrations/20260820130912_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const artifactsUrl = new URL(
  "../functions/assinatura-eletronica-diario-artefatos/artifacts.ts",
  import.meta.url,
);
const adapterUrl = new URL(
  "../../modules/gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const previousSql = await Deno.readTextFile(previousMigrationUrl);
const artifacts = await Deno.readTextFile(artifactsUrl);
const adapter = await Deno.readTextFile(adapterUrl);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("migration v4 é incremental, atômica e não altera a migration aplicada", () => {
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.match(
    previousSql,
    /individual_signature_proofs_v1|provas individuais/iu,
  );
  assert.doesNotMatch(previousSql, /schemaVersion',\s*4/iu);
  assert.match(sql, /ASSINATURA_EDITOR_V4_ENVELOPES_EXISTENTES/u);
  assert.match(sql, /assinatura_eletronica_politica_assets/u);
  assert.match(sql, /ASSINATURA_EDITOR_V4_MARCA_CUSTOM_VINCULADA/u);
  assert.match(sql, /politica\.documento = 'diario_classe'/u);
});

Deno.test("editor v4 tem páginas fechadas, título técnico estável e sem watermark custom", () => {
  const normalizer = functionBlock(
    "public.assinatura_eletronica_normalizar_editor(",
  );
  assert.match(normalizer, /'pages', 'schemaVersion', 'signatureStamp'/u);
  assert.match(normalizer, /ARRAY\['page', 'template'\]::text\[\]/u);
  assert.match(
    normalizer,
    /ARRAY\['page', 'sections', 'template'\]::text\[\]/u,
  );
  assert.match(normalizer, /Documento assinado eletronicamente/u);
  assert.doesNotMatch(normalizer, /CUSTOM_ASSET|watermarkAssets/u);
  assert.match(
    sql,
    /politica\.politica -> 'editor' -> 'pages' -> 0 \? 'watermark'/u,
  );
  assert.match(
    sql,
    /politica\.politica -> 'editor' -> 'pages' -> 1 \? 'watermark'/u,
  );
  assert.match(
    normalizer,
    /assinatura_eletronica_normalizar_editor_v2_legacy\(p_editor\)/u,
  );
  assert.match(
    normalizer,
    /assinatura_eletronica_editor_padrao_v3_individual_legacy\(\)/u,
  );
});

Deno.test("contentLayout v4 é exato, inteiro, múltiplo de cinco e congelado em geometry v2", () => {
  const validator = functionBlock(
    "public.assinatura_eletronica_content_layout_carimbo_valido(",
  );
  const freezer = functionBlock(
    "public.assinatura_eletronica_congelar_geometria_v2()",
  );
  const geometryValidator = functionBlock(
    "public.assinatura_eletronica_geometria_v2_valida(",
  );
  assert.match(
    validator,
    /'lineSpacingPercent', 'qrScalePercent', 'sealScalePercent'/u,
  );
  assert.match(validator, /v_seal BETWEEN 70 AND 130/u);
  assert.match(validator, /v_spacing BETWEEN 85 AND 105/u);
  assert.match(validator, /v_qr BETWEEN 85 AND 115/u);
  assert.match(validator, /v_seal % 5 = 0/u);
  assert.match(validator, /v_spacing % 5 = 0/u);
  assert.match(validator, /v_qr % 5 = 0/u);
  assert.match(freezer, /'schemaVersion', 2/u);
  assert.match(freezer, /'contentLayout'/u);
  assert.match(geometryValidator, /'contentLayout'/u);
  assert.match(
    sql,
    /assinatura_eletronica_envelopes_00_geometry_v2_before_insert/u,
  );
});

Deno.test("somente políticas ativas do Diário são versionadas e preservam gates", () => {
  assert.match(
    sql,
    /WHERE politica\.documento = 'diario_classe'\s+AND politica\.arquivada_em IS NULL/u,
  );
  assert.match(sql, /v_old\.habilitada/u);
  assert.match(sql, /v_old\.status_juridico/u);
  assert.match(sql, /v_old\.certificado/u);
  assert.match(sql, /v_old\.versao \+ 1/u);
  assert.match(
    sql,
    /assinatura_eletronica_politica_carimbo_assets[\s\S]*?WHERE vinculo\.politica_id = v_old\.id/u,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_politicas[\s\S]{0,240}documento\s*=\s*'MODELO_PADRAO'/iu,
  );
});

Deno.test("wrapper de finalização fecha payload visual e ACL permanece service-only", () => {
  const wrapper = functionBlock(
    "public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(",
  );
  assert.match(wrapper, /schemaVersion' !~ '\^\[12\]\$'/u);
  assert.match(wrapper, /v_schema_geometria = 2/u);
  assert.match(wrapper, /jsonb_array_length\(v_custom_watermarks\) <> 0/u);
  assert.match(wrapper, /- 'watermarkAssets'/u);
  assert.match(wrapper, /- 'institutionalWatermark'/u);
  assert.match(
    wrapper,
    /jsonb_build_object\('institutionalWatermark', 'null'::jsonb\)/u,
  );
  assert.match(wrapper, /SET search_path = ''/u);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION\s+public\.assinatura_eletronica_rpc_iniciar_finalizacao_diario_v3_legacy/u,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION\s+public\.assinatura_eletronica_rpc_iniciar_finalizacao_diario\([\s\S]*?\) TO service_role/u,
  );
  assert.doesNotMatch(sql, /\bcpf(?:_cnpj|Raw|Cnpj)?\b/iu);
});

Deno.test("Edge usa somente institutionalWatermark congelada nos schemas 2 e 3", () => {
  assert.match(artifacts, /loadFrozenInstitutionalWatermark/u);
  assert.match(
    artifacts,
    /manifestWatermark\.sourceUrl !== reference\.sourceUrl/u,
  );
  assert.match(
    artifacts,
    /decodeCanonicalInlineDataImage\(snapshot\.assetSources\.watermarkUrl\)/u,
  );
  assert.match(artifacts, /geometry\.schemaVersion/u);
  assert.match(
    artifacts,
    /geometrySchemaVersion >= 2 && references\.length !== 0/u,
  );
  assert.doesNotMatch(
    artifacts,
    /customWatermarks\.map\([^)]*loadFrozenModelAsset/su,
  );
  assert.match(artifacts, /contentLayout: geometry\.contentLayout/u);
  assert.match(
    artifacts,
    /institutionalWatermark: institutionalWatermark[\s\S]*?asCanonicalImage/u,
  );
  assert.match(
    artifacts,
    /delete \(receiptPayload as Record<string, unknown>\)\.watermarkAssets/u,
  );
  assert.match(adapter, /contentLayout: input\.contentLayout/u);
});

// @ts-nocheck -- contrato estático da migration incremental e do compositor.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260821030000_preserve_signature_institutional_watermark_presentation.sql",
  import.meta.url,
);
const portraitMigrationUrl = new URL(
  "../migrations/20260821040000_use_portrait_watermark_for_signature_receipts.sql",
  import.meta.url,
);
const artifactFinalizationUrl = new URL(
  "../functions/assinatura-eletronica-diario-artefatos/artifact-finalization.ts",
  import.meta.url,
);
const previewUrl = new URL(
  "../../modules/gestor/configuracoes/assinatura-eletronica/AssinaturaEletronicaConfig.tsx",
  import.meta.url,
);
const serviceUrl = new URL(
  "../../modules/shared/assinatura-eletronica/assinatura-eletronica.service.preview-normalizers.ts",
  import.meta.url,
);
const finalAssetsUrl = new URL(
  "../functions/assinatura-eletronica-diario-artefatos/artifact-final-assets.ts",
  import.meta.url,
);
const compositorUrl = new URL(
  "../../modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.receipt-decoration.ts",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const portraitSql = await Deno.readTextFile(portraitMigrationUrl);
const artifactFinalization = await Deno.readTextFile(artifactFinalizationUrl);
const preview = await Deno.readTextFile(previewUrl);
const service = await Deno.readTextFile(serviceUrl);
const finalAssets = await Deno.readTextFile(finalAssetsUrl);
const compositor = await Deno.readTextFile(compositorUrl);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

const portraitFunctionBlock = (signature: string) => {
  const start = portraitSql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = portraitSql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return portraitSql.slice(start, end);
};

Deno.test("migration congela o modelo completo sem reescrever snapshots históricos", () => {
  const validator = functionBlock(
    "public.assinatura_eletronica_snapshot_academico_diario_valido(",
  );
  const freezer = functionBlock(
    "public.assinatura_eletronica_congelar_marca_landscape_diario()",
  );
  const model = functionBlock(
    "public.assinatura_eletronica_marca_landscape_apresentacao_valida(",
  );

  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.match(
    sql,
    /RENAME TO assinatura_eletronica_snapshot_academico_diario_valido_v2_inline_watermark/u,
  );
  assert.match(model, /IF p_watermark IS NULL/u);
  assert.match(
    model,
    /ARRAY\['opacity', 'rotate', 'scale', 'url'\]::text\[\]/u,
  );
  assert.match(model, /v_opacity BETWEEN 0 AND 1/u);
  assert.match(model, /v_scale BETWEEN 10 AND 100/u);
  assert.match(model, /v_scale % 5 = 0/u);
  assert.match(validator, /v_identity - 'watermark'/u);
  assert.match(
    validator,
    /#>> '\{institutionalIdentity,watermarkUrl\}'/u,
  );
  assert.match(validator, /#>> '\{assetSources,watermarkUrl\}'/u);
  assert.match(
    freezer,
    /v_watermark := v_template\.conteudo/u,
  );
  assert.match(
    freezer,
    /ARRAY\['institutionalIdentity', 'watermark'\]/u,
  );
  assert.match(freezer, /academico_snapshot_sha256/u);
  assert.doesNotMatch(freezer, /coalesce\(/iu);
});

Deno.test("prévia, Edge e compositor transportam os parâmetros do modelo oficial", () => {
  const identity = functionBlock(
    "public.assinatura_eletronica_preview_identidade_matriz()",
  );

  assert.match(identity, /SECURITY INVOKER/u);
  assert.match(identity, /SET search_path = ''/u);
  assert.match(identity, /marca\.conteudo AS watermark/u);
  assert.match(identity, /'watermark', v_watermark/u);
  assert.doesNotMatch(identity, /'watermarkUrl'/u);
  assert.match(preview, /canonicalPreviewIdentity\.watermark\.url/u);
  assert.doesNotMatch(preview, /canonicalPreviewIdentity\.watermarkUrl/u);
  assert.match(service, /const normalizePreviewWatermark/u);
  assert.match(
    service,
    /\["institution", "logoUrl", "watermark"\]/u,
  );
  assert.match(
    artifactFinalization,
    /resolveReceiptWatermarkSettings\([\s\S]*?preflight\.receiptWatermarkSnapshot/u,
  );
  assert.match(
    finalAssets,
    /receiptSnapshot\.opacity[\s\S]*?receiptSnapshot\.scale[\s\S]*?receiptSnapshot\.rotate/u,
  );
  assert.match(compositor, /settings\.rotate \? -45 : 0/u);
  assert.match(
    compositor,
    /PAGE_WIDTH \* settings\.scale \/ 100/u,
  );
});

Deno.test("comprovante retrato usa o modelo oficial do polo, nunca o template paisagem", () => {
  const freezer = portraitFunctionBlock(
    "public.assinatura_eletronica_congelar_marca_landscape_diario()",
  );
  const identity = portraitFunctionBlock(
    "public.assinatura_eletronica_preview_identidade_matriz()",
  );

  assert.match(portraitSql, /^BEGIN;/m);
  assert.match(portraitSql, /COMMIT;\s*$/u);
  assert.match(
    freezer,
    /FROM public\.polos AS pole[\s\S]*?WHERE pole\.id = NEW\.polo_id[\s\S]*?FOR KEY SHARE/u,
  );
  assert.match(freezer, /'url', v_polo\.watermark_url/u);
  assert.match(freezer, /'opacity', v_polo\.watermark_opacity/u);
  assert.match(freezer, /'scale', v_polo\.watermark_scale/u);
  assert.match(freezer, /'rotate', v_polo\.watermark_rotate/u);
  assert.doesNotMatch(freezer, /documentos_templates|watermark_landscape_/u);
  assert.match(identity, /pole\.watermark_url/u);
  assert.match(identity, /pole\.watermark_opacity/u);
  assert.match(identity, /pole\.watermark_scale/u);
  assert.match(identity, /pole\.watermark_rotate/u);
  assert.doesNotMatch(identity, /documentos_templates|watermark_landscape_/u);
});

// @ts-nocheck -- contrato estático de migration/Edge executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260818204500_add_assinatura_eletronica_custom_watermark_assets_v2.sql",
  import.meta.url,
);
const edgeUrl = new URL(
  "../functions/assinatura-eletronica-modelo-assets/index.ts",
  import.meta.url,
);
const configUrl = new URL("../config.toml", import.meta.url);

const sql = await Deno.readTextFile(migrationUrl);
const edge = await Deno.readTextFile(edgeUrl);
const config = await Deno.readTextFile(configUrl);
const edgeHandler = edge.slice(edge.indexOf("export const handleRequest"));

const functionBlock = (signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("schema 2 has independent page assets and exact watermark keys", () => {
  const defaults = functionBlock(
    "public.assinatura_eletronica_editor_padrao()",
  );
  const normalizer = functionBlock(
    "public.assinatura_eletronica_normalizar_editor(",
  );

  assert.match(defaults, /'schemaVersion', 2/i);
  assert.equal((defaults.match(/'assetId', NULL/g) || []).length, 2);
  assert.match(
    normalizer,
    /ARRAY\['assetId', 'enabled', 'label', 'opacity', 'rotationDegrees', 'scalePercent', 'source'\]::text\[\]/i,
  );
  assert.match(
    normalizer,
    /IS DISTINCT FROM \(\s*CASE v_schema[\s\S]*?END\s*\)/i,
  );
  assert.match(normalizer, /v_source NOT IN \('TEXT', 'CUSTOM_ASSET'\)/i);
  assert.match(
    normalizer,
    /v_source = 'CUSTOM_ASSET'[\s\S]*?v_schema <> 2[\s\S]*?OR v_rotation <> 0/i,
  );
  assert.match(
    normalizer,
    /v_schema = 1 AND v_source = 'INSTITUTIONAL_BRAND'[\s\S]*?v_source := 'TEXT'[\s\S]*?v_asset_id := NULL/i,
  );
  assert.match(normalizer, /'schemaVersion', 2/i);
  assert.match(
    normalizer,
    /v_source = 'TEXT'[\s\S]*?jsonb_typeof\(v_watermark -> 'assetId'\) IS DISTINCT FROM 'null'/i,
  );
  assert.match(
    normalizer,
    /v_source = 'CUSTOM_ASSET'[\s\S]*?jsonb_typeof\(v_watermark -> 'label'\) IS DISTINCT FROM 'null'/i,
  );
});

Deno.test("custom assets use an isolated private PNG bucket with fail-closed access", () => {
  assert.match(
    sql,
    /'assinatura-eletronica-modelo-assets',[\s\S]*?false,[\s\S]*?1048576,[\s\S]*?ARRAY\['image\/png'\]/i,
  );
  assert.match(
    sql,
    /CREATE TABLE public\.assinatura_eletronica_modelo_asset_reservas/i,
  );
  assert.match(
    sql,
    /CREATE TABLE public\.assinatura_eletronica_modelo_assets/i,
  );
  assert.match(
    sql,
    /CREATE TABLE public\.assinatura_eletronica_politica_assets/i,
  );
  assert.match(sql, /ON DELETE RESTRICT/g);
  assert.equal(
    (sql.match(/ENABLE ROW LEVEL SECURITY/gi) || []).length >= 3,
    true,
  );
  assert.equal(
    (sql.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated/gi) || [])
      .length >= 4,
    true,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.assinatura_eletronica_modelo_assets[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /storage_path = 'global\/' \|\| id::text \|\| '\.png'/i,
  );
});

Deno.test("reservation and metadata RPCs enforce authorization before lookup", () => {
  const authorizeAccess = functionBlock(
    "public.assinatura_eletronica_modelo_asset_autorizar_acesso()",
  );
  const reserve = functionBlock(
    "public.assinatura_eletronica_modelo_asset_reservar(",
  );
  const register = functionBlock(
    "public.assinatura_eletronica_modelo_asset_registrar(",
  );
  const resolve = functionBlock(
    "public.assinatura_eletronica_modelo_asset_resolver(",
  );
  const internalResolve = functionBlock(
    "public.assinatura_eletronica_modelo_asset_resolver_storage(",
  );

  assert.ok(
    authorizeAccess.indexOf(
      "assinatura_eletronica_autoriza_configuracao(NULL)",
    ) <
      authorizeAccess.indexOf("RETURN true"),
  );
  assert.ok(
    reserve.indexOf("assinatura_eletronica_autoriza_configuracao(NULL)") <
      reserve.indexOf(
        "FROM public.assinatura_eletronica_modelo_asset_reservas",
      ),
  );
  assert.match(reserve, /v_recent_requests >= 10/i);
  assert.match(reserve, /v_recent_assets >= 100/i);
  assert.ok(
    register.indexOf("service_role") <
      register.indexOf(
        "FROM public.assinatura_eletronica_modelo_asset_reservas",
      ),
  );
  assert.match(register, /FROM storage\.objects AS objeto/i);
  assert.match(register, /STORAGE_METADATA_MISMATCH/i);
  assert.match(register, /v_reserva\.consumida_em IS NOT NULL/i);
  assert.match(register, /v_existing_asset\.id IS DISTINCT FROM p_asset_id/i);
  assert.match(register, /ASSINATURA_MODELO_ASSET_REPLAY_MISMATCH/i);
  assert.match(register, /'replayed', true/i);
  assert.match(
    register,
    /INSERT INTO public\.assinatura_eletronica_modelo_assets\s*\(\s*id,\s*reserva_id,\s*bucket_id,\s*storage_path,\s*mime_type,\s*tamanho_bytes,\s*largura,\s*altura,\s*sha256,\s*criada_por\s*\)\s*VALUES\s*\(\s*p_asset_id,\s*v_reserva\.id,/i,
  );
  assert.doesNotMatch(register, /\(\s*id,\s*id,/i);
  assert.ok(
    resolve.indexOf("assinatura_eletronica_autoriza_configuracao(NULL)") <
      resolve.indexOf("FROM public.assinatura_eletronica_modelo_assets"),
  );
  assert.doesNotMatch(resolve, /storagePath|bucketId/i);
  assert.match(internalResolve, /SERVICE_ROLE_REQUIRED/i);
  assert.match(internalResolve, /asset\.status = 'PRONTO'/i);
  assert.match(internalResolve, /'storagePath', v_asset\.storage_path/i);
});

Deno.test("save validates assets and freezes snapshots, hashes and FK links atomically", () => {
  const save = functionBlock(
    "public.assinatura_eletronica_salvar_configuracao(",
  );

  assert.match(
    sql,
    /public\.assinatura_eletronica_salvar_configuracao\(\s*p_polo_id uuid DEFAULT NULL,\s*p_documento text DEFAULT 'MODELO_PADRAO',\s*p_configuracao jsonb DEFAULT '\{\}'::jsonb,\s*p_request_id uuid DEFAULT NULL\s*\)/i,
  );
  assert.doesNotMatch(
    sql,
    /p_configuracao jsonb DEFAULT '\{\}'::jsonb,\s*p_configuracao jsonb/i,
  );
  assert.match(save, /v_habilitada boolean := false/i);
  assert.match(save, /v_status_juridico text := 'PENDENTE_MATRIZ_JURIDICA'/i);
  assert.match(save, /asset\.status = 'PRONTO'[\s\S]*?FOR KEY SHARE/i);
  assert.match(save, /'watermarkAssetSnapshots', v_asset_snapshots/i);
  assert.match(save, /'sha256', v_asset\.sha256/i);
  assert.match(
    save,
    /INSERT INTO public\.assinatura_eletronica_politica_assets/i,
  );
  assert.match(
    save,
    /v_resultado\.id,[\s\S]*?asset\.id,[\s\S]*?asset\.sha256/i,
  );
  assert.doesNotMatch(
    save.slice(save.indexOf("v_politica_core :=")),
    /'storagePath'|'bucketId'/i,
  );
  assert.doesNotMatch(save, /assinatura_eletronica_envelopes/i);
});

Deno.test("cleanup is creator-scoped, race-safe and refuses referenced assets", () => {
  const authorize = functionBlock(
    "public.assinatura_eletronica_modelo_asset_cleanup_autorizar(",
  );
  const finalize = functionBlock(
    "public.assinatura_eletronica_modelo_asset_cleanup_finalizar(",
  );
  const cleanupResolve = functionBlock(
    "public.assinatura_eletronica_modelo_asset_cleanup_resolver_storage(",
  );

  assert.match(
    authorize,
    /assinatura_eletronica_autoriza_configuracao\(NULL\)/i,
  );
  assert.match(authorize, /v_asset\.criada_por IS DISTINCT FROM v_actor/i);
  assert.match(authorize, /FOR UPDATE/i);
  assert.match(authorize, /assinatura_eletronica_politica_assets/i);
  assert.match(authorize, /ASSINATURA_MODELO_ASSET_REFERENCIADO/i);
  assert.match(authorize, /SET status = 'LIMPEZA_PENDENTE'/i);
  assert.match(cleanupResolve, /SERVICE_ROLE_REQUIRED/i);
  assert.match(cleanupResolve, /asset\.status = 'LIMPEZA_PENDENTE'/i);
  assert.match(finalize, /SERVICE_ROLE_REQUIRED/i);
  assert.match(finalize, /FROM storage\.objects/i);
  assert.match(
    finalize,
    /DELETE FROM public\.assinatura_eletronica_modelo_assets/i,
  );
  assert.match(edge, /action === "cleanup"/i);
  assert.match(
    edge,
    /const cleanupTrackedAsset[\s\S]*?assinatura_eletronica_modelo_asset_cleanup_resolver_storage/i,
  );
  assert.match(edge, /action === "cleanup"[\s\S]*?cleanupTrackedAsset/i);
  assert.match(edge, /REFERENCIADO\|23503/i);
  assert.match(edge, /409/i);
});

Deno.test("reconciliation converges expired, unlinked and orphaned records", () => {
  const reconcile = functionBlock(
    "public.assinatura_eletronica_modelo_asset_reconciliar_reivindicar(",
  );
  assert.ok(
    reconcile.indexOf("service_role") <
      reconcile.indexOf(
        "FROM public.assinatura_eletronica_modelo_asset_reservas",
      ),
  );
  assert.match(
    reconcile,
    /p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100/i,
  );
  assert.match(reconcile, /reserva\.expira_em <= v_agora/i);
  assert.match(
    reconcile,
    /ORDER BY reserva\.expira_em[\s\S]*?LIMIT p_limite \* 4[\s\S]*?FOR UPDATE OF reserva SKIP LOCKED/i,
  );
  assert.match(
    reconcile,
    /asset\.created_at <= v_agora - interval '24 hours'/i,
  );
  assert.match(
    reconcile,
    /ORDER BY asset\.created_at[\s\S]*?LIMIT p_limite[\s\S]*?FOR UPDATE OF asset SKIP LOCKED/i,
  );
  assert.match(reconcile, /objeto\.created_at <= v_agora - interval '1 hour'/i);
  assert.match(reconcile, /asset\.status = 'LIMPEZA_PENDENTE'/i);
  assert.match(
    reconcile,
    /NOT EXISTS \([\s\S]*?assinatura_eletronica_politica_assets AS vinculo[\s\S]*?vinculo\.asset_id = asset\.id/i,
  );
  assert.match(reconcile, /'ORPHAN_OBJECT'::text/i);
  assert.match(edge, /reconcileModelAssets\(admin, 5\)/i);
  assert.match(edge, /action === "reconcile"/i);
  assert.match(
    edge,
    /if \(removeError\)[\s\S]*?retry_pending[\s\S]*?continue;[\s\S]*?cleanup_finalizar/i,
  );
  assert.match(
    edge,
    /if \(finalizeError\)[\s\S]*?retry_pending[\s\S]*?continue;/i,
  );
});

Deno.test("Edge validates JWT, keeps Storage private and returns short signed previews", () => {
  assert.match(
    config,
    /\[functions\.assinatura-eletronica-modelo-assets\][\s\S]*?verify_jwt = true/i,
  );
  assert.match(edge, /bearerTokenFromRequest\(request\)/i);
  assert.match(edge, /admin\.auth\.getUser\([\s\S]*?bearer,[\s\S]*?\)/i);
  assert.ok(
    edgeHandler.indexOf(
      "assinatura_eletronica_modelo_asset_autorizar_acesso",
    ) < edgeHandler.indexOf(
      "readBodyBounded(request, MAX_MULTIPART_BYTES)",
    ),
  );
  assert.doesNotMatch(edgeHandler, /await request\.formData\(\)/i);
  assert.match(
    edgeHandler,
    /readBodyBounded\(request, MAX_MULTIPART_BYTES\)[\s\S]*?boundedRequest\.formData\(\)/i,
  );
  assert.match(edge, /MAX_PNG_BYTES = 1024 \* 1024/i);
  assert.match(edge, /MAX_PNG_SIDE = 4096/i);
  assert.match(edge, /MAX_PNG_PIXELS = 12_000_000/i);
  assert.equal(
    (edge.match(/const height = readNumber\(record, "height"\);/g) || [])
      .length,
    1,
  );
  assert.match(edge, /file\.type !== "image\/png"/i);
  assert.match(edge, /validateAndSanitizePng/i);
  assert.match(edge, /upsert: false/i);
  assert.match(
    edge,
    /let registration = await admin\.rpc\([\s\S]*?assinatura_eletronica_modelo_asset_registrar[\s\S]*?if \(registration\.error \|\| !registration\.data\)[\s\S]*?registration = await admin\.rpc\([\s\S]*?assinatura_eletronica_modelo_asset_registrar/i,
  );
  assert.match(
    edge,
    /if \(registration\.error \|\| !registered\)[\s\S]*?assinatura_eletronica_modelo_asset_resolver_storage[\s\S]*?if \(!registered\)[\s\S]*?removeStorageObject/i,
  );
  assert.match(
    edge,
    /metadata\.assetId !== assetId[\s\S]*?metadata\.sha256 !== sha256/i,
  );
  assert.match(edge, /createSignedUrl[\s\S]*?PREVIEW_EXPIRES_IN_SECONDS/i);
  assert.match(edge, /PREVIEW_EXPIRES_IN_SECONDS = 300/i);
  assert.match(edge, /action === "resolve-preview"/i);
  assert.doesNotMatch(edge, /getPublicUrl|\/object\/public\//i);
  assert.match(
    edge,
    /return json\([\s\S]*?\.\.\.metadata,[\s\S]*?signedUrl: signed\.signedUrl,[\s\S]*?expiresIn:/i,
  );
});

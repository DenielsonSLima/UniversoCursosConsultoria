// @ts-nocheck -- contrato estatico da migration incremental v5.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260820180725_add_signature_editor_v5_global_stamp_template.sql",
  import.meta.url,
);
const appliedIndividualUrl = new URL(
  "../migrations/20260820130912_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const previousV4Url = new URL(
  "../migrations/20260820180207_add_signature_editor_v4_institutional_brand.sql",
  import.meta.url,
);
const globalModelNormalizationUrl = new URL(
  "../migrations/20260820181901_normalize_global_signature_stamp_model_v5.sql",
  import.meta.url,
);
const envelopeRequestV1Url = new URL(
  "../migrations/20260819203221_enable_diario_signature_envelopes_v1.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const appliedIndividual = await Deno.readTextFile(appliedIndividualUrl);
const previousV4 = await Deno.readTextFile(previousV4Url);
const globalModelNormalization = await Deno.readTextFile(
  globalModelNormalizationUrl,
);
const envelopeRequestV1 = await Deno.readTextFile(envelopeRequestV1Url);

const occurrences = (source: string, fragment: string) =>
  source.split(fragment).length - 1;

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("v5 é incremental, atômica e preserva migrations anteriores", () => {
  assert.match(sql, /^BEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.match(
    appliedIndividual,
    /prova individual|carimbo individual/iu,
  );
  assert.match(previousV4, /schemaVersion',\s*4/u);
  assert.doesNotMatch(previousV4, /STAMP_TOP_LEFT_BP_V1/u);
  assert.match(previousV4, /assinatura_eletronica_geometria_v2_valida/u);
  assert.match(previousV4, /assinatura_eletronica_congelar_geometria_v2/u);
  assert.match(
    previousV4,
    /RENAME TO assinatura_eletronica_rpc_iniciar_finalizacao_diario_v3_legacy/u,
  );
  assert.match(
    previousV4,
    /assinatura_eletronica_salvar_configuracao_v2_legacy/u,
  );
  assert.doesNotMatch(sql, /ASSINATURA_EDITOR_V5_ENVELOPES_EXISTENTES/u);
  assert.match(sql, /ASSINATURA_EDITOR_V5_PRECONDICAO_V4_INVALIDA/u);
  assert.match(sql, /ASSINATURA_EDITOR_V5_MARCA_CUSTOM_INCOMPATIVEL/u);
  assert.match(sql, /assinatura_eletronica_politica_assets/u);
});

Deno.test("reparo incremental normaliza somente o MODELO_PADRAO v3 sem trocar asset ou vínculo", () => {
  assert.match(globalModelNormalization, /^BEGIN;/mu);
  assert.match(globalModelNormalization, /COMMIT;\s*$/u);
  assert.match(
    globalModelNormalization,
    /LOCK TABLE public\.assinatura_eletronica_politicas IN SHARE ROW EXCLUSIVE MODE/u,
  );
  assert.match(
    globalModelNormalization,
    /politica\.documento = 'MODELO_PADRAO'[\s\S]*?politica\.polo_id IS NULL[\s\S]*?politica\.arquivada_em IS NULL/u,
  );
  assert.match(
    globalModelNormalization,
    /v_policy_count <> 1[\s\S]*?ASSINATURA_MODELO_PADRAO_V5_CARDINALIDADE_INVALIDA/u,
  );
  assert.match(
    globalModelNormalization,
    /'schemaVersion'\)\s+IS DISTINCT FROM '3'/u,
  );
  assert.match(
    globalModelNormalization,
    /FROM public\.assinatura_eletronica_envelopes AS envelope[\s\S]*?envelope\.politica_id = v_policy\.id/u,
  );
  assert.match(
    globalModelNormalization,
    /v_link_count <> 1[\s\S]*?VINCULO_CARIMBO_INVALIDO/u,
  );
  assert.ok(
    globalModelNormalization.includes(
      "v_snapshot_asset_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
    ),
  );
  assert.match(
    globalModelNormalization,
    /public\.assinatura_eletronica_normalizar_editor\(v_editor_v3\)/u,
  );
  assert.match(
    globalModelNormalization,
    /SET politica = pg_catalog\.jsonb_set\([\s\S]*?ARRAY\['editor'\][\s\S]*?v_editor_v5/u,
  );
  assert.match(
    globalModelNormalization,
    /v_updated_policy\.politica -> 'signatureStampAssetSnapshot'[\s\S]*?IS DISTINCT FROM v_asset_snapshot/u,
  );
  assert.match(
    globalModelNormalization,
    /v_link_after\.asset_snapshot IS DISTINCT FROM v_link\.asset_snapshot/u,
  );
  assert.doesNotMatch(
    globalModelNormalization,
    /INSERT INTO public\.assinatura_eletronica_politicas/u,
  );
  assert.doesNotMatch(
    globalModelNormalization,
    /arquivada_em\s*=/u,
  );
});

Deno.test("um template global contém 11 bindings canônicos em ordem fechada", () => {
  const validator = functionBlock(
    "public.assinatura_eletronica_template_carimbo_v5_valido(",
  );
  const normalizer = functionBlock(
    "public.assinatura_eletronica_normalizar_editor(",
  );
  for (
    const token of [
      "STAMP_ASSET",
      "SIGNER_ROLE",
      "DISPLAY_TITLE",
      "SIGNER_NAME",
      "SIGNED_AT",
      "SIGNER_CPF_MASKED",
      "SIGNATURE_HASH",
      "VERIFICATION_CODE",
      "VERIFICATION_URL",
      "DECORATIVE",
    ]
  ) {
    assert.match(validator, new RegExp(`'${token}'`, "u"));
  }
  assert.match(
    validator,
    /jsonb_array_length\(p_template -> 'elements'\) <> 11/u,
  );
  assert.match(validator, /STAMP_TOP_LEFT_BP_V1/u);
  assert.match(
    normalizer,
    /'assetId', 'autoLayout', 'canonicalLabel', 'enabled', 'template'/u,
  );
  assert.doesNotMatch(
    normalizer,
    /'assetId', 'canonicalLabel', 'contentLayout'/u,
  );
});

Deno.test("somente a geometria é editável; estilos e bindings são canônicos", () => {
  const validator = functionBlock(
    "public.assinatura_eletronica_template_carimbo_v5_valido(",
  );
  assert.match(validator, /v_expected_styles constant jsonb/u);
  assert.match(
    validator,
    /v_element -> 'style' IS DISTINCT FROM v_expected_styles -> v_index/u,
  );
  assert.match(validator, /'opacityBp', 100000/u);
  assert.match(validator, /'font', 'COURIER', 'fontSizeBp', 5500/u);
  assert.match(validator, /'widthBp', 500/u);
  assert.match(validator, /v_width NOT BETWEEN 29000 AND 40000/u);
  assert.match(validator, /'quietZoneModules', 4/u);
  assert.doesNotMatch(validator, /v_font_size|v_line_width|v_opacity/u);
  assert.match(validator, /v_qr := p_template -> 'elements' -> 9/u);
  assert.match(validator, /FOR v_index IN 0\.\.10 LOOP[\s\S]*?v_index <> 9/u);
  assert.doesNotMatch(sql, /SIGNER_CPF_RAW|cpf_cnpj|document\.cookie/iu);
  assert.doesNotMatch(sql, /\b[0-9]{3}[.]?[0-9]{3}[.]?[0-9]{3}-?[0-9]{2}\b/u);
});

Deno.test("uma regra automática neutra aplica o mesmo template a até 6 signatários", () => {
  const autoLayout = functionBlock(
    "public.assinatura_eletronica_auto_layout_carimbo_v5_valido(",
  );
  const defaultTemplate = functionBlock(
    "public.assinatura_eletronica_template_carimbo_v5_padrao()",
  );
  assert.match(autoLayout, /'maxSigners' = '6'/u);
  assert.match(autoLayout, /'columns' = '2'/u);
  assert.match(autoLayout, /'widthBp' = '38000'/u);
  assert.match(autoLayout, /'heightBp' = '14000'/u);
  assert.match(
    autoLayout,
    /jsonb_typeof\(p_layout -> 'maxSigners'\) IS DISTINCT FROM 'number'/u,
  );
  assert.doesNotMatch(autoLayout, /role|instance/iu);
  assert.doesNotMatch(defaultTemplate, /PROFESSOR|COORDENADOR/u);
  assert.doesNotMatch(sql, /instances|instancias/iu);
});

Deno.test("default reserva área legível para SHA, URL e QR individual", () => {
  const defaultTemplate = functionBlock(
    "public.assinatura_eletronica_template_carimbo_v5_padrao()",
  );
  const converter = functionBlock(
    "public.assinatura_eletronica_editor_v5_a_partir_v4(",
  );
  assert.match(
    defaultTemplate,
    /'id', 'signatureHash'[\s\S]*?'heightBp', 14000/u,
  );
  assert.match(
    defaultTemplate,
    /'id', 'verificationUrl'[\s\S]*?'heightBp', 14000/u,
  );
  assert.match(
    defaultTemplate,
    /'id', 'verificationQr'[\s\S]*?'xBp', 71000, 'yBp', 29000,[\s\S]*?'widthBp', 29000, 'heightBp', 29000/u,
  );
  assert.match(converter, /'columns', 2/u);
  assert.match(converter, /'maxSigners', 6/u);
  assert.match(converter, /'heightBp', 14000/u);
});

Deno.test("schemas v1-v4 convertem para v5 sem reescrever história", () => {
  const normalizer = functionBlock(
    "public.assinatura_eletronica_normalizar_editor(",
  );
  const converter = functionBlock(
    "public.assinatura_eletronica_editor_v5_a_partir_v4(",
  );
  assert.match(normalizer, /schema 1, 2, 3, 4 ou 5/u);
  assert.match(normalizer, /IF v_schema <= 4 THEN/u);
  assert.match(
    converter,
    /assinatura_eletronica_normalizar_editor_v4_institutional_legacy/u,
  );
  assert.match(converter, /v_auto_layout jsonb/u);
  assert.match(converter, /'maxSigners', 6/u);
  assert.doesNotMatch(converter, /v_slot|-> 'slots'|instance/iu);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION\s+public\.assinatura_eletronica_normalizar_editor_v4_institutional_legacy/u,
  );
});

Deno.test("geometry v3 congela o template global e sua regra automática", () => {
  const geometry = functionBlock(
    "public.assinatura_eletronica_geometria_snapshot_valida(",
  );
  const freezer = functionBlock(
    "public.assinatura_eletronica_congelar_geometria_v3()",
  );
  assert.match(geometry, /p_snapshot ->> 'schemaVersion' !~ '\^\[123\]\$'/u);
  assert.match(
    geometry,
    /'assetId', 'assetSnapshot', 'autoLayout', 'coordinateSpace',[\s\S]*?'schemaVersion', 'template'/u,
  );
  assert.match(freezer, /'schemaVersion', 3/u);
  assert.match(
    freezer,
    /WHERE politica\.documento = 'MODELO_PADRAO'[\s\S]*?politica\.polo_id IS NULL/u,
  );
  assert.match(
    freezer,
    /'template', v_global_editor -> 'signatureStamp' -> 'template'/u,
  );
  assert.match(
    freezer,
    /'assetSnapshot', coalesce\(\s*v_global_politica\.politica -> 'signatureStampAssetSnapshot'/u,
  );
  assert.match(
    freezer,
    /'autoLayout', v_global_editor -> 'signatureStamp' -> 'autoLayout'/u,
  );
  assert.match(freezer, /NEW\.geometria_snapshot := v_global_geometry/u);
  assert.match(freezer, /ASSINATURA_MODELO_PADRAO_CARIMBO_V5_INVALIDO/u);
  assert.match(
    sql,
    /- 'signatureStampAssetSnapshot'[\s\S]*?\{signatureStamp,assetId\}[\s\S]*?'null'::jsonb/u,
  );
  assert.match(
    sql,
    /assinatura_eletronica_envelopes_00_geometry_v3_before_insert/u,
  );
  assert.match(sql, /assinatura_eletronica_geometria_v2_valida\(p_snapshot\)/u);
});

Deno.test("salvamento do MODELO_PADRAO exige asset pronto e snapshot", () => {
  const saver = functionBlock(
    "public.assinatura_eletronica_salvar_configuracao(",
  );
  assert.match(
    saver,
    /jsonb_typeof\(v_editor -> 'signatureStamp' -> 'assetId'\)[\s\S]*?IS DISTINCT FROM 'string'/u,
  );
  assert.match(
    saver,
    /O modelo global exige uma imagem de carimbo pronta antes de salvar/u,
  );
  assert.match(
    saver,
    /WHERE asset\.id = v_stamp_asset_id[\s\S]*?asset\.status = 'PRONTO'/u,
  );
  assert.match(
    saver,
    /INSERT INTO public\.assinatura_eletronica_politica_carimbo_assets/u,
  );
});

Deno.test("v1/v2 históricos seguem intocados e v3 usa o finalizador global", () => {
  const freezer = functionBlock(
    "public.assinatura_eletronica_congelar_geometria_v3()",
  );
  const wrapper = functionBlock(
    "public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(",
  );
  assert.match(
    freezer,
    /v_policy_editor ->> 'schemaVersion' !~ '\^\[45\]\$'/u,
  );
  assert.match(
    freezer,
    /v_policy_editor -> 'signatureStamp' -> 'layout'/u,
  );
  assert.match(
    wrapper,
    /IF v_schema_geometria IN \(1, 2\) THEN[\s\S]*?assinatura_eletronica_rpc_iniciar_finalizacao_diario_v3_legacy/u,
  );
  assert.match(
    wrapper,
    /assinatura_eletronica_internal_iniciar_finalizacao_diario_v5_global/u,
  );
  assert.match(
    sql,
    /Envelopes ja emitidos sao prova imutavel[\s\S]*?envelope\.politica_id = politica\.id/u,
  );
});

Deno.test("finalização v5 usa snapshot global, provas completas e referência inline", () => {
  const events = functionBlock(
    "public.assinatura_eletronica_eventos_assinatura_diario_v5_validados(",
  );
  const proofs = functionBlock(
    "public.assinatura_eletronica_provas_individuais_diario_v5(",
  );
  const internal = functionBlock(
    "public.assinatura_eletronica_internal_iniciar_finalizacao_diario_v5_global(",
  );
  const wrapper = functionBlock(
    "public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(",
  );
  assert.match(events, /v_total_participants NOT BETWEEN 1 AND 6/u);
  assert.match(proofs, /jsonb_array_length\(v_eventos\) NOT BETWEEN 1 AND 6/u);
  assert.doesNotMatch(events, /v_event_count <> 2|v_valid_count <> 2/u);
  assert.match(
    internal,
    /WHERE asset\.id = \(v_envelope\.geometria_snapshot ->> 'assetId'\)::uuid/u,
  );
  assert.match(
    internal,
    /v_envelope\.geometria_snapshot -> 'assetSnapshot'/u,
  );
  assert.doesNotMatch(
    internal,
    /assinatura_eletronica_politica_carimbo_assets/u,
  );
  assert.match(
    wrapper,
    /assinatura_eletronica_provas_individuais_diario_v5/u,
  );
  assert.match(wrapper, /'\{participants\}',\s*v_provas/u);
  assert.match(
    wrapper,
    /'sourceKind', 'INLINE_DATA_URI',[\s\S]*?'sourceRef', 'documentSnapshot[.]assetSources[.]watermarkUrl'/u,
  );
  assert.match(wrapper, /'customWatermarks', '\[\]'::jsonb/u);
  assert.match(
    wrapper,
    /ASSINATURA_TRANSPORTE_PROVAS_V5_INVALIDO/u,
  );
});

Deno.test("helpers v5 SECURITY DEFINER não ficam executáveis publicamente", () => {
  for (
    const signature of [
      "assinatura_eletronica_eventos_assinatura_diario_v5_validados\\(uuid\\)",
      "assinatura_eletronica_provas_individuais_diario_v5\\(uuid\\)",
      "assinatura_eletronica_internal_iniciar_finalizacao_diario_v5_global\\([\\s\\S]*?uuid, uuid, uuid, uuid",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION\\s+public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "u",
      ),
    );
  }
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION\s+public\.assinatura_eletronica_(eventos_assinatura_diario_v5_validados|provas_individuais_diario_v5|internal_iniciar_finalizacao_diario_v5_global)/u,
  );
});

Deno.test("prévia e envelope usam somente watermark_landscape_<polo_id> inline", () => {
  const preview = functionBlock(
    "public.assinatura_eletronica_preview_identidade_matriz()",
  );
  const brandFreezer = functionBlock(
    "public.assinatura_eletronica_congelar_marca_landscape_diario()",
  );
  assert.match(preview, /'watermark_landscape_' \|\| pole\.id::text/u);
  assert.match(preview, /marca\.conteudo ->> 'url'/u);
  assert.doesNotMatch(preview, /pole\.watermark_url|company\.watermark_url/u);
  assert.match(brandFreezer, /'watermark_landscape_' \|\| NEW\.polo_id::text/u);
  assert.match(
    brandFreezer,
    /assinatura_eletronica_marca_landscape_data_uri_valida\(\s*v_source/su,
  );
  assert.match(brandFreezer, /academico_snapshot_sha256/u);
  assert.match(
    preview,
    /IF NOT public\.assinatura_eletronica_marca_landscape_data_uri_valida\(\s*v_watermark_url/su,
  );
  assert.match(
    sql,
    /NOT public\.assinatura_eletronica_marca_landscape_data_uri_valida\(\s*marca\.conteudo ->> 'url'/su,
  );
  assert.match(sql, /ASSINATURA_DIARIO_LANDSCAPE_SOURCE_DRIFT/u);
  assert.match(sql, /v_watermark_template\.conteudo ->> \\'url\\'/u);
  assert.match(sql, /LANDSCAPE_PATCH_INCOMPLETO/u);
  assert.match(
    sql,
    /'sourceKind', 'INLINE_DATA_URI',[\s\S]*?'sourceRef', 'documentSnapshot[.]assetSources[.]watermarkUrl'/u,
  );
  assert.doesNotMatch(brandFreezer, /https:\/\/|sourceUrl/u);
  assert.doesNotMatch(sql, /'label', 'UNIVERSO'/u);
});

Deno.test("patch fail-closed da RPC encontra uma vez cada fragmento-base", () => {
  const declaration = [
    "  v_template public.documentos_templates%ROWTYPE;",
    "  v_professor public.parceiros%ROWTYPE;",
  ].join("\n");
  const lookup = [
    "  SELECT template.* INTO v_template",
    "  FROM public.documentos_templates AS template",
    "  WHERE template.id = 'diario_' || upper(v_curso.modalidade)",
    "  FOR SHARE;",
    "  IF v_polo.id IS NULL OR v_empresa.id IS NULL OR v_curso.id IS NULL",
    "     OR v_disciplina.id IS NULL OR v_modulo.id IS NULL OR v_template.id IS NULL",
    "  THEN",
  ].join("\n");
  const source = [
    "    'watermarkUrl', coalesce(",
    "      nullif(btrim(v_polo.watermark_url), ''),",
    "      nullif(btrim(v_empresa.watermark_url), '')",
    "    )",
  ].join("\n");
  assert.equal(occurrences(envelopeRequestV1, declaration), 1);
  assert.equal(occurrences(envelopeRequestV1, lookup), 1);
  assert.equal(occurrences(envelopeRequestV1, source), 1);
});

Deno.test("versionamento afeta apenas Diário e preserva gates e ACL", () => {
  assert.match(
    sql,
    /WHERE politica\.documento = 'diario_classe'\s+AND politica\.arquivada_em IS NULL/u,
  );
  assert.match(sql, /v_old\.habilitada/u);
  assert.match(sql, /v_old\.status_juridico/u);
  assert.match(sql, /v_old\.certificado/u);
  assert.match(sql, /v_old\.versao \+ 1/u);
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_politicas[\s\S]{0,240}documento\s*=\s*'MODELO_PADRAO'/iu,
  );
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/u);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION\s+public\.assinatura_eletronica_salvar_configuracao\([\s\S]*?TO authenticated, service_role/u,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION\s+public\.assinatura_eletronica_rpc_iniciar_finalizacao_diario\([\s\S]*?TO service_role/u,
  );
});

Deno.test("migration não contém duplicações mecânicas conhecidas", () => {
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/\$function\$/gu) ?? []).length % 2, 0);
  assert.equal((sql.match(/\$migration\$/gu) ?? []).length % 2, 0);
  assert.doesNotMatch(sql, /DECLARE\s+DECLARE/u);
  assert.doesNotMatch(sql, /p_request_id uuid DEFAULT NULL\s+p_request_id/u);
  assert.doesNotMatch(sql, /v_now\s*,\s*v_now\s*,\s*v_now/u);
});

// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260819160000_harden_diario_artifact_pipeline.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);

const ownPublicStoragePattern =
  "^https://kfekgwyqozhicpfuunpo[.]supabase[.]co/storage/v1/object/public/[^?#[:space:]]+$";
const ownPublicStorageUrl =
  /^https:\/\/kfekgwyqozhicpfuunpo\.supabase\.co\/storage\/v1\/object\/public\/[^?#\s]+$/;

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

const assertAuthorizationPrecedesReplay = (
  signature: string,
  authorizationMarker: string,
) => {
  const block = functionBlock(signature);
  const authorization = block.indexOf(authorizationMarker);
  const replay = block.indexOf("SELECT operacao.* INTO v_replay");
  assert.ok(authorization >= 0, `${signature} não revalida autorização.`);
  assert.ok(
    replay > authorization,
    `${signature} consulta replay antes de autorizar.`,
  );
};

const watermark = functionBlock(
  "public.assinatura_eletronica_watermark_source_diario_valido(",
);
const snapshot = functionBlock(
  "public.assinatura_eletronica_snapshot_academico_diario_valido(",
);
const assetManifest = functionBlock(
  "public.assinatura_eletronica_pdf_asset_manifest_diario_valido(",
);
const prepareOriginal = functionBlock(
  "public.assinatura_eletronica_internal_preparar_original_diario_seguro(",
);
const registerOriginal = functionBlock(
  "public.assinatura_eletronica_internal_registrar_original_publicar_seguro(",
);
const signatureEvents = functionBlock(
  "public.assinatura_eletronica_eventos_assinatura_diario_validados(",
);
const prepareFinal = functionBlock(
  "public.assinatura_eletronica_internal_iniciar_finalizacao_diario_seguro(",
);
const registerFinal = functionBlock(
  "public.assinatura_eletronica_internal_registrar_artefato_finalizar_diario_seguro(",
);

Deno.test("migration é incremental, atômica, mantém a política desligada e não apaga upload", () => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_politicas[\s\S]{0,300}?habilitada\s*=\s*true/i,
  );
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+storage\.objects/i);
  assert.doesNotMatch(sql, /storage\.delete|removeObject|deleteObject/i);
});

Deno.test("watermark inline é canônica, limitada e não amplia logo ou outros assets", () => {
  assert.match(
    watermark,
    /\^data:image\/\(png\|jpeg\|webp\);base64,\(\[A-Za-z0-9\+\/\]\+=\{0,2\}\)\$/i,
  );
  assert.match(watermark, /char_length\(v_base64\) > 1398104/i);
  assert.match(
    watermark,
    /octet_length\(v_bytes\) NOT BETWEEN 1 AND 1048576/i,
  );
  assert.match(
    watermark,
    /replace\(pg_catalog\.encode\(v_bytes, 'base64'\), E'\\n', ''\)[\s\S]*?IS DISTINCT FROM v_base64/i,
  );
  assert.match(watermark, /89504e470d0a1a0a/i);
  assert.match(watermark, /ffd8ff/i);
  assert.match(watermark, /52494646[\s\S]*?57454250/i);

  assert.ok(snapshot.includes(ownPublicStoragePattern));
  assert.match(
    snapshot,
    /v_watermark_source ~ '\^https:\/\/'[\s\S]*?kfekgwyqozhicpfuunpo\[\.\]supabase\[\.\]co\/storage\/v1\/object\/public/i,
  );
  assert.match(
    snapshot,
    /ARRAY\['assetSources', 'watermarkUrl'\][\s\S]*?ARRAY\['institutionalIdentity', 'watermarkUrl'\]/i,
  );
  assert.match(
    snapshot,
    /assinatura_eletronica_snapshot_academico_diario_valido_v1_https\(\s*v_normalized\s*\)/i,
  );
  assert.doesNotMatch(snapshot, /templateSource', 'raw'/i);

  assert.match(
    sql,
    /v_occurrences :=[\s\S]*?IF v_occurrences <> 1 THEN[\s\S]*?ASSINATURA_DIARIO_WATERMARK_PATCH_DRIFT[\s\S]*?EXECUTE v_hardened_definition/i,
  );
});

Deno.test("URLs HTTPS de assets ficam restritas ao Storage público exato do projeto", () => {
  assert.ok(
    ownPublicStorageUrl.test(
      "https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/modelos/global/logo.png",
    ),
  );
  for (
    const hostileUrl of [
      "https://kfekgwyqozhicpfuunpo.supabase.co.evil.example/storage/v1/object/public/modelos/logo.png",
      "https://user@kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/modelos/logo.png",
      "https://kfekgwyqozhicpfuunpo.supabase.co:443/storage/v1/object/public/modelos/logo.png",
      "https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/modelos/logo.png?download=1",
      "https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/modelos/logo.png#fragment",
      "https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/modelos/logo png",
    ]
  ) {
    assert.equal(ownPublicStorageUrl.test(hostileUrl), false, hostileUrl);
  }

  assert.equal(snapshot.split(ownPublicStoragePattern).length - 1, 2);
  assert.equal(assetManifest.split(ownPublicStoragePattern).length - 1, 2);
});

Deno.test("manifesto de assets é fechado, vinculado ao snapshot e sem base64 redundante", () => {
  assert.match(
    assetManifest,
    /'schemaVersion', 'source', 'documentSnapshotSha256', 'validationUrl', 'assets'/i,
  );
  assert.match(
    assetManifest,
    /p_manifest ->> 'documentSnapshotSha256' IS DISTINCT FROM v_document_sha256/i,
  );
  assert.match(
    assetManifest,
    /lower\(btrim\(p_document_snapshot_sha256\)\) IS DISTINCT FROM v_document_sha256/i,
  );
  assert.match(
    assetManifest,
    /imprimirValidacaoContracapa'[\s\S]*?IS DISTINCT FROM 'true'::jsonb/i,
  );
  assert.match(
    assetManifest,
    /'https:\/\/universocc\.com\.br\/validador\?code=' \|\| v_validation_code[\s\S]*?'https:\/\/www\.universocc\.com\.br\/validador\?code=' \|\| v_validation_code/i,
  );

  assert.match(
    assetManifest,
    /v_logo ->> 'sourceUrl'[\s\S]*?kfekgwyqozhicpfuunpo\[\.\]supabase\[\.\]co\/storage\/v1\/object\/public/i,
  );
  assert.match(
    assetManifest,
    /v_logo ->> 'byteSize'\)::bigint NOT BETWEEN 1 AND 12582912/i,
  );
  assert.match(
    assetManifest,
    /v_watermark ->> 'byteSize'\)::bigint NOT BETWEEN 1 AND 1048576/i,
  );
  assert.match(
    assetManifest,
    /v_watermark ->> 'sourceUrl'[\s\S]*?kfekgwyqozhicpfuunpo\[\.\]supabase\[\.\]co\/storage\/v1\/object\/public/i,
  );
  assert.match(
    assetManifest,
    /v_logo ->> 'width'\)::integer NOT BETWEEN 1 AND 4096[\s\S]*?v_logo ->> 'height'\)::integer NOT BETWEEN 1 AND 4096[\s\S]*?> 12000000/i,
  );
  assert.match(
    assetManifest,
    /v_watermark ->> 'width'\)::integer NOT BETWEEN 1 AND 4096[\s\S]*?v_watermark ->> 'height'\)::integer NOT BETWEEN 1 AND 4096[\s\S]*?> 12000000/i,
  );

  const inlineBranch = assetManifest.slice(
    assetManifest.indexOf(
      "ELSIF v_watermark ->> 'sourceKind' = 'INLINE_DATA_URI'",
    ),
    assetManifest.indexOf(
      "ELSE\n    RETURN false;",
      assetManifest.indexOf(
        "ELSIF v_watermark ->> 'sourceKind' = 'INLINE_DATA_URI'",
      ),
    ),
  );
  assert.match(
    inlineBranch,
    /'sourceRef'[\s\S]*?documentSnapshot\.assetSources\.watermarkUrl/i,
  );
  assert.doesNotMatch(inlineBranch, /'sourceUrl'|'source'\s*,/i);
  assert.match(inlineBranch, /octet_length\(v_inline_bytes\)/i);
  assert.match(inlineBranch, /extensions\.digest\(v_inline_bytes, 'sha256'\)/i);

  assert.match(assetManifest, /v_qr ->> 'sourceKind' <> 'GENERATED_QR'/i);
  assert.match(
    assetManifest,
    /v_qr ->> 'payload' IS DISTINCT FROM v_validation_url/i,
  );
  assert.match(assetManifest, /v_qr ->> 'mimeType' <> 'image\/png'/i);
  assert.match(assetManifest, /v_qr -> 'width' IS DISTINCT FROM '240'::jsonb/i);
  assert.match(
    assetManifest,
    /v_qr -> 'height' IS DISTINCT FROM '240'::jsonb/i,
  );
  assert.match(
    assetManifest,
    /v_qr ->> 'byteSize'\)::bigint NOT BETWEEN 1 AND 1048576/i,
  );
});

Deno.test("manifesto persistido é obrigatório na publicação e imutável depois", () => {
  assert.match(
    sql,
    /ASSINATURA_DIARIO_MANIFEST_BACKFILL_OBRIGATORIO[\s\S]*?ADD COLUMN pdf_asset_manifest_snapshot jsonb/i,
  );
  assert.match(
    sql,
    /documento_original_sha256 IS NULL[\s\S]*?pdf_asset_manifest_snapshot IS NULL[\s\S]*?documento_original_sha256 IS NOT NULL[\s\S]*?pdf_asset_manifest_snapshot IS NOT NULL/i,
  );
  assert.match(
    sql,
    /ADD CONSTRAINT assinatura_eletronica_envelopes_pdf_asset_manifest_check[\s\S]*?assinatura_eletronica_pdf_asset_manifest_diario_valido/i,
  );
  const protect = functionBlock(
    "public.assinatura_eletronica_proteger_pdf_asset_manifest(",
  );
  assert.match(
    protect,
    /OLD\.pdf_asset_manifest_snapshot IS NOT NULL[\s\S]*?OLD\.status <> 'RASCUNHO'[\s\S]*?NEW\.status <> 'PENDENTE'/i,
  );
  assert.match(
    sql,
    /CREATE TRIGGER assinatura_eletronica_envelopes_15_proteger_pdf_asset_manifest/i,
  );
  assert.match(
    sql,
    /VALIDATE CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check/i,
  );
});

Deno.test("gates privados vinculam service role, ator, sessão e autorização corrente", () => {
  const originalGate = functionBlock(
    "public.assinatura_eletronica_autorizar_original_diario_seguro(",
  );
  const finalGate = functionBlock(
    "public.assinatura_eletronica_autorizar_finalizacao_diario_segura(",
  );
  for (const block of [originalGate, finalGate]) {
    assert.match(block, /LANGUAGE plpgsql\s+VOLATILE\s+SECURITY DEFINER/i);
    assert.match(block, /assinatura_eletronica_exigir_service_role\(\)/i);
    assert.match(
      block,
      /assinatura_eletronica_exigir_sessao_ativa\([\s\S]*?p_actor_auth_user_id[\s\S]*?p_auth_session_id/i,
    );
  }
  assert.match(
    originalGate,
    /v_envelope\.criado_por IS DISTINCT FROM p_actor_auth_user_id/i,
  );
  assert.match(originalGate, /assinatura_eletronica_gestor_pode_gerir_diario/i);
  assert.match(finalGate, /participante\.papel = 'COORDENADOR'/i);
  assert.match(finalGate, /desafio\.auth_session_id = p_auth_session_id/i);
  assert.match(finalGate, /desafio\.metodo = 'SENHA_REAUTENTICADA'/i);
  assert.match(finalGate, /desafio\.estado = 'CONSUMIDO'/i);
  assert.match(
    finalGate,
    /professores_coordenacoes[\s\S]*?coordenacao\.status = 'ATIVA'/i,
  );

  assertAuthorizationPrecedesReplay(
    "public.assinatura_eletronica_internal_preparar_original_diario_seguro(",
    "assinatura_eletronica_autorizar_original_diario_seguro",
  );
  assertAuthorizationPrecedesReplay(
    "public.assinatura_eletronica_internal_registrar_original_publicar_seguro(",
    "assinatura_eletronica_autorizar_original_diario_seguro",
  );

  for (
    const [block, marker] of [
      [
        prepareOriginal,
        "assinatura_eletronica_autorizar_original_diario_seguro",
      ],
      [
        registerOriginal,
        "assinatura_eletronica_autorizar_original_diario_seguro",
      ],
      [
        prepareFinal,
        "assinatura_eletronica_autorizar_finalizacao_diario_segura",
      ],
      [
        registerFinal,
        "assinatura_eletronica_autorizar_finalizacao_diario_segura",
      ],
    ] as const
  ) {
    const lock = block.indexOf("FOR UPDATE;");
    const secondAuthorization = block.indexOf(
      marker,
      block.indexOf(marker) + marker.length,
    );
    const replay = block.indexOf("SELECT operacao.* INTO v_replay");
    assert.ok(
      lock >= 0 && secondAuthorization > lock && replay > secondAuthorization,
    );
  }
  assertAuthorizationPrecedesReplay(
    "public.assinatura_eletronica_internal_iniciar_finalizacao_diario_seguro(",
    "assinatura_eletronica_autorizar_finalizacao_diario_segura",
  );
  assertAuthorizationPrecedesReplay(
    "public.assinatura_eletronica_internal_registrar_artefato_finalizar_diario_seguro(",
    "assinatura_eletronica_autorizar_finalizacao_diario_segura",
  );
});

Deno.test("PREPARE original devolve JSON canônico e replay converge após publicação", () => {
  const replay = prepareOriginal.indexOf("SELECT operacao.* INTO v_replay");
  const draftGate = prepareOriginal.indexOf("v_envelope.status <> 'RASCUNHO'");
  assert.ok(replay >= 0 && draftGate > replay);
  assert.match(prepareOriginal, /operacao\.actor_scope = v_actor_scope/i);
  assert.match(prepareOriginal, /operacao\.request_id = p_request_id/i);
  assert.match(
    prepareOriginal,
    /'canonicalization', 'POSTGRES_JSONB_TEXT_UTF8_V1'[\s\S]*?'hashAlgorithm', 'SHA-256'[\s\S]*?'encoding', 'UTF-8'[\s\S]*?'canonicalJson', v_envelope\.documento_snapshot::text/i,
  );
  assert.match(
    prepareOriginal,
    /'documentSnapshotSha256', v_document_snapshot_sha256[\s\S]*?'academicRevisionSha256'[\s\S]*?'templateSourceSha256'/i,
  );
  assert.match(
    prepareOriginal,
    /'verification'[\s\S]*?'code'[\s\S]*?'basePath', '\/validador'[\s\S]*?'path', '\/validador\?code='/i,
  );
  assert.match(
    prepareOriginal,
    /imprimirValidacaoContracapa'[\s\S]*?IS DISTINCT FROM 'true'::jsonb/i,
  );
  assert.doesNotMatch(prepareOriginal, /'academicSnapshot'/i);
  assert.doesNotMatch(prepareOriginal, /'academicSnapshotSha256'/i);
});

Deno.test("registro original exige o mesmo preflight e congela o manifesto com ator", () => {
  assert.match(registerOriginal, /p_pdf_asset_manifest jsonb/i);
  assert.match(
    registerOriginal,
    /assinatura_eletronica_pdf_asset_manifest_diario_valido\([\s\S]*?p_pdf_asset_manifest[\s\S]*?v_envelope\.documento_snapshot[\s\S]*?v_document_snapshot_sha256/i,
  );
  assert.match(
    registerOriginal,
    /preparo\.actor_scope = v_actor_scope[\s\S]*?preparo\.actor_auth_user_id = p_actor_auth_user_id[\s\S]*?preparo\.operacao = 'PREPARAR_ORIGINAL_DIARIO'[\s\S]*?preparo\.request_id = p_request_id/i,
  );
  assert.match(
    registerOriginal,
    /pdf_asset_manifest_snapshot = p_pdf_asset_manifest/i,
  );
  assert.match(
    registerOriginal,
    /'pdfAssetManifestSnapshot', p_pdf_asset_manifest/i,
  );
  assert.match(
    registerOriginal,
    /'DOCUMENTO_ORIGINAL_CONGELADO', p_actor_auth_user_id[\s\S]*?'ENVELOPE_PUBLICADO', p_actor_auth_user_id[\s\S]*?'PARTICIPANTE_LIBERADO', p_actor_auth_user_id/i,
  );
  assert.match(
    registerOriginal,
    /SELECT artefato\.\* INTO v_original_artifact[\s\S]*?FOR SHARE;[\s\S]*?ASSINATURA_REPLAY_ORIGINAL_DIVERGENTE/i,
  );
  assert.match(
    registerOriginal,
    /v_original_artifact\.bucket_id[\s\S]*?v_original_artifact\.storage_path[\s\S]*?v_original_artifact\.tamanho_bytes[\s\S]*?v_original_artifact\.sha256[\s\S]*?storage\.objects/i,
  );
  const eventSection = registerOriginal.slice(
    registerOriginal.indexOf("'DOCUMENTO_ORIGINAL_CONGELADO'"),
  );
  assert.doesNotMatch(eventSection, /'authSessionId'/i);
});

Deno.test("eventos de assinatura provam desafio consumido e usam método único", () => {
  assert.match(
    signatureEvents,
    /desafio\.id::text = evento\.dados ->> 'challengeId'[\s\S]*?desafio\.envelope_id = evento\.envelope_id[\s\S]*?desafio\.participante_id = evento\.participante_id/i,
  );
  assert.match(signatureEvents, /desafio\.metodo = 'SENHA_REAUTENTICADA'/i);
  assert.match(signatureEvents, /desafio\.estado = 'CONSUMIDO'/i);
  assert.match(
    signatureEvents,
    /desafio\.consumido_em = participante\.assinado_em/i,
  );
  assert.match(
    signatureEvents,
    /desafio\.actor_auth_user_id = evento\.ator_auth_user_id/i,
  );
  assert.match(signatureEvents, /desafio\.auth_session_id IS NOT NULL/i);
  assert.match(
    signatureEvents,
    /v_event_count <> 2 OR v_valid_count <> 2[\s\S]*?v_valid_participant_count <> 2/i,
  );
  assert.match(
    signatureEvents,
    /count\(DISTINCT participante\.id\)/i,
  );
  assert.match(
    signatureEvents,
    /'method', CASE desafio\.metodo[\s\S]*?WHEN 'SENHA_REAUTENTICADA' THEN 'SENHA_REAUTENTICADA'/i,
  );
  assert.doesNotMatch(signatureEvents, /CONTA_E_/i);

  assert.match(
    prepareFinal,
    /'method', CASE evento ->> 'method'[\s\S]*?WHEN 'SENHA_REAUTENTICADA' THEN 'SENHA_REAUTENTICADA'/i,
  );
  assert.match(prepareFinal, /'signatureEvents', v_eventos_assinatura/i);
  assert.match(prepareFinal, /'events', v_receipt_events/i);
  assert.doesNotMatch(prepareFinal, /CONTA_E_PIN|CONTA_E_SENHA_REAUTENTICADA/i);
  assert.doesNotMatch(
    registerFinal,
    /CONTA_E_PIN|CONTA_E_SENHA_REAUTENTICADA/i,
  );
  assert.match(
    sql,
    /VALIDATE CONSTRAINT assinatura_eletronica_operacoes_diario_sem_pin_check/i,
  );
});

Deno.test("FINALIZE usa preflight do mesmo ator/sessão/request e devolve o manifesto", () => {
  assert.match(
    prepareFinal,
    /assinatura_eletronica_pdf_asset_manifest_diario_valido\([\s\S]*?v_envelope\.pdf_asset_manifest_snapshot/i,
  );
  assert.match(
    prepareFinal,
    /'pdfAssetManifestSnapshot', v_envelope\.pdf_asset_manifest_snapshot/i,
  );
  assert.match(
    registerFinal,
    /inicio\.actor_scope = v_actor_scope[\s\S]*?inicio\.actor_auth_user_id = p_actor_auth_user_id[\s\S]*?inicio\.operacao = 'INICIAR_FINALIZACAO'[\s\S]*?inicio\.request_id = p_request_id/i,
  );
  assert.match(
    registerFinal,
    /'pdfAssetManifestSnapshot', v_envelope\.pdf_asset_manifest_snapshot/i,
  );
  assert.match(
    registerFinal,
    /'DOCUMENTO_FINAL_REGISTRADO', p_actor_auth_user_id[\s\S]*?'COMPROVANTE_REGISTRADO', p_actor_auth_user_id[\s\S]*?'ENVELOPE_ASSINADO', p_actor_auth_user_id/i,
  );
  assert.match(
    prepareFinal,
    /SELECT artefato\.\* INTO v_original[\s\S]*?FOR SHARE;[\s\S]*?storage\.objects/i,
  );
  const eventSection = registerFinal.slice(
    registerFinal.indexOf("'DOCUMENTO_FINAL_REGISTRADO'"),
  );
  assert.doesNotMatch(eventSection, /'authSessionId'/i);
});

Deno.test("os quatro ledgers persistem somente ids, estado, hashes e timestamps", () => {
  for (
    const block of [
      prepareOriginal,
      registerOriginal,
      prepareFinal,
      registerFinal,
    ]
  ) {
    assert.match(
      block,
      /INSERT INTO public\.assinatura_eletronica_operacoes[\s\S]*?v_payload_sha256, v_ledger_resultado/i,
    );
    const start = block.lastIndexOf(
      "v_ledger_resultado := jsonb_build_object(",
    );
    const end = block.indexOf(";", start);
    assert.ok(start >= 0 && end > start);
    const ledger = block.slice(start, end);
    assert.match(ledger, /'envelopeId'/i);
    assert.match(ledger, /'status'/i);
    assert.doesNotMatch(
      ledger,
      /canonicalJson|documentSnapshotIntegrity|pdfAssetManifestSnapshot|semanticManifestSnapshot|frozenSignatureTargetSnapshot|geometrySnapshot|policySnapshot|certificateSnapshot|'participants'|'signatureEvents'|'receiptPayload'|'artifacts'/i,
    );
  }

  assert.match(
    prepareOriginal,
    /IF FOUND THEN[\s\S]*?documentSnapshotSha256[\s\S]*?RETURN v_resultado/i,
  );
  assert.match(
    prepareFinal,
    /IF FOUND THEN[\s\S]*?documentSnapshotSha256[\s\S]*?RETURN v_resultado/i,
  );
  assert.doesNotMatch(
    sql,
    /v_payload_sha256, v_resultado\s*\n\s*\)/i,
  );
});

Deno.test("ACL fecha overloads antigos, helpers e tabelas; só wrappers seguros ficam no service role", () => {
  const compact = sql.replace(/\s+/g, " ");
  const oldSignatures = [
    "assinatura_eletronica_internal_preparar_original_diario\\( uuid, uuid \\)",
    "assinatura_eletronica_internal_registrar_original_publicar\\( uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, uuid \\)",
    "assinatura_eletronica_internal_iniciar_finalizacao\\( uuid, uuid \\)",
    "assinatura_eletronica_internal_registrar_artefato_finalizar\\( uuid, text, text, bigint, text, text, text, bigint, text, uuid \\)",
  ];
  for (const signature of oldSignatures) {
    assert.match(
      compact,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature} FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
  }

  const safeSignatures = [
    "assinatura_eletronica_internal_preparar_original_diario_seguro\\( uuid, uuid, uuid, uuid \\)",
    "assinatura_eletronica_internal_registrar_original_publicar_seguro\\( uuid, uuid, uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, jsonb, uuid \\)",
    "assinatura_eletronica_internal_iniciar_finalizacao_diario_seguro\\( uuid, uuid, uuid, uuid \\)",
    "assinatura_eletronica_internal_registrar_artefato_finalizar_diario_seguro\\( uuid, uuid, uuid, text, text, bigint, text, text, text, bigint, text, uuid \\)",
  ];
  for (const signature of safeSignatures) {
    assert.match(
      compact,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature} FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      compact,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${signature} TO service_role`,
        "i",
      ),
    );
  }

  for (
    const helper of [
      "assinatura_eletronica_watermark_source_diario_valido\\(text\\)",
      "assinatura_eletronica_snapshot_academico_diario_valido_v1_https\\(jsonb\\)",
      "assinatura_eletronica_snapshot_academico_diario_valido\\(jsonb\\)",
      "assinatura_eletronica_pdf_asset_manifest_diario_valido\\(jsonb, jsonb, text\\)",
      "assinatura_eletronica_proteger_pdf_asset_manifest\\(\\)",
      "assinatura_eletronica_autorizar_original_diario_seguro\\(uuid, uuid, uuid\\)",
      "assinatura_eletronica_autorizar_finalizacao_diario_segura\\(uuid, uuid, uuid\\)",
      "assinatura_eletronica_eventos_assinatura_diario_validados\\(uuid\\)",
    ]
  ) {
    assert.match(
      compact,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${helper} FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
  }

  for (
    const table of [
      "assinatura_eletronica_envelopes",
      "assinatura_eletronica_operacoes",
      "assinatura_eletronica_eventos",
      "assinatura_eletronica_artefatos",
      "assinatura_eletronica_desafios",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        "i",
      ),
    );
  }
  assert.match(
    compact,
    /REVOKE ALL ON TABLE public\.assinatura_eletronica_envelopes, public\.assinatura_eletronica_operacoes, public\.assinatura_eletronica_eventos, public\.assinatura_eletronica_artefatos, public\.assinatura_eletronica_desafios FROM PUBLIC, anon, authenticated, service_role/i,
  );
});

Deno.test("contrato não persiste senha, token, data URI redundante ou sessão em evento público", () => {
  assert.doesNotMatch(
    sql,
    /senha_hash|password_hash|access_token|refresh_token/i,
  );
  assert.doesNotMatch(
    sql,
    /jsonb_build_object\([\s\S]{0,500}?'source',\s*v_watermark_source/i,
  );
  assert.doesNotMatch(
    sql,
    /'sourceUrl',\s*v_watermark_source[\s\S]{0,300}?INLINE_DATA_URI/i,
  );
  assert.doesNotMatch(
    sql,
    /assinatura_eletronica_adicionar_evento\([\s\S]{0,800}?'authSessionId'/i,
  );
});

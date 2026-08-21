// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260819123000_enable_diario_signature_envelopes_v1.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);

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
  const replay = block.indexOf("INTO v_replay");
  assert.ok(authorization >= 0, `${signature} não revalida autorização.`);
  assert.ok(
    replay > authorization,
    `${signature} consulta replay antes de autorizar.`,
  );
};

Deno.test("migration é incremental, atômica e mantém o piloto juridicamente desligado", () => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(
    sql,
    /'diario_classe',\s*\n\s*1,\s*\n\s*false,\s*\n\s*'PENDENTE_MATRIZ_JURIDICA'/i,
  );
  assert.match(
    sql,
    /documento = 'diario_classe'[\s\S]*?habilitada IS FALSE[\s\S]*?status_juridico = 'PENDENTE_MATRIZ_JURIDICA'/i,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_politicas[\s\S]{0,240}?habilitada\s*=\s*true/i,
  );
  assert.doesNotMatch(sql, /INSERT[\s\S]{0,240}?'APROVADA'/i);
});

Deno.test("envelope do Diário congela fonte, versão, snapshots, geometria e hashes distintos", () => {
  for (
    const column of [
      "origem_tipo",
      "turma_id",
      "disciplina_id",
      "origem_versao",
      "documento_snapshot",
      "academico_snapshot_sha256",
      "geometria_snapshot",
      "pdf_semantic_manifest_snapshot",
      "pdf_signature_target_snapshot",
      "documento_original_sha256",
      "documento_final_sha256",
      "original_congelado_em",
      "publicado_em",
    ]
  ) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, "i"));
  }
  assert.match(
    sql,
    /documento = 'diario_classe'[\s\S]*?origem_tipo = 'DIARIO'/i,
  );
  assert.match(sql, /coordinateSpace' = 'PAGE_TOP_LEFT_BP_V1'/i);
  assert.match(sql, /composerSchemaVersion' = '1'/i);
  assert.match(sql, /schemaVersion' = '2'/i);
  assert.match(
    sql,
    /academico_snapshot_sha256 = public\.assinatura_eletronica_sha256_json\(documento_snapshot\)/i,
  );
  assert.match(sql, /assinatura_eletronica_manifesto_diario_valido/i);
  assert.match(sql, /assinatura_eletronica_target_diario_valido/i);
  assert.match(sql, /jsonb_array_length\(geometria_snapshot -> 'slots'\) = 2/i);
  assert.match(
    sql,
    /status IN \('ASSINADO', 'SUBSTITUIDO'\)[\s\S]*?documento_final_sha256 IS NOT NULL/i,
  );
  assert.match(sql, /'FINALIZANDO'/i);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX assinatura_eletronica_envelopes_origem_viva_key[\s\S]*?WHERE status IN \('RASCUNHO', 'PENDENTE', 'EM_ASSINATURA', 'FINALIZANDO'\)/i,
  );
});

Deno.test("snapshot acadêmico v2 nasce completo e imutável na transação do envelope", () => {
  const request = functionBlock(
    "public.assinatura_eletronica_solicitar_envelope_diario(",
  );
  assert.match(
    request,
    /LOCK TABLE[\s\S]*?public\.turmas_disciplinas[\s\S]*?public\.documentos_templates[\s\S]*?IN SHARE MODE/i,
  );
  assert.match(request, /'composerSchemaVersion', 1/i);
  assert.match(
    request,
    /'academicRevisionSha256', v_academic_revision_sha256/i,
  );
  assert.match(
    request,
    /'templateSource'[\s\S]*?'raw', v_template\.conteudo[\s\S]*?'sha256'/i,
  );
  for (
    const key of [
      "students",
      "aulas",
      "attendanceMap",
      "gradesMap",
      "praticasMap",
      "observacoes",
      "activeInstruments",
      "institutionalIdentity",
      "assetSources",
      "closure",
    ]
  ) {
    assert.match(request, new RegExp(`'${key}'`, "i"));
  }
  assert.match(request, /'exportMode', 'PREENCHIDO'/i);
  assert.match(request, /ASSINATURA_DIARIO_RESULTADO_AUSENTE/i);
  assert.match(request, /ASSINATURA_DIARIO_FREQUENCIA_AUSENTE/i);
  assert.match(request, /ASSINATURA_DIARIO_DATA_AULA_AUSENTE/i);
  assert.match(request, /ASSINATURA_DIARIO_PRATICA_AUSENTE/i);
  assert.match(request, /ASSINATURA_DIARIO_PRATICA_INCOERENTE/i);
  assert.match(request, /resultado\.total_aulas <> v_session_count/i);
  assert.match(request, /'validationCode', upper\(v_envelope_id::text\)/i);
  assert.match(
    request,
    /'headerLogoUrl', v_identity -> 'logoUrl'[\s\S]*?'watermarkUrl', v_identity -> 'watermarkUrl'/i,
  );
  assert.match(
    request,
    /'cabecalhoLogoUrl', coalesce\([\s\S]*?v_empresa\.logo_url[\s\S]*?v_polo\.logo_url/i,
  );
  assert.match(
    request,
    /v_academico_snapshot_sha256 := public\.assinatura_eletronica_sha256_json\(v_documento_snapshot\)/i,
  );
  assert.doesNotMatch(request, /Prática padrão|Aula expositiva/i);
  assert.doesNotMatch(request, /dataSource'[\s\S]{0,180}?created_at/i);
  assert.doesNotMatch(request, /valuePlaceholder/i);
  assert.match(
    sql,
    /NEW\.academico_snapshot_sha256 IS DISTINCT FROM OLD\.academico_snapshot_sha256/i,
  );
  assert.doesNotMatch(request, /data:image\//i);
});

Deno.test("preparo do original devolve somente snapshot congelado e destino canônico", () => {
  const prepare = functionBlock(
    "public.assinatura_eletronica_internal_preparar_original_diario(",
  );
  assert.match(prepare, /assinatura_eletronica_exigir_service_role/i);
  assert.match(prepare, /v_envelope\.status <> 'RASCUNHO'/i);
  assert.match(prepare, /'academicSnapshot', v_envelope\.documento_snapshot/i);
  assert.match(
    prepare,
    /'academicSnapshotSha256', v_envelope\.academico_snapshot_sha256/i,
  );
  assert.match(prepare, /'composerSchemaVersion'/i);
  assert.match(
    prepare,
    /'originalDestination'[\s\S]*?'bucketId', 'documentos-assinatura-eletronica'/i,
  );
  assert.match(prepare, /'verification'[\s\S]*?'code'[\s\S]*?'path'/i);
  assert.doesNotMatch(prepare, /signedUrl|signedURL|createSignedUrl/i);
});

Deno.test("publicação congela manifesto e alvo semântico inseparáveis do hash original", () => {
  const register = functionBlock(
    "public.assinatura_eletronica_internal_registrar_original_publicar(",
  );
  assert.match(register, /p_academic_snapshot_sha256 text/i);
  assert.match(register, /p_semantic_manifest jsonb/i);
  assert.match(register, /p_frozen_signature_target jsonb/i);
  assert.match(
    register,
    /assinatura_eletronica_target_diario_valido\([\s\S]*?p_frozen_signature_target[\s\S]*?v_sha256/i,
  );
  assert.match(
    register,
    /pdf_semantic_manifest_snapshot = p_semantic_manifest/i,
  );
  assert.match(
    register,
    /pdf_signature_target_snapshot = p_frozen_signature_target/i,
  );
  assert.match(register, /ASSINATURA_ACADEMICO_SNAPSHOT_DIVERGENTE/i);
  assert.match(
    sql,
    /NEW\.pdf_semantic_manifest_snapshot IS DISTINCT FROM OLD\.pdf_semantic_manifest_snapshot/i,
  );
  assert.match(
    sql,
    /NEW\.pdf_signature_target_snapshot IS DISTINCT FROM OLD\.pdf_signature_target_snapshot/i,
  );
});

Deno.test("validadores SQL fecham chaves, limites, URLs e geometria semântica", () => {
  const academic = functionBlock(
    "public.assinatura_eletronica_snapshot_academico_diario_valido(",
  );
  const manifest = functionBlock(
    "public.assinatura_eletronica_manifesto_diario_valido(",
  );
  const target = functionBlock(
    "public.assinatura_eletronica_target_diario_valido(",
  );
  assert.match(academic, /octet_length\(p_snapshot::text\) > 4194304/i);
  assert.match(
    academic,
    /jsonb_array_length\(p_snapshot -> 'students'\) > 2000/i,
  );
  assert.match(academic, /jsonb_array_length\(p_snapshot -> 'aulas'\) > 1000/i);
  assert.match(academic, /v_total_sessoes > 5000/i);
  assert.match(academic, /data:image\//i);
  assert.match(academic, /x-amz-signature/i);
  assert.match(academic, /academicRevisionSha256/i);
  assert.match(
    academic,
    /v_session_hours IS DISTINCT FROM \(v_aula ->> 'cargaHoraria'\)::numeric/i,
  );
  assert.match(
    academic,
    /v_sessao ->> 'periodo' NOT IN \('M', 'T', 'N', 'U'\)/i,
  );
  assert.match(
    academic,
    /presenca\.value #>> '\{\}' NOT IN \('P', 'F', 'J'\)/i,
  );
  assert.match(
    academic,
    /\(v_resultado ->> 'frequencia_percent'\)::numeric NOT BETWEEN 0 AND 100/i,
  );
  assert.match(
    academic,
    /\(v_resultado ->> v_grade_key\)::numeric NOT BETWEEN 0 AND 10/i,
  );
  assert.match(
    academic,
    /btrim\(p_snapshot -> 'praticasMap' ->> v_aula_id\) = ''/i,
  );
  assert.match(academic, /v_frequencia_esperada := round/i);
  assert.match(
    academic,
    /p_snapshot -> 'assetSources' -> 'headerLogoUrl'[\s\S]*?p_snapshot -> 'institutionalIdentity' -> 'logoUrl'/i,
  );
  assert.match(
    academic,
    /p_snapshot -> 'assetSources' -> 'watermarkUrl'[\s\S]*?p_snapshot -> 'institutionalIdentity' -> 'watermarkUrl'/i,
  );
  assert.match(manifest, /UNIVERSO_DIARIO_PDF_V1/i);
  assert.match(manifest, /DIARIO_LAST_CONTENT_PAGE/i);
  assert.match(manifest, /v_page_count BETWEEN 1 AND 500/i);
  assert.match(
    target,
    /p_target ->> 'originalSha256' IS DISTINCT FROM p_original_sha256/i,
  );
  assert.match(target, /p_target -> 'manifest' IS DISTINCT FROM p_manifest/i);
  assert.match(target, /rotationDegrees/i);
});

Deno.test("piloto exige exatamente Professor 1 e Coordenador 2 com snapshots imutáveis", () => {
  assert.match(sql, /UNIQUE \(envelope_id, ordem\)/i);
  assert.match(
    sql,
    /'PROFESSOR'[\s\S]*?'COORDENADOR'[\s\S]*?'RESPONSAVEL_LEGAL'/i,
  );
  assert.match(sql, /contexto_tipo = papel/i);
  assert.match(sql, /identidade_snapshot ->> 'schemaVersion' = '1'/i);
  assert.match(sql, /vinculo_snapshot ->> 'schemaVersion' = '1'/i);
  assert.match(sql, /NEW\.papel = 'PROFESSOR' AND NEW\.ordem <> 1/i);
  assert.match(sql, /NEW\.papel = 'COORDENADOR' AND NEW\.ordem <> 2/i);
  assert.match(sql, /NEW\.papel NOT IN \('PROFESSOR', 'COORDENADOR'\)/i);
  assert.match(
    sql,
    /NEW\.identidade_snapshot IS DISTINCT FROM OLD\.identidade_snapshot/i,
  );
  assert.match(
    sql,
    /NEW\.vinculo_snapshot IS DISTINCT FROM OLD\.vinculo_snapshot/i,
  );
  assert.equal(
    (sql.match(
      /jsonb_build_object\('role', 'PROFESSOR', 'order', 1, 'required', true\)/g,
    ) || []).length > 0,
    true,
  );
  assert.equal(
    (sql.match(
      /jsonb_build_object\('role', 'COORDENADOR', 'order', 2, 'required', true\)/g,
    ) || []).length > 0,
    true,
  );
});

Deno.test("artefatos e ledger são privados, append-only e escopados ao bucket", () => {
  assert.match(sql, /'DOCUMENTO_ORIGINAL'/i);
  assert.match(sql, /'DOCUMENTO_FINAL'/i);
  assert.match(sql, /'COMPROVANTE_EVIDENCIA'/i);
  assert.match(sql, /CREATE TABLE public\.assinatura_eletronica_operacoes/i);
  assert.match(sql, /UNIQUE \(actor_scope, operacao, request_id\)/i);
  assert.match(
    sql,
    /CREATE TABLE public\.assinatura_eletronica_reauth_tentativas/i,
  );
  for (
    const table of [
      "assinatura_eletronica_operacoes",
      "assinatura_eletronica_reauth_tentativas",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
  }
  assert.match(
    sql,
    /assinatura_eletronica_storage_client_deny[\s\S]*?AS RESTRICTIVE FOR ALL TO anon, authenticated[\s\S]*?USING \(bucket_id <> 'documentos-assinatura-eletronica'\)[\s\S]*?WITH CHECK \(bucket_id <> 'documentos-assinatura-eletronica'\)/i,
  );
});

Deno.test("RPCs externas têm contrato mínimo camelCase e decisões de ação do servidor", () => {
  const request = functionBlock(
    "public.assinatura_eletronica_solicitar_envelope_diario(",
  );
  const detail = functionBlock("public.assinatura_eletronica_obter_envelope(");
  const list = functionBlock(
    "public.assinatura_eletronica_listar_caixa_contexto(",
  );

  assert.match(
    request,
    /p_turma_id uuid[\s\S]*?p_disciplina_id uuid[\s\S]*?p_perfil text[\s\S]*?p_context_id uuid[\s\S]*?p_request_id uuid/i,
  );
  assert.match(
    request,
    /upper\(btrim\(coalesce\(p_perfil, ''\)\)\) <> 'GESTOR'/i,
  );
  assert.match(request, /v_bloqueio IS DISTINCT FROM 'PROFESSOR'/i);
  assert.match(request, /assinatura_eletronica_gestor_pode_gerir_diario/i);
  assert.match(request, /ASSINATURA_DIARIO_CARGA_HORARIA_INCOMPLETA/i);
  assert.match(request, /'statusLabel'/i);
  assert.match(request, /'roleLabel'/i);
  assert.match(request, /'statusLabel'/i);
  assert.match(request, /'contextId'/i);
  assert.match(request, /'canAct'/i);

  for (
    const key of [
      "roleLabel",
      "statusLabel",
      "contextId",
      "canAct",
      "documentSnapshot",
      "geometrySnapshot",
      "artifacts",
    ]
  ) {
    assert.match(detail, new RegExp(`'${key}'`, "i"));
  }
  for (
    const action of [
      "SIGN",
      "VIEW",
      "WAITING_PREVIOUS_SIGNER",
      "FINALIZATION_IN_PROGRESS",
    ]
  ) {
    assert.match(list, new RegExp(`'${action}'`));
  }
  assert.match(list, /'primaryActionLabel'/i);
  assert.match(list, /'participantRoleLabel'/i);
  assert.match(list, /'participantStatusLabel'/i);

  for (
    const signature of [
      "assinatura_eletronica_solicitar_envelope_diario\\(uuid, uuid, text, uuid, uuid\\)",
      "assinatura_eletronica_obter_envelope\\(uuid, text, uuid\\)",
      "assinatura_eletronica_listar_caixa_contexto\\(text, uuid, text, uuid, integer, timestamptz, uuid\\)",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]*?TO authenticated`,
        "i",
      ),
    );
  }
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.assinatura_eletronica_listar_caixa\(text, uuid, integer, timestamptz\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
});

Deno.test("reauth usa Vault/HMAC, sessão vinculada, TTL 120s e rate limit antes do Auth", () => {
  const prepare = functionBlock(
    "public.assinatura_eletronica_internal_preparar_reautenticacao(",
  );
  const register = functionBlock(
    "public.assinatura_eletronica_internal_registrar_reautenticacao(",
  );
  const consume = functionBlock(
    "public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(",
  );
  const decode = functionBlock(
    "public.assinatura_eletronica_decodificar_ticket(",
  );

  assert.match(
    sql,
    /vault\.decrypted_secrets[\s\S]*?assinatura_reauth_ticket_hmac_secret/i,
  );
  assert.match(sql, /octet_length\(v_secret\) < 32/i);
  assert.match(sql, /extensions\.hmac/i);
  assert.match(decode, /v_signature IS DISTINCT FROM v_expected/i);
  assert.match(register, /interval '120 seconds'/i);
  assert.match(consume, /interval '120 seconds'/i);
  assert.match(prepare, /auth_session_id/i);
  assert.match(register, /auth_session_id/i);
  assert.match(consume, /authSessionId/i);
  assert.match(consume, /ASSINATURA_REAUTH_TICKET_NAO_PERTENCE_A_SESSAO/i);
  assert.match(consume, /ASSINATURA_REAUTH_TICKET_CONSUMIDO/i);
  assert.match(consume, /ASSINATURA_REAUTH_TICKET_EXPIRADO/i);
  assert.match(
    prepare,
    /created_at > statement_timestamp\(\) - interval '15 minutes'/i,
  );
  assert.match(prepare, /IF v_count >= 5/i);
  assert.match(prepare, /ASSINATURA_REAUTH_RATE_LIMITED/i);
  assert.match(prepare, /retryAfterSeconds/i);

  assertAuthorizationPrecedesReplay(
    "public.assinatura_eletronica_internal_preparar_reautenticacao(",
    "assinatura_eletronica_exigir_sessao_ativa",
  );
  assertAuthorizationPrecedesReplay(
    "public.assinatura_eletronica_internal_registrar_reautenticacao(",
    "assinatura_eletronica_exigir_sessao_ativa",
  );
  assertAuthorizationPrecedesReplay(
    "public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(",
    "assinatura_eletronica_exigir_sessao_ativa",
  );
  assert.ok(
    prepare.indexOf("INTO v_replay") < prepare.indexOf("INTO v_count"),
    "Replay do mesmo preflight não pode consumir novamente o rate limit.",
  );
});

Deno.test("evidência de senha é estrita e ticket é consumido sob lock", () => {
  const register = functionBlock(
    "public.assinatura_eletronica_internal_registrar_reautenticacao(",
  );
  const consume = functionBlock(
    "public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(",
  );

  assert.match(
    register,
    /WHERE chave NOT IN \('provider', 'authenticatedAt', 'ipHash', 'userAgentHash'\)/i,
  );
  assert.match(
    register,
    /jsonb_typeof\(p_evidencia -> 'provider'\) <> 'string'/i,
  );
  assert.match(register, /p_evidencia ->> 'provider' <> 'SUPABASE_PASSWORD'/i);
  assert.match(
    register,
    /jsonb_typeof\(p_evidencia -> 'authenticatedAt'\) <> 'string'/i,
  );
  assert.match(
    register,
    /v_authenticated_at IS DISTINCT FROM p_reautenticado_em/i,
  );
  assert.match(
    register,
    /coalesce\(p_evidencia -> 'ipHash', 'null'::jsonb\) <> 'null'::jsonb[\s\S]*?p_evidencia ->> 'ipHash' !~ '\^\[0-9a-f\]\{64\}\$'/i,
  );
  assert.match(
    register,
    /coalesce\(p_evidencia -> 'userAgentHash', 'null'::jsonb\) <> 'null'::jsonb[\s\S]*?p_evidencia ->> 'userAgentHash' !~ '\^\[0-9a-f\]\{64\}\$'/i,
  );
  assert.match(register, /p_evidencia ->> 'ipHash' !~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(
    register,
    /p_evidencia ->> 'userAgentHash' !~ '\^\[0-9a-f\]\{64\}\$'/i,
  );
  assert.doesNotMatch(
    register,
    /nullif\(p_evidencia ->> '(?:ipHash|userAgentHash)', ''\)/i,
  );
  assert.match(register, /ASSINATURA_REAUTH_PREFLIGHT_OBRIGATORIO/i);
  assert.match(
    consume,
    /FROM public\.assinatura_eletronica_desafios AS desafio[\s\S]*?FOR UPDATE/i,
  );
  assert.match(
    consume,
    /SET estado = 'CONSUMIDO', consumido_em = v_signed_at/i,
  );
  assert.match(
    consume,
    /SET status = 'ASSINADO'[\s\S]*?assinado_por_auth_user_id = p_actor_auth_user_id/i,
  );
  assert.match(
    consume,
    /assinatura_eletronica_adicionar_evento\([\s\S]*?v_participante\.id, 'ASSINATURA_CONCLUIDA', p_actor_auth_user_id[\s\S]*?'signedAt', v_signed_at/i,
  );
  assert.doesNotMatch(consume, /ASSINATURA_CONFIRMADA/i);
  assert.match(
    consume,
    /IF v_participante\.ordem = 1 THEN[\s\S]*?SET status = 'PENDENTE'/i,
  );
  assert.match(
    consume,
    /ELSE[\s\S]*?SET status = 'FINALIZANDO'[\s\S]*?v_requires_finalization := true/i,
  );
});

Deno.test("sete RPCs internas ficam exclusivas do service_role e sem search_path implícito", () => {
  const signatures = [
    "assinatura_eletronica_internal_preparar_original_diario\\(uuid, uuid\\)",
    "assinatura_eletronica_internal_registrar_original_publicar\\(uuid, text, text, bigint, text, text, jsonb, jsonb, jsonb, uuid\\)",
    "assinatura_eletronica_internal_preparar_reautenticacao\\(uuid, uuid, text, uuid, uuid, uuid, uuid\\)",
    "assinatura_eletronica_internal_registrar_reautenticacao\\(uuid, uuid, text, uuid, uuid, uuid, timestamptz, jsonb, uuid\\)",
    "assinatura_eletronica_internal_consumir_ticket_reautenticacao\\(text, uuid, uuid, uuid\\)",
    "assinatura_eletronica_internal_iniciar_finalizacao\\(uuid, uuid\\)",
    "assinatura_eletronica_internal_registrar_artefato_finalizar\\(uuid, text, text, bigint, text, text, text, bigint, text, uuid\\)",
  ];
  for (const signature of signatures) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]*?TO service_role`,
        "i",
      ),
    );
  }

  const functionCount =
    (sql.match(/CREATE OR REPLACE FUNCTION public\./g) || []).length;
  const emptySearchPathCount =
    (sql.match(/SET search_path = ''/g) || []).length;
  assert.equal(emptySearchPathCount, functionCount);
  assert.equal((sql.match(/\$function\$;/g) || []).length, functionCount);
});

Deno.test("fechamento separa original, final e comprovante e só conclui após duas assinaturas", () => {
  const start = functionBlock(
    "public.assinatura_eletronica_internal_iniciar_finalizacao(",
  );
  const finish = functionBlock(
    "public.assinatura_eletronica_internal_registrar_artefato_finalizar(",
  );

  assert.match(start, /participante\.status = 'ASSINADO'\) <> 2/i);
  assert.match(start, /'documentSnapshot'/i);
  assert.match(start, /'academicSnapshotSha256'/i);
  assert.match(start, /'geometrySnapshot'/i);
  assert.match(start, /'semanticManifestSnapshot'/i);
  assert.match(start, /'frozenSignatureTargetSnapshot'/i);
  assert.match(start, /'roleLabel'/i);
  assert.match(start, /'statusLabel'/i);
  assert.match(start, /'contextId'/i);
  assert.match(start, /'canAct', false/i);
  assert.match(start, /'identitySnapshot'/i);
  assert.match(start, /'policySnapshot'/i);
  assert.match(start, /'certificateSnapshot'/i);
  assert.match(start, /'templateSnapshot'/i);
  assert.match(start, /'receiptPayload'/i);
  assert.match(start, /'receiptAssetReferences'/i);
  assert.match(start, /'signatureEvents'/i);
  assert.match(start, /evento\.tipo = 'ASSINATURA_CONCLUIDA'/i);
  assert.match(start, /'method', 'CONTA_E_PIN'/i);
  assert.match(start, /ASSINATURA_EVENTOS_CONCLUSAO_INCOMPLETOS/i);
  assert.match(start, /'stampAsset', v_stamp_asset_payload/i);
  for (
    const key of [
      "assetId",
      "bucketId",
      "storagePath",
      "mimeType",
      "byteSize",
      "width",
      "height",
      "sha256",
    ]
  ) {
    assert.match(start, new RegExp(`'${key}'`, "i"));
  }
  assert.match(
    start,
    /v_stamp_asset\.sha256 IS DISTINCT FROM v_stamp_link\.asset_sha256/i,
  );
  assert.match(start, /storage\.objects AS objeto/i);
  assert.doesNotMatch(start, /signedUrl|signedURL|createSignedUrl/i);
  assert.match(finish, /documento_original_sha256 IS NULL/i);
  assert.match(
    finish,
    /v_final_sha256 = v_envelope\.documento_original_sha256/i,
  );
  assert.match(finish, /participante\.status = 'ASSINADO'\) <> 2/i);
  assert.match(finish, /'DOCUMENTO_FINAL'/i);
  assert.match(finish, /'COMPROVANTE_EVIDENCIA'/i);
  assert.match(
    finish,
    /SET documento_final_sha256 = v_final_sha256[\s\S]*?status = 'ASSINADO'/i,
  );
});

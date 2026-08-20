// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260820002006_add_assinatura_termo_acervo_v1.sql",
  import.meta.url,
);
const archiveBrowserServiceUrl = new URL(
  "../../modules/gestor/secretaria/assinaturas/secretaria-assinaturas-acervo.service.ts",
  import.meta.url,
);
const artifactPipelineUrl = new URL(
  "../migrations/20260819203314_harden_diario_artifact_pipeline.sql",
  import.meta.url,
);
const [sql, archiveBrowserService, artifactPipeline] = await Promise.all([
  Deno.readTextFile(migrationUrl),
  Deno.readTextFile(archiveBrowserServiceUrl),
  Deno.readTextFile(artifactPipelineUrl),
]);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

const term = functionBlock(
  "public.assinatura_eletronica_termo_canonico_diario(",
);
const getTerm = functionBlock(
  "public.assinatura_eletronica_obter_termo(",
);
const gestorActorScope = functionBlock(
  "public.assinatura_eletronica_gestor_actor_tem_escopo(",
);
const manageDiary = functionBlock(
  "public.assinatura_eletronica_gestor_pode_gerir_diario(",
);
const prepare = functionBlock(
  "public.assinatura_eletronica_internal_preparar_reautenticacao(",
);
const register = functionBlock(
  "public.assinatura_eletronica_internal_registrar_reautenticacao(",
);
const consume = functionBlock(
  "public.assinatura_eletronica_internal_consumir_ticket_reautenticacao(",
);
const validator = functionBlock("public.validar_documento_por_codigo(");
const archive = functionBlock(
  "public.assinatura_eletronica_listar_acervo_gestor(",
);
const archiveOptions = functionBlock(
  "public.assinatura_eletronica_opcoes_acervo_gestor(",
);
const authorizeArtifact = functionBlock(
  "public.assinatura_eletronica_autorizar_artefato(",
);
const actorArtifact = functionBlock(
  "public.assinatura_eletronica_actor_pode_acessar_artefato(",
);
const resolveArtifact = functionBlock(
  "public.assinatura_eletronica_internal_resolver_acervo(",
);

Deno.test("migration é incremental, atômica e não habilita política nem altera Storage", () => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_politicas[\s\S]{0,300}?habilitada\s*=\s*true/i,
  );
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+storage\.objects/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+storage\.objects/i);
});

Deno.test("termo deriva somente da política aprovada congelada e fecha placeholders", () => {
  assert.match(
    term,
    /politica\.arquivada_em IS NULL[\s\S]*?politica\.habilitada[\s\S]*?politica\.status_juridico = 'APROVADA'/i,
  );
  assert.match(
    term,
    /politica\.versao = v_envelope\.politica_versao[\s\S]*?politica\.politica = v_envelope\.politica_snapshot[\s\S]*?politica\.certificado = v_envelope\.certificado_snapshot/i,
  );
  assert.match(
    term,
    /assinatura_eletronica_normalizar_editor[\s\S]*?v_editor IS DISTINCT FROM v_envelope\.politica_snapshot -> 'editor'/i,
  );
  assert.match(term, /v_editor ->> 'schemaVersion' <> '3'/i);
  assert.match(term, /jsonb_array_length\(v_sections\) <> 5/i);
  assert.match(term, /assinatura_eletronica_texto_termo_fechado/g);
  assert.match(sql, /defina aqui\|descreva aqui\|informe como/i);
  assert.match(term, /'termId', 'diario_classe:v' \|\|/i);
  assert.match(term, /'sections', v_sections/i);
  assert.match(
    term,
    /'sha256', public\.assinatura_eletronica_sha256_json\(v_base\)/i,
  );
  for (
    const key of [
      "termId",
      "version",
      "versionLabel",
      "title",
      "confirmationMessage",
      "sections",
      "sha256",
    ]
  ) {
    assert.match(term, new RegExp(`'${key}'`, "i"));
  }
});

Deno.test("RPC do termo autentica e vincula participante, perfil e contexto", () => {
  const auth = getTerm.indexOf("auth.uid()");
  const scope = getTerm.indexOf(
    "assinatura_eletronica_validar_escopo_reauth",
  );
  const canonical = getTerm.indexOf(
    "assinatura_eletronica_termo_canonico_diario",
  );
  assert.ok(auth >= 0 && scope > auth && canonical > scope);
  assert.match(
    getTerm,
    /p_envelope_id uuid[\s\S]*?p_participante_id uuid[\s\S]*?p_perfil text[\s\S]*?p_context_id uuid/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_obter_termo\([\s\S]*?\) TO authenticated/i,
  );
  assert.match(getTerm, /assinatura_eletronica_sessao_jwt_ativa\(v_actor\)/i);
});

Deno.test("gate de Gestor é actor-aware mesmo quando a Edge usa service_role", () => {
  assert.doesNotMatch(
    gestorActorScope,
    /auth\.(?:uid|role)\(|auth_email\(|can_operate_turma_academics|gestor_has_tab|is_gestor_for_polo/i,
  );
  assert.match(
    gestorActorScope,
    /FROM public\.usuarios_sistema AS gestor[\s\S]*?gestor\.id = p_context_id[\s\S]*?gestor\.auth_user_id = p_actor_auth_user_id[\s\S]*?is_active_status\(gestor\.status\)/i,
  );
  assert.match(
    gestorActorScope,
    /personalizar_permissoes[\s\S]*?perfil\.permissoes[\s\S]*?LEFT JOIN public\.perfis_acesso AS perfil/i,
  );
  assert.match(
    gestorActorScope,
    /AT TIME ZONE 'America\/Maceio'[\s\S]*?restricao_horario -> 'ativo'[\s\S]*?horario_inicio[\s\S]*?horario_fim[\s\S]*?restricao_horario -> 'dias'/i,
  );
  assert.match(
    gestorActorScope,
    /permissoes_efetivas -> 'modules'[\s\S]*?permissoes_efetivas -> 'tabs' -> v_modulo[\s\S]*?permissoes_usuario -> 'allPolos'[\s\S]*?v_polo_ids[\s\S]*?v_contexto_polo::uuid/i,
  );
  assert.match(
    manageDiary,
    /FROM public\.turmas AS turma[\s\S]*?turma\.id = p_turma_id[\s\S]*?turma\.polo_id = p_polo_id[\s\S]*?'gestao',[\s\S]*?NULL[\s\S]*?'secretaria',[\s\S]*?'assinatura-eletronica'/i,
  );
  assert.doesNotMatch(
    manageDiary,
    /auth\.(?:uid|role)\(|can_operate_turma_academics|gestor_has_tab|is_gestor_for_polo/i,
  );
  assert.match(
    artifactPipeline,
    /assinatura_eletronica_autorizar_original_diario_seguro\([\s\S]*?assinatura_eletronica_exigir_service_role\(\)[\s\S]*?assinatura_eletronica_gestor_pode_gerir_diario\(\s*p_actor_auth_user_id/i,
  );
});

Deno.test("preflight valida consent antes de rate-limit/replay e fecha overload antigo", () => {
  assert.match(
    prepare,
    /p_auth_session_id uuid,[\s\S]*?p_consent jsonb,[\s\S]*?p_request_id uuid,[\s\S]*?p_attempt_id uuid/i,
  );
  const session = prepare.indexOf("assinatura_eletronica_exigir_sessao_ativa");
  const scope = prepare.indexOf("assinatura_eletronica_validar_escopo_reauth");
  const canonical = prepare.indexOf(
    "assinatura_eletronica_termo_canonico_diario",
  );
  const rateLock = prepare.indexOf("assinatura:reauth:rate:");
  const replay = prepare.indexOf("SELECT tentativa.*");
  assert.ok(
    session >= 0 && scope > session && canonical > scope &&
      rateLock > canonical &&
      replay > rateLock,
  );
  assert.match(
    prepare,
    /ARRAY\['accepted', 'sha256', 'termId'\]::text\[\][\s\S]*?p_consent -> 'accepted' IS DISTINCT FROM 'true'::jsonb/i,
  );
  assert.match(
    prepare,
    /p_consent ->> 'termId' IS DISTINCT FROM v_term ->> 'termId'[\s\S]*?p_consent ->> 'sha256' IS DISTINCT FROM v_term ->> 'sha256'/i,
  );
  assert.ok((prepare.match(/'consent', p_consent/g) || []).length >= 2);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.assinatura_eletronica_internal_preparar_reautenticacao\(\s*uuid, uuid, text, uuid, uuid, uuid, uuid, uuid\s*\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_internal_preparar_reautenticacao\(\s*uuid, uuid, text, uuid, uuid, uuid, jsonb, uuid, uuid\s*\)[\s\S]*?TO service_role/i,
  );
  assert.match(
    register,
    /'authSessionId', p_auth_session_id,[\s\S]*?'consent', p_evidencia -> 'consent'[\s\S]*?v_preflight\.payload_sha256 IS DISTINCT FROM v_attempt_payload_sha256/i,
  );
});

Deno.test("aceite novo exige versão, hash e instante oficial no mesmo transition", () => {
  assert.match(
    sql,
    /ADD COLUMN aceite_termo_sha256 text,[\s\S]*?ADD COLUMN aceite_termo_em timestamptz/i,
  );
  assert.match(
    sql,
    /aceite_termo_sha256 IS NOT NULL[\s\S]*?aceite_termo_sha256 ~ '\^\[0-9a-f\]\{64\}\$'[\s\S]*?aceite_termo_em IS NOT NULL/i,
  );
  const protect = functionBlock(
    "public.assinatura_eletronica_proteger_participante(",
  );
  assert.match(
    protect,
    /NEW\.aceite_termo_sha256 IS DISTINCT FROM OLD\.aceite_termo_sha256[\s\S]*?NEW\.aceite_termo_em IS DISTINCT FROM OLD\.aceite_termo_em/i,
  );
  assert.match(
    protect,
    /OLD\.status <> 'DESAFIO_PENDENTE'[\s\S]*?NEW\.status <> 'ASSINADO'[\s\S]*?NEW\.aceite_termo_sha256 IS NULL[\s\S]*?NEW\.aceite_termo_sha256 !~ '\^\[0-9a-f\]\{64\}\$'[\s\S]*?NEW\.aceite_termo_em IS DISTINCT FROM NEW\.assinado_em/i,
  );
  assert.doesNotMatch(
    consume,
    /aceitou_versao_termo\s*=\s*'diario_classe:v'/i,
  );
  assert.match(
    consume,
    /aceitou_versao_termo = v_term ->> 'termId'[\s\S]*?aceite_termo_sha256 = v_term ->> 'sha256'[\s\S]*?aceite_termo_em = v_signed_at/i,
  );
});

Deno.test("registrador exige consent exact e o liga a payload, challenge e ticket", () => {
  const authorization = register.indexOf(
    "assinatura_eletronica_exigir_sessao_ativa",
  );
  const scope = register.indexOf("assinatura_eletronica_validar_escopo_reauth");
  const replay = register.indexOf("SELECT operacao.*");
  assert.ok(authorization >= 0 && scope > authorization && replay > scope);
  assert.match(
    register,
    /ARRAY\['accepted', 'sha256', 'termId'\]::text\[\]/i,
  );
  assert.match(
    register,
    /p_evidencia -> 'consent' -> 'accepted' IS DISTINCT FROM 'true'::jsonb/i,
  );
  assert.match(
    register,
    /p_evidencia -> 'consent' ->> 'termId'[\s\S]*?v_term ->> 'termId'[\s\S]*?p_evidencia -> 'consent' ->> 'sha256'[\s\S]*?v_term ->> 'sha256'/i,
  );
  assert.match(
    register,
    /'reauthenticatedAt', p_reautenticado_em,[\s\S]*?'evidence', p_evidencia/i,
  );
  assert.match(register, /'consent', p_evidencia -> 'consent'/i);
  assert.match(register, /evidencia_snapshot[\s\S]*?p_evidencia/i);
  assert.match(
    register,
    /evidencia_hash[\s\S]*?assinatura_eletronica_sha256_json\(p_evidencia\)/i,
  );

  // Hashes de transporte são opcionais, porém nenhuma chave desconhecida entra.
  assert.match(
    register,
    /chave NOT IN \([\s\S]*?'ipHash'[\s\S]*?'userAgentHash'[\s\S]*?'consent'/i,
  );
  assert.match(register, /p_evidencia \? 'ipHash'/i);
  assert.match(register, /p_evidencia \? 'userAgentHash'/i);
  assert.doesNotMatch(register, /p_evidencia \?& ARRAY\[[^\]]*'ipHash'/i);
});

Deno.test("decoder recusa tickets antigos sem consentimento", () => {
  const decode = functionBlock(
    "public.assinatura_eletronica_decodificar_ticket(",
  );
  assert.match(
    decode,
    /ARRAY\[[\s\S]*?'challengeId', 'consent',[\s\S]*?'requestId'[\s\S]*?\]::text\[\]/i,
  );
  assert.match(
    decode,
    /ARRAY\['accepted', 'sha256', 'termId'\]::text\[\]/i,
  );
  assert.match(decode, /'accepted' IS DISTINCT FROM 'true'::jsonb/i);
});

Deno.test("consume recalcula termo sob lock antes do replay e emite leitura antes da assinatura", () => {
  const session = consume.indexOf("assinatura_eletronica_exigir_sessao_ativa");
  const scope = consume.indexOf("assinatura_eletronica_validar_escopo_reauth");
  const envelopeLock = consume.indexOf("SELECT envelope.*");
  const termRevalidation = consume.indexOf(
    "assinatura_eletronica_termo_canonico_diario",
  );
  const replay = consume.indexOf("SELECT operacao.*");
  assert.ok(
    session >= 0 && scope > session && envelopeLock > scope &&
      termRevalidation > envelopeLock && replay > termRevalidation,
  );
  assert.match(
    consume,
    /v_desafio\.evidencia_snapshot -> 'consent' IS DISTINCT FROM v_consent/i,
  );
  assert.match(
    consume,
    /v_consent ->> 'termId' IS DISTINCT FROM v_term ->> 'termId'[\s\S]*?v_consent ->> 'sha256' IS DISTINCT FROM v_term ->> 'sha256'/i,
  );
  const reading = consume.indexOf("'LEITURA_CONFIRMADA'");
  const signed = consume.indexOf("'ASSINATURA_CONCLUIDA'");
  assert.ok(reading >= 0 && signed > reading);
  assert.match(
    consume,
    /'termId', v_term ->> 'termId'[\s\S]*?'termVersion'[\s\S]*?'termSha256', v_term ->> 'sha256'[\s\S]*?'acceptedAt', v_signed_at/i,
  );
  assert.match(
    consume,
    /'ASSINATURA_CONCLUIDA'[\s\S]*?'signedAt', v_signed_at[\s\S]*?'termId'[\s\S]*?'termSha256'/i,
  );
});

Deno.test("validador preserva legado e só publica Diário final ou substituído", () => {
  const legacy = validator.indexOf("FROM public.documentos_validacao AS dv");
  const legacyReturn = validator.indexOf("RETURN v_resultado", legacy);
  const envelopeBranch = validator.indexOf(
    "FROM public.assinatura_eletronica_envelopes AS envelope",
  );
  assert.ok(
    legacy >= 0 && legacyReturn > legacy && envelopeBranch > legacyReturn,
  );
  assert.match(
    validator,
    /envelope\.status IN \('ASSINADO', 'SUBSTITUIDO'\)/i,
  );
  assert.match(validator, /envelope\.finalizado_em IS NOT NULL/i);
  assert.match(
    validator,
    /artefato_final\.classe = 'DOCUMENTO_FINAL'[\s\S]*?artefato_final\.sha256 = envelope\.documento_final_sha256/i,
  );
  assert.match(
    validator,
    /JOIN storage\.objects AS objeto_final[\s\S]*?objeto_final\.bucket_id = artefato_final\.bucket_id[\s\S]*?objeto_final\.name = artefato_final\.storage_path/i,
  );
  assert.match(
    validator,
    /WHEN envelope\.status = 'SUBSTITUIDO' THEN 'REVOKED'[\s\S]*?ELSE 'ACTIVE'/i,
  );
  assert.match(
    validator,
    /upper\(envelope\.documento_snapshot ->> 'validationCode'\)[\s\S]*?upper\(envelope\.id::text\)/i,
  );
  assert.match(
    validator,
    /'visibleFields', jsonb_build_array\('institutionName', 'issuedAt'\)[\s\S]*?'schemaVersion', 2/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.validar_documento_por_codigo\(text\)[\s\S]*?TO anon, authenticated/i,
  );
});

Deno.test("acervo é diary-only, filtra no servidor e pagina por cursor estável", () => {
  assert.match(archive, /assinatura_eletronica_sessao_jwt_ativa\(v_actor\)/i);
  assert.match(
    archive,
    /p_context_id uuid[\s\S]*?p_polo_id uuid[\s\S]*?p_documento text[\s\S]*?p_status text[\s\S]*?p_busca text[\s\S]*?p_turma_id uuid[\s\S]*?p_finalizado_de timestamptz[\s\S]*?p_finalizado_ate timestamptz[\s\S]*?p_limite integer[\s\S]*?p_cursor_finalizado_em timestamptz[\s\S]*?p_cursor_envelope_id uuid/i,
  );
  assert.match(archive, /v_documento <> 'diario_classe'/i);
  assert.match(
    archive,
    /envelope\.documento = 'diario_classe'[\s\S]*?envelope\.origem_tipo = 'DIARIO'/i,
  );
  assert.match(
    archive,
    /envelope\.status IN \('ASSINADO', 'SUBSTITUIDO'\)/i,
  );
  assert.match(
    archive,
    /pg_catalog\.strpos\(lower\(envelope\.titulo\)[\s\S]*?pg_catalog\.strpos\(lower\(envelope\.id::text\)[\s\S]*?envelope\.documento_snapshot -> 'turma' ->> 'nome'[\s\S]*?envelope\.documento_snapshot -> 'disciplina' ->> 'nome'[\s\S]*?participante_busca\.identidade_snapshot ->> 'name'/i,
  );
  assert.match(
    archive,
    /\(envelope\.finalizado_em, envelope\.id\) <[\s\S]*?\(p_cursor_finalizado_em, p_cursor_envelope_id\)/i,
  );
  assert.match(
    archive,
    /ORDER BY envelope\.finalizado_em DESC, envelope\.id DESC[\s\S]*?LIMIT p_limite \+ 1/i,
  );
  assert.match(
    archive,
    /assinatura_eletronica_artefatos AS artefato_final[\s\S]*?JOIN storage\.objects AS objeto_final[\s\S]*?objeto_final\.bucket_id = artefato_final\.bucket_id[\s\S]*?objeto_final\.name = artefato_final\.storage_path/i,
  );
  assert.match(
    archive,
    /assinatura_eletronica_artefatos AS comprovante[\s\S]*?JOIN storage\.objects AS objeto_comprovante[\s\S]*?objeto_comprovante\.bucket_id = comprovante\.bucket_id[\s\S]*?objeto_comprovante\.name = comprovante\.storage_path/i,
  );
  for (
    const key of [
      "turmaId",
      "turmaNome",
      "disciplinaId",
      "disciplinaNome",
      "signers",
      "role",
      "name",
      "signedAt",
      "nextCursor",
    ]
  ) {
    assert.match(archive, new RegExp(`'${key}'`, "i"));
  }
  assert.doesNotMatch(
    archive.slice(archive.indexOf("RETURN jsonb_build_object")),
    /storagePath|bucketId|documento_snapshot|identidade_snapshot/i,
  );
});

Deno.test("autorizador decide combinações no SQL e nunca entrega coordenadas", () => {
  assert.match(
    authorizeArtifact,
    /assinatura_eletronica_sessao_jwt_ativa\(v_actor\)/i,
  );
  assert.match(
    authorizeArtifact,
    /v_perfil NOT IN \('GESTOR', 'PROFESSOR', 'COORDENADOR'\)/i,
  );
  assert.match(
    authorizeArtifact,
    /v_classe NOT IN \([\s\S]*?'DOCUMENTO_ORIGINAL'[\s\S]*?'DOCUMENTO_FINAL'[\s\S]*?'COMPROVANTE_EVIDENCIA'/i,
  );
  assert.match(
    authorizeArtifact,
    /assinatura_eletronica_actor_pode_acessar_artefato\([\s\S]*?v_actor,[\s\S]*?v_envelope\.id,[\s\S]*?v_classe,[\s\S]*?v_perfil,[\s\S]*?p_context_id/i,
  );
  assert.match(
    actorArtifact,
    /upper\(btrim\(p_perfil\)\) = 'GESTOR'[\s\S]*?assinatura_eletronica_acervo_gestor_autorizado[\s\S]*?upper\(btrim\(p_perfil\)\) IN \('PROFESSOR', 'COORDENADOR'\)[\s\S]*?upper\(btrim\(p_classe\)\) = 'DOCUMENTO_ORIGINAL'/i,
  );
  assert.match(
    actorArtifact,
    /participante\.papel = upper\(btrim\(p_perfil\)\)[\s\S]*?participante\.contexto_id = p_context_id[\s\S]*?participante\.auth_user_id = p_actor_auth_user_id/i,
  );
  const returned = authorizeArtifact.slice(
    authorizeArtifact.indexOf("RETURN jsonb_build_object"),
  );
  for (
    const key of [
      "envelopeId",
      "artifactId",
      "artifactClass",
      "sha256",
      "byteSize",
      "mimeType",
      "fileName",
    ]
  ) {
    assert.match(returned, new RegExp(`'${key}'`, "i"));
  }
  assert.doesNotMatch(returned, /bucketId|storagePath|bucket_id|storage_path/i);
  assert.match(
    authorizeArtifact,
    /JOIN storage\.objects AS objeto[\s\S]*?objeto\.bucket_id = artefato\.bucket_id[\s\S]*?objeto\.name = artefato\.storage_path/i,
  );
});

Deno.test("opções de turma usam o mesmo RBAC e só refletem acervo disponível", () => {
  assert.match(
    archiveOptions,
    /p_context_id uuid,[\s\S]*?p_polo_id uuid[\s\S]*?RETURNS jsonb/i,
  );
  assert.match(
    archiveOptions,
    /assinatura_eletronica_sessao_jwt_ativa\(v_actor\)/i,
  );
  assert.match(
    archiveOptions,
    /assinatura_eletronica_perfil_contexto_valido\([\s\S]*?'GESTOR'[\s\S]*?gestor_has_tab\('secretaria', 'assinatura-eletronica'\)[\s\S]*?is_gestor_for_polo\(p_polo_id\)/i,
  );
  assert.match(
    archiveOptions,
    /envelope\.documento = 'diario_classe'[\s\S]*?envelope\.origem_tipo = 'DIARIO'[\s\S]*?envelope\.status IN \('ASSINADO', 'SUBSTITUIDO'\)[\s\S]*?envelope\.finalizado_em IS NOT NULL/i,
  );
  assert.match(
    archiveOptions,
    /JOIN storage\.objects AS objeto_final[\s\S]*?JOIN storage\.objects AS objeto_comprovante/i,
  );
  assert.match(
    archiveOptions,
    /SELECT DISTINCT ON \(envelope\.turma_id\)[\s\S]*?'id', ultima_turma\.id, 'label', ultima_turma\.label[\s\S]*?RETURN jsonb_build_object\('items', v_items\)/i,
  );
  assert.doesNotMatch(
    archiveOptions.slice(archiveOptions.indexOf("RETURN jsonb_build_object")),
    /documento_snapshot|identidade_snapshot|storage_path|bucket_id/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_opcoes_acervo_gestor\(\s*uuid, uuid\s*\)[\s\S]*?TO authenticated/i,
  );
});

Deno.test("browser obtém opções somente pela RPC autorizada", () => {
  assert.match(
    archiveBrowserService,
    /\.rpc\(\s*'assinatura_eletronica_opcoes_acervo_gestor'/i,
  );
  assert.match(
    archiveBrowserService,
    /p_context_id:[\s\S]*?p_polo_id:/i,
  );
  assert.doesNotMatch(archiveBrowserService, /\.from\(\s*['"]turmas['"]\s*\)/i);
  assert.doesNotMatch(archiveBrowserService, /\.from\s*\(/i);
});

Deno.test("RPCs authenticated derivam session_id do JWT e revalidam auth.sessions", () => {
  const sessionHelper = functionBlock(
    "public.assinatura_eletronica_sessao_jwt_ativa(",
  );
  assert.match(
    sessionHelper,
    /auth\.uid\(\) IS DISTINCT FROM p_actor_auth_user_id/i,
  );
  assert.match(sessionHelper, /auth\.jwt\(\) ->> 'session_id'/i);
  assert.match(
    sessionHelper,
    /assinatura_eletronica_exigir_sessao_ativa\([\s\S]*?p_actor_auth_user_id,[\s\S]*?v_auth_session_id/i,
  );
  assert.match(sessionHelper, /ASSINATURA_SESSAO_INVALIDA_OU_REVOGADA/g);
});

Deno.test("resolver service-role reautoriza ator e sessão no mesmo boundary", () => {
  const serviceRole = resolveArtifact.indexOf(
    "assinatura_eletronica_exigir_service_role",
  );
  const session = resolveArtifact.indexOf(
    "assinatura_eletronica_exigir_sessao_ativa",
  );
  const authorization = resolveArtifact.indexOf(
    "assinatura_eletronica_actor_pode_acessar_artefato",
  );
  const query = resolveArtifact.indexOf(
    "FROM public.assinatura_eletronica_artefatos",
  );
  assert.ok(
    serviceRole >= 0 && session > serviceRole && authorization > session &&
      query > authorization,
  );
  assert.match(
    resolveArtifact,
    /p_envelope_id uuid[\s\S]*?p_classe text[\s\S]*?p_perfil text[\s\S]*?p_context_id uuid[\s\S]*?p_actor_auth_user_id uuid[\s\S]*?p_auth_session_id uuid[\s\S]*?p_request_id uuid/i,
  );
  assert.doesNotMatch(resolveArtifact, /p_artifact_id/i);
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.assinatura_eletronica_internal_resolver_acervo\(\s*uuid\s*\)/i,
  );
  assert.doesNotMatch(
    sql,
    /CREATE OR REPLACE FUNCTION public\.assinatura_eletronica_internal_resolver_acervo\(\s*p_artifact_id uuid/i,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_internal_resolver_acervo\(\s*uuid\s*\)/i,
  );
  assert.match(resolveArtifact, /'requestId', p_request_id/i);
  assert.match(resolveArtifact, /'bucketId', v_artefato\.bucket_id/i);
  assert.match(resolveArtifact, /'storagePath', v_artefato\.storage_path/i);
  assert.match(
    resolveArtifact,
    /JOIN storage\.objects AS objeto[\s\S]*?objeto\.bucket_id = artefato\.bucket_id[\s\S]*?objeto\.name = artefato\.storage_path/i,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_internal_resolver_acervo\(\s*uuid, text, text, uuid, uuid, uuid, uuid\s*\)[\s\S]*?TO service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_internal_resolver_acervo\([\s\S]{0,120}?TO authenticated/i,
  );
});

Deno.test("todas as funções definer fecham search_path e ACL pública é mínima", () => {
  const definitions = [...sql.matchAll(
    /CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\([\s\S]*?\$function\$;/gi,
  )];
  assert.ok(definitions.length >= 10);
  for (const definition of definitions) {
    const name = definition[1];
    assert.ok(name.length <= 63, `${name} excede 63 bytes.`);
    if (/SECURITY DEFINER/i.test(definition[0])) {
      assert.match(definition[0], /SET search_path = ''/i, name);
    }
  }
  assert.doesNotMatch(sql, /GRANT EXECUTE[\s\S]{0,160}?TO PUBLIC/i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.assinatura_eletronica_internal_registrar_reautenticacao\([\s\S]*?timestamptz, jsonb, uuid\s*\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
});

// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";
import {
  compactSql,
  firstAccess,
  functionBlock,
  migration,
} from "./responsavel_first_access.contract-support.ts";

import "./responsavel_first_access.additional-contracts.ts";

Deno.test("migration é atômica, incremental e protege o estado canônico", () => {
  assert.match(migration, /^--[\s\S]*?\nBEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/i);

  const guard = functionBlock("public.proteger_campos_acesso_responsavel()");
  for (
    const column of [
      "email_validado_gestor_em",
      "troca_senha_obrigatoria",
      "senha_temporaria_pendente",
      "senha_temporaria_emitida_em",
      "senha_atualizada_em",
      "senha_temporaria_emissao_id",
      "senha_temporaria_emissao_iniciada_em",
      "senha_temporaria_emissao_senha_alterada_em",
      "senha_temporaria_emissoes_revogadas",
      "aceitou_termos_uso",
      "aceitou_termos_uso_em",
      "termos_uso_versao",
    ]
  ) {
    assert.match(
      migration,
      new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, "i"),
    );
    assert.match(guard, new RegExp(`NEW\\.${column}`, "i"));
  }
  assert.match(
    migration,
    /responsaveis_legais_emissao_senha_temporaria_coerente[\s\S]*?senha_temporaria_emissao_senha_alterada_em IS NULL[\s\S]*?senha_temporaria_emissao_iniciada_em IS NOT NULL/i,
  );
  assert.match(guard, /current_user IN \('anon', 'authenticated'\)/i);
  assert.doesNotMatch(guard, /SECURITY DEFINER/i);
});

Deno.test("preparação preserva o contrato anterior e acrescenta reconciliação completa", () => {
  const prepare = functionBlock(
    "CREATE OR REPLACE FUNCTION public.responsavel_legal_acesso_preparar(",
  );

  for (
    const key of [
      "responsavelLegalId",
      "nome",
      "cpf",
      "email",
      "status",
      "authUserId",
      "eligible",
      "accessBlockReason",
      "emailValidatedByManager",
      "temporaryPasswordPending",
      "temporaryPasswordAllowed",
      "temporaryPasswordIssuedAt",
      "passwordUpdatedAt",
      "temporaryPasswordIssueId",
      "temporaryPasswordIssueStartedAt",
      "temporaryPasswordRevokedIssueIds",
      "requiresPasswordChange",
      "termsAccepted",
      "termsVersion",
      "currentTermsVersion",
      "firstAccessPending",
    ]
  ) {
    assert.match(prepare, new RegExp(`'${key}'`, "i"));
  }

  assert.match(prepare, /portal_identidade_exigir_service_role_actor/i);
  assert.match(prepare, /GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO/i);
  assert.match(prepare, /senha_atualizada_em IS NULL/i);
  assert.match(
    prepare,
    /senha_atualizada_em <=[\s\S]*?senha_temporaria_emitida_em/i,
  );
  assert.match(
    prepare,
    /'firstAccessPending', NOT v_termos_aceitos OR v_requer_troca_senha/i,
  );
  assert.match(
    prepare,
    /v_identidade_auth_compartilhada := EXISTS \([\s\S]*?FROM public\.parceiros AS outro_perfil[\s\S]*?OR EXISTS \([\s\S]*?FROM public\.usuarios_sistema AS usuario_interno[\s\S]*?OR EXISTS \([\s\S]*?FROM public\.responsaveis_legais AS outro_responsavel/i,
  );
  assert.match(
    prepare,
    /'temporaryPasswordAllowed',[\s\S]*?auth_user_id IS NOT NULL[\s\S]*?AND NOT v_identidade_auth_compartilhada/i,
  );
});

Deno.test("troca de identidade Auth não herda senha, validação ou termos", () => {
  const initialize = functionBlock(
    "public.inicializar_acesso_responsavel_ao_vincular_auth()",
  );
  const clearValidation = functionBlock(
    "public.limpar_validacao_email_responsavel_ao_alterar_identidade()",
  );

  assert.match(
    initialize,
    /NEW\.auth_user_id IS NOT DISTINCT FROM OLD\.auth_user_id[\s\S]*?RETURN NEW/i,
  );
  for (
    const reset of [
      "email_validado_gestor_em := NULL",
      "senha_atualizada_em := NULL",
      "senha_temporaria_emissao_id := NULL",
      "aceitou_termos_uso := false",
      "aceitou_termos_uso_em := NULL",
      "termos_uso_versao := NULL",
    ]
  ) {
    assert.match(initialize, new RegExp(reset, "i"));
  }
  assert.match(
    clearValidation,
    /NEW\.auth_user_id IS DISTINCT FROM OLD\.auth_user_id/i,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OF auth_user_id, email ON public\.responsaveis_legais/i,
  );
});

Deno.test("convite normal exige somente termos depois da senha criada", () => {
  const normalInvite = firstAccess({
    passwordUpdatedAt: 20,
    temporaryPasswordIssuedAt: null,
    temporaryPasswordPending: false,
    requiresPasswordReset: false,
    termsAcceptedForCurrentVersion: false,
  });

  assert.deepEqual(normalInvite, {
    requiresPasswordChange: false,
    firstAccessPending: true,
  });

  const sync = functionBlock("public.sync_aluno_password_reset_completion()");
  assert.match(sync, /UPDATE public\.responsaveis_legais AS responsavel/i);
  assert.match(sync, /WHEN v_password_changed THEN v_password_updated_at/i);
  assert.match(
    sync,
    /coalesce\(responsavel\.senha_temporaria_pendente, false\)[\s\S]*?THEN true[\s\S]*?ELSE false/i,
  );
  assert.match(
    sync,
    /OR EXISTS \([\s\S]*?FROM public\.responsaveis_legais AS responsavel[\s\S]*?responsavel\.auth_user_id = NEW\.id/i,
  );
  assert.match(
    sync,
    /FROM public\.parceiros AS outro_perfil[\s\S]*?outro_perfil\.auth_user_id = NEW\.id[\s\S]*?<> 'ALUNO'/i,
  );
  assert.match(
    sync,
    /FROM public\.usuarios_sistema AS usuario_interno[\s\S]*?usuario_interno\.auth_user_id = NEW\.id/i,
  );
  assert.match(sync, /\) THEN\s+RETURN NEW;/i);
  assert.match(
    sync,
    /upper\(coalesce\(parceiro\.tipo, ''\)\) = 'ALUNO'/i,
  );
  assert.doesNotMatch(sync, /parceiro\.tipo = 'Aluno'/i);
  assert.match(
    sync,
    /OLD\.email_confirmed_at IS DISTINCT FROM NEW\.email_confirmed_at/i,
  );
  assert.doesNotMatch(sync, /\b(?:OLD|NEW)\.confirmed_at\b/i);
  assert.doesNotMatch(
    migration,
    /\b(?:auth_user|usuario_auth)\.confirmed_at\b/i,
  );
  assert.match(
    migration,
    /AFTER UPDATE OF encrypted_password, email_confirmed_at\s+ON auth\.users/i,
  );
  assert.ok(
    sync.indexOf("FROM public.responsaveis_legais AS responsavel") <
      sync.indexOf("v_email_normalizado := lower(btrim(NEW.email))"),
    "A identidade do Responsável deve interromper o fallback por e-mail antes da busca do Aluno.",
  );
});

Deno.test("senha temporária exige uma troca posterior antes dos termos", () => {
  const justIssued = firstAccess({
    passwordUpdatedAt: 20,
    temporaryPasswordIssuedAt: 30,
    temporaryPasswordPending: true,
    requiresPasswordReset: true,
    termsAcceptedForCurrentVersion: false,
  });
  assert.deepEqual(justIssued, {
    requiresPasswordChange: true,
    firstAccessPending: true,
  });

  const afterOwnPassword = firstAccess({
    passwordUpdatedAt: 40,
    temporaryPasswordIssuedAt: 30,
    temporaryPasswordPending: true,
    requiresPasswordReset: false,
    termsAcceptedForCurrentVersion: false,
  });
  assert.deepEqual(afterOwnPassword, {
    requiresPasswordChange: false,
    firstAccessPending: true,
  });

  const reserve = functionBlock(
    "public.portal_reservar_emissao_senha_temporaria_responsavel(",
  );
  const complete = functionBlock(
    "public.portal_concluir_emissao_senha_temporaria_responsavel(",
  );
  const finalize = functionBlock(
    "CREATE OR REPLACE FUNCTION public.portal_finalizar_primeiro_acesso(",
  );
  assert.match(reserve, /troca_senha_obrigatoria = true/i);
  assert.match(reserve, /senha_atualizada_em = NULL/i);
  assert.match(
    reserve,
    /email_validado_gestor_em IS NULL[\s\S]*?v_auth_email_confirmado_em IS NULL/i,
  );
  assert.match(
    complete,
    /senha_temporaria_emitida_em = pg_catalog\.clock_timestamp\(\)/i,
  );
  assert.match(
    complete,
    /senha_temporaria_emissao_senha_alterada_em IS NULL/i,
  );
  assert.match(
    complete,
    /v_auth_write_nonce IS DISTINCT FROM p_emissao_id::text/i,
  );
  assert.match(complete, /troca_senha_obrigatoria = true/i);
  assert.match(finalize, /PORTAL_PRIMEIRO_ACESSO_SENHA_AINDA_OBRIGATORIA/i);
});

Deno.test("dependentes só voltam após senha e termos da versão vigente", () => {
  const dependents = functionBlock(
    "public.responsavel_legal_listar_dependentes(",
  );
  const guard = dependents.indexOf(
    "PORTAL_RESPONSAVEL_PRIMEIRO_ACESSO_PENDENTE",
  );
  const rows = dependents.indexOf("RETURN QUERY");

  assert.ok(guard >= 0 && rows > guard);
  assert.match(dependents, /responsavel\.auth_user_id = v_actor/i);
  assert.match(dependents, /responsavel\.status = 'ATIVO'/i);
  assert.match(dependents, /senha_atualizada_em IS NULL/i);
  assert.match(dependents, /troca_senha_obrigatoria/i);
  assert.match(dependents, /senha_temporaria_pendente/i);
  assert.match(dependents, /aceitou_termos_uso/i);
  assert.match(
    dependents,
    /termos_uso_versao IS DISTINCT FROM[\s\S]*?v_termos_versao_vigente/i,
  );
});

Deno.test("RPCs sensíveis são service_role, fail-closed e sem segredo", () => {
  for (
    const rpc of [
      "portal_validar_email_responsavel_por_gestor",
      "portal_reservar_emissao_senha_temporaria_responsavel",
      "portal_concluir_emissao_senha_temporaria_responsavel",
      "portal_cancelar_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ]
  ) {
    const block = functionBlock(`public.${rpc}(`);
    assert.match(block, /SECURITY DEFINER/i);
    assert.match(block, /SET search_path = ''/i);
    assert.match(
      block,
      /portal_identidade_exigir_service_role_actor|responsavel_legal_acesso_preparar/i,
    );
    assert.match(
      compactSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${rpc}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      compactSql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([\\s\\S]*?TO service_role`,
        "i",
      ),
    );
  }

  assert.match(
    migration,
    /universocc_responsavel_temporary_password_issue_id/i,
  );
  assert.doesNotMatch(
    migration,
    /p_(senha|password)|temporaryPassword['"]?\s*[,=:]/i,
  );
});

Deno.test("trigger Auth separa emissões de Aluno e Responsável sem colisão", () => {
  const fence = functionBlock(
    "public.rejeitar_emissao_senha_temporaria_revogada()",
  );
  const collision = functionBlock(
    "public.impedir_colisao_senha_temporaria_entre_perfis()",
  );

  assert.match(fence, /universocc_temporary_password_issue_id/i);
  assert.match(
    fence,
    /universocc_responsavel_temporary_password_issue_id/i,
  );
  assert.match(fence, /universocc_temporary_password_write_nonce/i);
  assert.match(
    fence,
    /universocc_responsavel_temporary_password_write_nonce/i,
  );
  assert.match(fence, /FROM public\.parceiros AS aluno[\s\S]*?FOR UPDATE/i);
  assert.match(
    fence,
    /FROM public\.responsaveis_legais AS responsavel[\s\S]*?FOR UPDATE/i,
  );
  assert.match(collision, /pg_advisory_xact_lock/i);
  assert.match(
    collision,
    /PORTAL_EMISSAO_SENHA_TEMPORARIA_OUTRO_PERFIL_ATIVA/i,
  );
  for (
    const invariant of [
      /v_aluno_previous_issue_text IS NULL/i,
      /v_aluno_previous_write_nonce_text IS NULL/i,
      /OR v_aluno_marker_changed/i,
      /OR v_aluno_write_nonce_changed/i,
      /v_aluno\.senha_temporaria_emissao_senha_alterada_em[\s\S]*?IS NOT NULL/i,
      /v_responsavel_previous_issue_text IS NULL/i,
      /v_responsavel_previous_write_nonce_text IS NULL/i,
      /OR v_responsavel_marker_changed/i,
      /OR v_responsavel_write_nonce_changed/i,
      /v_responsavel\.senha_temporaria_emissao_senha_alterada_em[\s\S]*?IS NOT NULL/i,
      /PORTAL_EMISSAO_SENHA_TEMPORARIA_ESCRITA_DIVERGENTE/i,
      /PORTAL_EMISSAO_SENHA_TEMPORARIA_PREPARACAO_DIVERGENTE/i,
      /PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_ESCRITA_DIVERGENTE/i,
      /PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_PREPARACAO_DIVERGENTE/i,
    ]
  ) {
    assert.match(fence, invariant);
  }
  assert.ok(
    fence.indexOf("FOR v_aluno IN") <
      fence.indexOf("v_aluno_previous_write_nonce_text IS NULL"),
  );
  assert.ok(
    fence.indexOf("FOR v_responsavel IN") <
      fence.indexOf("v_responsavel_previous_write_nonce_text IS NULL"),
  );
});

Deno.test("Edge do Responsável stageia marker e nonce antes da escrita única da senha", async () => {
  const handler = await Deno.readTextFile(
    new URL(
      "../functions/portal-user-management/handlers/issue-responsavel-temporary-password.ts",
      import.meta.url,
    ),
  );
  const emissionCoordinator = await Deno.readTextFile(
    new URL(
      "../functions/portal-user-management/handlers/temporary-password-emission.ts",
      import.meta.url,
    ),
  );

  assert.match(
    handler,
    /issueMetadataKey:\s*RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY[\s\S]*?writeNonceMetadataKey:\s*RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY/i,
  );
  assert.match(
    emissionCoordinator,
    /\[config\.issueMetadataKey\]: issueId,[\s\S]*?\[config\.writeNonceMetadataKey\]: issueId/i,
  );
  assert.match(
    emissionCoordinator,
    /issueIdFromAuthUser\(data\.user\) === issueId[\s\S]*?writeNonceFromAuthUser\(data\.user\) === issueId/i,
  );

  const issueFlow = handler.slice(
    handler.indexOf("export const handleIssueResponsavelTemporaryPassword"),
  );
  const stagedAt = issueFlow.indexOf("markIssueInAuth(");
  const passwordAt = issueFlow.indexOf("password: temporaryPassword");
  const verifiedAt = issueFlow.indexOf("verifyTemporaryPassword(");
  const completedAt = issueFlow.indexOf("finishAfterPasswordAttempt(");
  assert.ok(stagedAt >= 0 && stagedAt < passwordAt);
  assert.ok(passwordAt < verifiedAt && verifiedAt < completedAt);
  const passwordWrite = issueFlow.slice(
    issueFlow.lastIndexOf("updateUserById(", passwordAt),
    verifiedAt,
  );
  assert.doesNotMatch(passwordWrite, /app_metadata/i);
});

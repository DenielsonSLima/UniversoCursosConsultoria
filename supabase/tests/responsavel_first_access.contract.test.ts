// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260821234000_complete_responsavel_first_access.sql",
    import.meta.url,
  ),
);
const studentMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260821230000_harden_student_temporary_password_first_access.sql",
    import.meta.url,
  ),
);

const compactSql = migration.replace(/\s+/g, " ").trim();

const functionBlockFrom = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  const end = source.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return source.slice(start, end + "$function$;".length);
};
const functionBlock = (signature: string) =>
  functionBlockFrom(migration, signature);

type FirstAccessState = {
  passwordUpdatedAt: number | null;
  temporaryPasswordIssuedAt: number | null;
  temporaryPasswordPending: boolean;
  requiresPasswordReset: boolean;
  termsAcceptedForCurrentVersion: boolean;
};

// Espelha a expressão canônica publicada por preparar/perfis/dependentes.
const firstAccess = (state: FirstAccessState) => {
  const requiresPasswordChange = state.passwordUpdatedAt === null ||
    state.requiresPasswordReset ||
    (state.temporaryPasswordPending &&
      (state.temporaryPasswordIssuedAt === null ||
        state.passwordUpdatedAt <= state.temporaryPasswordIssuedAt));

  return {
    requiresPasswordChange,
    firstAccessPending: requiresPasswordChange ||
      !state.termsAcceptedForCurrentVersion,
  };
};

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

  assert.match(
    handler,
    /\[RESPONSAVEL_TEMPORARY_PASSWORD_ISSUE_METADATA_KEY\]: issueId,[\s\S]*?\[RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY\]: issueId/i,
  );
  assert.match(
    handler,
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

Deno.test("Aluno e Responsável rejeitam multiperfil de forma simétrica e cercam a corrida de vínculo", () => {
  const studentReserve = functionBlockFrom(
    studentMigration,
    "public.portal_reservar_emissao_senha_temporaria(",
  );
  const responsibleReserve = functionBlock(
    "public.portal_reservar_emissao_senha_temporaria_responsavel(",
  );
  const linkGuard = functionBlock(
    "public.proteger_vinculo_auth_senha_temporaria()",
  );

  for (const reserve of [studentReserve, responsibleReserve]) {
    assert.match(reserve, /pg_advisory_xact_lock/i);
    assert.match(
      reserve,
      /portal-temporary-password-auth:[\s\S]*?auth_user_id/i,
    );
    assert.match(reserve, /FROM public\.parceiros AS /i);
    assert.match(reserve, /FROM public\.usuarios_sistema AS usuario_interno/i);
    assert.match(reserve, /FROM public\.responsaveis_legais AS /i);
  }
  assert.match(
    studentReserve,
    /PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_IDENTIDADE_MULTIPERFIL/i,
  );
  assert.match(
    responsibleReserve,
    /PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_IDENTIDADE_MULTIPERFIL/i,
  );

  assert.match(linkGuard, /pg_advisory_xact_lock/i);
  assert.match(linkGuard, /pg_catalog\.to_jsonb\(OLD\)/i);
  assert.match(linkGuard, /pg_catalog\.to_jsonb\(NEW\)/i);
  assert.match(linkGuard, /FROM public\.parceiros AS aluno/i);
  assert.match(linkGuard, /FROM public\.responsaveis_legais AS responsavel/i);
  assert.match(
    linkGuard,
    /coalesce\(aluno\.senha_temporaria_pendente, false\)/i,
  );
  assert.match(
    linkGuard,
    /coalesce\(responsavel\.senha_temporaria_pendente, false\)/i,
  );
  assert.match(
    linkGuard,
    /PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA/i,
  );
  assert.match(
    linkGuard,
    /NEW\.auth_user_id IS DISTINCT FROM OLD\.auth_user_id[\s\S]*?AND v_proprio_acesso_temporario[\s\S]*?PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA/i,
  );
  assert.match(
    linkGuard,
    /v_tipo_parceiro_alterado := TG_TABLE_NAME = 'parceiros'[\s\S]*?NEW\.auth_user_id IS NOT DISTINCT FROM OLD\.auth_user_id[\s\S]*?AND NOT v_tipo_parceiro_alterado[\s\S]*?RETURN NEW/i,
  );
  assert.match(
    linkGuard,
    /pg_advisory_xact_lock[\s\S]*?IF v_tipo_parceiro_alterado AND v_proprio_acesso_temporario THEN[\s\S]*?PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA/i,
  );
  for (
    const table of ["parceiros", "usuarios_sistema", "responsaveis_legais"]
  ) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TRIGGER b15_proteger_vinculo_auth_senha_temporaria[\\s\\S]*?ON public\\.${table}[\\s\\S]*?EXECUTE FUNCTION public\\.proteger_vinculo_auth_senha_temporaria\\(\\)`,
        "i",
      ),
    );
  }

  const deleteGuard = functionBlock(
    "public.proteger_remocao_senha_temporaria_pendente()",
  );
  assert.match(deleteGuard, /pg_catalog\.to_jsonb\(OLD\)/i);
  assert.match(deleteGuard, /senha_temporaria_pendente/i);
  assert.match(deleteGuard, /senha_temporaria_emissao_id/i);
  assert.match(
    deleteGuard,
    /PORTAL_REMOCAO_BLOQUEADA_POR_SENHA_TEMPORARIA/i,
  );
  for (const table of ["parceiros", "responsaveis_legais"]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TRIGGER b16_proteger_remocao_senha_temporaria_pendente\\s+BEFORE DELETE ON public\\.${table}[\\s\\S]*?EXECUTE FUNCTION public\\.proteger_remocao_senha_temporaria_pendente\\(\\)`,
        "i",
      ),
    );
  }
});

Deno.test("ledger e RPCs de reenvio são fechados, serializados e idempotentes", () => {
  assert.match(
    migration,
    /CREATE TABLE public\.portal_responsavel_reenvios_acesso[\s\S]*?UNIQUE \(actor_auth_user_id, request_id\)/i,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX portal_responsavel_reenvios_reserva_ativa_key[\s\S]*?\(responsavel_legal_id\)[\s\S]*?WHERE estado = 'RESERVADO'/i,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.portal_responsavel_reenvios_acesso ENABLE ROW LEVEL SECURITY/i,
  );
  assert.match(
    migration,
    /CREATE POLICY portal_responsavel_reenvios_client_deny[\s\S]*?AS RESTRICTIVE FOR ALL TO anon, authenticated[\s\S]*?USING \(false\)[\s\S]*?WITH CHECK \(false\)/i,
  );

  const reserve = functionBlock(
    "public.portal_reservar_reenvio_acesso_responsavel(",
  );
  const complete = functionBlock(
    "public.portal_concluir_reenvio_acesso_responsavel(",
  );
  const cancel = functionBlock(
    "public.portal_cancelar_reenvio_acesso_responsavel(",
  );

  assert.ok(
    reserve.indexOf("responsavel_legal_acesso_preparar(") <
      reserve.indexOf("WHERE reenvio.actor_auth_user_id"),
    "A autorização deve anteceder qualquer lookup por request_id.",
  );
  assert.match(reserve, /portal-responsavel-resend:[\s\S]*?p_request_id/i);
  assert.match(
    reserve,
    /portal-responsavel-resend-target:[\s\S]*?p_responsavel_legal_id/i,
  );
  assert.match(
    reserve,
    /UPDATE public\.portal_responsavel_reenvios_acesso AS reenvio[\s\S]*?estado = 'FALHOU'[\s\S]*?falhou_em = pg_catalog\.clock_timestamp\(\)[\s\S]*?reenvio\.estado = 'RESERVADO'[\s\S]*?reenvio\.reservado_em <=[\s\S]*?pg_catalog\.clock_timestamp\(\) - interval '5 minutes'/i,
  );
  assert.ok(
    reserve.indexOf("portal-responsavel-resend-target:") <
      reserve.indexOf("UPDATE public.portal_responsavel_reenvios_acesso"),
    "A expiração ambígua deve ocorrer sob o advisory exclusivo do destinatário.",
  );
  assert.ok(
    reserve.indexOf("UPDATE public.portal_responsavel_reenvios_acesso") <
      reserve.indexOf("WHERE reenvio.actor_auth_user_id"),
    "Reservas vencidas devem virar FALHOU antes do replay por request_id.",
  );
  assert.match(reserve, /FOR UPDATE/i);
  assert.match(
    reserve,
    /responsavel_legal_id IS DISTINCT FROM[\s\S]*?PORTAL_REENVIO_RESPONSAVEL_REQUEST_REPLAY_DIVERGENTE/i,
  );
  assert.match(
    reserve,
    /estado = 'ENVIADO'[\s\S]*?'shouldSend', false[\s\S]*?'state', 'sent'/i,
  );
  assert.match(
    reserve,
    /estado = 'RESERVADO'[\s\S]*?'shouldSend', false[\s\S]*?'state', 'reserved'/i,
  );
  assert.match(
    reserve,
    /tentativas = reenvio\.tentativas \+ 1[\s\S]*?'shouldSend', true[\s\S]*?'replayed', true/i,
  );
  assert.match(complete, /estado = 'ENVIADO'[\s\S]*?RETURN true/i);
  assert.match(cancel, /estado = 'FALHOU'[\s\S]*?RETURN true/i);

  for (
    const rpc of [
      "portal_reservar_reenvio_acesso_responsavel",
      "portal_concluir_reenvio_acesso_responsavel",
      "portal_cancelar_reenvio_acesso_responsavel",
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
        `REVOKE ALL ON FUNCTION public\\.${rpc}\\(uuid, uuid, uuid\\)[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      compactSql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\(uuid, uuid, uuid\\)[\\s\\S]*?TO service_role`,
        "i",
      ),
    );
  }
});

Deno.test("assinaturas de Aluno e Responsável respeitam a barreira simétrica de primeiro acesso", () => {
  const signatureGate = functionBlock(
    "public.assinatura_eletronica_perfil_contexto_valido(",
  );
  const responsibleBranch = signatureGate.slice(
    signatureGate.indexOf("WHEN 'RESPONSAVEL_LEGAL'"),
    signatureGate.indexOf("WHEN 'ALUNO'"),
  );
  const studentBranch = signatureGate.slice(
    signatureGate.indexOf("WHEN 'ALUNO'"),
    signatureGate.indexOf("ELSE false"),
  );

  assert.match(
    responsibleBranch,
    /responsavel\.auth_user_id = p_actor_auth_user_id/i,
  );
  assert.match(responsibleBranch, /responsavel\.status = 'ATIVO'/i);
  assert.match(responsibleBranch, /senha_atualizada_em IS NOT NULL/i);
  assert.match(
    responsibleBranch,
    /NOT coalesce\(responsavel\.troca_senha_obrigatoria, false\)/i,
  );
  assert.match(responsibleBranch, /senha_temporaria_pendente/i);
  assert.match(
    responsibleBranch,
    /senha_atualizada_em <=[\s\S]*?senha_temporaria_emitida_em/i,
  );
  assert.match(responsibleBranch, /aceitou_termos_uso/i);
  assert.match(responsibleBranch, /aceitou_termos_uso_em IS NOT NULL/i);
  assert.match(
    responsibleBranch,
    /termos_uso_versao =[\s\S]*?portal_identidade_termos_versao_vigente\(\)/i,
  );

  assert.match(studentBranch, /aluno\.auth_user_id = p_actor_auth_user_id/i);
  assert.match(studentBranch, /upper\(aluno\.tipo\) = 'ALUNO'/i);
  assert.match(studentBranch, /public\.is_active_status\(aluno\.status\)/i);
  assert.match(
    studentBranch,
    /NOT coalesce\(aluno\.troca_senha_obrigatoria, false\)/i,
  );
  assert.match(studentBranch, /senha_temporaria_pendente/i);
  assert.match(
    studentBranch,
    /senha_atualizada_em <=[\s\S]*?senha_temporaria_emitida_em/i,
  );
  assert.match(studentBranch, /aceitou_termos_uso/i);
  assert.match(
    studentBranch,
    /termos_uso_versao =[\s\S]*?portal_identidade_termos_versao_vigente\(\)/i,
  );
});

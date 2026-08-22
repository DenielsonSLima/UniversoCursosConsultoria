// @ts-nocheck -- contrato SQL executado pelo Deno, fora do TypeScript do frontend.

import assert from "node:assert/strict";

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260821230000_harden_student_temporary_password_first_access.sql",
    import.meta.url,
  ),
);

const functionBlock = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  const end = source.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return source.slice(start, end + "$function$;".length);
};

Deno.test("estado persistente da senha temporária é protegido contra escrita direta", () => {
  const protection = functionBlock(
    migration,
    "public.protect_student_access_control_fields()",
  );

  for (
    const column of [
      "email_validado_gestor_em",
      "senha_temporaria_pendente",
      "senha_temporaria_emitida_em",
      "senha_atualizada_em",
      "senha_temporaria_emissao_id",
      "senha_temporaria_emissao_iniciada_em",
      "senha_temporaria_emissao_senha_alterada_em",
      "senha_temporaria_emissoes_revogadas",
    ]
  ) {
    assert.match(
      migration,
      new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, "i"),
    );
    assert.match(protection, new RegExp(`NEW\\.${column}`, "i"));
  }

  assert.match(
    migration,
    /parceiros_emissao_senha_temporaria_escrita_coerente[\s\S]*?senha_temporaria_emissao_senha_alterada_em IS NULL[\s\S]*?senha_temporaria_emissao_id IS NOT NULL[\s\S]*?senha_temporaria_emissao_iniciada_em IS NOT NULL/i,
  );
});

Deno.test("troca da identidade de e-mail invalida a validação administrativa anterior", () => {
  const clearValidation = functionBlock(
    migration,
    "public.clear_manager_email_validation_on_identity_change()",
  );

  assert.match(clearValidation, /NEW\.email_validado_gestor_em := NULL/i);
  assert.match(
    migration,
    /BEFORE UPDATE OF email, auth_login_email ON public\.parceiros/i,
  );
  assert.match(
    migration,
    /NEW\.email_validado_gestor_em IS NULL[\s\S]*?NEW\.email/i,
  );
});

Deno.test("reserva serializa a emissão com ator e escopo validados no banco", () => {
  const reserve = functionBlock(
    migration,
    "public.portal_reservar_emissao_senha_temporaria(",
  );
  const complete = functionBlock(
    migration,
    "public.portal_concluir_emissao_senha_temporaria(",
  );
  const cleanup = functionBlock(
    migration,
    "public.portal_confirmar_limpeza_emissao_senha_temporaria(",
  );

  assert.match(reserve, /p_actor_auth_user_id uuid/i);
  assert.match(reserve, /portal_identidade_exigir_service_role_actor/i);
  assert.match(reserve, /portal_identidade_actor_pode_gerir_aluno/i);
  assert.match(reserve, /FOR UPDATE/i);
  assert.match(reserve, /senha_atualizada_em = NULL/i);
  assert.match(
    reserve,
    /senha_temporaria_emissao_iniciada_em IS NOT NULL[\s\S]*?senha_temporaria_emissao_id = p_emissao_id/i,
  );
  assert.doesNotMatch(reserve, /interval '5 minutes'/i);
  assert.match(
    complete,
    /senha_atualizada_em < v_aluno\.senha_temporaria_emissao_iniciada_em/i,
  );
  assert.match(
    complete,
    /auth_user\.raw_app_meta_data ->> 'universocc_temporary_password_issue_id'/i,
  );
  assert.match(
    complete,
    /v_auth_issue_id IS DISTINCT FROM p_emissao_id::text/i,
  );
  assert.match(
    complete,
    /senha_temporaria_emissao_senha_alterada_em IS NULL/i,
  );
  assert.match(
    complete,
    /v_auth_write_nonce IS DISTINCT FROM p_emissao_id::text/i,
  );
  assert.match(complete, /INSERT INTO public\.sistema_eventos/i);
  assert.match(complete, /'Emitiu senha temporária'/i);
  assert.match(complete, /senha_temporaria_emissao_iniciada_em = NULL/i);
  assert.match(
    complete,
    /senha_temporaria_emissoes_revogadas = pg_catalog\.array_append/i,
  );
  assert.doesNotMatch(complete, /temporaryPassword|password:\s*/i);
  assert.match(cleanup, /FOR UPDATE/i);
  assert.match(
    cleanup,
    /raw_app_meta_data[\s\S]*?universocc_temporary_password_issue_id/i,
  );
  assert.match(
    cleanup,
    /universocc_temporary_password_write_nonce/i,
  );
  assert.match(
    cleanup,
    /IF NOT FOUND OR v_auth_issue_id IS NOT NULL OR v_auth_write_nonce IS NOT NULL THEN/i,
  );
  assert.match(cleanup, /senha_temporaria_emissao_id = NULL/i);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.portal_reservar_emissao_senha_temporaria\(uuid, uuid, uuid\)[\s\S]*?TO service_role/i,
  );
});

Deno.test("emissão do Aluno rejeita identidade multiperfil e serializa novos vínculos", () => {
  const reserve = functionBlock(
    migration,
    "public.portal_reservar_emissao_senha_temporaria(",
  );
  const linkGuard = functionBlock(
    migration,
    "public.proteger_vinculo_auth_senha_temporaria()",
  );

  for (const block of [reserve, linkGuard]) {
    assert.match(block, /pg_advisory_xact_lock/i);
    assert.match(
      block,
      /portal-temporary-password-auth:[\s\S]*?auth_user_id/i,
    );
  }

  assert.match(reserve, /FROM public\.parceiros AS outro_perfil/i);
  assert.match(reserve, /FROM public\.usuarios_sistema AS usuario_interno/i);
  assert.match(reserve, /FROM public\.responsaveis_legais AS responsavel/i);
  assert.match(
    reserve,
    /PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_IDENTIDADE_MULTIPERFIL/i,
  );

  assert.match(linkGuard, /FROM public\.parceiros AS aluno/i);
  assert.match(linkGuard, /senha_temporaria_pendente/i);
  assert.match(linkGuard, /pg_catalog\.to_jsonb\(OLD\)/i);
  assert.match(linkGuard, /pg_catalog\.to_jsonb\(NEW\)/i);
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
  assert.match(
    linkGuard,
    /PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA/i,
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
    migration,
    "public.proteger_remocao_senha_temporaria_pendente()",
  );
  assert.match(deleteGuard, /pg_catalog\.to_jsonb\(OLD\)/i);
  assert.match(deleteGuard, /senha_temporaria_pendente/i);
  assert.match(deleteGuard, /senha_temporaria_emissao_id/i);
  assert.match(
    deleteGuard,
    /PORTAL_REMOCAO_BLOQUEADA_POR_SENHA_TEMPORARIA/i,
  );
  assert.match(
    migration,
    /CREATE TRIGGER b16_proteger_remocao_senha_temporaria_pendente\s+BEFORE DELETE ON public\.parceiros[\s\S]*?EXECUTE FUNCTION public\.proteger_remocao_senha_temporaria_pendente\(\)/i,
  );
});

Deno.test("validação administrativa e emissão só concluem com auditoria transacional", () => {
  const validation = functionBlock(
    migration,
    "public.portal_validar_email_aluno_por_gestor(",
  );
  const complete = functionBlock(
    migration,
    "public.portal_concluir_emissao_senha_temporaria(",
  );

  assert.match(
    validation,
    /IF v_aluno\.email_validado_gestor_em IS NULL THEN/i,
  );
  assert.match(validation, /INSERT INTO public\.sistema_eventos/i);
  assert.match(validation, /'Validou e-mail para acesso assistido'/i);
  assert.match(
    complete,
    /UPDATE public\.parceiros[\s\S]*?INSERT INTO public\.sistema_eventos/i,
  );
  assert.match(complete, /'Emitiu senha temporária'/i);
});

Deno.test("trigger preserva convite por e-mail e a etapa de senha temporária", () => {
  const trigger = functionBlock(
    migration,
    "public.sync_aluno_password_reset_completion()",
  );

  assert.match(
    migration,
    /AFTER UPDATE OF encrypted_password, email_confirmed_at\s+ON auth\.users/i,
  );
  assert.doesNotMatch(trigger, /raw_app_meta_data|raw_user_meta_data/i);
  assert.match(trigger, /senha_atualizada_em/i);
  assert.match(trigger, /v_email_confirmation_changed/i);
  assert.match(
    trigger,
    /OLD\.email_confirmed_at IS DISTINCT FROM NEW\.email_confirmed_at/i,
  );
  assert.doesNotMatch(trigger, /\b(?:OLD|NEW)\.confirmed_at\b/i);
  assert.doesNotMatch(
    migration,
    /\b(?:auth_user|usuario_auth)\.confirmed_at\b/i,
  );
  assert.match(trigger, /senha_temporaria_pendente/i);
  assert.match(trigger, /senha_temporaria_emitida_em IS NULL/i);
  assert.match(
    trigger,
    /upper\(coalesce\(parceiro\.tipo, ''\)\) = 'ALUNO'/i,
  );
  assert.doesNotMatch(trigger, /parceiro\.tipo = 'Aluno'/i);
  assert.match(
    trigger,
    /v_password_updated_at <= parceiro\.senha_temporaria_emitida_em/i,
  );
  assert.match(trigger, /THEN 'pendente'[\s\S]*?ELSE 'ativo'/i);
});

Deno.test("identificador técnico do Auth serve apenas para reconciliar uma emissão pendente", async () => {
  const handler = await Deno.readTextFile(
    new URL(
      "../functions/portal-user-management/handlers/issue-student-temporary-password.ts",
      import.meta.url,
    ),
  );

  assert.match(handler, /universocc_temporary_password_issue_id/i);
  assert.match(handler, /universocc_temporary_password_write_nonce/i);
  assert.match(
    handler,
    /\[TEMPORARY_PASSWORD_ISSUE_METADATA_KEY\]: issueId,[\s\S]*?\[TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY\]: issueId/i,
  );
  assert.match(
    handler,
    /temporaryPasswordIssueIdFromAuthUser\(data\.user\) === issueId[\s\S]*?temporaryPasswordWriteNonceFromAuthUser\(data\.user\) === issueId/i,
  );
  assert.match(handler, /reconcilePendingTemporaryPasswordEmission/i);
  assert.match(handler, /markTemporaryPasswordIssueInAuth/i);
  assert.match(handler, /cleanTemporaryPasswordIssueMarker/i);
  assert.match(handler, /portal_confirmar_limpeza_emissao_senha_temporaria/i);
  assert.match(handler, /app_metadata: appMetadataForTemporaryPasswordIssue/i);
  assert.match(
    handler,
    /\[TEMPORARY_PASSWORD_ISSUE_METADATA_KEY\]: null/i,
  );
  assert.ok(
    handler.indexOf("markTemporaryPasswordIssueInAuth(") <
      handler.indexOf("password: temporaryPassword"),
  );
  const issueFlow = handler.slice(
    handler.indexOf("export const handleIssueStudentTemporaryPassword"),
  );
  const stagedAt = issueFlow.indexOf("markTemporaryPasswordIssueInAuth(");
  const passwordAt = issueFlow.indexOf("password: temporaryPassword");
  const verifiedAt = issueFlow.indexOf("verifyTemporaryPassword(");
  const completedAt = issueFlow.indexOf("completeTemporaryPasswordEmission(");
  assert.ok(stagedAt >= 0 && stagedAt < passwordAt);
  assert.ok(passwordAt < verifiedAt && verifiedAt < completedAt);
  const passwordWrite = issueFlow.slice(
    issueFlow.lastIndexOf("updateUserById(", passwordAt),
    verifiedAt,
  );
  assert.doesNotMatch(passwordWrite, /app_metadata/i);
  const trigger = functionBlock(
    migration,
    "public.sync_aluno_password_reset_completion()",
  );
  assert.doesNotMatch(trigger, /temporary_password_issue_id/i);
});

Deno.test("emissão revogada cerca chamadas Auth atrasadas sem liberar o acesso", () => {
  const cancellation = functionBlock(
    migration,
    "public.portal_cancelar_emissao_senha_temporaria(",
  );
  const fence = functionBlock(
    migration,
    "public.rejeitar_emissao_senha_temporaria_revogada()",
  );

  assert.match(cancellation, /senha_temporaria_emissoes_revogadas/i);
  assert.match(cancellation, /array_append/i);
  assert.match(cancellation, /senha_temporaria_emissao_iniciada_em = NULL/i);
  assert.match(cancellation, /senha_temporaria_emissao_iniciada_em IS NULL/i);
  assert.match(
    fence,
    /raw_app_meta_data ->> 'universocc_temporary_password_issue_id'/i,
  );
  assert.match(fence, /universocc_temporary_password_write_nonce/i);
  assert.match(fence, /senha_temporaria_emissoes_revogadas/i);
  assert.match(fence, /FOR UPDATE/i);
  assert.match(fence, /v_previous_issue_text IS NULL/i);
  assert.match(fence, /v_previous_write_nonce_text IS NULL/i);
  assert.match(fence, /OR v_marker_changed/i);
  assert.match(fence, /OR v_write_nonce_changed/i);
  assert.match(
    fence,
    /senha_temporaria_emissao_senha_alterada_em IS NOT NULL/i,
  );
  assert.match(
    fence,
    /SET senha_temporaria_emissao_senha_alterada_em\s*=\s*pg_catalog\.clock_timestamp\(\)/i,
  );
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_ESCRITA_DIVERGENTE/i);
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_PREPARACAO_DIVERGENTE/i);
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_MARCADOR_DIVERGENTE/i);
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_LIMPEZA_PENDENTE/i);
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_REVOGADA/i);
  assert.match(
    migration,
    /BEFORE UPDATE OF encrypted_password, raw_app_meta_data\s+ON auth\.users/i,
  );

  assert.ok(
    fence.indexOf("FOR UPDATE") <
      fence.indexOf("v_previous_write_nonce_text IS NULL"),
    "A linha do Aluno deve ser bloqueada antes de consumir o nonce de escrita.",
  );
});

Deno.test("RLS só reconhece aluno após nova senha e termos vigentes", () => {
  const currentAluno = functionBlock(migration, "public.current_aluno_id()");

  assert.match(currentAluno, /parceiro\.auth_user_id = auth\.uid\(\)/i);
  assert.match(
    currentAluno,
    /upper\(coalesce\(parceiro\.tipo, ''\)\) = 'ALUNO'/i,
  );
  assert.doesNotMatch(currentAluno, /parceiro\.tipo = 'Aluno'/i);
  assert.match(
    currentAluno,
    /coalesce\(parceiro\.troca_senha_obrigatoria, false\) = false/i,
  );
  assert.match(currentAluno, /senha_temporaria_pendente/i);
  assert.match(
    currentAluno,
    /senha_atualizada_em <= parceiro\.senha_temporaria_emitida_em/i,
  );
  assert.match(
    currentAluno,
    /coalesce\(parceiro\.aceitou_termos_uso, false\) = true/i,
  );
  assert.match(currentAluno, /portal_identidade_termos_versao_vigente\(\)/i);
});

Deno.test("finalização, perfil e RLS compartilham a barreira da senha temporária", () => {
  const firstAccess = functionBlock(
    migration,
    "public.portal_finalizar_primeiro_acesso(",
  );
  const profiles = functionBlock(migration, "public.portal_listar_perfis()");
  const passwordCheck = firstAccess.indexOf(
    "PORTAL_PRIMEIRO_ACESSO_SENHA_AINDA_OBRIGATORIA",
  );
  const replayReturn = firstAccess.indexOf("IF v_replay IS NOT NULL THEN");

  assert.ok(passwordCheck >= 0);
  assert.ok(replayReturn > passwordCheck);
  assert.match(firstAccess, /senha_temporaria_pendente/i);
  assert.match(firstAccess, /senha_temporaria_pendente = false/i);
  assert.match(profiles, /'requiresPasswordReset', \(/i);
  assert.match(profiles, /senha_temporaria_pendente/i);
});

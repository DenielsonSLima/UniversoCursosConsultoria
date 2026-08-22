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
      "senha_temporaria_emissoes_revogadas",
    ]
  ) {
    assert.match(
      migration,
      new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, "i"),
    );
    assert.match(protection, new RegExp(`NEW\\.${column}`, "i"));
  }
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
    /raw_app_meta_data ->> 'universocc_temporary_password_issue_id'/i,
  );
  assert.match(cleanup, /IF NOT FOUND OR v_auth_issue_id IS NOT NULL THEN/i);
  assert.match(cleanup, /senha_temporaria_emissao_id = NULL/i);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.portal_reservar_emissao_senha_temporaria\(uuid, uuid, uuid\)[\s\S]*?TO service_role/i,
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
  assert.match(trigger, /senha_temporaria_pendente/i);
  assert.match(trigger, /senha_temporaria_emitida_em IS NULL/i);
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
  assert.match(fence, /senha_temporaria_emissoes_revogadas/i);
  assert.match(fence, /FOR UPDATE/i);
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_MARCADOR_DIVERGENTE/i);
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_LIMPEZA_PENDENTE/i);
  assert.match(fence, /PORTAL_EMISSAO_SENHA_TEMPORARIA_REVOGADA/i);
  assert.match(
    migration,
    /BEFORE UPDATE OF encrypted_password, raw_app_meta_data\s+ON auth\.users/i,
  );
});

Deno.test("RLS só reconhece aluno após nova senha e termos vigentes", () => {
  const currentAluno = functionBlock(migration, "public.current_aluno_id()");

  assert.match(currentAluno, /parceiro\.auth_user_id = auth\.uid\(\)/i);
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

// @ts-nocheck -- contrato estático das migrations executado pelo Deno.

import assert from "node:assert/strict";

const readMigration = (name: string) =>
  Deno.readTextFile(new URL(`../migrations/${name}`, import.meta.url));

const [
  checkout,
  deletion,
  emailSync,
  identityActivation,
  institutionalProof,
  canonicalInitializers,
] = await Promise.all([
  readMigration("20260824113600_allow_professor_student_checkout_identity.sql"),
  readMigration("20260824113200_harden_shared_auth_identity_deletion.sql"),
  readMigration("20260824113100_sync_shared_auth_email.sql"),
  readMigration("20260824113400_allow_partner_auth_identity_per_profile.sql"),
  readMigration(
    "20260824113250_include_responsavel_in_institutional_password_proof.sql",
  ),
  readMigration(
    "20260824113270_use_canonical_shared_credential_initializers.sql",
  ),
]);

const functionBlock = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  const end = source.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return source.slice(start, end);
};

Deno.test("rollout instala guardas antes de ativar o compartilhamento", () => {
  const rollout = [
    "20260824113000_lock_auth_identity_before_profile_link.sql",
    "20260824113100_sync_shared_auth_email.sql",
    "20260824113200_harden_shared_auth_identity_deletion.sql",
    "20260824113250_include_responsavel_in_institutional_password_proof.sql",
    "20260824113255_scope_real_password_change_promotion.sql",
    "20260824113256_fail_fast_student_temporary_password_reservation.sql",
    "20260824113257_fail_fast_responsavel_temporary_password_reservation.sql",
    "20260824113260_lock_shared_credential_promotion.sql",
    "20260824113270_use_canonical_shared_credential_initializers.sql",
    "20260824113300_harden_responsavel_multi_profile_link.sql",
    "20260824113400_allow_partner_auth_identity_per_profile.sql",
    "20260824113410_complete_public_signup_credential_proof.sql",
    "20260824113600_allow_professor_student_checkout_identity.sql",
    "20260824113700_sign_partner_invite_operations.sql",
  ];

  assert.deepEqual(rollout, [...rollout].sort());
  const activation = rollout.findIndex((name) =>
    name.includes("allow_partner_auth_identity")
  );
  const publicSignupBackfill = rollout.findIndex((name) =>
    name.includes("complete_public_signup_credential_proof")
  );
  assert.ok(
    activation >
      rollout.findIndex((name) => name.includes("harden_responsavel")),
  );
  assert.ok(
    activation >
      rollout.findIndex((name) => name.includes("institutional_password")),
  );
  assert.ok(
    activation >
      rollout.findIndex((name) => name.includes("shared_credential_promotion")),
  );
  assert.ok(
    activation < rollout.findIndex((name) => name.includes("student_checkout")),
  );
  assert.ok(publicSignupBackfill > activation);
  assert.ok(
    publicSignupBackfill <
      rollout.findIndex((name) => name.includes("student_checkout")),
  );
});

Deno.test("preflight bloqueia escritas até instalar índice e constraints", () => {
  const lock = identityActivation.indexOf("LOCK TABLE");
  const preflight = identityActivation.indexOf("DO $preflight$");
  const commit = identityActivation.lastIndexOf("COMMIT;");

  assert.ok(lock >= 0 && lock < preflight && preflight < commit);
  assert.match(
    identityActivation,
    /LOCK TABLE[\s\S]*?public\.usuarios_sistema,[\s\S]*?public\.parceiros,[\s\S]*?public\.responsaveis_legais[\s\S]*?IN SHARE ROW EXCLUSIVE MODE/i,
  );
});

Deno.test("checkout adquire advisories antes de qualquer row lock", () => {
  const source = checkout.indexOf("FROM public.parceiros AS parceiro");
  const sourceRowLock = checkout.indexOf("FOR UPDATE", source);
  const target = checkout.indexOf("FROM public.parceiros AS aluno\n");
  const targetRowLock = checkout.indexOf("FOR UPDATE", target);
  const temporaryLock = checkout.indexOf(
    "'portal-temporary-password-auth:'",
  );
  const identityLock = checkout.indexOf(
    "'portal-auth-identity:'",
    temporaryLock,
  );

  assert.ok(source >= 0 && sourceRowLock > source);
  assert.ok(target > sourceRowLock && targetRowLock > target);
  assert.ok(temporaryLock < identityLock && identityLock < sourceRowLock);
});

Deno.test("e-mail Auth não pode virar NULL quando há perfil vinculado", () => {
  assert.match(
    emailSync,
    /IF NEW\.email IS NULL THEN[\s\S]*?pg_try_advisory_xact_lock[\s\S]*?'portal-auth-identity:' \|\| NEW\.id::text[\s\S]*?FROM public\.usuarios_sistema[\s\S]*?FROM public\.parceiros[\s\S]*?FROM public\.responsaveis_legais[\s\S]*?PORTAL_IDENTIDADE_AUTH_EMAIL_OBRIGATORIO/i,
  );
  assert.match(emailSync, /auth_login_email = lower\(NEW\.email\)/i);
  assert.match(
    emailSync,
    /UPDATE public\.responsaveis_legais[\s\S]*?email = lower\(NEW\.email\)/i,
  );
});

Deno.test("Aluno compartilhado só herda acesso de credencial canônica concluída", () => {
  const proof = functionBlock(
    institutionalProof,
    "public.portal_identidade_credencial_compartilhada_liberada(",
  );

  assert.match(
    proof,
    /portal_identidade_institucional_acesso_liberado\([\s\S]*?'GESTOR'[\s\S]*?portal_identidade_institucional_acesso_liberado\([\s\S]*?'PROFESSOR'/i,
  );
  assert.match(proof, /aluno\.id is distinct from p_exclude_partner_id/i);
  assert.match(
    proof,
    /responsavel\.id is distinct from p_exclude_responsavel_id/i,
  );
  assert.match(
    proof,
    /not exists \([\s\S]*?gestor_pendente[\s\S]*?not exists \([\s\S]*?parceiro_pendente[\s\S]*?not exists \([\s\S]*?responsavel_pendente/i,
  );
  assert.match(
    institutionalProof,
    /revoke all on function[\s\S]*?portal_identidade_credencial_compartilhada_liberada\(uuid, uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant execute on function[\s\S]*?to service_role/i,
  );
});

Deno.test("novo Responsável não confunde hash pendente com senha concluída", () => {
  const initializer = functionBlock(
    canonicalInitializers,
    "public.inicializar_acesso_responsavel_ao_vincular_auth()",
  );

  assert.doesNotMatch(initializer, /encrypted_password/i);
  assert.match(initializer, /new\.troca_senha_obrigatoria := true/i);
  assert.match(initializer, /new\.senha_atualizada_em := null/i);
  assert.match(
    initializer,
    /portal_identidade_credencial_compartilhada_liberada\([\s\S]*?new\.auth_user_id,[\s\S]*?null,[\s\S]*?new\.id/i,
  );
  assert.match(
    initializer,
    /if v_credencial_liberada then[\s\S]*?new\.troca_senha_obrigatoria := false[\s\S]*?new\.senha_atualizada_em := v_credencial_propagada_em/i,
  );
  assert.doesNotMatch(initializer, /usuario_auth\.(updated_at|created_at)/i);
});

Deno.test("cleanup de Parceiro usa o e-mail atual do Auth nos fallbacks", () => {
  const cleanup = functionBlock(
    deletion,
    "public.delete_partner_auth_user_on_partner_delete()",
  );
  const identityLock = cleanup.indexOf("pg_try_advisory_xact_lock");
  const authLookup = cleanup.indexOf("INTO v_auth_email", identityLock);
  const partnerCheck = cleanup.indexOf("FROM public.parceiros AS parceiro");

  assert.ok(identityLock >= 0 && authLookup > identityLock);
  assert.ok(authLookup < partnerCheck);
  assert.match(
    cleanup,
    /where auth_user\.id = v_auth_user_id;[\s\S]*?if not found then[\s\S]*?return old/i,
  );
  assert.doesNotMatch(cleanup.slice(partnerCheck), /= v_login_email/i);
  assert.equal(
    (cleanup.slice(partnerCheck).match(/= v_auth_email/gi) || []).length,
    3,
  );
});

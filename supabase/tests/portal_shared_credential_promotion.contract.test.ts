// @ts-nocheck -- contrato estatico das migrations executado pelo Deno.

import assert from "node:assert/strict";

const readMigration = (name: string) =>
  Deno.readTextFile(new URL(`../migrations/${name}`, import.meta.url));

const [
  proof,
  passwordSync,
  publicSignup,
  guardMigration,
  initializers,
  studentReservation,
  responsibleReservation,
  responsibleLink,
  checkout,
] = await Promise.all([
  readMigration(
    "20260824113250_include_responsavel_in_institutional_password_proof.sql",
  ),
  readMigration("20260824113255_scope_real_password_change_promotion.sql"),
  readMigration(
    "20260824113410_complete_public_signup_credential_proof.sql",
  ),
  readMigration("20260824113260_lock_shared_credential_promotion.sql"),
  readMigration(
    "20260824113270_use_canonical_shared_credential_initializers.sql",
  ),
  readMigration(
    "20260824113256_fail_fast_student_temporary_password_reservation.sql",
  ),
  readMigration(
    "20260824113257_fail_fast_responsavel_temporary_password_reservation.sql",
  ),
  readMigration("20260824113300_harden_responsavel_multi_profile_link.sql"),
  readMigration("20260824113600_allow_professor_student_checkout_identity.sql"),
]);

const functionBlock = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  const taggedEnd = source.indexOf("$function$;", start);
  const plainEnd = source.indexOf("$$;", start);
  const end = [taggedEnd, plainEnd]
    .filter((candidate) => candidate > start)
    .sort((left, right) => left - right)[0] ?? -1;
  assert.ok(start >= 0 && end > start, `Funcao ${signature} ausente.`);
  return source.slice(start, end);
};

Deno.test("prova compartilhada usa snapshot novo e exige senha concluida", () => {
  const readiness = functionBlock(
    proof,
    "public.portal_identidade_credencial_compartilhada_liberada(",
  );

  assert.match(readiness, /language sql[\s\S]*?volatile/i);
  assert.doesNotMatch(readiness, /language sql[\s\S]*?stable/i);
  assert.match(
    readiness,
    /upper\(btrim\(coalesce\(aluno\.tipo[\s\S]*?aluno\.senha_atualizada_em is not null[\s\S]*?not coalesce\(aluno\.troca_senha_obrigatoria/i,
  );
  assert.match(
    readiness,
    /parceiro_pendente\.senha_atualizada_em is null[\s\S]*?parceiro_pendente\.acesso_status[\s\S]*?parceiro_pendente\.troca_senha_obrigatoria/i,
  );
});

Deno.test("serializacao falha sem espera e nunca tenta row lock cruzado", () => {
  const serializer = functionBlock(
    guardMigration,
    "public.portal_identidade_serializar_credencial_compartilhada()",
  );

  assert.doesNotMatch(serializer, /for update/i);
  assert.equal(
    (serializer.match(/pg_try_advisory_xact_lock/gi) || []).length,
    2,
  );
  assert.doesNotMatch(
    serializer,
    /perform\s+pg_catalog\.pg_advisory_xact_lock/i,
  );
  assert.match(
    serializer,
    /errcode = '40001'[\s\S]*?PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA/i,
  );
  assert.match(
    serializer,
    /v_old_auth_user_id::text < v_new_auth_user_id::text[\s\S]*?v_primeiro := v_old_auth_user_id[\s\S]*?v_segundo := v_new_auth_user_id/i,
  );
  assert.match(
    serializer,
    /'portal-temporary-password-auth:' \|\| v_primeiro::text[\s\S]*?'portal-temporary-password-auth:' \|\| v_segundo::text/i,
  );

  for (
    const table of ["parceiros", "usuarios_sistema", "responsaveis_legais"]
  ) {
    assert.match(
      guardMigration,
      new RegExp(
        `create trigger a04_serializar_credencial_compartilhada[\\s\\S]*?before insert or delete or update of[\\s\\S]*?on public\\.${table}[\\s\\S]*?portal_identidade_serializar_credencial_compartilhada`,
        "i",
      ),
    );
  }
});

Deno.test("somente conclusao canonica dispensa a revalidacao aninhada", () => {
  const sync = functionBlock(
    passwordSync,
    "public.sync_aluno_password_reset_completion()",
  );
  const guard = functionBlock(
    guardMigration,
    "public.portal_identidade_guardar_promocao_credencial()",
  );

  assert.match(
    sync,
    /old\.encrypted_password is distinct from new\.encrypted_password/i,
  );
  assert.match(
    sync,
    /if v_credential_completed then[\s\S]*?current_setting\([\s\S]*?'app\.portal_credential_completion_auth_user_id'[\s\S]*?set_config\([\s\S]*?new\.id::text/i,
  );
  assert.match(
    sync,
    /if v_password_marker_installed then[\s\S]*?set_config\([\s\S]*?v_previous_password_marker[\s\S]*?return new/i,
  );
  assert.match(
    sync,
    /exception when others then[\s\S]*?set_config\([\s\S]*?v_previous_password_marker[\s\S]*?raise/i,
  );

  assert.match(
    guard,
    /pg_catalog\.pg_trigger_depth\(\) > 1[\s\S]*?current_setting\([\s\S]*?'app\.portal_credential_completion_auth_user_id'[\s\S]*?= new\.auth_user_id::text/i,
  );
  assert.doesNotMatch(guard, /pg_trigger_depth\(\) = 1/i);
  assert.match(
    guard,
    /portal_identidade_credencial_compartilhada_liberada[\s\S]*?PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_ALTERADA/i,
  );
  assert.match(
    guard,
    /new\.senha_atualizada_em is null[\s\S]*?senha_temporaria_emissao_id is not null[\s\S]*?PORTAL_ALUNO_CREDENCIAL_LOCAL_INCOMPLETA/i,
  );
});

Deno.test("confirmacao publica rejeita convite e qualquer fence temporaria", () => {
  const sync = functionBlock(
    passwordSync,
    "public.sync_aluno_password_reset_completion()",
  );
  const metadataLink = functionBlock(
    publicSignup,
    "public.link_public_aluno_auth_partner_after_profile_sync()",
  );

  assert.match(
    sync,
    /not v_credential_completed and parceiro\.senha_atualizada_em is null/i,
  );
  assert.match(
    sync,
    /not v_credential_completed[\s\S]*?responsavel\.senha_atualizada_em is null/i,
  );
  assert.match(
    sync,
    /new\.invited_at is null[\s\S]*?cadastro_publico_ead[\s\S]*?aluno_publico\.auth_user_id = new\.id/i,
  );
  assert.match(
    sync,
    /v_persisted_password_ready[\s\S]*?portal_identidade_institucional_senha_eventos[\s\S]*?evento\.senha_alterada_em >= new\.invited_at/i,
  );
  assert.doesNotMatch(
    sync,
    /usuario_auth\.(updated_at|created_at)|new\.(updated_at|created_at)/i,
  );
  assert.match(
    sync,
    /universocc_temporary_password_issue_id[\s\S]*?universocc_responsavel_temporary_password_issue_id/i,
  );
  assert.match(
    sync,
    /aluno_publico\.senha_temporaria_pendente[\s\S]*?aluno_publico\.senha_temporaria_emissao_id is null[\s\S]*?aluno_publico\.senha_temporaria_emissao_iniciada_em is null/i,
  );
  assert.match(
    sync,
    /v_confirmation_credential_ready := \([\s\S]*?v_public_signup_password_ready[\s\S]*?or v_persisted_password_ready[\s\S]*?\) and not v_profile_temporary_fenced/i,
  );
  assert.match(
    sync,
    /if v_confirmation_credential_ready then[\s\S]*?portal_identidade_institucional_senha_eventos[\s\S]*?update public\.usuarios_sistema[\s\S]*?update public\.parceiros as professor[\s\S]*?portal_identidade_credencial_compartilhada_liberada[\s\S]*?PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_ALTERADA/i,
  );
  assert.match(
    metadataLink,
    /new\.invited_at is null[\s\S]*?new\.encrypted_password[\s\S]*?new\.email_confirmed_at is not null[\s\S]*?universocc_temporary_password_issue_id/i,
  );
  assert.match(
    metadataLink,
    /senha_atualizada_em = case[\s\S]*?when v_auth_ready then coalesce/i,
  );
  assert.match(
    publicSignup,
    /portal_public_signup_credential_backfill[\s\S]*?usuario\.email_confirmed_at as credential_completed_at[\s\S]*?usuario\.invited_at is null[\s\S]*?senha_temporaria_emissao_id is null[\s\S]*?responsavel_fenced/i,
  );
  assert.match(
    publicSignup,
    /update public\.usuarios_sistema[\s\S]*?update public\.parceiros as professor[\s\S]*?update public\.responsaveis_legais[\s\S]*?portal_identidade_credencial_compartilhada_liberada[\s\S]*?PORTAL_PUBLIC_SIGNUP_CREDENTIAL_BACKFILL_INCONSISTENTE/i,
  );
  assert.match(
    publicSignup,
    /order by candidato\.auth_user_id[\s\S]*?pg_advisory_xact_lock[\s\S]*?portal-temporary-password-auth:[\s\S]*?pg_advisory_xact_lock[\s\S]*?portal-auth-identity:/i,
  );
  assert.match(
    publicSignup,
    /select usuario\.email_confirmed_at[\s\S]*?not exists \([\s\S]*?perfil_fenced[\s\S]*?not exists \([\s\S]*?responsavel_fenced/i,
  );
  assert.match(
    publicSignup,
    /portal_credential_completion_auth_user_id[\s\S]*?exception when others then[\s\S]*?v_previous_marker[\s\S]*?raise/i,
  );
  assert.doesNotMatch(
    publicSignup,
    /usuario\.(updated_at|created_at)|new\.(updated_at|created_at)/i,
  );
});

Deno.test("revalidacoes rodam depois dos initializers em todos os papeis", () => {
  const institutional = functionBlock(
    guardMigration,
    "public.portal_identidade_revalidar_promocao_institucional()",
  );
  const responsible = functionBlock(
    guardMigration,
    "public.portal_identidade_revalidar_promocao_responsavel()",
  );

  assert.match(
    institutional,
    /not v_credencial_liberada[\s\S]*?primeiro_acesso_institucional_pendente := true[\s\S]*?acesso_institucional_origem := 'CONVITE'/i,
  );
  assert.match(
    responsible,
    /not v_credencial_liberada[\s\S]*?troca_senha_obrigatoria := true[\s\S]*?senha_atualizada_em := null/i,
  );
  assert.match(
    responsible,
    /status is distinct from 'ATIVO'[\s\S]*?senha_atualizada_em is null[\s\S]*?troca_senha_obrigatoria[\s\S]*?senha_temporaria_pendente[\s\S]*?senha_temporaria_emitida_em/i,
  );
  assert.match(
    responsible,
    /pg_trigger_depth\(\) > 1[\s\S]*?portal_credential_completion_auth_user_id[\s\S]*?new\.auth_user_id::text/i,
  );
  assert.match(
    guardMigration,
    /create trigger zz30_revalidar_promocao_responsavel[\s\S]*?before insert or update of\s+auth_user_id, status, troca_senha_obrigatoria, senha_temporaria_pendente,\s+senha_temporaria_emitida_em, senha_atualizada_em/i,
  );
  assert.ok(
    "a04_serializar_credencial_compartilhada" <
      "a05_inicializar_acesso_responsavel_ao_vincular_auth",
  );
  assert.ok(
    "zz10_inicializar_primeiro_acesso_institucional" <
      "zz20_revalidar_promocao_institucional",
  );
  assert.ok(
    "zz20_revalidar_promocao_institucional" <
      "zz30_guardar_promocao_credencial_compartilhada",
  );
  assert.match(initializers, /inicializar_primeiro_acesso_institucional/i);
  assert.match(
    initializers,
    /inicializar_acesso_responsavel_ao_vincular_auth/i,
  );
  assert.doesNotMatch(proof, /inicializar_.*acesso/i);
});

Deno.test("RPCs novas usam try-lock depois da linha e antes da identidade", () => {
  const responsibleRow = responsibleLink.indexOf("FOR UPDATE");
  const responsibleTemporary = responsibleLink.indexOf(
    "'portal-temporary-password-auth:'",
    responsibleRow,
  );
  const responsibleIdentity = responsibleLink.indexOf(
    "'portal-auth-identity:'",
    responsibleTemporary,
  );
  const responsibleUpdate = responsibleLink.indexOf(
    "UPDATE public.responsaveis_legais",
    responsibleIdentity,
  );
  assert.ok(
    responsibleRow < responsibleTemporary &&
      responsibleTemporary < responsibleIdentity &&
      responsibleIdentity < responsibleUpdate,
  );
  assert.match(
    responsibleLink.slice(responsibleRow, responsibleIdentity),
    /pg_try_advisory_xact_lock[\s\S]*?errcode = '40001'[\s\S]*?pg_try_advisory_xact_lock/i,
  );

  const firstRow = checkout.indexOf("FOR UPDATE");
  const temporary = checkout.indexOf("'portal-temporary-password-auth:'");
  const identity = checkout.indexOf("'portal-auth-identity:'", temporary);
  const update = checkout.indexOf("UPDATE public.parceiros AS aluno", identity);
  assert.ok(temporary < identity && identity < firstRow && firstRow < update);
  assert.equal(
    (checkout.match(/pg_try_advisory_xact_lock/gi) || []).length,
    2,
  );
  assert.equal(
    (checkout.match(/errcode = '40001'/gi) || []).length,
    2,
  );
  assert.match(
    checkout,
    /update public\.parceiros as aluno[\s\S]*?senha_atualizada_em = coalesce\([\s\S]*?statement_timestamp\(\)/i,
  );
  assert.match(
    checkout,
    /insert into public\.parceiros \([\s\S]*?senha_atualizada_em,[\s\S]*?\) values \([\s\S]*?statement_timestamp\(\),[\s\S]*?false,[\s\S]*?'ativo'/i,
  );
});

Deno.test("reservas aplicadas ganham try-lock por migrations incrementais", () => {
  for (
    const [migration, signature] of [
      [
        studentReservation,
        "public.portal_reservar_emissao_senha_temporaria(",
      ],
      [
        responsibleReservation,
        "public.portal_reservar_emissao_senha_temporaria_responsavel(",
      ],
    ]
  ) {
    const reservation = functionBlock(migration, signature);
    const rowLock = reservation.indexOf("FOR UPDATE");
    const tryLock = reservation.indexOf("pg_try_advisory_xact_lock");

    assert.ok(rowLock >= 0 && tryLock > rowLock);
    assert.doesNotMatch(
      reservation,
      /perform\s+pg_catalog\.pg_advisory_xact_lock/i,
    );
    assert.match(
      reservation,
      /pg_try_advisory_xact_lock[\s\S]*?errcode = '40001'[\s\S]*?PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA/i,
    );
    assert.match(
      migration,
      /revoke all on function[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant execute on function[\s\S]*?to service_role/i,
    );
  }
});

Deno.test("Responsavel registra o instante local da propagacao da prova", () => {
  const initializer = functionBlock(
    initializers,
    "public.inicializar_acesso_responsavel_ao_vincular_auth()",
  );

  assert.match(
    initializer,
    /v_credencial_propagada_em timestamptz :=[\s\S]*?statement_timestamp\(\)/i,
  );
  assert.match(
    initializer,
    /new\.senha_atualizada_em := v_credencial_propagada_em/i,
  );
  assert.doesNotMatch(
    initializer,
    /usuario_auth\.(updated_at|created_at)/i,
  );
});

Deno.test("guardas permanecem privadas e abaixo do teto", () => {
  for (
    const migration of [
      proof,
      passwordSync,
      publicSignup,
      guardMigration,
      initializers,
      studentReservation,
      responsibleReservation,
    ]
  ) {
    assert.ok(migration.split(/\r?\n/).length <= 500);
  }
  assert.match(
    guardMigration,
    /revoke all on function[\s\S]*?portal_identidade_serializar_credencial_compartilhada\(\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    guardMigration,
    /revoke all on function public\.portal_identidade_guardar_promocao_credencial\(\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
});

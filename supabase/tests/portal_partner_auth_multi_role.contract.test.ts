// @ts-nocheck -- contrato estatico das migrations executado pelo Deno.
import assert from "node:assert/strict";

const identityMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113400_allow_partner_auth_identity_per_profile.sql",
    import.meta.url,
  ),
);
const identityLockMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113000_lock_auth_identity_before_profile_link.sql",
    import.meta.url,
  ),
);
const emailSyncMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113100_sync_shared_auth_email.sql",
    import.meta.url,
  ),
);
const deletionMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113200_harden_shared_auth_identity_deletion.sql",
    import.meta.url,
  ),
);
const institutionalProofMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113250_include_responsavel_in_institutional_password_proof.sql",
    import.meta.url,
  ),
);
const canonicalInitializersMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113270_use_canonical_shared_credential_initializers.sql",
    import.meta.url,
  ),
);
const responsibleLinkMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113300_harden_responsavel_multi_profile_link.sql",
    import.meta.url,
  ),
);
const responsibleFirstAccessMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260821234000_complete_responsavel_first_access.sql",
    import.meta.url,
  ),
);
const originalMultiProfileMigration = await Deno.readTextFile(
  new URL(
    "../migrations/20260819203143_create_portal_multi_profile_identities.sql",
    import.meta.url,
  ),
);

const functionBlock = (sql: string, signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Funcao ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("migrations manuais respeitam o teto de 500 linhas", () => {
  for (
    const migration of [
      identityLockMigration,
      emailSyncMigration,
      deletionMigration,
      institutionalProofMigration,
      canonicalInitializersMigration,
      responsibleLinkMigration,
      identityMigration,
    ]
  ) {
    assert.ok(migration.split(/\r?\n/).length <= 500);
  }
});

Deno.test("vinculos diretos travam UID antigo e novo antes da escrita", () => {
  const locker = functionBlock(
    identityLockMigration,
    "public.portal_identidade_lock_antes_vinculo_auth()",
  );

  assert.match(locker, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(
    locker,
    /v_old_auth_user_id::text < v_new_auth_user_id::text[\s\S]*?v_primeiro := v_old_auth_user_id[\s\S]*?v_segundo := v_new_auth_user_id[\s\S]*?else[\s\S]*?v_primeiro := v_new_auth_user_id[\s\S]*?v_segundo := v_old_auth_user_id/i,
  );
  assert.match(
    locker,
    /'portal-auth-identity:' \|\| v_primeiro::text[\s\S]*?'portal-auth-identity:' \|\| v_segundo::text/i,
  );

  for (
    const [table, columns] of [
      ["parceiros", "auth_user_id, tipo, cpf_cnpj, email, auth_login_email"],
      ["usuarios_sistema", "auth_user_id, cpf, email"],
      ["responsaveis_legais", "auth_user_id, cpf_normalizado, email"],
    ]
  ) {
    assert.match(
      identityLockMigration,
      new RegExp(
        `create trigger z80_portal_auth_identity_lock[\\s\\S]*?before insert or update of\\s+${
          columns.replaceAll(", ", ",\\s+")
        }[\\s\\S]*?on public\\.${table}[\\s\\S]*?portal_identidade_lock_antes_vinculo_auth`,
        "i",
      ),
    );
  }
});

Deno.test("primeira migration serializa exclusao no mesmo commit dos vinculos", () => {
  const deleteLocker = functionBlock(
    identityLockMigration,
    "public.portal_identidade_lock_antes_exclusao_auth()",
  );

  assert.match(
    deleteLocker,
    /pg_try_advisory_xact_lock[\s\S]*?'portal-auth-identity:'[\s\S]*?errcode = '40001'/i,
  );
  for (
    const table of ["parceiros", "usuarios_sistema", "responsaveis_legais"]
  ) {
    assert.match(
      identityLockMigration,
      new RegExp(
        `create trigger a00_portal_auth_identity_delete_lock[\\s\\S]*?before delete on public\\.${table}`,
        "i",
      ),
    );
  }
});

Deno.test("unicidade passa de UID global para UID e tipo normalizado", () => {
  assert.match(
    identityMigration,
    /lock table\s+public\.usuarios_sistema,\s+public\.parceiros,\s+public\.responsaveis_legais\s+in share row exclusive mode/i,
  );
  assert.match(
    identityMigration,
    /group by parceiro\.auth_user_id, upper\(parceiro\.tipo\)[\s\S]*?having count\(\*\) > 1/i,
  );
  assert.match(
    identityMigration,
    /drop index if exists public\.uq_parceiros_auth_user_id/i,
  );
  assert.match(
    identityMigration,
    /create unique index uq_parceiros_auth_user_id_tipo[\s\S]*?on public\.parceiros \(auth_user_id, upper\(tipo\)\)[\s\S]*?where auth_user_id is not null/i,
  );
  assert.doesNotMatch(
    identityMigration,
    /create unique index uq_parceiros_auth_user_id\s/i,
  );
});

Deno.test("compartilhamento em parceiros aceita somente Aluno mais Professor", () => {
  assert.match(
    identityMigration,
    /group by parceiro\.auth_user_id[\s\S]*?having count\(\*\) > 1[\s\S]*?filter \(where upper\(btrim\(coalesce\(parceiro\.tipo, ''\)\)\) = 'ALUNO'\) <> 1[\s\S]*?filter \(where upper\(btrim\(coalesce\(parceiro\.tipo, ''\)\)\) = 'PROFESSOR'\) <> 1[\s\S]*?count\(\*\) <> 2/i,
  );
  assert.match(
    identityMigration,
    /bool_or\([\s\S]*?tipo_parceiro is not null[\s\S]*?tipo_parceiro not in \('ALUNO', 'PROFESSOR'\)/i,
  );

  const validator = functionBlock(
    identityMigration,
    "public.portal_identidade_validar_consistencia_auth_compartilhado()",
  );
  assert.match(
    validator,
    /v_tem_outro_perfil and exists \([\s\S]*?from public\.parceiros[\s\S]*?not in \('ALUNO', 'PROFESSOR'\)/i,
  );
  assert.match(validator, /PARCEIRO_AUTH_UID_PAPEIS_NAO_SUPORTADOS/i);
});

Deno.test("identidade compartilhada exige CPF e e-mail canonicos no banco", () => {
  const validator = functionBlock(
    identityMigration,
    "public.portal_identidade_validar_consistencia_auth_compartilhado()",
  );

  assert.match(
    identityMigration,
    /with identidades as \([\s\S]*?from public\.parceiros[\s\S]*?union all[\s\S]*?from public\.usuarios_sistema[\s\S]*?union all[\s\S]*?from public\.responsaveis_legais/i,
  );
  assert.match(identityMigration, /count\(distinct identidade\.cpf\) <> 1/i);
  assert.match(identityMigration, /count\(distinct identidade\.email\) <> 1/i);
  assert.match(identityMigration, /public\.is_valid_cpf\(identidade\.cpf\)/i);
  assert.match(
    identityMigration,
    /min\(identidade\.email\) is distinct from[\s\S]*?auth_user\.email/i,
  );

  assert.match(validator, /pg_try_advisory_xact_lock/i);
  assert.match(validator, /'portal-auth-identity:' \|\| v_auth_user_id::text/i);
  assert.match(validator, /from public\.parceiros as parceiro/i);
  assert.match(validator, /from public\.usuarios_sistema as gestor/i);
  assert.match(validator, /from public\.responsaveis_legais as responsavel/i);
  assert.match(validator, /from auth\.users as auth_user/i);
  assert.match(validator, /public\.is_valid_cpf\(v_cpf\)/i);
  assert.match(validator, /v_auth_email is distinct from v_email/i);
  assert.match(validator, /PORTAL_IDENTIDADE_MULTIPERFIL_DIVERGENTE/i);
  assert.match(validator, /if not v_tem_outro_perfil then[\s\S]*?return new/i);
});

Deno.test("validacao e adiada nas tres tabelas e serializada por UID", () => {
  for (
    const table of [
      "parceiros",
      "usuarios_sistema",
      "responsaveis_legais",
    ]
  ) {
    const escapedTable = table.replace("_", "_");
    assert.match(
      identityMigration,
      new RegExp(
        `create constraint trigger z90_portal_auth_consistencia_insert[\\s\\S]*?after insert on public\\.${escapedTable}[\\s\\S]*?deferrable initially deferred`,
        "i",
      ),
    );
    assert.match(
      identityMigration,
      new RegExp(
        `create constraint trigger z90_portal_auth_consistencia_update[\\s\\S]*?on public\\.${escapedTable}[\\s\\S]*?deferrable initially deferred`,
        "i",
      ),
    );
  }

  assert.match(
    identityMigration,
    /revoke all on function[\s\S]*?portal_identidade_validar_consistencia_auth_compartilhado\(\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
});

Deno.test("sincronizacao de e-mail cobre Gestor, Parceiro e Responsavel", () => {
  const sync = functionBlock(
    emailSyncMigration,
    "public.sync_gestor_email_from_auth()",
  );

  assert.match(sync, /update public\.usuarios_sistema/i);
  assert.match(sync, /update public\.parceiros/i);
  assert.match(sync, /update public\.responsaveis_legais/i);
  assert.match(sync, /where auth_user_id = NEW\.id/i);
  assert.match(sync, /app\.syncing_auth_email/i);
  assert.match(
    sync,
    /v_previous_sync_marker[\s\S]*?set_config\('app\.syncing_auth_email', 'true'[\s\S]*?set_config\([\s\S]*?v_previous_sync_marker[\s\S]*?exception when others then[\s\S]*?v_previous_sync_marker[\s\S]*?raise/i,
  );
  assert.match(
    sync,
    /if NEW\.email is null then[\s\S]*?pg_try_advisory_xact_lock[\s\S]*?'portal-auth-identity:' \|\| NEW\.id::text[\s\S]*?if exists \([\s\S]*?from public\.usuarios_sistema/i,
  );
  assert.match(sync, /PORTAL_IDENTIDADE_AUTH_EMAIL_OBRIGATORIO/i);
});

Deno.test("delete preserva Auth enquanto qualquer outro papel usa o UID", () => {
  assert.doesNotMatch(
    identityMigration,
    /delete_partner_auth_user_on_partner_delete/i,
  );
  const deletion = functionBlock(
    deletionMigration,
    "public.delete_partner_auth_user_on_partner_delete()",
  );
  const partnerCheck = deletion.indexOf("FROM public.parceiros AS parceiro");
  const gestorCheck = deletion.indexOf(
    "FROM public.usuarios_sistema AS gestor",
  );
  const responsibleCheck = deletion.indexOf(
    "FROM public.responsaveis_legais AS responsavel",
  );
  const identityLock = deletion.indexOf("pg_try_advisory_xact_lock");
  const authDelete = deletion.indexOf("DELETE FROM auth.users AS auth_user");

  assert.ok(identityLock >= 0 && identityLock < partnerCheck);
  assert.ok(partnerCheck >= 0 && partnerCheck < authDelete);
  assert.ok(gestorCheck >= 0 && gestorCheck < authDelete);
  assert.ok(responsibleCheck >= 0 && responsibleCheck < authDelete);
  assert.match(
    deletion,
    /'portal-auth-identity:' \|\| v_auth_user_id::text/i,
  );
  assert.match(
    deletion,
    /responsavel\.auth_user_id = v_auth_user_id/i,
  );
  assert.match(
    deletionMigration,
    /create trigger trg_delete_partner_auth_user_on_partner_delete[\s\S]*?after delete on public\.parceiros/i,
  );
});

Deno.test("delete de Gestor valida BEFORE e limpa Auth somente AFTER", () => {
  const guard = functionBlock(
    deletionMigration,
    "public.proteger_exclusao_usuario_sistema()",
  );
  const cleanup = functionBlock(
    deletionMigration,
    "public.delete_gestor_auth_user_on_usuario_sistema_delete()",
  );
  const lock = cleanup.indexOf("pg_try_advisory_xact_lock");
  const managerCheck = cleanup.indexOf(
    "FROM public.usuarios_sistema AS outro_gestor",
  );
  const partnerCheck = cleanup.indexOf("FROM public.parceiros AS parceiro");
  const responsibleCheck = cleanup.indexOf(
    "FROM public.responsaveis_legais AS responsavel",
  );
  const authDelete = cleanup.indexOf("DELETE FROM auth.users AS identidade");

  assert.match(guard, /v_old_email = v_actor_email/i);
  assert.match(guard, /usuario_sistema_tem_atividade\(OLD\.id\)/i);
  assert.doesNotMatch(guard, /delete from auth\.users|pg_advisory_xact_lock/i);
  assert.match(
    deletionMigration,
    /create trigger trg_proteger_exclusao_usuario_sistema[\s\S]*?before delete on public\.usuarios_sistema/i,
  );
  assert.ok(lock >= 0 && lock < managerCheck);
  assert.ok(managerCheck < partnerCheck && partnerCheck < responsibleCheck);
  assert.ok(responsibleCheck < authDelete);
  assert.match(
    cleanup,
    /'portal-auth-identity:' \|\| v_auth_user_id::text/i,
  );
  assert.match(cleanup, /outro_gestor\.auth_user_id = v_auth_user_id/i);
  assert.match(cleanup, /parceiro\.auth_user_id = v_auth_user_id/i);
  assert.match(cleanup, /responsavel\.auth_user_id = v_auth_user_id/i);
  assert.match(
    cleanup,
    /auth_user_id is null[\s\S]*?lower\(nullif\(btrim\([^)]*email[^)]*\), ''\)\) = v_auth_email/i,
  );
  assert.match(cleanup, /where identidade\.id = v_auth_user_id/i);
  assert.match(
    deletionMigration,
    /create trigger trg_delete_gestor_auth_user_on_delete[\s\S]*?after delete on public\.usuarios_sistema/i,
  );
});

Deno.test("Responsavel nao possui trigger que apaga Auth ao excluir perfil", () => {
  assert.doesNotMatch(
    responsibleFirstAccessMigration,
    /delete from auth\.users/i,
  );
  const removalGuard = functionBlock(
    responsibleFirstAccessMigration,
    "public.proteger_remocao_senha_temporaria_pendente()",
  );
  assert.match(removalGuard, /PORTAL_REMOCAO_BLOQUEADA_POR_SENHA_TEMPORARIA/i);
  assert.match(
    responsibleFirstAccessMigration,
    /before delete on public\.responsaveis_legais[\s\S]*?proteger_remocao_senha_temporaria_pendente/i,
  );
});

Deno.test("Responsavel concluido prova senha institucional sem liberar pendencias", () => {
  const initializer = functionBlock(
    canonicalInitializersMigration,
    "public.inicializar_primeiro_acesso_institucional()",
  );
  const proof = functionBlock(
    institutionalProofMigration,
    "public.portal_identidade_credencial_compartilhada_liberada(",
  );

  assert.match(
    initializer,
    /portal_identidade_credencial_compartilhada_liberada\([\s\S]*?new\.auth_user_id/i,
  );
  assert.match(proof, /responsavel\.status = 'ATIVO'/i);
  assert.match(
    proof,
    /responsavel\.senha_atualizada_em is not null/i,
  );
  assert.match(
    proof,
    /not coalesce\(responsavel\.troca_senha_obrigatoria/i,
  );
  assert.match(
    proof,
    /responsavel_pendente\.senha_atualizada_em is null[\s\S]*?responsavel_pendente\.troca_senha_obrigatoria/i,
  );
  assert.match(
    initializer,
    /new\.primeiro_acesso_institucional_pendente := true;[\s\S]*?new\.acesso_institucional_origem := 'CONVITE';[\s\S]*?return new;/i,
  );
});

Deno.test("vinculo de Responsavel exige todos os perfis canonicos", () => {
  const link = functionBlock(
    responsibleLinkMigration,
    "public.responsavel_legal_acesso_vincular(",
  );
  const rowLock = link.indexOf("FOR UPDATE");
  const identityLock = link.indexOf("pg_try_advisory_xact_lock");

  assert.match(link, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  assert.match(
    link,
    /pg_try_advisory_xact_lock[\s\S]*?'portal-auth-identity:' \|\| p_auth_user_id::text/i,
  );
  assert.ok(rowLock >= 0 && identityLock > rowLock);
  assert.equal(link.includes("'\\\\D'"), false);
  assert.match(link, /'\[\^0-9\]'/i);
  assert.match(
    link,
    /if exists \([\s\S]*?from public\.parceiros[\s\S]*?is distinct from v_responsavel\.cpf_normalizado[\s\S]*?is distinct from v_responsavel\.email[\s\S]*?\) or exists \([\s\S]*?from public\.usuarios_sistema[\s\S]*?is distinct from v_responsavel\.cpf_normalizado[\s\S]*?is distinct from[\s\S]*?v_responsavel\.email[\s\S]*?\) then/i,
  );
  assert.match(link, /RESPONSAVEL_IDENTIDADE_MULTIPERFIL_DIVERGENTE/i);
  assert.match(
    responsibleLinkMigration,
    /revoke all on function[\s\S]*?responsavel_legal_acesso_vincular\(uuid, uuid, uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    responsibleLinkMigration,
    /grant execute on function[\s\S]*?responsavel_legal_acesso_vincular\(uuid, uuid, uuid, uuid\)[\s\S]*?to service_role/i,
  );
});

Deno.test("linker automatico permanece conservador", () => {
  assert.doesNotMatch(
    identityMigration,
    /create or replace function public\.link_parceiro_auth_identity\(\)/i,
  );
  const originalLinker = functionBlock(
    originalMultiProfileMigration,
    "public.link_parceiro_auth_identity()",
  );
  assert.match(
    originalLinker,
    /parceiro_vinculado\.auth_user_id = auth_user\.id/i,
  );
  assert.doesNotMatch(
    originalLinker,
    /parceiro_vinculado\.tipo\s*=\s*NEW\.tipo/i,
  );
});

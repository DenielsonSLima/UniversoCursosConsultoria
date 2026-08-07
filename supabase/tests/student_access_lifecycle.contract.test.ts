import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migrationUrl = new URL(
  "../migrations/20260803173000_canonicalize_student_access_lifecycle.sql",
  import.meta.url,
);

const migration = await Deno.readTextFile(migrationUrl);

Deno.test("ciclo de acesso possui estados canônicos restritos", () => {
  for (
    const column of [
      "acesso_status",
      "acesso_erro",
      "convite_enviado_em",
      "acesso_ativado_em",
    ]
  ) {
    assert.match(
      migration,
      new RegExp(`add column if not exists ${column}`, "i"),
    );
  }

  assert.match(
    migration,
    /check\s*\(\s*acesso_status\s+in\s*\(\s*'sem_acesso',\s*'pendente',\s*'processando',\s*'convite_enviado',\s*'ativo',\s*'erro'/is,
  );
  assert.match(migration, /default\s+'sem_acesso'/i);
});

Deno.test("backfill vincula Auth somente quando aluno e e-mail são unívocos", () => {
  assert.match(
    migration,
    /aluno_unico[\s\S]*group by email_normalizado[\s\S]*having count\(\*\) = 1/i,
  );
  assert.match(
    migration,
    /auth_email[\s\S]*group by lower\(btrim\(auth_user\.email\)\)[\s\S]*having count\(\*\) = 1/i,
  );
  assert.match(migration, /parceiro\.auth_user_id is null/i);
  assert.match(
    migration,
    /coalesce\(\s*nullif\(parceiro\.auth_login_email, ''\),\s*nullif\(parceiro\.email, ''\)/is,
  );
  assert.match(
    migration,
    /not exists \([\s\S]*vinculo_existente\.auth_user_id = auth_user\.id/i,
  );
  assert.match(
    migration,
    /not exists \([\s\S]*usuario_sistema\.auth_user_id = auth_user\.id/i,
  );
  assert.match(migration, /min\(id::text\)::uuid as parceiro_id/i);
  assert.match(
    migration,
    /min\(auth_user\.id::text\)::uuid as auth_user_id/i,
  );
  assert.doesNotMatch(migration, /min\((?:auth_user\.)?id\)/i);
});

Deno.test("auth_user_id é único e duplicidade prévia interrompe a migration", () => {
  assert.match(
    migration,
    /group by parceiro\.auth_user_id\s+having count\(\*\) > 1[\s\S]*raise exception/i,
  );
  assert.match(
    migration,
    /create unique index if not exists uq_parceiros_auth_user_id\s+on public\.parceiros \(auth_user_id\)\s+where auth_user_id is not null/i,
  );
});

Deno.test("backfill não inventa ativação sem confirmação e senha do Auth", () => {
  assert.match(
    migration,
    /coalesce\(auth_user\.encrypted_password, ''\) <> ''[\s\S]*coalesce\(auth_user\.email_confirmed_at, auth_user\.confirmed_at\) is not null[\s\S]*then 'ativo'/i,
  );
  assert.match(
    migration,
    /when auth_user\.invited_at is not null then 'convite_enviado'/i,
  );
  assert.match(migration, /when auth_user\.id is null then 'sem_acesso'/i);
});

Deno.test("migration não cria usuários nem envia convites em massa", () => {
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users/i);
  assert.doesNotMatch(migration, /inviteUserByEmail/i);
  assert.doesNotMatch(migration, /generateLink/i);
  assert.doesNotMatch(migration, /net\.http|http_post|pg_net/i);
});

Deno.test("conclusão da senha prioriza auth_user_id e usa fallback único", () => {
  const functionStart = migration.indexOf(
    "create or replace function public.sync_aluno_password_reset_completion()",
  );
  const functionEnd = migration.indexOf("$$;", functionStart);
  const source = migration.slice(functionStart, functionEnd);

  assert.match(source, /parceiro\.auth_user_id = new\.id/i);
  assert.match(source, /get diagnostics v_updated_count = row_count/i);
  assert.match(source, /if v_updated_count > 0 or new\.email is null/i);
  assert.match(
    source,
    /parceiro\.auth_user_id is null[\s\S]*having count\(\*\) = 1/i,
  );
  assert.match(source, /acesso_status = 'ativo'/i);
  assert.match(source, /acesso_erro = null/i);
  assert.match(source, /troca_senha_obrigatoria = false/i);
});

Deno.test("trigger cobre senha e confirmação sem expor função aos clientes", () => {
  assert.match(
    migration,
    /after update of encrypted_password, email_confirmed_at\s+on auth\.users/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.sync_aluno_password_reset_completion\(\)\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.sync_aluno_password_reset_completion\(\)\s+to (?:anon|authenticated)/i,
  );
});

Deno.test("clientes não alteram identidade nem estado canônico diretamente", () => {
  const functionStart = migration.indexOf(
    "create or replace function public.protect_student_access_control_fields()",
  );
  const functionEnd = migration.indexOf("$$;", functionStart);
  const source = migration.slice(functionStart, functionEnd);

  assert.match(source, /auth\.role\(\)[\s\S]*= 'service_role'/i);
  assert.match(source, /pg_trigger_depth\(\) > 1/i);
  for (
    const column of [
      "auth_user_id",
      "auth_login_email",
      "troca_senha_obrigatoria",
      "acesso_status",
      "acesso_erro",
      "convite_enviado_em",
      "acesso_ativado_em",
    ]
  ) {
    assert.match(source, new RegExp(`new\\.${column}`, "i"));
  }
  assert.match(source, /using errcode = '42501'/i);
  assert.match(migration, /trg_00_protect_student_access_insert/i);
  assert.match(migration, /trg_zz_protect_student_access_update/i);
});

Deno.test("linker legado limita o navegador à própria sessão e não reutiliza conta de gestor", () => {
  const functionStart = migration.lastIndexOf(
    "create or replace function public.link_parceiro_auth_identity()",
  );
  const functionEnd = migration.indexOf("$$;", functionStart);
  const source = migration.slice(functionStart, functionEnd);

  assert.match(source, /v_session_auth_user_id uuid := auth\.uid\(\)/i);
  assert.match(source, /auth_user\.id = v_session_auth_user_id/i);
  assert.match(source, /auth\.role\(\)[\s\S]*= 'service_role'/i);
  assert.match(
    source,
    /parceiro_vinculado\.auth_user_id = auth_user\.id/i,
  );
  assert.match(
    source,
    /usuario_sistema\.auth_user_id = auth_user\.id/i,
  );
});

Deno.test("exclusão limpa Auth por ID somente depois de remover o parceiro", () => {
  const functionStart = migration.indexOf(
    "create or replace function public.delete_partner_auth_user_on_partner_delete()",
  );
  const functionEnd = migration.indexOf("$$;", functionStart);
  const source = migration.slice(functionStart, functionEnd);

  assert.match(source, /v_auth_user_id uuid := old\.auth_user_id/i);
  assert.match(source, /parceiro\.auth_user_id = v_auth_user_id/i);
  assert.match(source, /usuario_sistema\.auth_user_id = v_auth_user_id/i);
  assert.match(
    source,
    /delete from auth\.users as auth_user\s+where auth_user\.id = v_auth_user_id/i,
  );
  assert.match(
    migration,
    /create trigger trg_delete_partner_auth_user_on_partner_delete\s+after delete on public\.parceiros/i,
  );
});

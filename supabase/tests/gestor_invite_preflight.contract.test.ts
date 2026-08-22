import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260822110000_harden_gestor_invite_preflight.sql",
    import.meta.url,
  ),
);
const handler = await Deno.readTextFile(
  new URL(
    "../functions/portal-user-management/handlers/upsert-gestor-user.ts",
    import.meta.url,
  ),
);
const config = await Deno.readTextFile(
  new URL("../config.toml", import.meta.url),
);

Deno.test("pré-validação canônica ocorre antes de qualquer consulta ou convite Auth", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS usuarios_sistema_cpf_digits_unique_idx[\s\S]*?regexp_replace\([\s\S]*?'\[\^0-9\]'/i,
  );
  assert.match(
    migration,
    /FUNCTION public\.portal_validar_unicidade_usuario_sistema\([\s\S]*?RETURNS TABLE \([\s\S]*?email_em_uso boolean,[\s\S]*?cpf_em_uso boolean,[\s\S]*?email_usuario_nome text,[\s\S]*?cpf_usuario_nome text[\s\S]*?SECURITY INVOKER/i,
  );
  assert.match(
    migration,
    /lower\(btrim\(usuario\.email\)\) = lower\(btrim\(coalesce\(p_email, ''\)\)\)/i,
  );
  assert.match(
    migration,
    /regexp_replace\([\s\S]*?usuario\.cpf[\s\S]*?= pg_catalog\.regexp_replace\(coalesce\(p_cpf, ''\)/i,
  );
  assert.match(migration, /'\[\^0-9\]'/);
  assert.doesNotMatch(migration, /'\\\\D'/);

  const preflight = handler.indexOf("checkGestorUserUniqueness(");
  const authLookup = handler.indexOf("findAuthUserByEmail(admin, email)");
  const invite = handler.indexOf("inviteUserByEmail(email");
  assert.ok(preflight > -1);
  assert.ok(authLookup > preflight);
  assert.ok(invite > authLookup);
});

Deno.test("prova HMAC do convite é exclusiva do serviço e vincula ator, e-mail e CPF", () => {
  assert.match(
    migration,
    /FUNCTION public\.portal_identidade_assinar_convite_gestor\([\s\S]*?SECURITY DEFINER\s+SET search_path = ''/i,
  );
  assert.match(migration, /auth\.jwt\(\) ->> 'role'.*'service_role'/i);
  assert.match(migration, /GESTOR_GLOBAL_CONFIGURACOES_OBRIGATORIO/i);
  assert.match(
    migration,
    /portal_invite_reconciliation_hmac_secret[\s\S]*?extensions\.hmac/i,
  );
  assert.match(
    migration,
    /p_original_actor_auth_user_id::text[\s\S]*?p_request_id::text[\s\S]*?v_email[\s\S]*?v_cpf/i,
  );
});

Deno.test("RPCs não são expostas ao cliente e rota institucional está autorizada", () => {
  for (
    const signature of [
      "portal_validar_unicidade_usuario_sistema\\(text, text\\)",
      "portal_identidade_assinar_convite_gestor\\(\\s*uuid, uuid, uuid, text, text\\s*\\)",
    ]
  ) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]*?TO (?:PUBLIC|anon|authenticated)`,
        "i",
      ),
    );
  }
  assert.match(
    config,
    /additional_redirect_urls\s*=\s*\[[\s\S]*?https:\/\/universocc\.com\.br\/sistema\/primeiro-acesso/,
  );
});

Deno.test("migration de segurança é atômica", () => {
  assert.match(migration, /^--[\s\S]*?\nBEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
});

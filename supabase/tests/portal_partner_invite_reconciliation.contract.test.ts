// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260824113700_sign_partner_invite_operations.sql",
    import.meta.url,
  ),
);

const compact = migration.replace(/\s+/g, " ");

Deno.test("assinatura do convite é atômica e limitada a service_role", () => {
  assert.match(migration, /^--[\s\S]*?\nBEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(
    compact,
    /CREATE OR REPLACE FUNCTION public\.portal_identidade_assinar_convite_parceiro\([\s\S]*?SECURITY DEFINER SET search_path = ''/i,
  );
  assert.match(
    compact,
    /auth\.jwt\(\) ->> 'role'[\s\S]*?SERVICE_ROLE_OBRIGATORIO/i,
  );
  assert.match(
    compact,
    /REVOKE ALL ON FUNCTION public\.portal_identidade_assinar_convite_parceiro[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    compact,
    /GRANT EXECUTE ON FUNCTION public\.portal_identidade_assinar_convite_parceiro[\s\S]*?TO service_role/i,
  );
});

Deno.test("prova revalida ator, parceiro, identidade civil e escopo", () => {
  assert.match(migration, /portal_identidade_exigir_service_role_actor/i);
  assert.match(migration, /v_tipo NOT IN \('ALUNO', 'PROFESSOR'\)/i);
  assert.match(migration, /FROM public\.parceiros AS parceiro/i);
  assert.match(migration, /PORTAL_INVITE_PARCEIRO_EMAIL_DIVERGENTE/i);
  assert.match(migration, /v_parceiro\.cpf_cnpj/i);
  assert.match(migration, /v_cpf_canonico/i);
  assert.match(migration, /v_contexto ->> 'allPolos'/i);
  assert.match(migration, /v_contexto -> 'poloIds'/i);
  assert.match(migration, /v_parceiro\.polo_id/i);
  assert.match(migration, /v_parceiro\.polo_ids/i);
  assert.match(migration, /PORTAL_INVITE_PARCEIRO_FORA_ESCOPO/i);
});

Deno.test("HMAC usa segredo Vault e separador de domínio", () => {
  assert.match(
    migration,
    /portal_invite_reconciliation_hmac_secret/i,
  );
  assert.match(migration, /extensions\.hmac/i);
  assert.match(migration, /'parceiro-v1' \|\| E'\\n'/i);
  for (
    const field of [
      "p_original_actor_auth_user_id",
      "p_request_id",
      "p_partner_id",
      "v_tipo",
      "v_email",
      "v_cpf_canonico",
    ]
  ) {
    assert.match(migration, new RegExp(`${field}[\\s\\S]*?\\|\\|`, "i"));
  }
  assert.ok(migration.split(/\r?\n/).length <= 500);
});

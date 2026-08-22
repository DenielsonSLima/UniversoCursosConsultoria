import assert from "node:assert/strict";

const readLocal = (path: string) =>
  Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("manifesto fixa a dependência Supabase e exige JWT no gateway", async () => {
  const [indexSource, denoJsonSource, denoLockSource, supabaseConfig] =
    await Promise.all([
      readLocal("./index.ts"),
      readLocal("./deno.json"),
      readLocal("./deno.lock"),
      readLocal("../../config.toml"),
    ]);

  assert.match(
    indexSource,
    /from "@supabase\/supabase-js"/,
  );
  assert.doesNotMatch(
    indexSource,
    /npm:@supabase\/supabase-js@2(?:"|')/,
  );

  const denoJson = JSON.parse(denoJsonSource);
  assert.equal(
    denoJson.imports?.["@supabase/supabase-js"],
    "npm:@supabase/supabase-js@2.106.1",
  );
  const denoLock = JSON.parse(denoLockSource);
  assert.equal(
    denoLock.specifiers?.["npm:@supabase/supabase-js@2.106.1"],
    "2.106.1",
  );
  assert.match(
    supabaseConfig,
    /\[functions\.portal-user-management\]\s+verify_jwt\s*=\s*true/,
  );
});

Deno.test("roteador publica as ações de Professor e Responsável", async () => {
  const indexSource = await readLocal("./index.ts");

  for (
    const action of [
      "ensure-professor-access",
      "ensure-responsavel-access",
      "list-responsavel-access-statuses",
      "confirm-responsavel-email",
      "issue-responsavel-temporary-password",
      "resend-responsavel-access",
    ]
  ) {
    assert.match(indexSource, new RegExp(`"${action}"`));
  }
  assert.match(
    indexSource,
    /action === "ensure-professor-access"[\s\S]*handleEnsureProfessorAccess\(context, partner\)/,
  );
  assert.match(
    indexSource,
    /action === "ensure-responsavel-access"[\s\S]*payload\.responsavelLegalId[\s\S]*payload\.requestId/,
  );
  assert.match(
    indexSource,
    /action === "list-responsavel-access-statuses"[\s\S]*payload\.responsavelLegalIds/,
  );
  assert.match(
    indexSource,
    /action === "confirm-responsavel-email"[\s\S]*payload\.responsavelLegalId[\s\S]*payload\.emailValidatedByManager === true/,
  );
  assert.match(
    indexSource,
    /action === "issue-responsavel-temporary-password"[\s\S]*payload\.responsavelLegalId/,
  );
  assert.match(
    indexSource,
    /action === "resend-responsavel-access"[\s\S]*payload\.responsavelLegalId[\s\S]*payload\.requestId[\s\S]*publicApiKey\.apiKey/,
  );

  const partnerLoadIndex = indexSource.indexOf("await loadManagedPartner(");
  assert.ok(partnerLoadIndex >= 0);
  for (
    const action of [
      "ensure-responsavel-access",
      "list-responsavel-access-statuses",
      "confirm-responsavel-email",
      "issue-responsavel-temporary-password",
      "resend-responsavel-access",
    ]
  ) {
    const responsavelRouteIndex = indexSource.indexOf(`action === "${action}"`);
    assert.ok(responsavelRouteIndex >= 0);
    assert.ok(
      responsavelRouteIndex < partnerLoadIndex,
      "Responsável possui entidade própria e não pode exigir partnerId.",
    );
  }
  assert.match(indexSource, /Cache-Control", "no-store, max-age=0"/);
  assert.doesNotMatch(
    indexSource,
    /hasOwnProperty\.call\(payload,\s*"temporaryPassword"\)/,
  );
});

Deno.test("emissão do Responsável usa marcador app_metadata distinto e RPCs dedicadas", async () => {
  const source = await readLocal(
    "./handlers/issue-responsavel-temporary-password.ts",
  );

  assert.match(
    source,
    /universocc_responsavel_temporary_password_issue_id/,
  );
  for (
    const rpc of [
      "portal_reservar_emissao_senha_temporaria_responsavel",
      "portal_concluir_emissao_senha_temporaria_responsavel",
      "portal_cancelar_emissao_senha_temporaria_responsavel",
      "portal_confirmar_limpeza_emissao_senha_temporaria_responsavel",
    ]
  ) {
    assert.match(source, new RegExp(rpc));
  }
  assert.match(source, /app_metadata/);
  assert.match(
    source,
    /universocc_responsavel_temporary_password_write_nonce/,
  );
  assert.match(
    source,
    /appMetadataWithIssue[\s\S]*RESPONSAVEL_TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY/,
  );
  assert.match(source, /password:\s*temporaryPassword,\s*\n\s*}/);
  assert.match(
    source,
    /verifyTemporaryPassword\([\s\S]*identity\.authUser\.id[\s\S]*finishAfterPasswordAttempt/,
  );
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});

Deno.test("toda resposta JSON do endpoint desabilita cache", async () => {
  const indexSource = await readLocal("./index.ts");
  const jsonStart = indexSource.indexOf(
    "const json = (payload: FunctionResponse, status = 200)",
  );
  const preflightStart = indexSource.indexOf('if (req.method === "OPTIONS")');
  const jsonFactory = indexSource.slice(jsonStart, preflightStart);

  assert.ok(jsonStart >= 0);
  assert.ok(preflightStart > jsonStart);
  assert.match(
    jsonFactory,
    /headers\.set\("Cache-Control", "no-store, max-age=0"\)/,
  );
  assert.match(jsonFactory, /headers\.set\("Pragma", "no-cache"\)/);
  assert.match(jsonFactory, /headers\.set\("Expires", "0"\)/);
  assert.doesNotMatch(jsonFactory, /temporaryPassword/);
});

Deno.test("senha temporária do aluno stageia nonce antes da senha e a verifica", async () => {
  const source = await readLocal(
    "./handlers/issue-student-temporary-password.ts",
  );

  assert.match(source, /universocc_temporary_password_write_nonce/);
  assert.match(
    source,
    /appMetadataForTemporaryPasswordIssue[\s\S]*TEMPORARY_PASSWORD_WRITE_NONCE_METADATA_KEY/,
  );
  assert.match(source, /password:\s*temporaryPassword,\s*\n\s*}/);
  assert.match(
    source,
    /verifyTemporaryPassword\([\s\S]*identity\.authUser\.id[\s\S]*completeTemporaryPasswordEmission/,
  );
});

Deno.test("reenvio do responsável delega reserva e auditoria à RPC transacional", async () => {
  const source = await readLocal(
    "./handlers/resend-responsavel-access.ts",
  );

  for (
    const rpc of [
      "portal_reservar_reenvio_acesso_responsavel",
      "portal_concluir_reenvio_acesso_responsavel",
      "portal_cancelar_reenvio_acesso_responsavel",
    ]
  ) {
    assert.match(source, new RegExp(rpc));
  }
  assert.doesNotMatch(source, /recordResponsavelAccessAudit|sistema_eventos/);
  assert.match(source, /\/recuperar-senha\?source=responsavel/);
});

Deno.test("reconciliação de convite usa somente a RPC Vault congelada", async () => {
  const source = await readLocal("./handlers/ensure-responsavel-access.ts");

  assert.match(
    source,
    /portal_identidade_assinar_convite_responsavel/,
  );
  for (
    const argument of [
      "p_current_actor_auth_user_id",
      "p_original_actor_auth_user_id",
      "p_request_id",
      "p_responsavel_legal_id",
      "p_email",
    ]
  ) {
    assert.match(source, new RegExp(argument));
  }
  assert.doesNotMatch(source, /PORTAL_INVITE_RECONCILIATION_SECRET/);
  assert.doesNotMatch(
    source,
    /SUPABASE_SERVICE_ROLE_KEY[\s\S]*sign|sign[\s\S]*SUPABASE_SERVICE_ROLE_KEY/i,
  );
});

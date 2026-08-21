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
    const action of ["ensure-professor-access", "ensure-responsavel-access"]
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

  const responsavelRouteIndex = indexSource.indexOf(
    'action === "ensure-responsavel-access"',
  );
  const partnerLoadIndex = indexSource.indexOf("await loadManagedPartner(");
  assert.ok(responsavelRouteIndex >= 0);
  assert.ok(partnerLoadIndex >= 0);
  assert.ok(
    responsavelRouteIndex < partnerLoadIndex,
    "Responsável possui entidade própria e não pode exigir partnerId.",
  );
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

// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const originalSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260819203143_create_portal_multi_profile_identities.sql",
    import.meta.url,
  ),
);
const fixSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260820033346_fix_portal_profile_polo_id_ambiguity.sql",
    import.meta.url,
  ),
);

const functionBlock = (sql: string, signature: string) => {
  const start = sql.indexOf(signature);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end + "$function$;".length);
};

const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();

const profileSignature = "public.portal_listar_perfis()";
const dependentSignature = "public.responsavel_legal_listar_dependentes(";

Deno.test("hotfix qualifica todo polo_id derivado de unnest", () => {
  const profiles = functionBlock(fixSql, profileSignature);
  const dependents = functionBlock(fixSql, dependentSignature);

  assert.equal(
    (profiles.match(/polo_escopo\.polo_id/g) ?? []).length,
    6,
    "portal_listar_perfis precisa qualificar SELECT, filtro e ordem nos dois ramos.",
  );
  assert.equal(
    (dependents.match(/polo_escopo\.polo_id/g) ?? []).length,
    3,
    "responsavel_legal_listar_dependentes precisa qualificar SELECT, filtro e ordem.",
  );

  for (const block of [profiles, dependents]) {
    assert.doesNotMatch(
      block,
      /(?:SELECT DISTINCT|WHERE|AND|ORDER BY)\s+polo_id\b/i,
    );
    assert.match(block, /SELECT DISTINCT polo_escopo\.polo_id/i);
    assert.match(block, /WHERE polo_escopo\.polo_id IS NOT NULL/i);
    assert.match(block, /ORDER BY polo_escopo\.polo_id/i);
  }
});

Deno.test("hotfix altera somente a qualificação das referências ambíguas", () => {
  for (const signature of [profileSignature, dependentSignature]) {
    const original = functionBlock(originalSql, signature);
    const fixed = functionBlock(fixSql, signature).replaceAll(
      "polo_escopo.polo_id",
      "polo_id",
    );
    assert.equal(normalize(fixed), normalize(original));
  }
});

Deno.test("shape, segurança e ACL pública permanecem fechados", () => {
  const profiles = functionBlock(fixSql, profileSignature);
  const dependents = functionBlock(fixSql, dependentSignature);

  assert.match(
    profiles,
    /RETURNS TABLE\s*\([\s\S]*?"contextId" uuid[\s\S]*?"poloIds" uuid\[\][\s\S]*?"firstAccess" jsonb/i,
  );
  assert.match(
    dependents,
    /RETURNS TABLE\s*\([\s\S]*?"vinculoId" uuid[\s\S]*?"alunoId" uuid[\s\S]*?"poloIds" uuid\[\]/i,
  );

  for (const block of [profiles, dependents]) {
    assert.match(block, /STABLE[\s\S]*?SECURITY DEFINER/i);
    assert.match(block, /SET search_path = ''/i);
    assert.match(block, /v_actor uuid := auth\.uid\(\)/i);
  }

  assert.match(
    fixSql,
    /REVOKE ALL ON FUNCTION public\.portal_listar_perfis\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    fixSql,
    /REVOKE ALL ON FUNCTION public\.responsavel_legal_listar_dependentes\(uuid\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.match(
    fixSql,
    /GRANT EXECUTE ON FUNCTION public\.portal_listar_perfis\(\) TO authenticated/i,
  );
  assert.match(
    fixSql,
    /GRANT EXECUTE ON FUNCTION public\.responsavel_legal_listar_dependentes\(uuid\)[\s\S]*?TO authenticated/i,
  );
});

Deno.test("hotfix não habilita política nem altera dados ou Vault", () => {
  assert.doesNotMatch(
    fixSql,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i,
  );
  assert.doesNotMatch(fixSql, /vault\./i);
  assert.doesNotMatch(fixSql, /habilitada|status_juridico/i);
  assert.doesNotMatch(fixSql, /ALTER TABLE|CREATE TABLE|DROP TABLE/i);
});

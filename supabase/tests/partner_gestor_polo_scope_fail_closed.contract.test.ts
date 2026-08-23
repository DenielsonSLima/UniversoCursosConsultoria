// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";

const migrationSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260822162200_close_null_partner_polo_gestor_scope.sql",
    import.meta.url,
  ),
);

const functionBlock = (signature: string) => {
  const start = migrationSql.indexOf(signature);
  const end = migrationSql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return migrationSql.slice(start, end + "$function$;".length);
};

const writeScope = functionBlock(
  "public.is_partner_in_gestor_scope(",
);
const readScope = functionBlock(
  "public.is_partner_in_gestor_read_scope(",
);

const assertFailClosedPoloMatch = (block: string) => {
  assert.doesNotMatch(block, /p_polo_id\s+IS\s+NULL/i);
  assert.match(
    block,
    /p_polo_id\s+IS\s+NOT\s+NULL\s+AND\s+p_polo_id\s*=\s*ANY/i,
  );
  assert.match(
    block,
    /pg_catalog\.unnest\(\s*coalesce\(\s*p_polo_ids,\s*ARRAY\[\]::uuid\[\]\s*\)/i,
  );
  assert.match(block, /partner_polo\.id\s+IS\s+NOT\s+NULL/i);
  assert.match(
    block,
    /partner_polo\.id\s*=\s*ANY\(\s*coalesce\(\s*public\.gestor_allowed_polo_ids\(\),\s*ARRAY\[\]::uuid\[\]/i,
  );
};

Deno.test("escrita em Parceiros não trata polo nulo como autorização", () => {
  assert.match(writeScope, /public\.gestor_has_module\('parceiros'\)/i);
  assert.match(writeScope, /public\.is_gestor_global\(\)/i);
  assert.match(writeScope, /public\.is_gestor\(\)/i);
  assertFailClosedPoloMatch(writeScope);
});

Deno.test("leitura preserva módulos operacionais e fecha o mesmo bypass", () => {
  for (
    const moduleId of [
      "inicio",
      "parceiros",
      "cadastros",
      "gestao",
      "secretaria",
      "financeiro",
      "caixa",
      "relatorios",
    ]
  ) {
    assert.match(readScope, new RegExp(`'${moduleId}'`, "i"));
  }

  assert.match(readScope, /public\.gestor_has_any_module\(/i);
  assert.match(readScope, /public\.is_gestor_global\(\)/i);
  assert.match(readScope, /public\.is_gestor\(\)/i);
  assertFailClosedPoloMatch(readScope);
});

Deno.test("helpers privilegiados usam search_path fechado e ACL explícita", () => {
  for (const block of [writeScope, readScope]) {
    assert.match(block, /STABLE[\s\S]*?SECURITY DEFINER/i);
    assert.match(block, /SET search_path = ''/i);
  }

  for (
    const functionName of [
      "is_partner_in_gestor_scope",
      "is_partner_in_gestor_read_scope",
    ]
  ) {
    assert.match(
      migrationSql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}\\(uuid, uuid\\[\\]\\)[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "i",
      ),
    );
    assert.match(
      migrationSql,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\(uuid, uuid\\[\\]\\)[\\s\\S]*?TO authenticated, service_role`,
        "i",
      ),
    );
  }
});

Deno.test("migration é aditiva e limitada aos dois helpers", () => {
  assert.match(migrationSql, /^\s*--[^\n]*\n\s*BEGIN;/i);
  assert.match(migrationSql, /COMMIT;\s*$/i);
  assert.equal(
    (migrationSql.match(/CREATE OR REPLACE FUNCTION/gi) ?? []).length,
    2,
  );
  assert.doesNotMatch(
    migrationSql,
    /\b(?:CREATE|DROP)\s+POLICY\b|\bALTER\s+TABLE\b|\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i,
  );
  assert.doesNotMatch(migrationSql, /pg_catalog\.coalesce/i);
});

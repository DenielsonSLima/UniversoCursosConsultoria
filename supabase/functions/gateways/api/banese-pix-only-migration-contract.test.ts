import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../../../migrations/20260831210000_harden_banese_pix_only_persistence_cas.sql",
  import.meta.url,
);
const migrationSql = await Deno.readTextFile(migrationUrl);

const functionStart = migrationSql.indexOf(
  "create or replace function public.persist_banese_recovered_pix_v2(",
);
assert.notEqual(functionStart, -1, "RPC Pix-only v2 ausente da migration");
const functionEnd = migrationSql.indexOf("\n$function$;", functionStart);
assert.notEqual(functionEnd, -1, "fim da RPC Pix-only v2 ausente");
const functionSql = migrationSql.slice(functionStart, functionEnd + 12);

Deno.test("RPC Pix-only aceita os dois formatos de claim service_role", () => {
  assert.match(functionSql, /request\.jwt\.claim\.role/);
  assert.match(functionSql, /request\.jwt\.claims/);
  assert.match(
    functionSql,
    /session_user not in \('postgres', 'supabase_admin', 'service_role'\)/,
  );
});

Deno.test("RPC Pix-only limita espera por locks e tempo total", () => {
  assert.match(functionSql, /set lock_timeout = '5s'/);
  assert.match(functionSql, /set statement_timeout = '45s'/);
  assert.match(functionSql, /for update;/);
});

Deno.test("conflitos CAS Pix-only retornam PT409 sem retry serializavel", () => {
  const conflictCodes = functionSql.match(/using errcode = 'PT409'/g) ?? [];
  assert.equal(conflictCodes.length, 2);
  assert.doesNotMatch(functionSql, /using errcode = '40001'/);
});

Deno.test("RPC Pix-only permanece restrita ao service_role", () => {
  assert.match(
    migrationSql,
    /revoke all on function public\.persist_banese_recovered_pix_v2\([\s\S]*?from public, anon, authenticated;/,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.persist_banese_recovered_pix_v2\([\s\S]*?to service_role;/,
  );
});

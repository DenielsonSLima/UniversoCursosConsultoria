import assert from "node:assert/strict";

const migration = await Deno.readTextFile(
  new URL(
    "../migrations/20260901120450_guard_manual_technical_future_sync.sql",
    import.meta.url,
  ),
);
const banese = await Deno.readTextFile(
  new URL(
    "../functions/gateways/api/banese-post-settlement-projection.ts",
    import.meta.url,
  ),
);
const cnab = await Deno.readTextFile(
  new URL(
    "../functions/banese-cnab240-api/return-activation.ts",
    import.meta.url,
  ),
);

Deno.test("RPC isola exclusivamente política técnica MANUAL ativa", () => {
  assert.match(
    migration,
    /join public\.cursos course on course\.id = class\.curso_id/i,
  );
  assert.match(
    migration,
    /upper\(coalesce\(course\.modalidade, ''\)\) in \('TECNICO', 'TÉCNICO'\)/i,
  );
  assert.match(migration, /policy\.active = true/i);
  assert.match(migration, /policy\.generation_mode = 'MANUAL'/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function[\s\S]*to service_role/i,
  );
});

Deno.test("adaptador Banese consulta guarda antes do bulk futuro", () => {
  const guard = banese.indexOf("shouldSkipTechnicalManualFutureSync(");
  const bulk = banese.indexOf("await input.syncFutureInstallments(");
  assert.ok(guard >= 0);
  assert.ok(bulk > guard);
  assert.match(
    banese.slice(guard, bulk),
    /if \(skipAutomaticFutureSync\)[\s\S]*futureSyncWarning/i,
  );
});

Deno.test("retorno CNAB consulta guarda antes de rota de sincronização", () => {
  const guard = cnab.indexOf("await shouldSkipTechnicalManualFutureSync(");
  const bulk = cnab.indexOf("await syncRouteAwareFutureInstallments(");
  assert.ok(guard >= 0);
  assert.ok(bulk > guard);
  assert.match(cnab.slice(guard, bulk), /\) return;/);
  assert.ok(cnab.indexOf('status: "ACTIVATED"') > bulk);
});

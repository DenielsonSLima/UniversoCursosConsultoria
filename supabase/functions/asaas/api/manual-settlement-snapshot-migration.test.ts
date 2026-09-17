import assert from "node:assert/strict";
import { manualSettlementAuditedReceivableSnapshot } from "./manual-settlement.repository.ts";

const migrationPath =
  "../../../migrations/20260916120000_fix_manual_settlement_audited_snapshot.sql";
const fixed = await Deno.readTextFile(new URL(migrationPath, import.meta.url));
const original = await Deno.readTextFile(
  new URL(
    "../../../migrations/20260722080000_receivable_manual_settlement_audit.sql",
    import.meta.url,
  ),
);
const functionBody = (sql: string) => {
  const start = sql.indexOf(
    "create or replace function public.finalize_receivable_manual_settlement(",
  );
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf("\n$$;", start) + 4);
};

Deno.test("reproduz contexto auditável ausente no snapshot financeiro original", () => {
  const sqlKeys = [
    ...functionBody(original).matchAll(
      /'([a-z_]+)', (?:v_receivable\.|round\(v_receivable\.)/g,
    ),
  ]
    .map((match) => match[1]);
  const audited = manualSettlementAuditedReceivableSnapshot(
    { status: "PENDENTE", valor: 279.9 },
    "STANDARD",
  );
  assert.equal(audited.manual_settlement_context, "STANDARD");
  assert.ok(!sqlKeys.includes("manual_settlement_context"));
  assert.match(
    functionBody(original),
    /v_current_snapshot is distinct from v_settlement.receivable_snapshot/,
  );
});

Deno.test("correção preserva integralmente guardas, locks e efeitos da RPC anterior", () => {
  const fixedBody = functionBody(fixed);
  const contextStart = fixedBody.indexOf("  -- Contexto descreve");
  const originalGuardStart = fixedBody.indexOf(
    "    raise exception using errcode = 'PT409', message = 'Identidade",
    contextStart,
  );
  assert.ok(contextStart >= 0 && originalGuardStart > contextStart);
  const normalized = fixedBody.slice(0, contextStart) +
    "  if v_current_snapshot is distinct from v_settlement.receivable_snapshot then\n" +
    fixedBody.slice(originalGuardStart);
  assert.equal(
    normalized.replace(
      "set search_path = ''",
      "set search_path = public, pg_temp",
    )
      .replaceAll("errcode = 'PT409'", "errcode = '40001'"),
    functionBody(original),
    "nenhuma guarda financeira ou efeito lateral pode mudar junto com o metadado",
  );
});

Deno.test("somente contexto conhecido fica fora do CAS; restante do JSON continua exato", () => {
  assert.match(
    fixed,
    /v_current_snapshot is distinct from\s*\(v_settlement\.receivable_snapshot - 'manual_settlement_context'\)/,
  );
  assert.match(
    fixed,
    /jsonb_typeof\(v_settlement\.receivable_snapshot -> 'manual_settlement_context'\)\s*is distinct from 'string'/,
  );
  assert.match(fixed, /not in \('STANDARD', 'DASHBOARD_EXISTING_TITLE_ONLY'\)/);
  assert.match(fixed, /set search_path = ''/);
  assert.match(
    fixed,
    /revoke all on function public\.finalize_receivable_manual_settlement\(uuid, uuid\)\s*from public, anon, authenticated/,
  );
  assert.match(
    fixed,
    /grant execute on function public\.finalize_receivable_manual_settlement\(uuid, uuid\)\s*to service_role/,
  );
  assert.doesNotMatch(fixed, /set state = 'FAILED_SAFE'|set state = 'STARTED'/);
});

Deno.test("conflitos de negócio não causam retry serializável do PostgREST", () => {
  assert.doesNotMatch(functionBody(fixed), /errcode = '40001'/);
  assert.equal(
    (functionBody(fixed).match(/errcode = 'PT409'/g) || []).length,
    3,
  );
});

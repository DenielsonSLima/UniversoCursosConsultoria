import assert from "node:assert/strict";

const routeUrl = new URL("./index.ts", import.meta.url);
const source = await Deno.readTextFile(routeUrl);
const reversalStart = source.indexOf('if (action === "reverse-manual-settlement")');
const reversalEnd = source.indexOf('\n    if (action === "create-course-link")', reversalStart);
assert.notEqual(reversalStart, -1, "rota de estorno manual ausente");
assert.notEqual(reversalEnd, -1, "fim da rota de estorno manual ausente");
const reversalRoute = source.slice(reversalStart, reversalEnd);

Deno.test("estorno manual grava a data auditável para saldo histórico", () => {
  assert.match(reversalRoute, /const reversalTimestamp = new Date\(\)\.toISOString\(\)/);
  assert.match(reversalRoute, /manual_settlement_reversed_at: reversalTimestamp/);
  assert.match(
    reversalRoute,
    /"manual_settlement_id",\s*"manual_settlement_reversed_at"/,
  );
  assert.match(reversalRoute, /eq\("status", "PAGO"\)/);
  assert.match(reversalRoute, /eq\("origem_pagamento", "PRESENCIAL"\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../migrations/20260830112000_stop_banese_cas_retry_loop.sql",
  import.meta.url,
);

test("conflito CAS Banese vira HTTP 409 sem retry serializavel", async () => {
  const sql = await readFile(migration, "utf8");

  assert.match(sql, /persist_banese_reconciliation_snapshot/);
  assert.match(sql, /v_hits <> 3/);
  assert.match(sql, /'using errcode = ''PT409'''/);
  assert.doesNotMatch(sql, /update\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /update\s+public\.payment_gateway_transactions/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
});
